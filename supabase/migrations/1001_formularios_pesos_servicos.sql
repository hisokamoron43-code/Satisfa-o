-- ============================================================================
-- 1001 — Formulários, pesos do RH, serviços e avaliação do auditor
-- Executar DEPOIS da 1000. Idempotente e sem apagar dados.
--
--  1. Novos tipos de questão: escala 1-10, escolha única/múltipla com valores de
--     conformidade, Sim/Não/N.A. com impacto configurável.
--  2. Ligação critério (peso do RH) <-> categoria do formulário (category_code).
--  3. Ligação serviço <-> categoria (service_categories). Sem linhas = aplica-se a todos.
--  4. Parecer qualitativo do auditor (áudio e argumentos escritos), gravado de forma
--     imutável na homologação.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TIPOS DE QUESTÃO
-- ----------------------------------------------------------------------------
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.form_questions'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%RATING_5%'
  LOOP
    EXECUTE format('ALTER TABLE public.form_questions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.form_questions ADD CONSTRAINT form_questions_type_check CHECK (type IN (
  'RATING_5', 'RATING_10', 'NPS_10', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'MULTIPLE_CHOICE',
  'YES_NO_NA', 'TEXT_ONLY', 'SHORT_TEXT', 'AUDIO_AND_TEXT'));

ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS option_scores jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS yes_score numeric(3,2) CHECK (yes_score IS NULL OR yes_score BETWEEN 0 AND 1);
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS no_score numeric(3,2) CHECK (no_score IS NULL OR no_score BETWEEN 0 AND 1);
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS affects_score boolean NOT NULL DEFAULT true;

-- Formulário anónimo precisa de ler a configuração das novas questões (colunas novas só no fim da vista)
CREATE OR REPLACE VIEW public.v_public_form_questions AS
  SELECT id, version_id, text, description, category, type, required, active, display_order,
         service_id, options, conditional_on,
         option_scores, yes_score, no_score, affects_score
  FROM public.form_questions WHERE active = true;
GRANT SELECT ON public.v_public_form_questions TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. CRITÉRIO DO RH <-> CATEGORIA DO FORMULÁRIO
-- ----------------------------------------------------------------------------
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS category_code text;
UPDATE public.evaluation_criteria SET category_code = CASE id
    WHEN 'crit-qualidade' THEN 'QUALIDADE'
    WHEN 'crit-pontualidade' THEN 'PONTUALIDADE'
    WHEN 'crit-seguranca' THEN 'SEGURANCA'
    WHEN 'crit-atendimento' THEN 'ATENDIMENTO' END
  WHERE category_code IS NULL AND id IN ('crit-qualidade', 'crit-pontualidade', 'crit-seguranca', 'crit-atendimento');
CREATE INDEX IF NOT EXISTS idx_criteria_category_code ON public.evaluation_criteria (category_code);

-- ----------------------------------------------------------------------------
-- 3. SERVIÇO <-> CATEGORIA  (sem linhas para uma categoria = vale para todos os serviços)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_categories (
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  -- código da categoria (sem FK: as categorias de sistema podem existir só na aplicação, não como linhas)
  category_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_service_categories_category ON public.service_categories (category_id);
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_categories_select ON public.service_categories;
DROP POLICY IF EXISTS service_categories_write ON public.service_categories;
CREATE POLICY service_categories_select ON public.service_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY service_categories_write ON public.service_categories FOR ALL TO authenticated
  USING (public.is_hr_or_admin()) WITH CHECK (public.is_hr_or_admin());
GRANT SELECT ON public.service_categories TO anon, authenticated;
GRANT ALL ON public.service_categories TO service_role;

-- ----------------------------------------------------------------------------
-- 4. PARECER QUALITATIVO DO AUDITOR
-- ----------------------------------------------------------------------------
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS auditor_review jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Imutabilidade: o parecer do auditor passa a fazer parte do que fica congelado na homologação
CREATE OR REPLACE FUNCTION public.guard_finalized_evaluation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION 'Avaliação homologada não pode ser eliminada.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.finalized_at IS NOT NULL AND (
       (NEW.technical_score, NEW.final_classification, NEW.finalized_at, NEW.finalized_by,
        NEW.criteria_snapshot, NEW.criterion_ratings, NEW.satisfaction_rating, NEW.nps_score,
        NEW.comment, NEW.client_name, NEW.service_name, NEW.service_date, NEW.evaluation_date,
        NEW.audio_recording_url, NEW.detailed_answers, NEW.questions_snapshot, NEW.reference, NEW.auditor_review)
       IS DISTINCT FROM
       (OLD.technical_score, OLD.final_classification, OLD.finalized_at, OLD.finalized_by,
        OLD.criteria_snapshot, OLD.criterion_ratings, OLD.satisfaction_rating, OLD.nps_score,
        OLD.comment, OLD.client_name, OLD.service_name, OLD.service_date, OLD.evaluation_date,
        OLD.audio_recording_url, OLD.detailed_answers, OLD.questions_snapshot, OLD.reference, OLD.auditor_review)
     ) THEN
    RAISE EXCEPTION 'Avaliação homologada é imutável: resultados e respostas não podem ser alterados.';
  END IF;
  RETURN NEW;
END;
$$;

-- save_evaluation_criteria passa a gravar category_code
CREATE OR REPLACE FUNCTION public.save_evaluation_criteria(p_criteria jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c jsonb;
  v_email text := public.current_user_email();
  v_total numeric;
  v_count integer;
BEGIN
  IF COALESCE(public.current_user_role()::text, '') NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN e HR podem gerir critérios.';
  END IF;
  IF jsonb_typeof(p_criteria) <> 'array' THEN
    RAISE EXCEPTION 'Lista de critérios inválida.';
  END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(p_criteria) LOOP
    IF COALESCE(c->>'id', '') = '' OR COALESCE(c->>'categoryName', '') = '' THEN
      RAISE EXCEPTION 'Cada critério requer identificador e nome.';
    END IF;
    IF (c->>'maxScore')::numeric <= 0 THEN
      RAISE EXCEPTION 'A pontuação máxima do critério "%" deve ser positiva.', c->>'categoryName';
    END IF;
    INSERT INTO public.evaluation_criteria
      (id, category_code, category_name, description, weight_percentage, max_score, min_score, active, display_order, updated_at, updated_by)
    VALUES
      (c->>'id', NULLIF(upper(btrim(COALESCE(c->>'categoryCode', ''))), ''), c->>'categoryName', c->>'description', (c->>'weightPercentage')::numeric,
       (c->>'maxScore')::numeric, COALESCE((c->>'minScore')::numeric, 0),
       COALESCE((c->>'active')::boolean, true), COALESCE((c->>'order')::integer, 1), now(), v_email)
    ON CONFLICT (id) DO UPDATE SET
      category_code = EXCLUDED.category_code, category_name = EXCLUDED.category_name, description = EXCLUDED.description,
      weight_percentage = EXCLUDED.weight_percentage, max_score = EXCLUDED.max_score,
      min_score = EXCLUDED.min_score, active = EXCLUDED.active, display_order = EXCLUDED.display_order,
      updated_at = now(), updated_by = v_email;
  END LOOP;

  SELECT COALESCE(SUM(weight_percentage), 0), COUNT(*) INTO v_total, v_count
  FROM public.evaluation_criteria WHERE active;
  IF v_count = 0 OR abs(v_total - 100) > 0.01 THEN
    RAISE EXCEPTION 'A soma dos pesos dos critérios ativos deve ser exatamente 100%% (soma atual: %)', v_total;
  END IF;

  PERFORM public.log_audit_event('UPDATE', 'evaluation_criteria', NULL, 'SUCCESS',
    format('Critérios de avaliação atualizados (%s critérios)', jsonb_array_length(p_criteria)), v_email);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- A homologação ganha o parecer do auditor. A assinatura antiga é removida para não existir ambiguidade no PostgREST.
DROP FUNCTION IF EXISTS public.calculate_and_finalize_evaluation(uuid, jsonb, numeric, text);
CREATE OR REPLACE FUNCTION public.calculate_and_finalize_evaluation(
  p_evaluation_id uuid,
  p_criterion_ratings jsonb,
  p_custom_threshold numeric DEFAULT NULL,
  p_threshold_override_reason text DEFAULT NULL,
  p_auditor_review jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_eval public.evaluations%ROWTYPE;
  v_email text := public.current_user_email();
  v_total numeric;
  v_count integer;
  v_threshold numeric;
  v_score numeric := 0;
  v_class text;
  v_now timestamptz := clock_timestamp();
  v_snapshot jsonb;
  v_criteria jsonb := '[]'::jsonb;
  c record;
  v_rating numeric;
  v_review jsonb;
  v_key text;
  v_pq jsonb;
BEGIN
  IF COALESCE(public.current_user_role()::text, '') NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN e HR podem homologar avaliações.';
  END IF;

  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  IF v_eval.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta avaliação já se encontra homologada e é imutável.';
  END IF;
  IF p_criterion_ratings IS NULL OR jsonb_typeof(p_criterion_ratings) <> 'object' THEN
    RAISE EXCEPTION 'Classificações por critério inválidas.';
  END IF;

  -- Parecer qualitativo do auditor (áudio, argumentos escritos, notas por questão): forma e limites
  v_review := COALESCE(p_auditor_review, '{}'::jsonb);
  IF jsonb_typeof(v_review) <> 'object' THEN
    RAISE EXCEPTION 'Parecer do auditor inválido.';
  END IF;
  IF length(v_review::text) > 20000 THEN
    RAISE EXCEPTION 'Parecer do auditor demasiado extenso.';
  END IF;
  FOR v_key IN SELECT unnest(ARRAY['audio', 'writtenArguments']) LOOP
    IF v_review ? v_key THEN
      IF jsonb_typeof(v_review -> v_key) <> 'object'
         OR COALESCE(v_review -> v_key ->> 'score', '') !~ '^[0-9]+(\.[0-9]+)?$'
         OR (v_review -> v_key ->> 'score')::numeric > 5 THEN
        RAISE EXCEPTION 'A nota qualitativa de "%" deve estar entre 0 e 5.', v_key;
      END IF;
    END IF;
  END LOOP;
  IF v_review ? 'perQuestion' THEN
    IF jsonb_typeof(v_review -> 'perQuestion') <> 'object' THEN
      RAISE EXCEPTION 'Notas por questão inválidas.';
    END IF;
    FOR v_pq IN SELECT value FROM jsonb_each(v_review -> 'perQuestion') LOOP
      IF COALESCE(v_pq ->> 'score', '') !~ '^[0-9]+(\.[0-9]+)?$' OR (v_pq ->> 'score')::numeric > 5 THEN
        RAISE EXCEPTION 'Cada nota qualitativa por questão deve estar entre 0 e 5.';
      END IF;
    END LOOP;
  END IF;

  SELECT COALESCE(SUM(weight_percentage), 0), COUNT(*) INTO v_total, v_count
  FROM public.evaluation_criteria WHERE active;
  IF v_count = 0 OR abs(v_total - 100) > 0.01 THEN
    RAISE EXCEPTION 'A soma dos pesos dos critérios ativos deve ser exatamente 100%% (soma atual: %)', v_total;
  END IF;

  FOR c IN SELECT * FROM public.evaluation_criteria WHERE active ORDER BY display_order, id LOOP
    v_rating := NULL;
    IF COALESCE(p_criterion_ratings ->> c.id, '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      v_rating := (p_criterion_ratings ->> c.id)::numeric;
    END IF;
    IF v_rating IS NULL OR v_rating < c.min_score OR v_rating > c.max_score THEN
      RAISE EXCEPTION 'Classificação inválida ou em falta para o critério: %', c.category_name;
    END IF;

    v_score := v_score + (v_rating / c.max_score) * c.weight_percentage;
    v_criteria := v_criteria || jsonb_build_object(
      'criterionId', c.id, 'categoryName', c.category_name, 'weightPercentage', c.weight_percentage,
      'rating', v_rating, 'maxScore', c.max_score,
      'weightedContribution', round((v_rating / c.max_score) * c.weight_percentage, 3));
  END LOOP;

  IF p_custom_threshold IS NOT NULL THEN
    IF p_custom_threshold < 0 OR p_custom_threshold > 100 THEN
      RAISE EXCEPTION 'O limiar personalizado deve estar entre 0 e 100.';
    END IF;
    IF p_threshold_override_reason IS NULL OR length(btrim(p_threshold_override_reason)) < 5 THEN
      RAISE EXCEPTION 'É obrigatório indicar uma justificação válida para a alteração do limiar.';
    END IF;
    v_threshold := p_custom_threshold;
  ELSE
    SELECT cc.passing_threshold INTO v_threshold FROM public.criteria_configurations cc
    WHERE cc.is_active ORDER BY cc.version DESC LIMIT 1;
    v_threshold := COALESCE(v_threshold, 70);
  END IF;

  v_score := round(v_score, 2);
  v_class := CASE WHEN v_score >= v_threshold THEN 'POSITIVE' ELSE 'NEGATIVE' END;

  v_snapshot := jsonb_build_object(
    'passingThreshold', v_threshold, 'totalWeight', v_total,
    'overrideReason', p_threshold_override_reason, 'evaluatedCriteria', v_criteria,
    'calculatedAt', v_now, 'calculatedBy', v_email,
    'auditorReview', v_review);

  UPDATE public.evaluations
  SET technical_score = v_score, final_classification = v_class, finalized_at = v_now,
      finalized_by = v_email, criteria_snapshot = v_snapshot, criterion_ratings = p_criterion_ratings, auditor_review = v_review,
      status = 'REVIEWED', updated_at = v_now
  WHERE id = p_evaluation_id;

  PERFORM public.log_audit_event('UPDATE', 'evaluations', p_evaluation_id::text, 'SUCCESS',
    format('Avaliação %s homologada com pontuação técnica de %s%%', v_eval.reference, v_score), v_email);

  RETURN jsonb_build_object(
    'success', true, 'evaluationId', p_evaluation_id,
    'finalScore', v_score, 'finalClassification', v_class, 'snapshot', v_snapshot,
    'finalizedBy', v_email, 'finalizedAt', v_now);
END;
$$;
GRANT EXECUTE ON FUNCTION public.calculate_and_finalize_evaluation(uuid, jsonb, numeric, text, jsonb) TO authenticated;

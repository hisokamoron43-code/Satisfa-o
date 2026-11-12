-- ============================================================================
-- 1003 — Pontuação 80/20: 80% automáticos (respostas do cliente) + 20% do auditor
--        (áudio 0–10, argumentos escritos 0–10), associação automática de
--        empresa e equipa na submissão.
-- Executar DEPOIS da 1001 (e da 1000). Idempotente e sem apagar dados.
--
-- Regras:
--  • Parte automática (80 pontos): para cada critério do RH com respostas pontuáveis,
--    conformidade = média das conformidades das suas questões (0–1). Os pesos dos
--    critérios (soma 100) repartem os 80 pontos. Critérios sem respostas pontuáveis
--    neste serviço ficam de fora e os pesos dos restantes são reescalados.
--  • Áudio (10 pontos): nota do auditor 0–5 × 2. Argumentos escritos (10 pontos): idem.
--  • Sem áudio gravado, a parcela do áudio vale 0. Sem argumentos escritos, a dos
--    argumentos vale 0.
--  • A nota é calculada SEMPRE no servidor, a partir da configuração congelada
--    (questions_snapshot) e das respostas (detailed_answers). O frontend não envia a nota.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Equipa na avaliação (a submissão passa a gravar a equipa que prestou o serviço)
-- ----------------------------------------------------------------------------
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS team_name text;
CREATE INDEX IF NOT EXISTS idx_evaluations_team_id ON public.evaluations (team_id);

-- ----------------------------------------------------------------------------
-- 2. Funções auxiliares (internas: só as usam as funções SECURITY DEFINER)
-- ----------------------------------------------------------------------------

-- Normaliza um nome/código: sem acentos, maiúsculas, separadores -> '_'.
-- Espelha normalizeKey() do frontend (src/services/weightBalancer.ts).
CREATE OR REPLACE FUNCTION public.sicsc_norm_key(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '_' FROM regexp_replace(
           upper(translate(COALESCE(p, ''),
             'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
             'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
           '[^A-Z0-9]+', '_', 'g'))
$$;

-- Conformidade (0–1) de UMA resposta, segundo a configuração congelada da questão.
-- Espelha questionConformity() de src/services/questionScoring.ts. NULL = não entra no cálculo.
CREATE OR REPLACE FUNCTION public.sicsc_question_conformity(q jsonb, a jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_type text := COALESCE(q->>'type', '');
  v_scores jsonb := COALESCE(q->'optionScores', '{}'::jsonb);
  v_rating numeric;
  v_choice text;
  v_val numeric;
  v_denom numeric;
  v_picked numeric;
BEGIN
  IF a IS NULL OR jsonb_typeof(a) <> 'object' THEN RETURN NULL; END IF;
  IF COALESCE(jsonb_typeof(q->'affectsScore'), '') = 'boolean' AND (q->>'affectsScore')::boolean = false THEN
    RETURN NULL;
  END IF;

  IF v_type IN ('RATING_5', 'RATING_10', 'NPS_10') THEN
    IF COALESCE(a->>'rating', '') !~ '^[0-9]+(\.[0-9]+)?$' THEN RETURN NULL; END IF;
    v_rating := (a->>'rating')::numeric;
    IF v_type = 'RATING_5' THEN
      IF v_rating < 1 OR v_rating > 5 THEN RETURN NULL; END IF;
      RETURN v_rating / 5;
    ELSIF v_type = 'RATING_10' THEN
      IF v_rating < 1 OR v_rating > 10 THEN RETURN NULL; END IF;
      RETURN v_rating / 10;
    ELSE
      IF v_rating < 0 OR v_rating > 10 THEN RETURN NULL; END IF;
      RETURN v_rating / 10;
    END IF;

  ELSIF v_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE') THEN
    v_choice := COALESCE(NULLIF(a->>'choice', ''), NULLIF(a->>'textAnswer', ''));
    IF v_choice IS NULL OR COALESCE(v_scores ->> v_choice, '') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      RETURN NULL;
    END IF;
    v_val := (v_scores ->> v_choice)::numeric;
    RETURN LEAST(1, GREATEST(0, v_val));

  ELSIF v_type = 'MULTI_CHOICE' THEN
    IF COALESCE(jsonb_typeof(a->'choices'), '') <> 'array' THEN RETURN NULL; END IF;
    SELECT COALESCE(SUM(CASE WHEN value::numeric > 0 THEN value::numeric ELSE 0 END), 0) INTO v_denom
    FROM jsonb_each_text(v_scores)
    WHERE value ~ '^-?[0-9]+(\.[0-9]+)?$';
    IF v_denom <= 0 THEN RETURN NULL; END IF;
    SELECT COALESCE(SUM(GREATEST(0, (v_scores ->> ch.v)::numeric)), 0) INTO v_picked
    FROM jsonb_array_elements_text(a->'choices') AS ch(v)
    WHERE COALESCE(v_scores ->> ch.v, '') ~ '^-?[0-9]+(\.[0-9]+)?$';
    RETURN LEAST(1, GREATEST(0, v_picked / v_denom));

  ELSIF v_type = 'YES_NO_NA' THEN
    IF a->>'yesNo' = 'YES' THEN
      RETURN LEAST(1, GREATEST(0, COALESCE((q->>'yesScore')::numeric, 1)));
    ELSIF a->>'yesNo' = 'NO' THEN
      RETURN LEAST(1, GREATEST(0, COALESCE((q->>'noScore')::numeric, 0)));
    END IF;
    RETURN NULL;  -- N.A. ou sem resposta: fora do cálculo
  END IF;

  -- Texto, áudio e outros tipos não numéricos: avaliados pelo auditor
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sicsc_norm_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sicsc_question_conformity(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. HOMOLOGAÇÃO 80/20 (a nota é calculada no servidor; p_criterion_ratings é ignorado)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_and_finalize_evaluation(
  p_evaluation_id uuid,
  p_criterion_ratings jsonb,          -- mantido por compatibilidade; o servidor calcula as conformidades
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
  v_now timestamptz := clock_timestamp();
  v_review jsonb;
  v_key text;
  v_pq jsonb;
  v_answers jsonb;
  v_questions jsonb;
  v_has_audio boolean;
  v_has_written boolean;
  v_avg numeric;
  v_n integer;
  v_applicable_w numeric := 0;
  v_weighted numeric := 0;
  v_auto numeric;
  v_audio numeric := 0;
  v_arg numeric := 0;
  v_score numeric;
  v_class text;
  v_criteria jsonb := '[]'::jsonb;
  v_ratings jsonb := '{}'::jsonb;
  v_snapshot jsonb;
  c record;
BEGIN
  IF COALESCE(public.current_user_role()::text, '') NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN e HR podem homologar avaliações.';
  END IF;

  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  IF v_eval.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta avaliação já se encontra homologada e é imutável.';
  END IF;

  -- Pesos dos critérios: soma exata de 100 (repartem os 80 pontos automáticos)
  SELECT COALESCE(SUM(weight_percentage), 0), COUNT(*) INTO v_total, v_count
  FROM public.evaluation_criteria WHERE active;
  IF v_count = 0 OR abs(v_total - 100) > 0.01 THEN
    RAISE EXCEPTION 'A soma dos pesos dos critérios ativos deve ser exatamente 100%% (soma atual: %)', v_total;
  END IF;

  -- Parecer do auditor: só nota do áudio e nota dos argumentos escritos (0 a 5)
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

  v_answers := CASE WHEN jsonb_typeof(v_eval.detailed_answers) = 'object' THEN v_eval.detailed_answers ELSE '{}'::jsonb END;
  v_questions := CASE WHEN jsonb_typeof(v_eval.questions_snapshot) = 'array' THEN v_eval.questions_snapshot ELSE '[]'::jsonb END;

  -- O que o cliente deixou: áudio e argumentos escritos (o marcador do áudio não conta como texto)
  v_has_audio := v_eval.audio_recording_url IS NOT NULL
    OR EXISTS (SELECT 1 FROM jsonb_each(v_answers) e WHERE COALESCE(e.value->>'audioUrl', '') <> '');
  v_has_written := EXISTS (SELECT 1 FROM jsonb_each(v_answers) e WHERE btrim(COALESCE(e.value->>'textAnswer', '')) <> '')
    OR length(regexp_replace(
         replace(COALESCE(v_eval.comment, ''), '*(Áudio de testemunho gravado pelo cliente)*', ''),
         '\s', '', 'g')) > 0;

  IF v_has_audio AND (v_review -> 'audio' ->> 'score') IS NULL THEN
    RAISE EXCEPTION 'Falta classificar o áudio do cliente (nota de 0 a 5).';
  END IF;
  IF v_has_written AND (v_review -> 'writtenArguments' ->> 'score') IS NULL THEN
    RAISE EXCEPTION 'Faltam classificar os argumentos escritos do cliente (nota de 0 a 5).';
  END IF;

  -- Parte automática (80 pontos): conformidade por critério, a partir das respostas
  FOR c IN SELECT * FROM public.evaluation_criteria WHERE active ORDER BY display_order, id LOOP
    v_key := public.sicsc_norm_key(COALESCE(NULLIF(c.category_code, ''), c.category_name));
    SELECT AVG(s.conf), COUNT(s.conf) INTO v_avg, v_n
    FROM (
      SELECT public.sicsc_question_conformity(q.value, v_answers -> (q.value->>'id')) AS conf
      FROM jsonb_array_elements(v_questions) AS q(value)
      WHERE public.sicsc_norm_key(q.value->>'category') = v_key
    ) s;

    IF v_n > 0 THEN
      v_applicable_w := v_applicable_w + c.weight_percentage;
      v_weighted := v_weighted + v_avg * c.weight_percentage;
      v_ratings := v_ratings || jsonb_build_object(c.id, round(v_avg * c.max_score, 2));
      v_criteria := v_criteria || jsonb_build_object(
        'criterionId', c.id, 'categoryName', c.category_name, 'weightPercentage', c.weight_percentage,
        'maxScore', c.max_score, 'conformity', round(v_avg, 4), 'rating', round(v_avg * c.max_score, 2),
        'scoredQuestions', v_n);
    END IF;
  END LOOP;

  IF v_applicable_w <= 0 THEN
    RAISE EXCEPTION 'Não há respostas pontuáveis para calcular a parte automática (80%%) desta avaliação.';
  END IF;

  v_auto := round(80 * v_weighted / v_applicable_w, 4);
  SELECT COALESCE(jsonb_agg(elem || jsonb_build_object(
           'weightedContribution', round((elem->>'conformity')::numeric * (elem->>'weightPercentage')::numeric / v_applicable_w * 80, 4))), '[]'::jsonb)
    INTO v_criteria
  FROM jsonb_array_elements(v_criteria) AS elem;

  -- Parte do auditor (20 pontos): nota 0–5 × 2 (áudio 10 + argumentos 10). Sem o elemento, vale 0.
  IF v_has_audio THEN
    v_audio := round((v_review -> 'audio' ->> 'score')::numeric * 2, 4);
  END IF;
  IF v_has_written THEN
    v_arg := round((v_review -> 'writtenArguments' ->> 'score')::numeric * 2, 4);
  END IF;

  -- Limiar
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

  v_score := round(v_auto + v_audio + v_arg, 2);
  v_class := CASE WHEN v_score >= v_threshold THEN 'POSITIVE' ELSE 'NEGATIVE' END;

  v_snapshot := jsonb_build_object(
    'model', '80-20',
    'automaticPoints', v_auto, 'audioPoints', v_audio, 'argumentPoints', v_arg,
    'hasAudio', v_has_audio, 'hasWrittenArguments', v_has_written,
    'passingThreshold', v_threshold, 'totalWeight', v_total,
    'applicableWeight', v_applicable_w,
    'overrideReason', p_threshold_override_reason, 'evaluatedCriteria', v_criteria,
    'calculatedAt', v_now, 'calculatedBy', v_email,
    'auditorReview', v_review);

  UPDATE public.evaluations
  SET technical_score = v_score, final_classification = v_class, finalized_at = v_now,
      finalized_by = v_email, criteria_snapshot = v_snapshot, criterion_ratings = v_ratings,
      auditor_review = v_review, status = 'REVIEWED', updated_at = v_now
  WHERE id = p_evaluation_id;

  PERFORM public.log_audit_event('UPDATE', 'evaluations', p_evaluation_id::text, 'SUCCESS',
    format('Avaliação %s homologada: %s%% (automático %s + áudio %s + argumentos %s)',
           v_eval.reference, v_score, v_auto, v_audio, v_arg), v_email);

  RETURN jsonb_build_object(
    'success', true, 'evaluationId', p_evaluation_id,
    'finalScore', v_score, 'finalClassification', v_class, 'snapshot', v_snapshot,
    'automaticPoints', v_auto, 'audioPoints', v_audio, 'argumentPoints', v_arg,
    'finalizedBy', v_email, 'finalizedAt', v_now);
END;
$$;
GRANT EXECUTE ON FUNCTION public.calculate_and_finalize_evaluation(uuid, jsonb, numeric, text, jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. SUBMISSÃO: associação automática de empresa e equipa (versão da 1000 + ligações)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_evaluation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_client text;
  v_service_id uuid;
  v_service_name text;
  v_provider_id uuid;
  v_provider_name text;
  v_sat numeric;
  v_sat_int integer;
  v_nps integer;
  v_dur integer;
  v_audio text;
  v_version uuid;
  v_follow boolean;
  v_id uuid;
  v_ref text;
  v_types text[];
  v_answers jsonb;
  v_snapshot jsonb;
  v_date date;
  v_ip text;
  v_norm text;
  v_match_count integer;
  v_client_id uuid;
  v_client_official text;
  v_team_id uuid;
  v_team_name text;
BEGIN
  -- Limite por endereço (x-forwarded-for enviado pela plataforma)
  v_ip := left(COALESCE(
            NULLIF(btrim(split_part(COALESCE(
              (COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::json) ->> 'x-forwarded-for', ''), ',', 1)), ''),
            'desconhecido'), 64);
  IF (SELECT count(*) FROM public.evaluations
      WHERE submitted_ip = v_ip AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Demasiadas submissões a partir deste endereço. Tente novamente mais tarde.';
  END IF;

  v_client := left(btrim(COALESCE(p_payload->>'clientName', p_payload->>'clientNameInput', '')), 200);
  IF length(v_client) < 2 THEN
    RAISE EXCEPTION 'O nome da empresa cliente é obrigatório (mínimo 2 caracteres).';
  END IF;

  -- Associação automática à empresa da base de dados: só quando o nome (ou código interno) corresponde a UM cliente ativo
  v_norm := public.sicsc_norm_key(v_client);
  v_client_id := NULL;
  v_client_official := NULL;
  IF v_norm <> '' THEN
    SELECT count(*), (array_agg(c.id))[1], (array_agg(c.company_name))[1]
      INTO v_match_count, v_client_id, v_client_official
    FROM public.clients c
    WHERE c.status = 'ACTIVE'
      AND (public.sicsc_norm_key(c.company_name) = v_norm
           OR (c.internal_code IS NOT NULL AND public.sicsc_norm_key(c.internal_code) = v_norm));
    IF v_match_count <> 1 THEN
      v_client_id := NULL;
      v_client_official := NULL;
    END IF;
  END IF;

  SELECT s.id, s.name INTO v_service_id, v_service_name
  FROM public.services s
  WHERE s.id::text = btrim(COALESCE(p_payload->>'serviceId', '')) AND s.status = 'ACTIVE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O serviço selecionado é inválido ou encontra-se inativo.';
  END IF;

  IF COALESCE(p_payload->>'satisfactionRating', '') !~ '^[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'A classificação de satisfação é obrigatória (valor de 1 a 5).';
  END IF;
  v_sat := (p_payload->>'satisfactionRating')::numeric;
  v_sat_int := round(v_sat)::integer;
  IF v_sat_int NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'A classificação de satisfação deve estar entre 1 e 5.';
  END IF;

  v_nps := NULL;
  IF COALESCE(p_payload->>'npsScore', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN
    v_nps := round((p_payload->>'npsScore')::numeric)::integer;
    IF v_nps NOT BETWEEN 0 AND 10 THEN
      RAISE EXCEPTION 'O NPS deve estar entre 0 e 10.';
    END IF;
  END IF;

  v_audio := NULLIF(btrim(COALESCE(p_payload->>'audioRecordingUrl', '')), '');
  IF v_audio IS NOT NULL AND v_audio !~ '^submissions/[A-Za-z0-9._/-]{1,200}$' THEN
    RAISE EXCEPTION 'Referência de áudio inválida.';
  END IF;
  v_dur := NULL;
  IF COALESCE(p_payload->>'audioDurationSeconds', '') ~ '^[0-9]+$' THEN
    v_dur := (p_payload->>'audioDurationSeconds')::integer;
  END IF;
  IF v_dur IS NOT NULL AND v_dur > 45 THEN
    RAISE EXCEPTION 'A duração máxima permitida para o áudio é de 45 segundos.';
  END IF;
  IF v_audio IS NULL THEN v_dur := NULL; END IF;

  IF COALESCE(p_payload->>'providerId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT pr.id, pr.name INTO v_provider_id, v_provider_name
    FROM public.providers pr
    WHERE pr.id = (p_payload->>'providerId')::uuid AND pr.status = 'ACTIVE';
  END IF;

  SELECT fv.id INTO v_version FROM public.form_versions fv
  WHERE fv.status = 'PUBLISHED' ORDER BY fv.version_number DESC LIMIT 1;

  v_types := ARRAY(SELECT jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_payload->'serviceTypesProvided') = 'array' THEN p_payload->'serviceTypesProvided' ELSE '[]'::jsonb END));

  v_answers := CASE WHEN jsonb_typeof(p_payload->'detailedAnswers') = 'object' THEN p_payload->'detailedAnswers' ELSE '{}'::jsonb END;
  v_snapshot := CASE WHEN jsonb_typeof(p_payload->'questionsSnapshot') = 'array' THEN p_payload->'questionsSnapshot' ELSE '[]'::jsonb END;

  v_date := CURRENT_DATE;
  IF COALESCE(p_payload->>'serviceDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    v_date := (p_payload->>'serviceDate')::date;
  END IF;

  -- Associação automática à equipa que prestou o serviço (só equipas ativas e existentes)
  v_team_id := NULL;
  v_team_name := NULL;
  IF COALESCE(p_payload->>'teamId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT t.id, t.name INTO v_team_id, v_team_name
    FROM public.teams t
    WHERE t.id = (p_payload->>'teamId')::uuid AND t.status = 'ACTIVE';
  END IF;

  v_follow := (v_sat_int <= 2) OR (v_nps IS NOT NULL AND v_nps <= 6);

  INSERT INTO public.evaluations (
    client_id, client_name, client_name_input, service_id, service_name, provider_id, provider_name_input,
    form_version_id, service_date, satisfaction_rating, nps_score, comment,
    audio_recording_url, audio_duration_seconds, service_types_provided,
    detailed_answers, questions_snapshot, status, requires_follow_up, corrective_action_status, submitted_ip,
    team_id, team_name
  ) VALUES (
    v_client_id, COALESCE(v_client_official, v_client), v_client, v_service_id, v_service_name, v_provider_id,
    left(NULLIF(btrim(COALESCE(p_payload->>'providerName', '')), ''), 200),
    v_version, v_date, v_sat_int, v_nps, left(p_payload->>'comment', 5000),
    v_audio, v_dur, v_types, v_answers, v_snapshot,
    'PENDING_REVIEW', v_follow, CASE WHEN v_follow THEN 'PENDING' ELSE 'NOT_NEEDED' END, v_ip,
    v_team_id, v_team_name
  )
  RETURNING id, reference INTO v_id, v_ref;

  PERFORM public.log_audit_event('CREATE', 'evaluations', v_id::text, 'SUCCESS',
    format('Submissão pública registada para a empresa %s (Serviço: %s)', COALESCE(v_client_official, v_client), v_service_name),
    'public@aeternu.co.ao');

  RETURN jsonb_build_object('success', true, 'id', v_id, 'reference', v_ref,
                            'status', 'PENDING_REVIEW', 'message', 'Avaliação submetida com sucesso.');
END;
$$;

-- Privilégio de escrita para a gestão serviço-categoria (RLS limita a escrita a ADMIN/HR)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_categories TO authenticated;

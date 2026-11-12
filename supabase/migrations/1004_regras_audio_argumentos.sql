-- ============================================================================
-- 1004 — Regras de pontuação do áudio e dos argumentos (substitui a regra da 1003)
-- Executar DEPOIS da 1003. Idempotente e sem apagar dados.
--
--  • Sem áudio gravado: 10 pontos atribuídos automaticamente (sem nota do auditor).
--  • Com áudio gravado: nota do auditor 0–5 × 2.
--  • Com comentário escrito: nota do auditor 0–5 × 2.
--  • Sem comentário escrito: o analisador decide, pelas respostas do cliente, se atribui
--    os 10 pontos (nota 5) ou nenhum (nota 0). Nenhuma outra nota é aceite.
-- ============================================================================

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
  -- Sem comentário escrito: o analisador decide, pelas respostas, se atribui os 10 pontos ou nenhum
  IF NOT v_has_written AND (v_review -> 'writtenArguments' ->> 'score') IS NULL THEN
    RAISE EXCEPTION 'O cliente não escreveu comentário: indique se o analisador atribui os 10 pontos dos argumentos (sim) ou não (não).';
  END IF;
  IF NOT v_has_written AND (v_review -> 'writtenArguments' ->> 'score')::numeric NOT IN (0, 5) THEN
    RAISE EXCEPTION 'Sem comentário escrito, a decisão é tudo ou nada: use 5 (10 pontos) ou 0 (nenhum ponto).';
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

  -- Parte do auditor (20 pontos): áudio 0–5 × 2 (ou 10 automáticos se não houver áudio); argumentos 0–5 × 2.
  -- Sem áudio gravado: 10 pontos atribuídos automaticamente.
  IF v_has_audio THEN
    v_audio := round((v_review -> 'audio' ->> 'score')::numeric * 2, 4);
  ELSE
    v_audio := 10;
  END IF;
  -- Argumentos: nota 0–5 × 2 (com comentário) ou 0 / 10 por decisão do analisador (sem comentário)
  v_arg := round((v_review -> 'writtenArguments' ->> 'score')::numeric * 2, 4);

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
    'hasAudio', v_has_audio, 'audioAutomatic', NOT v_has_audio,
    'hasWrittenArguments', v_has_written, 'argumentsDecidedByAuditor', NOT v_has_written,
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

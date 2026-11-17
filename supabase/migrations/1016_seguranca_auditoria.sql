-- ============================================================================
-- 1016 — Correções da auditoria de segurança (SICSC)
--
-- Migração NOVA: não altera migrações já aplicadas (1000–1015).
-- Corrige: VUL-02 (imutabilidade e transições de estado), VUL-06 (equipas
-- inativas), VUL-07 (IP de submissão, duplicados, tamanhos), VUL-08 (auditoria),
-- VUL-09 (troca de palavra-passe imposta no servidor), VUL-10 (quota de áudio),
-- VUL-01 (revisão de avaliação só por RPC), VUL-03 (vistas públicas sem clientes/prestadores para anónimos).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- VUL-09: enquanto a palavra-passe temporária não for trocada, a conta não
-- tem acesso aos dados (o RLS passa a depender de current_user_role()).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p.role FROM public.profiles p
  WHERE p.id = auth.uid() AND p.active = true AND COALESCE(p.must_change_password, false) = false
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_provider_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p.provider_id FROM public.profiles p
  WHERE p.id = auth.uid() AND p.active = true AND COALESCE(p.must_change_password, false) = false
  LIMIT 1
$$;

-- ----------------------------------------------------------------------------
-- VUL-08: auditoria — tipos de operação em lista branca, texto limitado,
-- limite de registos por utilizador e por minuto.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_system_audit(
  p_operation_type text, p_affected_entity text, p_record_id text, p_result text, p_details text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_recent integer;
BEGIN
  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = auth.uid() AND p.active = true;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Sessão sem perfil ativo.';
  END IF;
  IF upper(COALESCE(p_operation_type, '')) NOT IN ('CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'LOGIN', 'LOGOUT') THEN
    RAISE EXCEPTION 'Tipo de operação de auditoria não permitido.';
  END IF;
  SELECT count(*) INTO v_recent FROM public.audit_logs
  WHERE user_email = v_email AND created_at > now() - interval '1 minute';
  IF v_recent >= 300 THEN
    RAISE EXCEPTION 'Demasiados registos de auditoria em pouco tempo.';
  END IF;
  PERFORM public.log_audit_event(
    upper(p_operation_type),
    left(COALESCE(p_affected_entity, ''), 80),
    left(p_record_id, 80),
    p_result,
    left(COALESCE(p_details, ''), 500),
    v_email
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- VUL-02: imutabilidade real de avaliações homologadas.
-- Após homologação só podem mudar o estado e a ação corretiva, e apenas
-- em transições válidas. Qualquer outra coluna fica bloqueada, incluindo
-- provider_id, client_id, service_id, team_id e os resultados.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_finalized_evaluation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION 'Avaliação homologada não pode ser eliminada.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.finalized_at IS NOT NULL THEN
    IF (to_jsonb(NEW) - 'status' - 'corrective_action_status' - 'updated_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'corrective_action_status' - 'updated_at') THEN
      RAISE EXCEPTION 'Avaliação homologada é imutável: apenas o estado e a ação corretiva podem ser atualizados.';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status = 'ARCHIVED' THEN
        RAISE EXCEPTION 'Avaliação arquivada não pode mudar de estado.';
      END IF;
      IF NEW.status = 'PENDING_REVIEW' THEN
        RAISE EXCEPTION 'Avaliação homologada não pode voltar a pendente de análise.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- VUL-01: revisão manual (CSAT, NPS, comentário e estado) só por RPC, com
-- justificação e registo de auditoria. A pontuação técnica e a classificação
-- final deixam de ser editáveis manualmente: são calculadas no servidor.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_evaluation_review(
  p_evaluation_id uuid,
  p_satisfaction integer,
  p_nps integer,
  p_comment text,
  p_status text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := COALESCE(public.current_user_role()::text, '');
  v_email text := public.current_user_email();
  v_eval public.evaluations%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_feedback_changed boolean;
BEGIN
  IF v_role NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN e HR podem rever avaliações.';
  END IF;

  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Avaliação não encontrada.';
  END IF;

  IF p_satisfaction IS NOT NULL AND (p_satisfaction < 1 OR p_satisfaction > 5) THEN
    RAISE EXCEPTION 'A classificação de satisfação deve estar entre 1 e 5.';
  END IF;
  IF p_nps IS NOT NULL AND (p_nps < 0 OR p_nps > 10) THEN
    RAISE EXCEPTION 'O NPS deve estar entre 0 e 10.';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('PENDING_REVIEW', 'REVIEWED', 'APPROVED', 'RESOLVED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'Estado de avaliação inválido.';
  END IF;

  v_feedback_changed :=
       (p_satisfaction IS NOT NULL AND p_satisfaction IS DISTINCT FROM v_eval.satisfaction_rating)
    OR (p_nps IS NOT NULL AND p_nps IS DISTINCT FROM v_eval.nps_score)
    OR (p_comment IS NOT NULL AND p_comment IS DISTINCT FROM v_eval.comment);

  IF v_feedback_changed THEN
    IF v_eval.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION 'Avaliação homologada é imutável: resultados e comentário não podem ser alterados.';
    END IF;
    IF length(v_reason) < 10 THEN
      RAISE EXCEPTION 'Indique a justificação da alteração (mínimo 10 caracteres).';
    END IF;
  END IF;

  UPDATE public.evaluations SET
    satisfaction_rating = COALESCE(p_satisfaction, satisfaction_rating),
    nps_score = COALESCE(p_nps, nps_score),
    comment = CASE WHEN p_comment IS NULL THEN comment ELSE left(p_comment, 5000) END,
    status = COALESCE(p_status, status),
    updated_at = now()
  WHERE id = p_evaluation_id;

  IF v_feedback_changed OR (p_status IS NOT NULL AND p_status IS DISTINCT FROM v_eval.status) THEN
    PERFORM public.log_audit_event(
      'UPDATE', 'evaluations', p_evaluation_id::text, 'SUCCESS',
      format('Revisão da avaliação %s: CSAT %s→%s, NPS %s→%s, estado %s→%s. Justificação: %s',
             v_eval.reference,
             v_eval.satisfaction_rating, COALESCE(p_satisfaction, v_eval.satisfaction_rating),
             COALESCE(v_eval.nps_score::text, '—'), COALESCE(p_nps::text, COALESCE(v_eval.nps_score::text, '—')),
             v_eval.status, COALESCE(p_status, v_eval.status),
             CASE WHEN v_reason = '' THEN '(sem justificação)' ELSE left(v_reason, 300) END),
      v_email
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_evaluation_review(uuid, integer, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_evaluation_review(uuid, integer, integer, text, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- VUL-06: lista de prestadores só para equipas ativas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_public_team_providers(p_team_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name) ORDER BY pr.name), '[]'::jsonb)
  FROM public.providers pr
  WHERE pr.team_id = p_team_id
    AND pr.status = 'ACTIVE'
    AND EXISTS (SELECT 1 FROM public.teams t WHERE t.id = p_team_id AND t.status = 'ACTIVE');
$$;

-- ----------------------------------------------------------------------------
-- VUL-07: submissão pública — IP fiável, duplicados e tamanhos limitados.
-- (corpo de submit_evaluation_core gerado a partir da migração 1005)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_evaluation_core(p_payload jsonb)
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
  v_prov_team uuid;
  v_prov_count integer;
BEGIN
  -- Limite por endereço: usa o ÚLTIMO valor de X-Forwarded-For (acrescentado pela plataforma).
  -- O primeiro valor é controlado pelo cliente e não pode ser usado para o limite.
  DECLARE
    v_xff text := COALESCE((COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::json) ->> 'x-forwarded-for', '');
    v_parts text[] := string_to_array(v_xff, ',');
  BEGIN
    v_ip := left(COALESCE(NULLIF(btrim(v_parts[array_length(v_parts, 1)]), ''), 'desconhecido'), 64);
  END;
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


  SELECT fv.id INTO v_version FROM public.form_versions fv
  WHERE fv.status = 'PUBLISHED' ORDER BY fv.version_number DESC LIMIT 1;

  v_types := ARRAY(SELECT jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_payload->'serviceTypesProvided') = 'array' THEN p_payload->'serviceTypesProvided' ELSE '[]'::jsonb END));

  v_answers := CASE WHEN jsonb_typeof(p_payload->'detailedAnswers') = 'object' THEN p_payload->'detailedAnswers' ELSE '{}'::jsonb END;
  v_snapshot := CASE WHEN jsonb_typeof(p_payload->'questionsSnapshot') = 'array' THEN p_payload->'questionsSnapshot' ELSE '[]'::jsonb END;

  IF length(COALESCE(p_payload->>'detailedAnswers', '')) > 20000 OR length(COALESCE(p_payload->>'questionsSnapshot', '')) > 20000 THEN
    RAISE EXCEPTION 'Os dados da avaliação excedem o tamanho permitido.';
  END IF;

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

  -- Funcionário que prestou o serviço:
  --  • o escolhido no formulário, desde que pertença à equipa indicada;
  --  • sem escolha, o único prestador ativo da equipa (se a equipa tiver exatamente um).
  v_provider_id := NULL;
  v_provider_name := NULL;
  IF COALESCE(p_payload->>'providerId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT pr.id, pr.name, pr.team_id INTO v_provider_id, v_provider_name, v_prov_team
    FROM public.providers pr
    WHERE pr.id = (p_payload->>'providerId')::uuid AND pr.status = 'ACTIVE';
    IF v_provider_id IS NOT NULL AND v_team_id IS NOT NULL AND v_prov_team IS DISTINCT FROM v_team_id THEN
      RAISE EXCEPTION 'O funcionário escolhido não pertence à equipa indicada.';
    END IF;
  END IF;
  IF v_provider_id IS NULL AND v_team_id IS NOT NULL THEN
    SELECT count(*), (array_agg(pr.id))[1], (array_agg(pr.name))[1]
      INTO v_prov_count, v_provider_id, v_provider_name
    FROM public.providers pr
    WHERE pr.team_id = v_team_id AND pr.status = 'ACTIVE';
    IF v_prov_count <> 1 THEN
      v_provider_id := NULL;
      v_provider_name := NULL;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.evaluations e
    WHERE e.created_at > now() - interval '10 minutes'
      AND e.service_id IS NOT DISTINCT FROM v_service_id
      AND e.client_name = COALESCE(v_client_official, v_client)
      AND e.service_date = v_date
      AND e.satisfaction_rating = v_sat_int
      AND COALESCE(e.comment, '') = COALESCE(left(p_payload->>'comment', 5000), '')
  ) THEN
    RAISE EXCEPTION 'Esta avaliação já foi submetida há instantes.';
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
REVOKE ALL ON FUNCTION public.submit_evaluation_core(jsonb) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- VUL-10: quota diária de áudios anónimos (2000 por dia no bucket).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audio_upload_quota_ok()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT (
    SELECT count(*) FROM storage.objects o
    WHERE o.bucket_id = 'evaluation-audio' AND o.created_at > now() - interval '1 day'
  ) < 2000
$$;
REVOKE ALL ON FUNCTION public.audio_upload_quota_ok() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audio_upload_quota_ok() TO anon, authenticated;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS sicsc_audio_anon_insert ON storage.objects';
    EXECUTE $p$CREATE POLICY sicsc_audio_anon_insert ON storage.objects FOR INSERT TO anon, authenticated
      WITH CHECK (bucket_id = 'evaluation-audio' AND name LIKE 'submissions/%' AND public.audio_upload_quota_ok())$p$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- VUL-03: clientes e prestadores deixam de ser legíveis por anónimos.
-- O formulário público não lista clientes (o nome é texto livre e a associação
-- é feita no servidor). Só usa equipas, serviços e list_public_team_providers.
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.v_public_clients, public.v_public_providers FROM anon;

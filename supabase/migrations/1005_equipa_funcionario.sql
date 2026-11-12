-- ============================================================================
-- 1005 — Equipa e funcionário na submissão pública
-- Executar DEPOIS da 1004. Idempotente e sem apagar dados.
--
--  • providers.team_id: cada prestador pertence a uma equipa.
--  • v_public_teams: lista pública (sem contactos) das equipas ativas, para o formulário anónimo.
--    A tabela teams continua restrita a utilizadores internos.
--  • list_public_team_providers(equipa): nomes dos prestadores ativos da equipa (sem contactos).
--  • submit_evaluation: associa o funcionário escolhido (validado contra a equipa) ou, sem escolha,
--    o único prestador ativo da equipa.
-- ============================================================================

ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_providers_team_id ON public.providers (team_id);

CREATE OR REPLACE VIEW public.v_public_teams AS
  SELECT id, name, code, department FROM public.teams WHERE status = 'ACTIVE';
GRANT SELECT ON public.v_public_teams TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_public_team_providers(p_team_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name) ORDER BY pr.name), '[]'::jsonb)
  FROM public.providers pr
  WHERE pr.team_id = p_team_id AND pr.status = 'ACTIVE';
$$;
REVOKE ALL ON FUNCTION public.list_public_team_providers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_team_providers(uuid) TO anon, authenticated;

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
  v_prov_team uuid;
  v_prov_count integer;
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
REVOKE ALL ON FUNCTION public.submit_evaluation(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_evaluation(jsonb) TO anon, authenticated;

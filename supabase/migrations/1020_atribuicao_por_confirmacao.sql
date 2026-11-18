-- ============================================================================
-- 1020 — Atribuição de equipa/funcionário por confirmação do RH
-- Migração nova. Não altera as migrações anteriores.
--
-- O cliente escreve o nome da equipa ou do funcionário (texto livre). O sistema
-- sugere a equipa e o funcionário correspondentes (só com correspondência única),
-- mas NÃO associa: a associação passa a ser feita pelo RH (confirm_evaluation_attribution)
-- e a avaliação só pode ser homologada depois de associada.
-- ============================================================================

-- 1) Campos novos
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS staff_name_input text;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS suggested_team_id uuid;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS suggested_provider_id uuid;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS attribution_confirmed boolean NOT NULL DEFAULT false;

-- Avaliações já existentes continuam como estão (já estavam associadas ou são históricas).
UPDATE public.evaluations SET attribution_confirmed = true WHERE attribution_confirmed = false;

-- 2) Normalização para comparação de nomes (minúsculas, sem acentos, sem pontuação)
CREATE OR REPLACE FUNCTION public.sicsc_norm_text(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(
    translate(lower(COALESCE(t, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- 3) Sugestão: só devolve uma equipa/funcionário quando a correspondência é única
CREATE OR REPLACE FUNCTION public.sicsc_suggest_staff(p_text text)
RETURNS TABLE(team_id uuid, provider_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_norm text := public.sicsc_norm_text(p_text);
  v_n integer;
  v_prov uuid;
  v_team uuid;
BEGIN
  IF length(v_norm) < 3 THEN
    RETURN;
  END IF;

  -- 1.º: funcionário com o nome exato
  SELECT count(*), (array_agg(p.id))[1] INTO v_n, v_prov
  FROM public.providers p
  WHERE p.status = 'ACTIVE' AND public.sicsc_norm_text(p.name) = v_norm;

  -- 2.º: funcionário cujo nome contém o texto (ex.: "Técnico Um" para "Um")
  IF v_n IS DISTINCT FROM 1 THEN
    SELECT count(*), (array_agg(p.id))[1] INTO v_n, v_prov
    FROM public.providers p
    WHERE p.status = 'ACTIVE' AND public.sicsc_norm_text(p.name) LIKE '%' || v_norm || '%';
  END IF;

  IF v_n = 1 THEN
    SELECT p.team_id INTO v_team FROM public.providers p WHERE p.id = v_prov;
    RETURN QUERY SELECT v_team, v_prov;
    RETURN;
  END IF;

  -- 3.º: equipa com o nome exato ou que contém o texto
  SELECT count(*), (array_agg(t.id))[1] INTO v_n, v_team
  FROM public.teams t
  WHERE t.status = 'ACTIVE' AND public.sicsc_norm_text(t.name) = v_norm;
  IF v_n IS DISTINCT FROM 1 THEN
    SELECT count(*), (array_agg(t.id))[1] INTO v_n, v_team
    FROM public.teams t
    WHERE t.status = 'ACTIVE' AND public.sicsc_norm_text(t.name) LIKE '%' || v_norm || '%';
  END IF;
  IF v_n = 1 THEN
    RETURN QUERY SELECT v_team, NULL::uuid;
  END IF;
  RETURN;
END;
$$;
REVOKE ALL ON FUNCTION public.sicsc_suggest_staff(text) FROM PUBLIC, anon, authenticated;

-- 4) Envolvente do envio público: guarda o texto e a sugestão, sem associar
CREATE OR REPLACE FUNCTION public.submit_evaluation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff text := left(btrim(COALESCE(p_payload ->> 'staffNameInput', '')), 160);
  v_payload jsonb;
  v_result jsonb;
  v_id uuid;
  v_team uuid;
  v_prov uuid;
BEGIN
  IF v_staff <> '' THEN
    -- Com texto livre o cliente não escolhe equipa nem funcionário: ignora quaisquer identificadores enviados.
    v_payload := p_payload - 'clientVisibleToTeam' - 'staffNameInput' - 'teamId' - 'providerId';
  ELSE
    v_payload := p_payload - 'clientVisibleToTeam' - 'staffNameInput';
  END IF;

  v_result := public.submit_evaluation_core(v_payload);

  IF v_staff <> '' THEN
    v_id := (v_result ->> 'id')::uuid;
    SELECT s.team_id, s.provider_id INTO v_team, v_prov FROM public.sicsc_suggest_staff(v_staff) s;
    UPDATE public.evaluations
    SET staff_name_input = v_staff,
        suggested_team_id = v_team,
        suggested_provider_id = v_prov,
        attribution_confirmed = false
    WHERE id = v_id;
  END IF;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_evaluation(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_evaluation(jsonb) TO anon, authenticated;

-- 5) Confirmação pelo RH (ou Administrador) — única forma de associar
CREATE OR REPLACE FUNCTION public.confirm_evaluation_attribution(
  p_evaluation_id uuid, p_team_id uuid, p_provider_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := COALESCE(public.current_user_role()::text, '');
  v_eval public.evaluations%ROWTYPE;
  v_team uuid := p_team_id;
  v_team_name text;
  v_prov_name text;
BEGIN
  IF v_role NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas RH e Administrador confirmam a associação.';
  END IF;

  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  IF v_eval.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'Avaliação já homologada: a associação não pode ser alterada.';
  END IF;

  IF p_provider_id IS NOT NULL THEN
    SELECT pr.name, pr.team_id INTO v_prov_name, v_team
    FROM public.providers pr WHERE pr.id = p_provider_id AND pr.status = 'ACTIVE';
    IF v_prov_name IS NULL THEN RAISE EXCEPTION 'Funcionário inválido ou inativo.'; END IF;
  END IF;

  IF v_team IS NULL AND p_provider_id IS NULL THEN
    RAISE EXCEPTION 'Indique a equipa ou o funcionário que prestou o serviço.';
  END IF;

  IF v_team IS NOT NULL THEN
    SELECT t.name INTO v_team_name FROM public.teams t WHERE t.id = v_team AND t.status = 'ACTIVE';
    IF v_team_name IS NULL THEN RAISE EXCEPTION 'Equipa inválida ou inativa.'; END IF;
  END IF;

  UPDATE public.evaluations
  SET team_id = v_team,
      team_name = v_team_name,
      provider_id = p_provider_id,
      provider_name_input = COALESCE(v_prov_name, provider_name_input),
      attribution_confirmed = true,
      updated_at = now()
  WHERE id = p_evaluation_id;

  PERFORM public.log_audit_event(
    'UPDATE', 'evaluations', p_evaluation_id::text, 'SUCCESS',
    format('Associação confirmada pelo RH: equipa %s, funcionário %s (avaliação %s)',
           COALESCE(v_team_name, '—'), COALESCE(v_prov_name, '—'), v_eval.reference),
    public.current_user_email());

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_evaluation_attribution(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_evaluation_attribution(uuid, uuid, uuid) TO authenticated;

-- 6) Homologação exige associação (confirmada ou já existente)
CREATE OR REPLACE FUNCTION public.guard_attribution_before_finalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.finalized_at IS NULL AND NEW.finalized_at IS NOT NULL THEN
    IF NOT (NEW.attribution_confirmed OR NEW.team_id IS NOT NULL OR NEW.provider_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Confirme a equipa ou o funcionário que prestou o serviço antes de homologar.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_attribution_before_finalize() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS evaluations_exige_atribuicao ON public.evaluations;
CREATE TRIGGER evaluations_exige_atribuicao
  BEFORE UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.guard_attribution_before_finalize();

-- Função auxiliar de normalização: só é usada dentro de funções SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.sicsc_norm_text(text) FROM PUBLIC, anon, authenticated;

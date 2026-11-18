-- ============================================================================
-- 1017 — Bloco A da auditoria v2: N-01, N-02, N-03 e N-11
-- Migração nova. Não altera as migrações 1000–1016.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- N-01: participantes e pesos de avaliações deixam de ser consultáveis
-- diretamente por utilizadores. Continuam disponíveis para as funções
-- SECURITY DEFINER (my_team_overview, preview_evaluation_participants,
-- snapshot), que correm como dono e não dependem do EXECUTE de authenticated.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.sicsc_compute_participants(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- N-02: integridade histórica. As ligações de avaliações a clientes, serviços,
-- prestadores e atividades passam de ON DELETE SET NULL para RESTRICT.
-- Não é alterada nenhuma linha existente.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, a.attname, cl.relname AS ref_table
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    JOIN pg_class cl ON cl.oid = c.confrelid
    WHERE c.conrelid = 'public.evaluations'::regclass
      AND c.contype = 'f'
      AND a.attname IN ('client_id', 'service_id', 'provider_id', 'activity_id')
  LOOP
    EXECUTE format('ALTER TABLE public.evaluations DROP CONSTRAINT %I', r.conname);
    EXECUTE format(
      'ALTER TABLE public.evaluations ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE RESTRICT',
      r.conname, r.attname, r.ref_table);
  END LOOP;
END $$;

-- Eliminação física de cadastros mestres só para ADMIN. RH, Direção e
-- Operacional alteram e desativam (status = 'INACTIVE').
DROP POLICY IF EXISTS clients_write ON public.clients;
CREATE POLICY clients_insert ON public.clients FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY clients_update ON public.clients FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY clients_delete ON public.clients FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS services_write ON public.services;
CREATE POLICY services_insert ON public.services FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY services_update ON public.services FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY services_delete ON public.services FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS providers_write ON public.providers;
CREATE POLICY providers_insert ON public.providers FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY providers_update ON public.providers FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY providers_delete ON public.providers FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS teams_write ON public.teams;
CREATE POLICY teams_insert ON public.teams FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY teams_update ON public.teams FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY teams_delete ON public.teams FOR DELETE TO authenticated USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- N-03: autorização de acesso às avaliações.
--  • Só RH ou Administrador alteram a autorização; fica registado quem e quando.
--  • my_team_overview devolve as avaliações apenas a prestadores autorizados.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_provider_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := COALESCE(public.current_user_role()::text, '');
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.evaluation_access_authorized)
     OR (TG_OP = 'UPDATE' AND NEW.evaluation_access_authorized IS DISTINCT FROM OLD.evaluation_access_authorized) THEN
    IF v_role NOT IN ('ADMIN', 'HR') THEN
      RAISE EXCEPTION 'Apenas RH ou Administrador podem alterar a autorização de acesso às avaliações.';
    END IF;
    NEW.access_authorized_at := now();
    NEW.access_authorized_by := public.current_user_email();
  END IF;
  RETURN NEW;
END;
$$;

-- Preservação do acesso atual: prestadores ativos mantêm a visão das equipas que já tinham.
-- RH pode retirar a autorização individualmente (ProvidersPage). Feito antes de criar o trigger,
-- porque a migração corre sem sessão de utilizador.
UPDATE public.providers
SET evaluation_access_authorized = true,
    access_authorized_at = COALESCE(access_authorized_at, now()),
    access_authorized_by = COALESCE(access_authorized_by, 'migração 1017 (preservação do acesso)')
WHERE status = 'ACTIVE' AND evaluation_access_authorized = false;

DROP TRIGGER IF EXISTS providers_guard_authorization ON public.providers;
CREATE TRIGGER providers_guard_authorization
  BEFORE INSERT OR UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.guard_provider_authorization();

CREATE OR REPLACE FUNCTION public.my_team_overview()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_me   uuid := public.current_provider_id();
  v_team uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('linked', false);
  END IF;

  SELECT team_id INTO v_team FROM public.providers WHERE id = v_me;
  IF v_team IS NULL THEN
    SELECT id INTO v_team FROM public.teams WHERE supervisor_provider_id = v_me AND status = 'ACTIVE' LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'linked', true,
    'provider', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'specialty', p.specialty)
                 FROM public.providers p WHERE p.id = v_me),
    'team', (SELECT jsonb_build_object(
                'id', t.id, 'name', t.name, 'code', t.code, 'department', t.department,
                'supervisorName', COALESCE(sp.name, t.supervisor_name))
             FROM public.teams t
             LEFT JOIN public.providers sp ON sp.id = t.supervisor_provider_id
             WHERE t.id = v_team),
    'joinedAt', (SELECT h.joined_at FROM public.team_member_history h
                 WHERE h.provider_id = v_me AND h.team_id = v_team AND h.left_at IS NULL),
    'members', COALESCE((
      SELECT jsonb_agg(m ORDER BY m->>'name')
      FROM (
        SELECT jsonb_build_object(
                 'id', pr.id, 'name', pr.name, 'specialty', pr.specialty,
                 'isSupervisor', EXISTS (SELECT 1 FROM public.teams tt WHERE tt.id = v_team AND tt.supervisor_provider_id = pr.id)) AS m
        FROM public.providers pr
        WHERE pr.status = 'ACTIVE'
          AND v_team IS NOT NULL
          AND (pr.team_id = v_team
               OR pr.id = (SELECT tt.supervisor_provider_id FROM public.teams tt WHERE tt.id = v_team))
      ) x
    ), '[]'::jsonb),
    'evaluations', COALESCE((
      SELECT jsonb_agg(e ORDER BY e->>'finalizedAt' DESC)
      FROM (
        SELECT jsonb_build_object(
                 'id', ev.id,
                 'reference', ev.reference,
                 'serviceDate', ev.service_date,
                 'clientVisible', ev.client_visible_to_team,
                 'clientName', CASE WHEN ev.client_visible_to_team THEN ev.client_name ELSE NULL END,
                 'serviceName', ev.service_name,
                 'teamName', ev.team_name,
                 'providerName', (SELECT pp.name FROM public.providers pp WHERE pp.id = ev.provider_id),
                 'technicalScore', ev.technical_score,
                 'finalClassification', ev.final_classification,
                 'finalizedAt', ev.finalized_at,
                 'myWeightPercentage', ep.weight_percentage,
                 'participants', (SELECT count(*) FROM public.evaluation_participants e2
                                  WHERE e2.evaluation_id = ev.id AND e2.counts)) AS e
        FROM public.evaluations ev
        JOIN public.evaluation_participants ep
          ON ep.evaluation_id = ev.id AND ep.provider_id = v_me AND ep.counts
        WHERE ev.finalized_at IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.providers pa WHERE pa.id = v_me AND pa.evaluation_access_authorized = true)
        ORDER BY ev.finalized_at DESC
        LIMIT 500
      ) y
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.my_team_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team_overview() TO authenticated;

-- ---------------------------------------------------------------------------
-- N-11: MFA (TOTP) obrigatória para ADMIN e HR.
--  • mfa_enforced_from: data a partir da qual a MFA passa a ser exigida.
--    Por defeito, 14 dias após esta migração, para que as contas se inscrevam
--    antes de ficarem bloqueadas.
--  • current_user_role() devolve nulo para ADMIN/HR sem sessão aal2 depois
--    dessa data. Como todas as políticas RLS e funções usam esta função, a
--    exigência fica aplicada na base de dados e não só na interface.
-- ---------------------------------------------------------------------------
ALTER TABLE public.login_settings ADD COLUMN IF NOT EXISTS mfa_enforced_from timestamptz;
INSERT INTO public.login_settings (id, mfa_enforced_from)
VALUES (1, now() + interval '14 days')
ON CONFLICT (id) DO UPDATE
  SET mfa_enforced_from = COALESCE(public.login_settings.mfa_enforced_from, EXCLUDED.mfa_enforced_from);

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p.role
  FROM public.profiles p
  LEFT JOIN public.login_settings s ON s.id = 1
  WHERE p.id = auth.uid()
    AND p.active = true
    AND COALESCE(p.must_change_password, false) = false
    AND (
      p.role NOT IN ('ADMIN', 'HR')
      OR s.mfa_enforced_from IS NULL
      OR now() < s.mfa_enforced_from
      OR COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    )
  LIMIT 1
$$;

-- Estado de MFA para a interface decidir se mostra o ecrã de inscrição ou de verificação.
CREATE OR REPLACE FUNCTION public.mfa_requirement()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
  SELECT jsonb_build_object(
    'role', p.role,
    'requiredRole', p.role IN ('ADMIN', 'HR'),
    'enforced', (s.mfa_enforced_from IS NOT NULL AND now() >= s.mfa_enforced_from),
    'enforcedFrom', s.mfa_enforced_from,
    'aal', COALESCE(auth.jwt() ->> 'aal', 'aal1'),
    'verifiedFactor', EXISTS (
      SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p.id AND f.status = 'verified'
    )
  )
  FROM public.profiles p
  LEFT JOIN public.login_settings s ON s.id = 1
  WHERE p.id = auth.uid() AND p.active = true
$$;
REVOKE ALL ON FUNCTION public.mfa_requirement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_requirement() TO authenticated;

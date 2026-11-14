-- ============================================================================
-- 1012 — Nota de avaliação para o grupo e supervisor (membro cadastrado ou prestador)
-- Executar DEPOIS da 1011. Idempotente e sem apagar dados.
--
--  • teams.supervisor_employee_id: o supervisor pode ser um membro cadastrado (employees) OU um
--    prestador (teams.supervisor_provider_id, já existente). Nunca os dois ao mesmo tempo.
--  • list_supervisor_candidates(): lista (só nomes) os membros cadastrados ativos e os prestadores
--    ativos para escolher o supervisor, também para quem não lê a tabela employees (RH/Admin).
--  • provider_in_evaluation_group(): devolve verdadeiro quando o prestador pertence ao grupo que
--    recebe a nota da avaliação (o prestador atribuído, os membros da equipa e o supervisor).
--  • evaluation_group_provider_ids(): ids de todos os prestadores do grupo de uma avaliação.
--  • Política evaluations_select_grupo: um prestador lê as avaliações HOMOLOGADAS do seu grupo,
--    não apenas as que lhe foram atribuídas diretamente.
-- ============================================================================

-- 1) Supervisor: membro cadastrado ou prestador -------------------------------------------------
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS supervisor_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_teams_supervisor_employee ON public.teams (supervisor_employee_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_supervisor_um_so') THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_supervisor_um_so
      CHECK (supervisor_provider_id IS NULL OR supervisor_employee_id IS NULL);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.list_supervisor_candidates()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
             'kind', 'EMPLOYEE', 'id', e.id, 'name', e.full_name,
             'code', e.employee_number, 'category', e.category) AS x
    FROM public.employees e
    WHERE public.is_staff() AND e.professional_status = 'ATIVO' AND btrim(e.full_name) <> ''
    UNION ALL
    SELECT jsonb_build_object(
             'kind', 'PROVIDER', 'id', pr.id, 'name', pr.name,
             'code', pr.internal_code, 'category', 'PRESTADOR')
    FROM public.providers pr
    WHERE public.is_staff() AND pr.status = 'ACTIVE'
  ) s;
$$;
REVOKE ALL ON FUNCTION public.list_supervisor_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_supervisor_candidates() TO authenticated;

-- 2) Grupo que recebe a nota ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_in_evaluation_group(p_me uuid, p_eval_provider uuid, p_eval_team uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p_me IS NOT NULL AND (
    p_me = p_eval_provider
    OR EXISTS (SELECT 1 FROM public.providers pr
               WHERE pr.id = p_me AND pr.status = 'ACTIVE' AND p_eval_team IS NOT NULL AND pr.team_id = p_eval_team)
    OR EXISTS (SELECT 1 FROM public.teams t
               WHERE t.id = p_eval_team AND t.supervisor_provider_id = p_me)
  );
$$;
REVOKE ALL ON FUNCTION public.provider_in_evaluation_group(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_in_evaluation_group(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.evaluation_group_provider_ids(p_evaluation_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(DISTINCT pid), '{}'::uuid[])
  FROM (
    SELECT ev.provider_id AS pid FROM public.evaluations ev WHERE ev.id = p_evaluation_id
    UNION
    SELECT ew.provider_id FROM public.evaluation_workers ew WHERE ew.evaluation_id = p_evaluation_id
    UNION
    SELECT pr.id FROM public.evaluations ev
      JOIN public.providers pr ON pr.team_id = ev.team_id AND pr.status = 'ACTIVE'
      WHERE ev.id = p_evaluation_id AND ev.team_id IS NOT NULL
    UNION
    SELECT t.supervisor_provider_id FROM public.evaluations ev
      JOIN public.teams t ON t.id = ev.team_id
      WHERE ev.id = p_evaluation_id AND t.supervisor_provider_id IS NOT NULL
  ) g
  WHERE pid IS NOT NULL AND public.is_staff();
$$;
REVOKE ALL ON FUNCTION public.evaluation_group_provider_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluation_group_provider_ids(uuid) TO authenticated;

-- 3) Leitura pelos membros do grupo (só avaliações homologadas) ----------------------------------
DROP POLICY IF EXISTS evaluations_select_grupo ON public.evaluations;
CREATE POLICY evaluations_select_grupo ON public.evaluations FOR SELECT TO authenticated
  USING (
    finalized_at IS NOT NULL
    AND public.provider_in_evaluation_group(public.current_provider_id(), provider_id, team_id)
  );

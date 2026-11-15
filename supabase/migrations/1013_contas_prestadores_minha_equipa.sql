-- ============================================================================
-- 1013 — Contas de acesso dos prestadores e página «A Minha Equipa»
-- Executar DEPOIS da 1012. Idempotente e sem apagar dados.
--
--  • Catálogo de páginas: «teams» (Equipas) e «my_team» (A Minha Equipa, para prestadores).
--  • profiles.provider_id: uma conta de acesso por prestador (índice único + ligação ao prestador).
--  • my_team_overview(): o prestador com sessão iniciada vê a sua equipa, os colegas e as notas
--    das avaliações HOMOLOGADAS do seu grupo. Devolve só os campos necessários (sem comentários nem
--    dados pessoais do cliente), por isso não é preciso dar-lhe leitura direta à tabela evaluations.
--  • Remove a política evaluations_select_grupo da 1012 (dava leitura da linha completa da avaliação).
--  • evaluations.client_visible_to_team: quem envia a avaliação escolhe se os avaliados podem ver o nome da
--    empresa. Por defeito fica OCULTO. my_team_overview() só devolve o nome quando foi permitido.
--    submit_evaluation passa a registar essa escolha (a função original fica como submit_evaluation_core).
-- ============================================================================

-- 1) Catálogo de páginas ---------------------------------------------------------------------------
INSERT INTO public.app_pages (key, name, section, required_base_role, is_sensitive, description, display_order) VALUES
  ('teams',   'Equipas',         'Operações', 'OPERATIONAL', false, 'Criação de equipas, escolha do supervisor e dos membros.', 5),
  ('my_team', 'A Minha Equipa',  'Operações', 'PROVIDER',    false, 'Equipa do prestador e notas das avaliações do grupo.', 17)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, section = EXCLUDED.section, required_base_role = EXCLUDED.required_base_role,
  is_sensitive = EXCLUDED.is_sensitive, description = EXCLUDED.description, display_order = EXCLUDED.display_order;

-- 2) Uma conta por prestador ------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS profiles_provider_id_key ON public.profiles (provider_id) WHERE provider_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_provider_id_fkey') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- 3) A leitura passa a ser feita só pela função abaixo ------------------------------------------------
DROP POLICY IF EXISTS evaluations_select_grupo ON public.evaluations;

-- 4) Escolha do avaliador: os avaliados veem o nome da empresa? (por defeito, não) ----------------------
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS client_visible_to_team boolean NOT NULL DEFAULT false;

-- A função de submissão existente passa a chamar-se submit_evaluation_core (só uma vez) e a nova
-- submit_evaluation chama-a e guarda a escolha. Assim não é preciso duplicar a lógica da submissão.
DO $$
BEGIN
  IF to_regprocedure('public.submit_evaluation_core(jsonb)') IS NULL
     AND to_regprocedure('public.submit_evaluation(jsonb)') IS NOT NULL THEN
    ALTER FUNCTION public.submit_evaluation(jsonb) RENAME TO submit_evaluation_core;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.submit_evaluation_core(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_evaluation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.submit_evaluation_core(p_payload);
  IF COALESCE((v_result->>'success')::boolean, false)
     AND lower(COALESCE(p_payload->>'clientVisibleToTeam', 'false')) IN ('true', 't', '1', 'yes', 'sim') THEN
    UPDATE public.evaluations SET client_visible_to_team = true WHERE id = (v_result->>'id')::uuid;
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_evaluation(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_evaluation(jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_team_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
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
                 'finalizedAt', ev.finalized_at) AS e
        FROM public.evaluations ev
        WHERE ev.finalized_at IS NOT NULL
          AND (public.provider_in_evaluation_group(v_me, ev.provider_id, ev.team_id)
               OR EXISTS (SELECT 1 FROM public.evaluation_workers ew WHERE ew.evaluation_id = ev.id AND ew.provider_id = v_me))
        ORDER BY ev.finalized_at DESC
        LIMIT 500
      ) y
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.my_team_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team_overview() TO authenticated;

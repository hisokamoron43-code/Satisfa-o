-- ============================================================================
-- 1015 — Histórico de membros da equipa, escalação no calendário e participantes por avaliação
-- Executar DEPOIS da 1014. Idempotente e sem apagar dados.
--
-- Regras (aplicadas na base de dados, não só no ecrã):
--  1) Um membro só recebe a nota de avaliações cujo serviço aconteceu DEPOIS de ele entrar na equipa
--     (team_member_history: data de entrada e de saída de cada membro em cada equipa).
--  2) Se a equipa tem 4 membros mas só 2 ou 3 vão ao serviço, só os escalados no calendário de
--     operações (activities.assigned_provider_ids) recebem a nota daquele serviço.
--  3) A nota é repartida pelos participantes (evaluation_participants.weight_percentage, soma 100,00).
--  4) Ao homologar, os participantes ficam congelados (snapshot) e deixam de mudar com movimentos
--     futuros de equipa.
--
--  • team_member_history + trigger em providers (entrada, saída, mudança de equipa, inativação).
--  • activities: trigger que impede escalar quem não pertencia à equipa na data da atividade.
--  • evaluations.activity_id: ligação à atividade do calendário (automática por equipa + data).
--  • evaluation_participants + sicsc_compute_participants() + snapshot na homologação.
--  • set_member_joined_date(): RH/Admin corrige a data de entrada de um membro.
--  • my_team_overview() e evaluation_group_provider_ids() passam a usar os participantes.
-- ============================================================================

-- 1) Histórico de pertença à equipa ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.team_member_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  joined_at date NOT NULL DEFAULT CURRENT_DATE,
  left_at date,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_member_history_datas CHECK (left_at IS NULL OR left_at >= joined_at)
);
CREATE INDEX IF NOT EXISTS idx_tmh_provider ON public.team_member_history (provider_id, joined_at);
CREATE INDEX IF NOT EXISTS idx_tmh_team ON public.team_member_history (team_id, joined_at);
-- Só uma pertença em aberto por prestador
CREATE UNIQUE INDEX IF NOT EXISTS tmh_uma_em_aberto ON public.team_member_history (provider_id) WHERE left_at IS NULL;

ALTER TABLE public.team_member_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tmh_select ON public.team_member_history;
CREATE POLICY tmh_select ON public.team_member_history FOR SELECT TO authenticated USING (public.is_staff());
-- Sem política de escrita: só o trigger e as funções abaixo (SECURITY DEFINER) escrevem.
REVOKE ALL ON public.team_member_history FROM anon, authenticated;
GRANT SELECT ON public.team_member_history TO authenticated;

-- Arranque: quem já está numa equipa fica com a data de criação do prestador como entrada.
-- RH pode corrigir cada data em «Equipas» (set_member_joined_date).
INSERT INTO public.team_member_history (provider_id, team_id, joined_at, changed_by)
SELECT p.id, p.team_id, LEAST(COALESCE(p.created_at::date, CURRENT_DATE), CURRENT_DATE), 'migração 1015'
FROM public.providers p
WHERE p.team_id IS NOT NULL AND p.status = 'ACTIVE'
  AND NOT EXISTS (SELECT 1 FROM public.team_member_history h WHERE h.provider_id = p.id AND h.left_at IS NULL);

CREATE OR REPLACE FUNCTION public.trg_providers_team_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_open public.team_member_history%ROWTYPE;
  v_ativo_com_equipa boolean := (NEW.status = 'ACTIVE' AND NEW.team_id IS NOT NULL);
  v_who text := COALESCE(public.current_user_email(), 'sistema');
BEGIN
  SELECT * INTO v_open FROM public.team_member_history WHERE provider_id = NEW.id AND left_at IS NULL;

  IF FOUND AND (NOT v_ativo_com_equipa OR v_open.team_id IS DISTINCT FROM NEW.team_id) THEN
    -- Saiu da equipa (retirado, movido ou inativado): fecha a pertença hoje
    UPDATE public.team_member_history SET left_at = GREATEST(joined_at, CURRENT_DATE) WHERE id = v_open.id;
    v_open := NULL;
  ELSIF FOUND THEN
    RETURN NEW; -- continua na mesma equipa
  END IF;

  IF v_ativo_com_equipa THEN
    INSERT INTO public.team_member_history (provider_id, team_id, joined_at, changed_by)
    VALUES (NEW.id, NEW.team_id, CURRENT_DATE, v_who);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS providers_team_history ON public.providers;
CREATE TRIGGER providers_team_history
  AFTER INSERT OR UPDATE OF team_id, status ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.trg_providers_team_history();

-- O prestador estava na equipa naquela data? (entrada e saída inclusivas)
CREATE OR REPLACE FUNCTION public.sicsc_member_on_date(p_provider uuid, p_team uuid, p_date date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_member_history h
    WHERE h.provider_id = p_provider AND h.team_id = p_team
      AND h.joined_at <= p_date AND (h.left_at IS NULL OR p_date <= h.left_at)
  );
$$;
REVOKE ALL ON FUNCTION public.sicsc_member_on_date(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sicsc_member_on_date(uuid, uuid, date) TO authenticated;

-- RH/Admin corrige a data de entrada do membro na equipa atual
CREATE OR REPLACE FUNCTION public.set_member_joined_date(p_provider_id uuid, p_joined_at date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_open public.team_member_history%ROWTYPE;
  v_prev_left date;
BEGIN
  IF NOT public.is_hr_or_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas Administrador ou RH podem alterar a data de entrada.';
  END IF;
  IF p_joined_at IS NULL OR p_joined_at > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data de entrada não pode estar vazia nem ser futura.';
  END IF;
  SELECT * INTO v_open FROM public.team_member_history WHERE provider_id = p_provider_id AND left_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Este prestador não pertence a nenhuma equipa neste momento.'; END IF;

  SELECT max(left_at) INTO v_prev_left FROM public.team_member_history
  WHERE provider_id = p_provider_id AND id <> v_open.id AND left_at IS NOT NULL;
  IF v_prev_left IS NOT NULL AND p_joined_at < v_prev_left THEN
    RAISE EXCEPTION 'A data de entrada não pode ser anterior à saída da equipa anterior (%).', to_char(v_prev_left, 'DD/MM/YYYY');
  END IF;

  UPDATE public.team_member_history SET joined_at = p_joined_at, changed_by = public.current_user_email() WHERE id = v_open.id;
  PERFORM public.log_audit_event('UPDATE', 'team_member_history', v_open.id::text, 'SUCCESS',
    format('Data de entrada na equipa alterada de %s para %s', v_open.joined_at, p_joined_at), public.current_user_email());
  RETURN jsonb_build_object('success', true, 'providerId', p_provider_id, 'joinedAt', p_joined_at);
END;
$$;
REVOKE ALL ON FUNCTION public.set_member_joined_date(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_joined_date(uuid, date) TO authenticated;

-- 2) Calendário: só se escala quem pertencia à equipa na data da atividade --------------------------------
CREATE OR REPLACE FUNCTION public.trg_activities_validar_escalacao()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_nome text;
BEGIN
  IF NEW.team_id IS NULL OR COALESCE(array_length(NEW.assigned_provider_ids, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;
  FOREACH v_id IN ARRAY NEW.assigned_provider_ids LOOP
    IF NOT public.sicsc_member_on_date(v_id, NEW.team_id, NEW.activity_date)
       AND NOT EXISTS (SELECT 1 FROM public.teams t WHERE t.id = NEW.team_id AND t.supervisor_provider_id = v_id) THEN
      SELECT name INTO v_nome FROM public.providers WHERE id = v_id;
      RAISE EXCEPTION '% não pertencia a esta equipa em %. Só pode escalar membros que já estavam na equipa nessa data.',
        COALESCE(v_nome, 'O prestador escolhido'), to_char(NEW.activity_date, 'DD/MM/YYYY');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activities_validar_escalacao ON public.activities;
CREATE TRIGGER activities_validar_escalacao
  BEFORE INSERT OR UPDATE OF team_id, activity_date, assigned_provider_ids ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.trg_activities_validar_escalacao();

-- 3) Avaliação ↔ atividade do calendário -----------------------------------------------------------------
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_evaluations_activity_id ON public.evaluations (activity_id);

-- Encontra a atividade do calendário: mesma equipa e mesma data; se houver várias, desempata por
-- cliente e serviço. Só devolve quando o resultado é único (nunca adivinha).
CREATE OR REPLACE FUNCTION public.sicsc_find_activity(p_team uuid, p_date date, p_client uuid, p_service uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  IF p_team IS NULL OR p_date IS NULL THEN RETURN NULL; END IF;
  SELECT array_agg(a.id) INTO v_ids FROM public.activities a
  WHERE a.team_id = p_team AND a.activity_date = p_date AND a.status <> 'CANCELLED';
  IF v_ids IS NULL THEN RETURN NULL; END IF;
  IF array_length(v_ids, 1) = 1 THEN RETURN v_ids[1]; END IF;

  SELECT array_agg(a.id) INTO v_ids FROM public.activities a
  WHERE a.id = ANY (v_ids) AND (p_client IS NULL OR a.client_id = p_client);
  IF v_ids IS NOT NULL AND array_length(v_ids, 1) = 1 THEN RETURN v_ids[1]; END IF;
  IF v_ids IS NULL THEN RETURN NULL; END IF;

  SELECT array_agg(a.id) INTO v_ids FROM public.activities a
  WHERE a.id = ANY (v_ids) AND (p_service IS NULL OR a.service_id = p_service);
  IF v_ids IS NOT NULL AND array_length(v_ids, 1) = 1 THEN RETURN v_ids[1]; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sicsc_find_activity(uuid, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sicsc_find_activity(uuid, date, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_evaluations_ligar_atividade()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.activity_id IS NULL AND NEW.finalized_at IS NULL AND NEW.team_id IS NOT NULL THEN
    NEW.activity_id := public.sicsc_find_activity(NEW.team_id, NEW.service_date, NEW.client_id, NEW.service_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evaluations_ligar_atividade ON public.evaluations;
CREATE TRIGGER evaluations_ligar_atividade
  BEFORE INSERT OR UPDATE OF team_id, service_date, client_id, service_id ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.trg_evaluations_ligar_atividade();

-- RH/Admin liga ou desliga manualmente a atividade (avaliações ainda não homologadas)
CREATE OR REPLACE FUNCTION public.set_evaluation_activity(p_evaluation_id uuid, p_activity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_eval public.evaluations%ROWTYPE;
BEGIN
  IF NOT public.is_hr_or_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas Administrador ou RH podem ligar a avaliação a uma atividade.';
  END IF;
  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  IF v_eval.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'Avaliação já homologada é imutável.'; END IF;
  IF p_activity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.activities WHERE id = p_activity_id) THEN
    RAISE EXCEPTION 'Atividade não encontrada.';
  END IF;
  UPDATE public.evaluations SET activity_id = p_activity_id, updated_at = now() WHERE id = p_evaluation_id;
  RETURN jsonb_build_object('success', true, 'evaluationId', p_evaluation_id, 'activityId', p_activity_id);
END;
$$;
REVOKE ALL ON FUNCTION public.set_evaluation_activity(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_evaluation_activity(uuid, uuid) TO authenticated;

-- 4) Participantes de cada avaliação ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.evaluation_participants (
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  counts boolean NOT NULL,
  reason text NOT NULL CHECK (reason IN ('ESCALADO', 'SEM_ESCALA', 'ATRIBUIDO', 'SUPERVISOR', 'NAO_ESCALADO', 'ENTROU_DEPOIS')),
  weight_percentage numeric(5,2) NOT NULL DEFAULT 0 CHECK (weight_percentage BETWEEN 0 AND 100),
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evaluation_id, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_evpart_provider ON public.evaluation_participants (provider_id) WHERE counts;

ALTER TABLE public.evaluation_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evpart_select ON public.evaluation_participants;
CREATE POLICY evpart_select ON public.evaluation_participants FOR SELECT TO authenticated
  USING (public.is_staff());
REVOKE ALL ON public.evaluation_participants FROM anon, authenticated;
GRANT SELECT ON public.evaluation_participants TO authenticated;

-- Calcula (sem gravar) quem participou e quem conta. Mesma regra do frontend (grupoAvaliacao.ts):
--   • Elegível = pertencia à equipa na data do serviço (histórico).
--   • Há atividade com escala → só os escalados contam; os restantes elegíveis ficam NAO_ESCALADO.
--   • Sem atividade ou sem escala → todos os elegíveis contam (SEM_ESCALA).
--   • Quem foi atribuído à avaliação (prestador escolhido ou atribuído por RH) conta sempre.
--   • O supervisor segue a mesma regra da escala: com escala só conta se for escalado; sem escala conta.
--   • Quem entrou depois da data do serviço nunca conta (ENTROU_DEPOIS), mesmo que esteja na equipa hoje.
CREATE OR REPLACE FUNCTION public.sicsc_compute_participants(p_evaluation_id uuid)
RETURNS TABLE (provider_id uuid, counts boolean, reason text, weight_percentage numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ev public.evaluations%ROWTYPE;
  v_act public.activities%ROWTYPE;
  v_has_scale boolean := false;
  v_sup uuid;
BEGIN
  SELECT * INTO v_ev FROM public.evaluations WHERE id = p_evaluation_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_ev.activity_id IS NOT NULL THEN
    SELECT * INTO v_act FROM public.activities WHERE id = v_ev.activity_id;
    v_has_scale := FOUND AND COALESCE(array_length(v_act.assigned_provider_ids, 1), 0) > 0;
  END IF;
  SELECT t.supervisor_provider_id INTO v_sup FROM public.teams t WHERE t.id = v_ev.team_id;

  RETURN QUERY
  WITH cand AS (
    SELECT pr.id AS pid,
           (pr.id = v_sup) AS is_sup,
           (pr.id = v_ev.provider_id
            OR EXISTS (SELECT 1 FROM public.evaluation_workers ew
                       WHERE ew.evaluation_id = v_ev.id AND ew.provider_id = pr.id)) AS is_assigned,
           public.sicsc_member_on_date(pr.id, v_ev.team_id, v_ev.service_date) AS in_team
    FROM public.providers pr
    WHERE (v_ev.team_id IS NOT NULL
           AND (pr.team_id = v_ev.team_id
                OR pr.id = v_sup
                OR EXISTS (SELECT 1 FROM public.team_member_history h
                           WHERE h.provider_id = pr.id AND h.team_id = v_ev.team_id)))
       OR pr.id = v_ev.provider_id
       OR EXISTS (SELECT 1 FROM public.evaluation_workers ew2
                  WHERE ew2.evaluation_id = v_ev.id AND ew2.provider_id = pr.id)
  ), cls AS (
    SELECT c.pid,
           CASE WHEN c.is_assigned THEN true
                WHEN c.is_sup THEN (NOT v_has_scale OR c.pid = ANY (v_act.assigned_provider_ids))
                WHEN NOT c.in_team THEN false
                WHEN v_has_scale THEN c.pid = ANY (v_act.assigned_provider_ids)
                ELSE true END AS cnt,
           CASE WHEN c.is_assigned THEN 'ATRIBUIDO'
                WHEN c.is_sup AND (NOT v_has_scale OR c.pid = ANY (v_act.assigned_provider_ids)) THEN 'SUPERVISOR'
                WHEN c.is_sup THEN 'NAO_ESCALADO'
                WHEN NOT c.in_team THEN 'ENTROU_DEPOIS'
                WHEN v_has_scale AND c.pid = ANY (v_act.assigned_provider_ids) THEN 'ESCALADO'
                WHEN v_has_scale THEN 'NAO_ESCALADO'
                ELSE 'SEM_ESCALA' END AS rsn
    FROM cand c
  ), ranked AS (
    SELECT k.pid, k.cnt, k.rsn,
           count(*) FILTER (WHERE k.cnt) OVER () AS n,
           row_number() OVER (PARTITION BY k.cnt ORDER BY k.pid) AS rn
    FROM cls k
  )
  SELECT r.pid, r.cnt, r.rsn,
         CASE WHEN r.cnt AND r.n > 0
              THEN floor(10000.0 / r.n) / 100.0
                   + CASE WHEN r.rn <= (10000 - floor(10000.0 / r.n) * r.n) THEN 0.01 ELSE 0 END
              ELSE 0::numeric END
  FROM ranked r
  ORDER BY r.cnt DESC, r.pid;
END;
$$;
REVOKE ALL ON FUNCTION public.sicsc_compute_participants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sicsc_compute_participants(uuid) TO authenticated;

-- Grava (ou volta a gravar) o retrato dos participantes
CREATE OR REPLACE FUNCTION public.sicsc_snapshot_participants(p_evaluation_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM public.evaluation_participants WHERE evaluation_id = p_evaluation_id;
  INSERT INTO public.evaluation_participants (evaluation_id, provider_id, counts, reason, weight_percentage)
  SELECT p_evaluation_id, c.provider_id, c.counts, c.reason, c.weight_percentage
  FROM public.sicsc_compute_participants(p_evaluation_id) c;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.sicsc_snapshot_participants(uuid) FROM PUBLIC, anon, authenticated;

-- Na homologação os participantes ficam congelados
CREATE OR REPLACE FUNCTION public.trg_evaluations_congelar_participantes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.finalized_at IS NULL AND NEW.finalized_at IS NOT NULL THEN
    PERFORM public.sicsc_snapshot_participants(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS evaluations_congelar_participantes ON public.evaluations;
CREATE TRIGGER evaluations_congelar_participantes
  AFTER UPDATE OF finalized_at ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.trg_evaluations_congelar_participantes();

-- Só o Administrador pode recalcular uma avaliação já homologada (fica na auditoria)
CREATE OR REPLACE FUNCTION public.recompute_evaluation_participants(p_evaluation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o Administrador pode recalcular os participantes.';
  END IF;
  v_n := public.sicsc_snapshot_participants(p_evaluation_id);
  PERFORM public.log_audit_event('UPDATE', 'evaluation_participants', p_evaluation_id::text, 'SUCCESS',
    format('Participantes da avaliação recalculados (%s registos)', v_n), public.current_user_email());
  RETURN jsonb_build_object('success', true, 'evaluationId', p_evaluation_id, 'participants', v_n);
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_evaluation_participants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_evaluation_participants(uuid) TO authenticated;

-- Pré-visualização para RH/Operações (inclui avaliações ainda por homologar)
CREATE OR REPLACE FUNCTION public.preview_evaluation_participants(p_evaluation_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  -- Avaliação homologada: devolve o retrato gravado. Caso contrário, calcula na hora.
  SELECT CASE WHEN public.is_staff() THEN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'providerId', c.provider_id, 'name', pr.name, 'counts', c.counts,
             'reason', c.reason, 'weightPercentage', c.weight_percentage) ORDER BY c.counts DESC, pr.name)
    FROM (
      SELECT ep.provider_id, ep.counts, ep.reason, ep.weight_percentage
      FROM public.evaluation_participants ep WHERE ep.evaluation_id = p_evaluation_id
      UNION ALL
      SELECT x.provider_id, x.counts, x.reason, x.weight_percentage
      FROM public.sicsc_compute_participants(p_evaluation_id) x
      WHERE NOT EXISTS (SELECT 1 FROM public.evaluation_participants e2 WHERE e2.evaluation_id = p_evaluation_id)
    ) c
    JOIN public.providers pr ON pr.id = c.provider_id
  ), '[]'::jsonb) ELSE '[]'::jsonb END;
$$;
REVOKE ALL ON FUNCTION public.preview_evaluation_participants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_evaluation_participants(uuid) TO authenticated;

-- Avaliações já homologadas antes desta migração: grava o retrato com a regra nova
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.evaluations ev
           WHERE ev.finalized_at IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.evaluation_participants ep WHERE ep.evaluation_id = ev.id)
  LOOP
    PERFORM public.sicsc_snapshot_participants(r.id);
  END LOOP;
END $$;

-- 5) Grupo que recebe a nota: passa a usar os participantes --------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_in_evaluation_group(p_me uuid, p_eval_provider uuid, p_eval_team uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p_me IS NOT NULL AND (
    p_me = p_eval_provider
    OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = p_eval_team AND t.supervisor_provider_id = p_me)
  );
$$;
REVOKE ALL ON FUNCTION public.provider_in_evaluation_group(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_in_evaluation_group(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.evaluation_group_provider_ids(p_evaluation_id uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(DISTINCT pid), '{}'::uuid[])
  FROM (
    SELECT ep.provider_id AS pid FROM public.evaluation_participants ep
    WHERE ep.evaluation_id = p_evaluation_id AND ep.counts
    UNION
    SELECT c.provider_id FROM public.sicsc_compute_participants(p_evaluation_id) c
    WHERE c.counts
      AND NOT EXISTS (SELECT 1 FROM public.evaluation_participants ep2 WHERE ep2.evaluation_id = p_evaluation_id)
  ) g
  WHERE pid IS NOT NULL AND public.is_staff();
$$;
REVOKE ALL ON FUNCTION public.evaluation_group_provider_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluation_group_provider_ids(uuid) TO authenticated;

-- «A Minha Equipa»: o prestador só vê as notas em que contou como participante, com o seu peso
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
        ORDER BY ev.finalized_at DESC
        LIMIT 500
      ) y
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.my_team_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team_overview() TO authenticated;

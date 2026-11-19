-- ============================================================================
-- 1022 — Re-homologação de avaliações com motivo obrigatório e histórico de versões
--
-- Uma avaliação homologada continua imutável para qualquer alteração normal. A ÚNICA forma de a
-- alterar é a função rehomologate_evaluation(), que:
--   • exige perfil ADMIN ou HR;
--   • exige o MOTIVO da re-homologação (10 a 1000 caracteres);
--   • guarda a homologação anterior (nota, classificação, snapshot, parecer do auditor e participantes)
--     no histórico imutável public.evaluation_homologations;
--   • recalcula a nota no servidor, com as mesmas regras da homologação normal;
--   • regista tudo na auditoria.
-- Idempotente. Não executa UPDATE em linhas existentes.
-- ============================================================================

BEGIN;

-- 1) Campos da avaliação (valores por omissão constantes: não há reescrita nem triggers)
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS homologation_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS rehomologated_at timestamptz;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS rehomologated_by text;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS rehomologation_reason text;

-- 2) Histórico de versões anteriores (imutável)
CREATE TABLE IF NOT EXISTS public.evaluation_homologations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  technical_score numeric,
  final_classification text,
  finalized_at timestamptz,
  finalized_by text,
  criteria_snapshot jsonb,
  criterion_ratings jsonb,
  auditor_review jsonb,
  participants_snapshot jsonb,
  superseded_at timestamptz NOT NULL DEFAULT now(),
  superseded_by text NOT NULL,
  superseded_reason text NOT NULL CHECK (length(btrim(superseded_reason)) >= 10),
  UNIQUE (evaluation_id, version)
);
CREATE INDEX IF NOT EXISTS idx_evaluation_homologations_eval ON public.evaluation_homologations (evaluation_id, version DESC);

ALTER TABLE public.evaluation_homologations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS evaluation_homologations_select ON public.evaluation_homologations;
CREATE POLICY evaluation_homologations_select ON public.evaluation_homologations
  FOR SELECT TO authenticated USING (public.is_staff());
REVOKE ALL ON public.evaluation_homologations FROM anon, authenticated;
GRANT SELECT ON public.evaluation_homologations TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_homologation_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'O histórico de homologações é imutável.';
END;
$$;

DROP TRIGGER IF EXISTS evaluation_homologations_imutavel ON public.evaluation_homologations;
CREATE TRIGGER evaluation_homologations_imutavel
  BEFORE UPDATE OR DELETE ON public.evaluation_homologations
  FOR EACH ROW EXECUTE FUNCTION public.guard_homologation_history();

-- 3) Imutabilidade: igual à 1016, com uma exceção estreita para a re-homologação.
--    A exceção só vale dentro da transação em que rehomologate_evaluation() a ativou
--    (a marca guarda o número da transação; um valor antigo ou forjado não serve).
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
    IF COALESCE(current_setting('sicsc.rehomologating', true), '') = txid_current()::text THEN
      RETURN NEW;
    END IF;

    IF (to_jsonb(NEW) - 'status' - 'corrective_action_status' - 'updated_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'status' - 'corrective_action_status' - 'updated_at') THEN
      RAISE EXCEPTION 'Avaliação homologada é imutável: apenas o estado e a ação corretiva podem ser atualizados. Para rever a nota use a re-homologação (com motivo).';
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

-- 4) Re-homologação
CREATE OR REPLACE FUNCTION public.rehomologate_evaluation(
  p_evaluation_id uuid,
  p_reason text,
  p_auditor_review jsonb DEFAULT NULL,
  p_custom_threshold numeric DEFAULT NULL,
  p_threshold_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := COALESCE(public.current_user_role()::text, '');
  v_email text := COALESCE(public.current_user_email(), 'sistema');
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_eval public.evaluations%ROWTYPE;
  v_review jsonb;
  v_participants jsonb;
  v_old_version integer;
  v_result jsonb;
BEGIN
  IF v_role NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN e HR podem re-homologar avaliações.';
  END IF;
  IF length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Indique o motivo da re-homologação (mínimo 10 caracteres).';
  END IF;
  IF length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'O motivo da re-homologação excede 1000 caracteres.';
  END IF;

  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  IF v_eval.finalized_at IS NULL THEN
    RAISE EXCEPTION 'Esta avaliação ainda não foi homologada: use a homologação normal.';
  END IF;
  IF v_eval.status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'Avaliação arquivada não pode ser re-homologada.';
  END IF;

  -- Sem novo parecer, mantém o parecer do auditor da homologação anterior
  v_review := COALESCE(p_auditor_review, v_eval.auditor_review, '{}'::jsonb);
  v_old_version := COALESCE(v_eval.homologation_version, 1);

  SELECT COALESCE(jsonb_agg(to_jsonb(ep)), '[]'::jsonb) INTO v_participants
  FROM public.evaluation_participants ep WHERE ep.evaluation_id = p_evaluation_id;

  -- Abre a exceção de imutabilidade apenas nesta transação
  PERFORM set_config('sicsc.rehomologating', txid_current()::text, true);

  -- Guarda a homologação anterior (a versão atual fica na própria avaliação)
  INSERT INTO public.evaluation_homologations (
    evaluation_id, version, technical_score, final_classification, finalized_at, finalized_by,
    criteria_snapshot, criterion_ratings, auditor_review, participants_snapshot,
    superseded_by, superseded_reason)
  VALUES (
    v_eval.id, v_old_version, v_eval.technical_score, v_eval.final_classification, v_eval.finalized_at,
    v_eval.finalized_by, v_eval.criteria_snapshot, v_eval.criterion_ratings, v_eval.auditor_review,
    v_participants, v_email, v_reason);

  -- Reabre a avaliação para novo cálculo
  UPDATE public.evaluations
  SET finalized_at = NULL, finalized_by = NULL, technical_score = NULL, final_classification = NULL,
      criteria_snapshot = NULL, criterion_ratings = NULL,
      homologation_version = v_old_version + 1,
      rehomologated_at = now(), rehomologated_by = v_email, rehomologation_reason = v_reason,
      updated_at = now()
  WHERE id = p_evaluation_id;

  -- Recalcula e grava no servidor com as regras oficiais (falha aqui desfaz TUDO, incluindo o histórico)
  v_result := public.calculate_and_finalize_evaluation(
    p_evaluation_id, '{}'::jsonb, p_custom_threshold, p_threshold_override_reason, v_review);

  PERFORM set_config('sicsc.rehomologating', '', true);

  PERFORM public.log_audit_event('UPDATE', 'evaluations', p_evaluation_id::text, 'SUCCESS',
    format('Avaliação %s RE-HOMOLOGADA (versão %s → %s). Nota anterior %s%%, nova nota %s%%. Motivo: %s',
           v_eval.reference, v_old_version, v_old_version + 1,
           COALESCE(v_eval.technical_score::text, 'n/d'), COALESCE(v_result ->> 'finalScore', 'n/d'),
           left(v_reason, 250)),
    v_email);

  RETURN v_result || jsonb_build_object(
    'rehomologated', true,
    'version', v_old_version + 1,
    'previousScore', v_eval.technical_score,
    'previousClassification', v_eval.final_classification,
    'reason', v_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.rehomologate_evaluation(uuid, text, jsonb, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rehomologate_evaluation(uuid, text, jsonb, numeric, text) TO authenticated;

COMMIT;

-- ============================================================================
-- 1018 — Bloco B da auditoria v2: N-05, N-06, N-07, N-08 e VUL-06
-- Migração nova. Não altera as migrações 1000–1017.
-- ATENÇÃO À ORDEM DE DEPLOY: a Edge Function `login` tem de estar publicada
-- antes de aplicar esta migração, porque deixa de ser possível resolver
-- identificadores de login a partir do navegador.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- N-05 e N-06: funções de atividades e de pertença deixam de ser chamáveis
-- por utilizadores. Continuam a ser usadas por triggers e por my_team_overview,
-- que correm como dono (SECURITY DEFINER).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.sicsc_find_activity(uuid, date, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sicsc_member_on_date(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_in_evaluation_group(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- N-07: o formulário público já não decide a visibilidade para a equipa.
-- O campo clientVisibleToTeam é ignorado; a visibilidade só muda por
-- set_evaluation_client_visibility (RH ou Administrador), antes da homologação.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_evaluation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.submit_evaluation_core(p_payload - 'clientVisibleToTeam');
END;
$$;
REVOKE ALL ON FUNCTION public.submit_evaluation(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_evaluation(jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_evaluation_client_visibility(p_evaluation_id uuid, p_visible boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := COALESCE(public.current_user_role()::text, '');
  v_ref text;
BEGIN
  IF v_role NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas RH e Administrador definem a visibilidade do nome da empresa.';
  END IF;

  UPDATE public.evaluations
  SET client_visible_to_team = COALESCE(p_visible, false), updated_at = now()
  WHERE id = p_evaluation_id
  RETURNING reference INTO v_ref;

  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Avaliação não encontrada.';
  END IF;

  PERFORM public.log_audit_event(
    'UPDATE', 'evaluations', p_evaluation_id::text, 'SUCCESS',
    format('Visibilidade do nome da empresa para a equipa: %s (avaliação %s)',
           CASE WHEN COALESCE(p_visible, false) THEN 'visível' ELSE 'oculta' END, v_ref),
    public.current_user_email()
  );
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.set_evaluation_client_visibility(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_evaluation_client_visibility(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- N-08: anexos de mensagens. Lista explícita de tipos e tamanho máximo de 10 MB.
-- O bucket valida o Content-Type enviado; a validação do conteúdo real
-- (magic bytes) não é feita pela base de dados (limitação registada).
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ],
    file_size_limit = 10485760
WHERE id = 'message-files';

-- ---------------------------------------------------------------------------
-- VUL-06: resolução de identificadores de login só pelo serviço (Edge Function).
-- Limite de tentativas durável por chave (identificador ou IP).
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.resolve_login_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO service_role;

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0
);
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auth_rate_hit(p_key text, p_limit integer, p_window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO public.auth_rate_limits AS r (key, window_start, hits)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    window_start = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds)
                        THEN now() ELSE r.window_start END,
    hits = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds)
                THEN 1 ELSE r.hits + 1 END
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.auth_rate_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_rate_hit(text, integer, integer) TO service_role;

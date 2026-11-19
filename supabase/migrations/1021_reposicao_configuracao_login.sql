-- ============================================================================
-- 1021 — Reposição e proteção da configuração de login
--
-- Problema: a tabela public.login_settings tem UMA linha (id = 1) que define que métodos
-- de login estão ativos e quando a MFA passa a ser obrigatória. Uma limpeza de dados que
-- esvazie todas as tabelas apaga essa linha, e então resolve_login_email() devolvia
-- sempre nulo: ninguém conseguia iniciar sessão (a interface mostrava "credenciais inválidas").
--
-- Esta migração:
--   1. repõe a linha (se faltar);
--   2. faz resolve_login_email() tolerante à falta da linha (por omissão, todos os métodos ativos);
--   3. impede que a linha seja apagada ou a tabela esvaziada por engano.
-- É idempotente: pode ser executada várias vezes.
-- ============================================================================

BEGIN;

-- 1) Linha de configuração (a MFA passa a ser exigida a ADMIN/HR 14 dias depois)
INSERT INTO public.login_settings (id, mfa_enforced_from)
VALUES (1, now() + interval '14 days')
ON CONFLICT (id) DO NOTHING;

-- 2) resolve_login_email tolerante: sem linha de configuração, aplica os valores por omissão (tudo ativo)
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_login text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  s public.login_settings%ROWTYPE;
  v text := btrim(COALESCE(p_login, ''));
  v_norm text := public.normalize_login_text(v);
  v_count integer;
  v_email text;
BEGIN
  IF length(v) < 3 OR length(v) > 120 THEN RETURN NULL; END IF;
  SELECT * INTO s FROM public.login_settings WHERE id = 1;

  IF position('@' IN v) > 0 THEN
    IF NOT COALESCE(s.allow_email, true) THEN RETURN NULL; END IF;
    IF v !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN RETURN NULL; END IF;
    SELECT p.email INTO v_email FROM public.profiles p
    WHERE lower(p.email) = lower(v) AND p.active = true LIMIT 1;
    RETURN v_email;
  END IF;

  SELECT count(DISTINCT p.email), min(p.email) INTO v_count, v_email
  FROM public.employees e
  JOIN public.profiles p ON p.id = e.user_id
  WHERE p.active = true AND e.account_status = 'ATIVA'
    AND (
      (COALESCE(s.allow_access_identifier, true) AND e.access_identifier = v_norm)
      OR (COALESCE(s.allow_full_name, true) AND public.normalize_login_text(e.full_name) = v_norm)
      OR (COALESCE(s.allow_employee_number, true) AND upper(e.employee_number) = upper(v))
    );
  IF v_count = 1 THEN RETURN v_email; END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO service_role;

-- 3) Proteção contra apagar a configuração por engano
CREATE OR REPLACE FUNCTION public.protect_login_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'login_settings é uma tabela de configuração e não pode ser apagada nem esvaziada. Exclua-a das limpezas de dados (veja supabase/manutencao/limpar_dados_producao.sql).';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_login_settings_row ON public.login_settings;
CREATE TRIGGER trg_protect_login_settings_row
BEFORE DELETE ON public.login_settings
FOR EACH ROW EXECUTE FUNCTION public.protect_login_settings();

DROP TRIGGER IF EXISTS trg_protect_login_settings_truncate ON public.login_settings;
CREATE TRIGGER trg_protect_login_settings_truncate
BEFORE TRUNCATE ON public.login_settings
FOR EACH STATEMENT EXECUTE FUNCTION public.protect_login_settings();

COMMIT;

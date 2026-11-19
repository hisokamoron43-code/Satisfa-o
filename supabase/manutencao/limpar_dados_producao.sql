-- ============================================================================
-- LIMPAR OS DADOS DE NEGÓCIO (mantém tabelas, funções, políticas e CONFIGURAÇÃO)
-- Irreversível. Faça um backup antes (Database > Backups).
--
-- Tabelas de configuração que NÃO são apagadas (sem elas o sistema deixa de funcionar):
--   app_pages              catálogo das páginas
--   login_settings         métodos de login e data da MFA  (sem esta linha ninguém entra)
--   criteria_configurations limiar de aprovação
-- Depois de correr este script: apague o utilizador antigo em Authentication, crie o novo e
-- corra supabase/manutencao/criar_administrador.sql.
-- Os ficheiros em Storage (employee-documents, evaluation-audio) têm de ser esvaziados no painel.
-- ============================================================================
BEGIN;

DO $$
DECLARE
  v_keep text[] := ARRAY['app_pages', 'login_settings', 'criteria_configurations'];
  v_list text;
  r record;
BEGIN
  SELECT string_agg(format('public.%I', tablename), ', ')
    INTO v_list
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename <> ALL (v_keep);

  IF v_list IS NULL THEN
    RAISE EXCEPTION 'Nenhuma tabela encontrada em public.';
  END IF;

  -- Sem CASCADE: se existir uma ligação inesperada, dá erro em vez de apagar às cegas
  EXECUTE 'TRUNCATE TABLE ' || v_list || ' RESTART IDENTITY';

  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I RESTART', r.sequencename);
  END LOOP;
END $$;

-- Garantia: a linha de configuração do login tem de existir
INSERT INTO public.login_settings (id, mfa_enforced_from)
VALUES (1, now() + interval '14 days')
ON CONFLICT (id) DO NOTHING;

COMMIT;

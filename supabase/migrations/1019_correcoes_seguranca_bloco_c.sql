-- ============================================================================
-- 1019 — Bloco C da auditoria v2: N-10 e VUL-10 (estratégia de limpeza)
-- Migração nova. Não altera as migrações 1000–1018.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- N-10: privilégios de execução. Funções de trigger e a homologação deixam de
-- ser chamáveis por anon (e as de trigger por ninguém fora do motor).
-- Não se retiram is_staff, is_admin, is_hr_or_admin, current_user_role nem
-- current_provider_id: são usadas pelas políticas RLS, incluindo as de anon.
-- ---------------------------------------------------------------------------
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'trg\_%' OR p.proname IN ('sync_criterion_from_category'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'calculate_and_finalize_evaluation'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- VUL-10: relatório de áudios órfãos (apenas leitura). A eliminação não é
-- automatizada: é destrutiva e exige aprovação. Retenção mínima de 30 dias.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audio_orphans_report(p_older_than_days integer DEFAULT 90)
RETURNS TABLE(object_name text, created_at timestamptz, size_bytes bigint)
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public, storage, pg_temp
AS $$
  SELECT o.name, o.created_at, NULLIF(o.metadata ->> 'size', '')::bigint
  FROM storage.objects o
  WHERE o.bucket_id = 'evaluation-audio'
    AND o.created_at < now() - make_interval(days => GREATEST(COALESCE(p_older_than_days, 90), 30))
    AND NOT EXISTS (
      SELECT 1 FROM public.evaluations e
      WHERE e.audio_recording_url = o.name OR e.audio_recording_url LIKE '%/' || o.name
    )
  ORDER BY o.created_at
$$;
REVOKE ALL ON FUNCTION public.audio_orphans_report(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audio_orphans_report(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Política por defeito para anon: nenhuma função pública é executável por
-- anon, exceto as que as políticas RLS destinadas a anon usam e as RPCs
-- públicas do formulário e do login. Evita que funções criadas no futuro (ou
-- as que escaparam a um REVOKE) fiquem expostas sem revisão.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  f record;
  v_needed text[];
  v_allow text[] := ARRAY[
    'submit_evaluation', 'list_public_team_providers', 'get_login_methods',
    'audio_upload_quota_ok', 'is_staff', 'is_admin', 'is_hr_or_admin',
    'current_user_role', 'current_user_email', 'current_provider_id'
  ];
BEGIN
  -- funções referenciadas por políticas RLS que se aplicam a anon
  SELECT COALESCE(array_agg(DISTINCT m[1]), ARRAY[]::text[]) INTO v_needed
  FROM pg_policies pol,
       LATERAL regexp_matches(COALESCE(pol.qual, '') || ' ' || COALESCE(pol.with_check, ''), 'public\.([a-z_][a-z0-9_]*)\(', 'g') AS m
  WHERE 'anon' = ANY (pol.roles) OR pol.roles @> ARRAY['public']::name[];

  v_allow := v_allow || v_needed;

  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT (p.proname = ANY (v_allow))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
  END LOOP;
END $$;

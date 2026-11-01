-- OBSOLETA — NÃO EXECUTAR.
-- Falha ao executar (função referencia tabela ainda não criada), apaga tabelas existentes (DROP ... CASCADE)
-- e contém os defeitos corrigidos em CORRECOES.md. Usar supabase/migrations/1000_producao_consolidada.sql.

-- ============================================================================
-- SICSC — SISTEMA INTEGRADO DE CONTROLO DA SATISFAÇÃO DE CLIENTES (AETERNU ANGOLA)
-- MIGRAÇÃO CONSOLIDADA, BLINDADA E COMPLETA DE PRODUÇÃO (VERSÃO 999 - FINAL)
-- ============================================================================

BEGIN;

--------------------------------------------------------------------------------
-- FASE 1: LIMPEZA TOTAL DE OBJETOS ANTIGOS (REINICIALIZAÇÃO ORQUESTRADA)
--------------------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_public_form_questions CASCADE;
DROP VIEW IF EXISTS public.v_public_form_categories CASCADE;
DROP VIEW IF EXISTS public.v_public_services CASCADE;

DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.hr_cases CASCADE;
DROP TABLE IF EXISTS public.evaluation_workers CASCADE;
DROP TABLE IF EXISTS public.evaluations CASCADE;
DROP TABLE IF EXISTS public.form_questions CASCADE;
DROP TABLE IF EXISTS public.form_categories CASCADE;
DROP TABLE IF EXISTS public.form_versions CASCADE;
DROP TABLE IF EXISTS public.evaluation_criteria CASCADE;
DROP TABLE IF EXISTS public.criteria_configurations CASCADE;
DROP TABLE IF EXISTS public.providers CASCADE;
DROP TABLE IF EXISTS public.services CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

DROP FUNCTION IF EXISTS public.current_user_email() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_role() CASCADE;
DROP FUNCTION IF EXISTS public.is_staff() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin_or_hr() CASCADE;
DROP FUNCTION IF EXISTS public.log_audit_event(text, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.submit_evaluation(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.associate_evaluation_client(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.assign_evaluation_workers(uuid, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.calculate_and_finalize_evaluation(uuid, jsonb, numeric, text) CASCADE;
DROP FUNCTION IF EXISTS public.finalize_evaluation_worker(uuid, uuid, jsonb, numeric, text) CASCADE;

DROP TYPE IF EXISTS public.user_role CASCADE;
DROP SEQUENCE IF EXISTS public.evaluation_reference_seq CASCADE;

--------------------------------------------------------------------------------
-- FASE 2: EXTENSÕES, TIPOS E SEQUÊNCIAS
--------------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE public.user_role AS ENUM ('ADMIN', 'HR', 'DIRECTOR', 'OPERATIONAL', 'PROVIDER');

CREATE SEQUENCE IF NOT EXISTS public.evaluation_reference_seq START WITH 1000 INCREMENT BY 1;

--------------------------------------------------------------------------------
-- FASE 3: FUNÇÕES DE SEGURANÇA BASE (SECURITY DEFINER COM SET search_path)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    nullif(auth.jwt() ->> 'email', ''),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT role 
  FROM public.profiles 
  WHERE email = public.current_user_email() 
    AND active = true 
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.current_user_role() IN ('ADMIN', 'HR', 'DIRECTOR', 'OPERATIONAL', 'PROVIDER');
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_hr()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.current_user_role() IN ('ADMIN', 'HR', 'DIRECTOR');
$$;

--------------------------------------------------------------------------------
-- FASE 4: CRIAÇÃO DE TABELAS RELACIONAIS
--------------------------------------------------------------------------------

-- 1. PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role public.user_role NOT NULL DEFAULT 'OPERATIONAL',
  provider_id uuid,
  department text NOT NULL DEFAULT 'Operações',
  avatar_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. CLIENTS
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL UNIQUE,
  internal_code text NOT NULL UNIQUE,
  contact_person text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  contracted_services text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. SERVICES
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  description text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  evaluation_indicator text NOT NULL DEFAULT 'CSAT_AND_NPS' CHECK (evaluation_indicator IN ('CSAT', 'NPS', 'CSAT_AND_NPS')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. PROVIDERS
CREATE TABLE public.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_code text NOT NULL UNIQUE,
  name text NOT NULL,
  professional_email text NOT NULL UNIQUE,
  phone text,
  specialty text,
  department text DEFAULT 'Operações',
  services text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  evaluation_access_authorized boolean NOT NULL DEFAULT false,
  access_authorized_at timestamptz,
  access_authorized_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. FORM_VERSIONS (Versões do Formulário Público)
CREATE TABLE public.form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number integer NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  title text NOT NULL,
  published_at timestamptz,
  published_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. FORM_CATEGORIES
CREATE TABLE public.form_categories (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#8CBF26',
  badge_bg text NOT NULL DEFAULT 'bg-slate-100 text-slate-800 border-slate-300',
  display_order integer NOT NULL DEFAULT 1 CHECK (display_order >= 1),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. FORM_QUESTIONS
CREATE TABLE public.form_questions (
  id text PRIMARY KEY,
  version_id uuid REFERENCES public.form_versions(id) ON DELETE CASCADE,
  text text NOT NULL,
  description text,
  category text NOT NULL REFERENCES public.form_categories(code) ON UPDATE CASCADE,
  type text NOT NULL CHECK (type IN ('RATING_5', 'NPS_10', 'TEXT_ONLY', 'AUDIO_AND_TEXT', 'MULTIPLE_CHOICE', 'SHORT_TEXT')),
  required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 1 CHECK (display_order >= 1),
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  options jsonb DEFAULT '[]'::jsonb,
  conditional_on jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT 'Sistema'
);

-- 8. EVALUATION_CRITERIA
CREATE TABLE public.evaluation_criteria (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  weight numeric(5,2) NOT NULL CHECK (weight >= 0.00 AND weight <= 100.00),
  description text,
  min_score numeric(3,1) NOT NULL DEFAULT 1.0,
  max_score numeric(3,1) NOT NULL DEFAULT 5.0,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT 'Sistema'
);

-- 9. CRITERIA_CONFIGURATIONS
CREATE TABLE public.criteria_configurations (
  id text PRIMARY KEY DEFAULT 'global_config',
  passing_threshold numeric(5,2) NOT NULL DEFAULT 70.00 CHECK (passing_threshold BETWEEN 0.00 AND 100.00),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT 'Sistema'
);

-- 10. EVALUATIONS
CREATE TABLE public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('AVAL-' || nextval('public.evaluation_reference_seq')),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  client_name_input text,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  form_version_id uuid REFERENCES public.form_versions(id) ON DELETE SET NULL,
  service_date date NOT NULL DEFAULT CURRENT_DATE,
  evaluation_date timestamptz NOT NULL DEFAULT now(),
  satisfaction_rating integer NOT NULL CHECK (satisfaction_rating BETWEEN 1 AND 5),
  nps_score integer CHECK (nps_score BETWEEN 0 AND 10),
  comment text,
  audio_recording_url text,
  audio_duration_seconds integer CHECK (audio_duration_seconds IS NULL OR audio_duration_seconds <= 45),
  service_types_provided text[] DEFAULT '{}',
  detailedAnswers jsonb DEFAULT '{}'::jsonb,
  questionsSnapshot jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'REVIEWED', 'APPROVED', 'RESOLVED', 'ARCHIVED')),
  requiresFollowUp boolean NOT NULL DEFAULT false,
  correctiveActionStatus text NOT NULL DEFAULT 'NOT_NEEDED' CHECK (correctiveActionStatus IN ('NOT_NEEDED', 'PENDING', 'IN_PROGRESS', 'COMPLETED')),
  technical_score numeric(5,2) CHECK (technical_score BETWEEN 0.00 AND 100.00),
  final_classification text CHECK (final_classification IN ('POSITIVE', 'NEGATIVE')),
  finalized_at timestamptz,
  finalized_by text,
  criteriaSnapshot jsonb,
  criterionRatings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 11. EVALUATION_WORKERS (Associação e Homologação Individual de Vários Trabalhadores)
CREATE TABLE public.evaluation_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  technical_score numeric(5,2) CHECK (technical_score BETWEEN 0.00 AND 100.00),
  final_classification text CHECK (final_classification IN ('POSITIVE', 'NEGATIVE')),
  criterionRatings jsonb DEFAULT '{}'::jsonb,
  criteriaSnapshot jsonb,
  finalized_at timestamptz,
  finalized_by text,
  internal_notes text,
  assigned_by text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(evaluation_id, provider_id)
);

-- 12. HR_CASES
CREATE TABLE public.hr_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  occurrence_type text NOT NULL,
  internal_notes text NOT NULL,
  assigned_to text NOT NULL,
  corrective_action text NOT NULL,
  status text NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'EM_ANALISE', 'RESOLVIDO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 13. AUDIT_LOGS
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL,
  affected_entity text NOT NULL,
  record_id text,
  user_email text NOT NULL,
  user_name text NOT NULL,
  result text NOT NULL CHECK (result IN ('SUCCESS', 'DENIED', 'WARNING')),
  details text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- FASE 5: FUNÇÃO DE AUDITORIA REAL
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_operation text,
  p_entity text,
  p_record_id text,
  p_result text,
  p_details text,
  p_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email text;
  v_name text;
BEGIN
  v_email := coalesce(nullif(p_email, ''), public.current_user_email(), 'sistema@aeternu.co.ao');
  SELECT name INTO v_name FROM public.profiles WHERE email = v_email LIMIT 1;
  v_name := coalesce(v_name, 'Sistema SICSC');

  INSERT INTO public.audit_logs (
    operation_type, affected_entity, record_id, user_email, user_name, result, details
  ) VALUES (
    p_operation, p_entity, p_record_id, v_email, v_name, p_result, p_details
  );
END;
$$;

--------------------------------------------------------------------------------
-- FASE 6: RLS E POLÍTICAS DE ACESSO RESTRITO
--------------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.criteria_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "profiles_admin" ON public.profiles FOR ALL TO authenticated USING (public.current_user_role() = 'ADMIN');

-- Clients Policies
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "clients_admin_hr" ON public.clients FOR ALL TO authenticated USING (public.is_admin_or_hr());

-- Services Policies
CREATE POLICY "services_select" ON public.services FOR SELECT TO anon, authenticated USING (status = 'ACTIVE' OR public.is_staff());
CREATE POLICY "services_admin" ON public.services FOR ALL TO authenticated USING (public.is_admin_or_hr());

-- Providers Policies
CREATE POLICY "providers_select" ON public.providers FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "providers_admin_hr" ON public.providers FOR ALL TO authenticated USING (public.is_admin_or_hr());

-- Form Versions, Categories & Questions
CREATE POLICY "form_versions_select" ON public.form_versions FOR SELECT TO anon, authenticated USING (status = 'PUBLISHED' OR public.is_staff());
CREATE POLICY "form_versions_admin" ON public.form_versions FOR ALL TO authenticated USING (public.is_admin_or_hr());

CREATE POLICY "form_categories_select" ON public.form_categories FOR SELECT TO anon, authenticated USING (active = true OR public.is_staff());
CREATE POLICY "form_categories_admin" ON public.form_categories FOR ALL TO authenticated USING (public.is_admin_or_hr());

CREATE POLICY "form_questions_select" ON public.form_questions FOR SELECT TO anon, authenticated USING (active = true OR public.is_staff());
CREATE POLICY "form_questions_admin" ON public.form_questions FOR ALL TO authenticated USING (public.is_admin_or_hr());

-- Criteria Policies
CREATE POLICY "criteria_select" ON public.evaluation_criteria FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "criteria_admin" ON public.evaluation_criteria FOR ALL TO authenticated USING (public.is_admin_or_hr());

CREATE POLICY "config_select" ON public.criteria_configurations FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "config_admin" ON public.criteria_configurations FOR ALL TO authenticated USING (public.is_admin_or_hr());

-- Evaluations Policies (Anónimo insere via RPC, Staff lê)
CREATE POLICY "evaluations_insert_public" ON public.evaluations FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "evaluations_select_staff" ON public.evaluations FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "evaluations_update_staff" ON public.evaluations FOR UPDATE TO authenticated USING (public.is_admin_or_hr());

-- Evaluation Workers Policies (Provider só vê as suas próprias avaliações finalizadas)
CREATE POLICY "eval_workers_select" ON public.evaluation_workers FOR SELECT TO authenticated USING (
  public.is_admin_or_hr() 
  OR provider_id IN (SELECT provider_id FROM public.profiles WHERE email = public.current_user_email() AND role = 'PROVIDER')
);
CREATE POLICY "eval_workers_admin" ON public.evaluation_workers FOR ALL TO authenticated USING (public.is_admin_or_hr());

-- HR Cases Policies
CREATE POLICY "hr_cases_policy" ON public.hr_cases FOR ALL TO authenticated USING (public.is_admin_or_hr());

-- Audit Logs Policies
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin_or_hr());
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT TO authenticated, service_role WITH CHECK (true);

--------------------------------------------------------------------------------
-- FASE 7: FUNÇÕES RPC SEGURAS (SUBMISSÃO, ATRIBUIÇÃO E HOMOLOGAÇÃO)
--------------------------------------------------------------------------------

-- 1. SUBMISSÃO PÚBLICA SEGURA
CREATE OR REPLACE FUNCTION public.submit_evaluation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_client_name text;
  v_service_id uuid;
  v_service_record record;
  v_service_name text;
  v_satisfaction integer;
  v_nps integer;
  v_comment text;
  v_audio_url text;
  v_audio_duration integer;
  v_answers jsonb;
  v_snapshot jsonb;
  v_version_id uuid;
  v_new_ref text;
  v_eval_id uuid;
  v_requires_followup boolean := false;
BEGIN
  v_client_name := trim(p_payload ->> 'clientName');
  IF v_client_name IS NULL OR length(v_client_name) < 2 THEN
    RAISE EXCEPTION 'O nome da empresa cliente é obrigatório.';
  END IF;

  v_service_id := (p_payload ->> 'serviceId')::uuid;
  SELECT * INTO v_service_record FROM public.services WHERE id = v_service_id AND status = 'ACTIVE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O serviço selecionado é inválido ou encontra-se inativo.';
  END IF;
  v_service_name := v_service_record.name;

  v_satisfaction := coalesce((p_payload ->> 'satisfactionRating')::integer, 5);
  v_nps := (p_payload ->> 'npsScore')::integer;
  v_comment := p_payload ->> 'comment';
  v_audio_url := p_payload ->> 'audioRecordingUrl';
  v_audio_duration := (p_payload ->> 'audioDurationSeconds')::integer;

  IF v_audio_duration IS NOT NULL AND v_audio_duration > 45 THEN
    RAISE EXCEPTION 'A duração máxima permitida para o áudio é de 45 segundos.';
  END IF;

  SELECT id INTO v_version_id FROM public.form_versions WHERE status = 'PUBLISHED' ORDER BY version_number DESC LIMIT 1;

  v_answers := coalesce(p_payload ->> 'detailedAnswers', '{}')::jsonb;
  v_snapshot := coalesce(p_payload ->> 'questionsSnapshot', '[]')::jsonb;

  IF v_satisfaction <= 2 OR (v_nps IS NOT NULL AND v_nps <= 6) THEN
    v_requires_followup := true;
  END IF;

  INSERT INTO public.evaluations (
    client_name,
    client_name_input,
    service_id,
    service_name,
    form_version_id,
    satisfaction_rating,
    nps_score,
    comment,
    audio_recording_url,
    audio_duration_seconds,
    detailedAnswers,
    questionsSnapshot,
    status,
    requiresFollowUp,
    correctiveActionStatus
  ) VALUES (
    v_client_name,
    v_client_name,
    v_service_id,
    v_service_name,
    v_version_id,
    v_satisfaction,
    v_nps,
    v_comment,
    v_audio_url,
    v_audio_duration,
    v_answers,
    v_snapshot,
    'PENDING_REVIEW',
    v_requires_followup,
    CASE WHEN v_requires_followup THEN 'PENDING' ELSE 'NOT_NEEDED' END
  )
  RETURNING id, reference INTO v_eval_id, v_new_ref;

  PERFORM public.log_audit_event('CREATE', 'evaluations', v_eval_id::text, 'SUCCESS', format('Submissão pública registada para a empresa %s (Serviço: %s)', v_client_name, v_service_name), 'public@aeternu.co.ao');

  RETURN jsonb_build_object(
    'success', true,
    'id', v_eval_id,
    'reference', v_new_ref,
    'message', 'Avaliação submetida com sucesso.'
  );
END;
$$;

-- 2. ASSOCIAR CLIENTE
CREATE OR REPLACE FUNCTION public.associate_evaluation_client(
  p_evaluation_id uuid,
  p_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_eval record;
  v_client record;
  v_role public.user_role;
BEGIN
  v_role := public.current_user_role();
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'HR', 'DIRECTOR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN, HR ou DIRECTOR podem associar clientes.';
  END IF;

  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  IF v_eval.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'Avaliação já homologada é imutável.'; END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado ou inativo.'; END IF;

  UPDATE public.evaluations
  SET client_id = p_client_id, client_name = v_client.company_name, updated_at = clock_timestamp()
  WHERE id = p_evaluation_id;

  PERFORM public.log_audit_event('UPDATE', 'evaluations', p_evaluation_id::text, 'SUCCESS', format('Avaliação %s associada ao cliente oficial %s', v_eval.reference, v_client.company_name));

  RETURN jsonb_build_object('success', true, 'evaluationId', p_evaluation_id, 'clientName', v_client.company_name);
END;
$$;

-- 3. ATRIBUIR VÁRIOS TRABALHADORES (assign_evaluation_workers)
CREATE OR REPLACE FUNCTION public.assign_evaluation_workers(
  p_evaluation_id uuid,
  p_provider_ids jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_eval record;
  v_role public.user_role;
  v_prov_id uuid;
  v_prov_name text;
  v_caller text;
BEGIN
  v_role := public.current_user_role();
  v_caller := public.current_user_email();

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'HR', 'DIRECTOR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN, HR ou DIRECTOR podem atribuir trabalhadores.';
  END IF;

  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  IF v_eval.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'Avaliação já homologada é imutável.'; END IF;

  -- Remover atribuições anteriores não homologadas
  DELETE FROM public.evaluation_workers WHERE evaluation_id = p_evaluation_id AND finalized_at IS NULL;

  FOR v_prov_id IN SELECT * FROM jsonb_array_elements_text(p_provider_ids)::uuid LOOP
    SELECT name INTO v_prov_name FROM public.providers WHERE id = v_prov_id AND status = 'ACTIVE';
    IF FOUND THEN
      INSERT INTO public.evaluation_workers (evaluation_id, provider_id, assigned_by)
      VALUES (p_evaluation_id, v_prov_id, v_caller)
      ON CONFLICT (evaluation_id, provider_id) DO NOTHING;
    END IF;
  END LOOP;

  PERFORM public.log_audit_event('UPDATE', 'evaluations', p_evaluation_id::text, 'SUCCESS', format('Trabalhadores atribuídos à avaliação %s', v_eval.reference));

  RETURN jsonb_build_object('success', true, 'evaluationId', p_evaluation_id);
END;
$$;

-- 4. HOMOLOGAÇÃO GERAL (calculate_and_finalize_evaluation)
CREATE OR REPLACE FUNCTION public.calculate_and_finalize_evaluation(
  p_evaluation_id uuid,
  p_criterion_ratings jsonb,
  p_custom_threshold numeric DEFAULT NULL,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_eval record;
  v_role public.user_role;
  v_caller_email text;
  v_passing_threshold numeric;
  v_total_weight numeric := 0;
  v_weighted_sum numeric := 0;
  v_final_score numeric;
  v_final_class text;
  v_criterion record;
  v_rating numeric;
  v_criteria_array jsonb := '[]'::jsonb;
  v_snapshot jsonb;
BEGIN
  v_role := public.current_user_role();
  v_caller_email := public.current_user_email();

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN e HR podem homologar avaliações.';
  END IF;

  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  IF v_eval.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'Esta avaliação já se encontra homologada e é imutável.'; END IF;

  -- Validar pesos ativos (devem somar 100%)
  SELECT sum(weight) INTO v_total_weight FROM public.evaluation_criteria WHERE active = true;
  IF v_total_weight IS NULL OR abs(v_total_weight - 100.00) > 0.01 THEN
    RAISE EXCEPTION 'A soma dos pesos dos critérios ativos deve ser exatamente 100%% (Soma atual: %%).', v_total_weight;
  END IF;

  v_total_weight := 0;

  -- Calcular pontuação ponderada
  FOR v_criterion IN SELECT * FROM public.evaluation_criteria WHERE active = true LOOP
    v_rating := (p_criterion_ratings ->> v_criterion.code)::numeric;
    IF v_rating IS NULL THEN
      v_rating := (p_criterion_ratings ->> v_criterion.id)::numeric;
    END IF;

    IF v_rating IS NULL OR v_rating < v_criterion.min_score OR v_rating > v_criterion.max_score THEN
      RAISE EXCEPTION 'Classificação inválida ou em falta para o critério obrigatório: %', v_criterion.name;
    END IF;

    v_total_weight := v_total_weight + v_criterion.weight;
    v_weighted_sum := v_weighted_sum + ((v_rating / v_criterion.max_score) * 100.0 * (v_criterion.weight / 100.0));

    v_criteria_array := v_criteria_array || jsonb_build_object(
      'criterionId', v_criterion.id,
      'code', v_criterion.code,
      'name', v_criterion.name,
      'weight', v_criterion.weight,
      'rating', v_rating,
      'maxScore', v_criterion.max_score
    );
  END LOOP;

  IF p_custom_threshold IS NOT NULL THEN
    v_passing_threshold := p_custom_threshold;
    IF p_override_reason IS NULL OR length(trim(p_override_reason)) < 5 THEN
      RAISE EXCEPTION 'É obrigatório indicar uma justificação válida para a alteração do limiar.';
    END IF;
  ELSE
    SELECT passing_threshold INTO v_passing_threshold FROM public.criteria_configurations WHERE id = 'global_config';
    IF NOT FOUND THEN v_passing_threshold := 70.00; END IF;
  END IF;

  v_final_score := round(v_weighted_sum, 2);
  v_final_class := CASE WHEN v_final_score >= v_passing_threshold THEN 'POSITIVE' ELSE 'NEGATIVE' END;

  v_snapshot := jsonb_build_object(
    'passingThreshold', v_passing_threshold,
    'totalWeight', v_total_weight,
    'overrideReason', p_override_reason,
    'evaluatedCriteria', v_criteria_array,
    'calculatedAt', clock_timestamp()
  );

  UPDATE public.evaluations
  SET 
    technical_score = v_final_score,
    final_classification = v_final_class,
    finalized_at = clock_timestamp(),
    finalized_by = v_caller_email,
    criteriaSnapshot = v_snapshot,
    criterionRatings = p_criterion_ratings,
    status = 'APPROVED',
    updated_at = clock_timestamp()
  WHERE id = p_evaluation_id;

  PERFORM public.log_audit_event('UPDATE', 'evaluations', p_evaluation_id::text, 'SUCCESS', format('Avaliação %s homologada com pontuação técnica de %s%%', v_eval.reference, v_final_score));

  RETURN jsonb_build_object(
    'success', true,
    'evaluationId', p_evaluation_id,
    'technicalScore', v_final_score,
    'finalClassification', v_final_class,
    'snapshot', v_snapshot
  );
END;
$$;

-- 5. HOMOLOGAÇÃO INDIVIDUAL DE TRABALHADOR (finalize_evaluation_worker)
CREATE OR REPLACE FUNCTION public.finalize_evaluation_worker(
  p_evaluation_id uuid,
  p_provider_id uuid,
  p_criterion_ratings jsonb,
  p_custom_threshold numeric DEFAULT NULL,
  p_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_caller_email text;
  v_passing_threshold numeric;
  v_total_weight numeric := 0;
  v_weighted_sum numeric := 0;
  v_final_score numeric;
  v_final_class text;
  v_criterion record;
  v_rating numeric;
  v_criteria_array jsonb := '[]'::jsonb;
  v_snapshot jsonb;
BEGIN
  v_role := public.current_user_role();
  v_caller_email := public.current_user_email();

  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN e HR podem homologar trabalhadores.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.evaluation_workers WHERE evaluation_id = p_evaluation_id AND provider_id = p_provider_id) THEN
    RAISE EXCEPTION 'O trabalhador especificado não está associado a esta avaliação.';
  END IF;

  SELECT sum(weight) INTO v_total_weight FROM public.evaluation_criteria WHERE active = true;
  IF v_total_weight IS NULL OR abs(v_total_weight - 100.00) > 0.01 THEN
    RAISE EXCEPTION 'A soma dos pesos dos critérios ativos deve ser exatamente 100%%.';
  END IF;

  v_total_weight := 0;

  FOR v_criterion IN SELECT * FROM public.evaluation_criteria WHERE active = true LOOP
    v_rating := (p_criterion_ratings ->> v_criterion.code)::numeric;
    IF v_rating IS NULL THEN
      v_rating := (p_criterion_ratings ->> v_criterion.id)::numeric;
    END IF;

    IF v_rating IS NULL OR v_rating < v_criterion.min_score OR v_rating > v_criterion.max_score THEN
      RAISE EXCEPTION 'Classificação inválida ou em falta para o critério: %', v_criterion.name;
    END IF;

    v_total_weight := v_total_weight + v_criterion.weight;
    v_weighted_sum := v_weighted_sum + ((v_rating / v_criterion.max_score) * 100.0 * (v_criterion.weight / 100.0));

    v_criteria_array := v_criteria_array || jsonb_build_object(
      'criterionId', v_criterion.id,
      'code', v_criterion.code,
      'name', v_criterion.name,
      'weight', v_criterion.weight,
      'rating', v_rating,
      'maxScore', v_criterion.max_score
    );
  END LOOP;

  IF p_custom_threshold IS NOT NULL THEN
    v_passing_threshold := p_custom_threshold;
  ELSE
    SELECT passing_threshold INTO v_passing_threshold FROM public.criteria_configurations WHERE id = 'global_config';
    IF NOT FOUND THEN v_passing_threshold := 70.00; END IF;
  END IF;

  v_final_score := round(v_weighted_sum, 2);
  v_final_class := CASE WHEN v_final_score >= v_passing_threshold THEN 'POSITIVE' ELSE 'NEGATIVE' END;

  v_snapshot := jsonb_build_object(
    'passingThreshold', v_passing_threshold,
    'totalWeight', v_total_weight,
    'overrideReason', p_override_reason,
    'evaluatedCriteria', v_criteria_array,
    'calculatedAt', clock_timestamp()
  );

  UPDATE public.evaluation_workers
  SET 
    technical_score = v_final_score,
    final_classification = v_final_class,
    finalized_at = clock_timestamp(),
    finalized_by = v_caller_email,
    criteriaSnapshot = v_snapshot,
    criterionRatings = p_criterion_ratings
  WHERE evaluation_id = p_evaluation_id AND provider_id = p_provider_id;

  PERFORM public.log_audit_event('UPDATE', 'evaluation_workers', p_provider_id::text, 'SUCCESS', format('Trabalhador homologado na avaliação %s com pontuação %s%%', p_evaluation_id, v_final_score));

  RETURN jsonb_build_object(
    'success', true,
    'evaluationId', p_evaluation_id,
    'providerId', p_provider_id,
    'technicalScore', v_final_score,
    'finalClassification', v_final_class
  );
END;
$$;

--------------------------------------------------------------------------------
-- FASE 8: PERMISSÕES DE EXECUÇÃO E VISTAS PÚBLICAS
--------------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.submit_evaluation(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.associate_evaluation_client(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_evaluation_workers(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_and_finalize_evaluation(uuid, jsonb, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_evaluation_worker(uuid, uuid, jsonb, numeric, text) TO authenticated, service_role;

GRANT SELECT ON public.services TO anon, authenticated, service_role;
GRANT SELECT ON public.form_versions TO anon, authenticated, service_role;
GRANT SELECT ON public.form_categories TO anon, authenticated, service_role;
GRANT SELECT ON public.form_questions TO anon, authenticated, service_role;
GRANT SELECT ON public.clients TO authenticated, service_role;
GRANT SELECT ON public.providers TO authenticated, service_role;
GRANT SELECT ON public.evaluations TO authenticated, service_role;
GRANT SELECT ON public.evaluation_workers TO authenticated, service_role;

COMMIT;

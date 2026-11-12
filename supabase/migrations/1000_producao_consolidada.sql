-- ============================================================================
-- SICSC — AETERNU ANGOLA
-- MIGRAÇÃO 1000 — ESQUEMA DE PRODUÇÃO CONSOLIDADO (NÃO DESTRUTIVA)
--
-- - NÃO apaga tabelas, colunas nem dados. É idempotente: pode ser executada
--   numa base vazia ou sobre a base já existente (acrescenta o que falta).
-- - Substitui as migrações 001–012 e a 999 (obsoleta, falhava e apagava dados).
-- - Nomes de colunas em snake_case, alinhados com o código do frontend.
-- - Antes de executar: FAÇA BACKUP (ver DEPLOY_RENDER.md, secção "Backup").
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. TIPOS E SEQUÊNCIAS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('ADMIN', 'HR', 'DIRECTOR', 'OPERATIONAL', 'PROVIDER');
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.evaluation_reference_seq START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.employee_number_seq START WITH 1 INCREMENT BY 1;

-- ----------------------------------------------------------------------------
-- 2. TABELAS (criar se não existirem; depois acrescentar colunas em falta)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'PROVIDER';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'Operações';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_pages text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS provider_id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_key ON public.profiles (email);

CREATE TABLE IF NOT EXISTS public.app_pages (key text PRIMARY KEY);
ALTER TABLE public.app_pages ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE public.app_pages ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'Operações';
ALTER TABLE public.app_pages ADD COLUMN IF NOT EXISTS required_base_role public.user_role NOT NULL DEFAULT 'PROVIDER';
ALTER TABLE public.app_pages ADD COLUMN IF NOT EXISTS is_sensitive boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_pages ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.app_pages ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.access_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.access_profiles ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE public.access_profiles ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE public.access_profiles ADD COLUMN IF NOT EXISTS base_role public.user_role NOT NULL DEFAULT 'PROVIDER';
ALTER TABLE public.access_profiles ADD COLUMN IF NOT EXISTS pages text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.access_profiles ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.access_profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.access_profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.access_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS internal_code text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contracted_services text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS clients_company_name_key ON public.clients (company_name);
CREATE UNIQUE INDEX IF NOT EXISTS clients_internal_code_key ON public.clients (internal_code);

CREATE TABLE IF NOT EXISTS public.services (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS evaluation_indicator text NOT NULL DEFAULT 'CSAT_AND_NPS' CHECK (evaluation_indicator IN ('CSAT', 'NPS', 'CSAT_AND_NPS'));
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS services_name_key ON public.services (name);
CREATE UNIQUE INDEX IF NOT EXISTS services_code_key ON public.services (code);

CREATE TABLE IF NOT EXISTS public.providers (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS internal_code text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS professional_email text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS specialty text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS department text DEFAULT 'Operações';
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS services text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS evaluation_access_authorized boolean NOT NULL DEFAULT false;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS access_authorized_at timestamptz;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS access_authorized_by text;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS providers_internal_code_key ON public.providers (internal_code);
CREATE UNIQUE INDEX IF NOT EXISTS providers_professional_email_key ON public.providers (professional_email);

CREATE TABLE IF NOT EXISTS public.form_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS published_by text;
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.form_versions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS form_versions_number_key ON public.form_versions (version_number);

CREATE TABLE IF NOT EXISTS public.form_categories (id text PRIMARY KEY);
ALTER TABLE public.form_categories ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.form_categories ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE public.form_categories ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.form_categories ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#8CBF26';
ALTER TABLE public.form_categories ADD COLUMN IF NOT EXISTS badge_bg text NOT NULL DEFAULT 'bg-slate-100 text-slate-800 border-slate-300';
ALTER TABLE public.form_categories ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 1 CHECK (display_order >= 1);
ALTER TABLE public.form_categories ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.form_categories ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.form_categories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS form_categories_code_key ON public.form_categories (code);

CREATE TABLE IF NOT EXISTS public.form_questions (id text PRIMARY KEY);
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS version_id uuid REFERENCES public.form_versions(id) ON DELETE CASCADE;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS text text NOT NULL DEFAULT '';
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'RATING_5' CHECK (type IN ('RATING_5', 'NPS_10', 'TEXT_ONLY', 'AUDIO_AND_TEXT', 'MULTIPLE_CHOICE', 'SHORT_TEXT'));
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT true;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 1 CHECK (display_order >= 1);
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS options jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS conditional_on jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT 'Sistema';

CREATE TABLE IF NOT EXISTS public.evaluation_criteria (id text PRIMARY KEY);
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS category_name text NOT NULL DEFAULT '';
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS weight_percentage numeric(5,2) NOT NULL DEFAULT 0 CHECK (weight_percentage >= 0 AND weight_percentage <= 100);
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS max_score numeric(5,2) NOT NULL DEFAULT 5 CHECK (max_score > 0);
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS min_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (min_score >= 0);
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 1;
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT 'Sistema';

CREATE TABLE IF NOT EXISTS public.criteria_configurations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.criteria_configurations ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.criteria_configurations ADD COLUMN IF NOT EXISTS passing_threshold numeric(5,2) NOT NULL DEFAULT 70.00 CHECK (passing_threshold BETWEEN 0 AND 100);
ALTER TABLE public.criteria_configurations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.criteria_configurations ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.criteria_configurations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.criteria_configurations ADD COLUMN IF NOT EXISTS updated_by text NOT NULL DEFAULT 'Sistema';
CREATE UNIQUE INDEX IF NOT EXISTS criteria_config_single_active ON public.criteria_configurations (is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.evaluations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS reference text NOT NULL DEFAULT ('AVAL-' || nextval('public.evaluation_reference_seq'));
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS client_name text NOT NULL DEFAULT '';
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS client_name_input text;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS service_name text NOT NULL DEFAULT '';
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS provider_name_input text;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS form_version_id uuid REFERENCES public.form_versions(id) ON DELETE SET NULL;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS service_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS evaluation_date timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS satisfaction_rating integer CHECK (satisfaction_rating BETWEEN 1 AND 5);
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS nps_score integer CHECK (nps_score BETWEEN 0 AND 10);
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS comment text;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS audio_recording_url text;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS audio_duration_seconds integer CHECK (audio_duration_seconds IS NULL OR audio_duration_seconds BETWEEN 0 AND 45);
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS service_types_provided text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS detailed_answers jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS questions_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW', 'REVIEWED', 'APPROVED', 'RESOLVED', 'ARCHIVED'));
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS requires_follow_up boolean NOT NULL DEFAULT false;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS corrective_action_status text NOT NULL DEFAULT 'NOT_NEEDED' CHECK (corrective_action_status IN ('NOT_NEEDED', 'PENDING', 'IN_PROGRESS', 'COMPLETED'));
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS technical_score numeric(5,2) CHECK (technical_score BETWEEN 0 AND 100);
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS final_classification text CHECK (final_classification IN ('POSITIVE', 'NEGATIVE'));
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS finalized_by text;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS criteria_snapshot jsonb;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS criterion_ratings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS evaluations_reference_key ON public.evaluations (reference);
CREATE INDEX IF NOT EXISTS idx_evaluations_client_id ON public.evaluations (client_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_service_id ON public.evaluations (service_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_provider_id ON public.evaluations (provider_id);

CREATE TABLE IF NOT EXISTS public.evaluation_workers (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.evaluation_workers ADD COLUMN IF NOT EXISTS evaluation_id uuid REFERENCES public.evaluations(id) ON DELETE CASCADE;
ALTER TABLE public.evaluation_workers ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id) ON DELETE CASCADE;
ALTER TABLE public.evaluation_workers ADD COLUMN IF NOT EXISTS assigned_by text;
ALTER TABLE public.evaluation_workers ADD COLUMN IF NOT EXISTS assigned_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS evaluation_workers_pair_key ON public.evaluation_workers (evaluation_id, provider_id);

CREATE TABLE IF NOT EXISTS public.hr_cases (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.hr_cases ADD COLUMN IF NOT EXISTS evaluation_id uuid REFERENCES public.evaluations(id) ON DELETE CASCADE;
ALTER TABLE public.hr_cases ADD COLUMN IF NOT EXISTS occurrence_type text NOT NULL DEFAULT '';
ALTER TABLE public.hr_cases ADD COLUMN IF NOT EXISTS internal_notes text NOT NULL DEFAULT '';
ALTER TABLE public.hr_cases ADD COLUMN IF NOT EXISTS assigned_to text NOT NULL DEFAULT '';
ALTER TABLE public.hr_cases ADD COLUMN IF NOT EXISTS corrective_action text NOT NULL DEFAULT '';
ALTER TABLE public.hr_cases ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'EM_ANALISE', 'RESOLVIDO'));
ALTER TABLE public.hr_cases ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.hr_cases ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS operation_type text NOT NULL DEFAULT '';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS affected_entity text NOT NULL DEFAULT '';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS record_id text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_email text NOT NULL DEFAULT '';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_name text NOT NULL DEFAULT '';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS result text NOT NULL DEFAULT 'SUCCESS' CHECK (result IN ('SUCCESS', 'DENIED', 'WARNING'));
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details text NOT NULL DEFAULT '';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at);

CREATE TABLE IF NOT EXISTS public.employees (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employee_number text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS access_identifier text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'OUTRO' CHECK (category IN ('TECNICO', 'SUPERVISOR', 'ADMINISTRATIVO', 'GESTAO', 'DIRECAO', 'OUTRO'));
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS personal_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS contacts jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS professional_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS access_profile_id uuid REFERENCES public.access_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS allowed_pages text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS professional_status text NOT NULL DEFAULT 'ATIVO' CHECK (professional_status IN ('ATIVO', 'FERIAS', 'LICENCA', 'SUSPENSO', 'INATIVO', 'DESLIGADO'));
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'SEM_ACESSO' CHECK (account_status IN ('SEM_ACESSO', 'ATIVA', 'DESATIVADA', 'BLOQUEADA'));
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS employees_number_key ON public.employees (employee_number);
CREATE UNIQUE INDEX IF NOT EXISTS employees_access_identifier_key ON public.employees (access_identifier);

CREATE TABLE IF NOT EXISTS public.employee_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'OUTRO';
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS original_filename text NOT NULL DEFAULT '';
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS storage_path text NOT NULL DEFAULT '';
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS file_size_bytes bigint NOT NULL DEFAULT 0;
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS mime_type text NOT NULL DEFAULT '';
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'VALIDO';
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS uploaded_by text;
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS uploaded_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.teams (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS supervisor_name text;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS members_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.activities (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS activity_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PLANEADA';
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.worker_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.worker_notifications ADD COLUMN IF NOT EXISTS evaluation_id uuid REFERENCES public.evaluations(id) ON DELETE CASCADE;
ALTER TABLE public.worker_notifications ADD COLUMN IF NOT EXISTS evaluation_reference text;
ALTER TABLE public.worker_notifications ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id) ON DELETE CASCADE;
ALTER TABLE public.worker_notifications ADD COLUMN IF NOT EXISTS provider_name text;
ALTER TABLE public.worker_notifications ADD COLUMN IF NOT EXISTS final_score numeric(5,2);
ALTER TABLE public.worker_notifications ADD COLUMN IF NOT EXISTS result_status text;
ALTER TABLE public.worker_notifications ADD COLUMN IF NOT EXISTS shared_feedback text;
ALTER TABLE public.worker_notifications ADD COLUMN IF NOT EXISTS notified_by text;
ALTER TABLE public.worker_notifications ADD COLUMN IF NOT EXISTS notified_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.provider_permission_audits (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.provider_permission_audits ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers(id) ON DELETE CASCADE;
ALTER TABLE public.provider_permission_audits ADD COLUMN IF NOT EXISTS provider_name text;
ALTER TABLE public.provider_permission_audits ADD COLUMN IF NOT EXISTS previous_state text;
ALTER TABLE public.provider_permission_audits ADD COLUMN IF NOT EXISTS new_state text;
ALTER TABLE public.provider_permission_audits ADD COLUMN IF NOT EXISTS changed_by text;
ALTER TABLE public.provider_permission_audits ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.provider_permission_audits ADD COLUMN IF NOT EXISTS changed_at timestamptz NOT NULL DEFAULT now();

-- Ligação do perfil de prestador (provider) ao registo de prestador
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_provider_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3. CATÁLOGO DE PÁGINAS (fonte de verdade para as permissões por funcionário)
-- ----------------------------------------------------------------------------
INSERT INTO public.app_pages (key, name, section, required_base_role, is_sensitive, description, display_order) VALUES
  ('dashboard',           'Painel Geral',               'Visão Geral',    'PROVIDER',    false, 'Indicadores executivos e métricas de satisfação.', 1),
  ('clients',             'Clientes',                   'Operações',      'OPERATIONAL', false, 'Diretório de empresas clientes.', 2),
  ('calendar',            'Calendário & Operações',     'Operações',      'OPERATIONAL', false, 'Cronograma de intervenções e equipas.', 3),
  ('services',            'Serviços',                   'Operações',      'OPERATIONAL', false, 'Catálogo de serviços e indicadores.', 4),
  ('providers',           'Prestadores & Técnicos',     'Operações',      'OPERATIONAL', false, 'Gestão de técnicos de campo.', 5),
  ('evaluations',         'Avaliações',                 'Qualidade & RH', 'PROVIDER',    false, 'Histórico de formulários de satisfação.', 6),
  ('evaluation_analysis', 'Análise de Avaliação',       'Qualidade & RH', 'HR',          false, 'Homologação técnica e validação final.', 7),
  ('form_editor',         'Edição de Formulário',       'Qualidade & RH', 'HR',          true,  'Configuração de perguntas e categorias.', 8),
  ('hr',                  'Recursos Humanos',           'Qualidade & RH', 'HR',          true,  'Ocorrências, critérios e limiares.', 9),
  ('employees',           'Funcionários',               'Administração',  'HR',          true,  'Cadastro de funcionários e contas.', 10),
  ('access_profiles',     'Perfis de Acesso',           'Administração',  'ADMIN',       true,  'Modelos de acesso reutilizáveis.', 11),
  ('reports',             'Relatórios',                 'Direção',        'DIRECTOR',    false, 'Relatórios de desempenho.', 12),
  ('users',               'Utilizadores',               'Administração',  'ADMIN',       true,  'Contas de utilizadores do sistema.', 13),
  ('audit',               'Auditoria',                  'Segurança',      'ADMIN',       true,  'Registo forense de ações sensíveis.', 14),
  ('settings',            'Configurações',              'Sistema',        'ADMIN',       true,  'Definições do sistema.', 15),
  ('messages',            'Mensagens Internas',         'Operações',      'PROVIDER',    false, 'Comunicação interna.', 16)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name, section = EXCLUDED.section, required_base_role = EXCLUDED.required_base_role,
  is_sensitive = EXCLUDED.is_sensitive, description = EXCLUDED.description, display_order = EXCLUDED.display_order;

-- ----------------------------------------------------------------------------
-- 4. FUNÇÕES DE IDENTIDADE E PAPEL (usam auth.uid(), não o e-mail do token)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p.role FROM public.profiles p
  WHERE p.id = auth.uid() AND p.active = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1),
    ''
  )
$$;

-- Níveis hierárquicos (usados nas validações de concessão de páginas)
CREATE OR REPLACE FUNCTION public.role_level(r public.user_role)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE r WHEN 'ADMIN' THEN 5 WHEN 'HR' THEN 4 WHEN 'DIRECTOR' THEN 3 WHEN 'OPERATIONAL' THEN 2 ELSE 1 END
$$;

-- Equipa interna: ADMIN, HR, DIRECTOR e OPERATIONAL (NÃO inclui PROVIDER)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.current_user_role() IN ('ADMIN', 'HR', 'DIRECTOR', 'OPERATIONAL'), false)
$$;

-- ADMIN ou HR
CREATE OR REPLACE FUNCTION public.is_hr_or_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.current_user_role() IN ('ADMIN', 'HR'), false)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.current_user_role() = 'ADMIN', false)
$$;

-- Acesso efetivo do utilizador autenticado (lido pelo frontend no arranque)
CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  p public.profiles%ROWTYPE;
  e public.employees%ROWTYPE;
  v_pages text[];
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid() AND active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'authenticated', false, 'base_role', NULL, 'pages', '[]'::jsonb,
      'must_change_password', false, 'account_status', 'SEM_ACESSO',
      'professional_status', NULL, 'employee_id', NULL
    );
  END IF;

  IF p.role = 'ADMIN' THEN
    SELECT COALESCE(array_agg(key ORDER BY display_order), '{}') INTO v_pages FROM public.app_pages;
  ELSE
    SELECT COALESCE(array_agg(k), '{}') INTO v_pages
    FROM unnest(p.allowed_pages) AS k
    WHERE k IN (SELECT key FROM public.app_pages);
  END IF;

  SELECT * INTO e FROM public.employees WHERE user_id = p.id LIMIT 1;

  RETURN jsonb_build_object(
    'authenticated', true,
    'base_role', p.role,
    'pages', to_jsonb(v_pages),
    'must_change_password', p.must_change_password,
    'account_status', COALESCE(e.account_status, 'ATIVA'),
    'professional_status', e.professional_status,
    'employee_id', e.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_page(p_page_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid() AND active = true LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p.role = 'ADMIN' THEN RETURN EXISTS (SELECT 1 FROM public.app_pages WHERE key = p_page_key); END IF;
  RETURN p_page_key = ANY (p.allowed_pages);
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_last_login()
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH u AS (
    UPDATE public.profiles SET last_login_at = now() WHERE id = auth.uid() AND active = true RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u)
$$;

-- Próximo número interno de funcionário (sem colisões, mesmo após eliminações)
CREATE OR REPLACE FUNCTION public.next_employee_number()
RETURNS text
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT 'AET-' || lpad(nextval('public.employee_number_seq')::text, 3, '0')
$$;

-- ----------------------------------------------------------------------------
-- 5. AUDITORIA (escrita apenas via funções SECURITY DEFINER)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_operation text, p_entity text, p_record_id text, p_result text, p_details text, p_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_name text;
BEGIN
  v_email := COALESCE(NULLIF(p_email, ''), NULLIF(public.current_user_email(), ''), 'sistema@aeternu.co.ao');
  SELECT name INTO v_name FROM public.profiles WHERE email = v_email LIMIT 1;
  INSERT INTO public.audit_logs (operation_type, affected_entity, record_id, user_email, user_name, result, details)
  VALUES (p_operation, p_entity, p_record_id, v_email, COALESCE(v_name, 'Sistema SICSC'),
          CASE WHEN p_result IN ('SUCCESS', 'DENIED', 'WARNING') THEN p_result ELSE 'WARNING' END,
          COALESCE(p_details, ''));
END;
$$;

-- Usado pelo frontend. O e-mail do ator é sempre o do utilizador autenticado.
CREATE OR REPLACE FUNCTION public.log_system_audit(
  p_operation_type text, p_affected_entity text, p_record_id text, p_result text, p_details text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.current_user_role() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem perfil ativo.';
  END IF;
  PERFORM public.log_audit_event(p_operation_type, p_affected_entity, p_record_id, p_result, p_details, NULL);
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. SUBMISSÃO PÚBLICA DE AVALIAÇÃO (anónima, só via RPC)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_evaluation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_client text;
  v_service_id uuid;
  v_service_name text;
  v_provider_id uuid;
  v_provider_name text;
  v_sat numeric;
  v_sat_int integer;
  v_nps integer;
  v_dur integer;
  v_audio text;
  v_version uuid;
  v_follow boolean;
  v_id uuid;
  v_ref text;
  v_types text[];
  v_answers jsonb;
  v_snapshot jsonb;
  v_date date;
BEGIN
  v_client := left(btrim(COALESCE(p_payload->>'clientName', p_payload->>'clientNameInput', '')), 200);
  IF length(v_client) < 2 THEN
    RAISE EXCEPTION 'O nome da empresa cliente é obrigatório (mínimo 2 caracteres).';
  END IF;

  SELECT s.id, s.name INTO v_service_id, v_service_name
  FROM public.services s
  WHERE s.id::text = btrim(COALESCE(p_payload->>'serviceId', '')) AND s.status = 'ACTIVE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O serviço selecionado é inválido ou encontra-se inativo.';
  END IF;

  -- Classificação de satisfação OBRIGATÓRIA (sem valor por omissão)
  IF COALESCE(p_payload->>'satisfactionRating', '') !~ '^[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'A classificação de satisfação é obrigatória (valor de 1 a 5).';
  END IF;
  v_sat := (p_payload->>'satisfactionRating')::numeric;
  v_sat_int := round(v_sat)::integer;
  IF v_sat_int NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'A classificação de satisfação deve estar entre 1 e 5.';
  END IF;

  -- NPS opcional (nulo quando não respondido)
  v_nps := NULL;
  IF COALESCE(p_payload->>'npsScore', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN
    v_nps := round((p_payload->>'npsScore')::numeric)::integer;
    IF v_nps NOT BETWEEN 0 AND 10 THEN
      RAISE EXCEPTION 'O NPS deve estar entre 0 e 10.';
    END IF;
  END IF;

  -- Áudio: apenas caminho interno no bucket privado, máximo 45 segundos
  v_audio := NULLIF(btrim(COALESCE(p_payload->>'audioRecordingUrl', '')), '');
  IF v_audio IS NOT NULL AND v_audio !~ '^submissions/[A-Za-z0-9._/-]{1,200}$' THEN
    RAISE EXCEPTION 'Referência de áudio inválida.';
  END IF;
  v_dur := NULL;
  IF COALESCE(p_payload->>'audioDurationSeconds', '') ~ '^[0-9]+$' THEN
    v_dur := (p_payload->>'audioDurationSeconds')::integer;
  END IF;
  IF v_dur IS NOT NULL AND v_dur > 45 THEN
    RAISE EXCEPTION 'A duração máxima permitida para o áudio é de 45 segundos.';
  END IF;
  IF v_audio IS NULL THEN v_dur := NULL; END IF;

  -- Prestador opcional (apenas se existir e estiver ativo)
  IF COALESCE(p_payload->>'providerId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT pr.id, pr.name INTO v_provider_id, v_provider_name
    FROM public.providers pr
    WHERE pr.id = (p_payload->>'providerId')::uuid AND pr.status = 'ACTIVE';
  END IF;

  SELECT fv.id INTO v_version FROM public.form_versions fv
  WHERE fv.status = 'PUBLISHED' ORDER BY fv.version_number DESC LIMIT 1;

  v_types := ARRAY(SELECT jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_payload->'serviceTypesProvided') = 'array' THEN p_payload->'serviceTypesProvided' ELSE '[]'::jsonb END));

  v_answers := CASE WHEN jsonb_typeof(p_payload->'detailedAnswers') = 'object' THEN p_payload->'detailedAnswers' ELSE '{}'::jsonb END;
  v_snapshot := CASE WHEN jsonb_typeof(p_payload->'questionsSnapshot') = 'array' THEN p_payload->'questionsSnapshot' ELSE '[]'::jsonb END;

  v_date := CURRENT_DATE;
  IF COALESCE(p_payload->>'serviceDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    v_date := (p_payload->>'serviceDate')::date;
  END IF;

  v_follow := (v_sat_int <= 2) OR (v_nps IS NOT NULL AND v_nps <= 6);

  INSERT INTO public.evaluations (
    client_name, client_name_input, service_id, service_name, provider_id, provider_name_input,
    form_version_id, service_date, satisfaction_rating, nps_score, comment,
    audio_recording_url, audio_duration_seconds, service_types_provided,
    detailed_answers, questions_snapshot, status, requires_follow_up, corrective_action_status
  ) VALUES (
    v_client, v_client, v_service_id, v_service_name, v_provider_id,
    left(NULLIF(btrim(COALESCE(p_payload->>'providerName', '')), ''), 200),
    v_version, v_date, v_sat_int, v_nps, left(p_payload->>'comment', 5000),
    v_audio, v_dur, v_types, v_answers, v_snapshot,
    'PENDING_REVIEW', v_follow, CASE WHEN v_follow THEN 'PENDING' ELSE 'NOT_NEEDED' END
  )
  RETURNING id, reference INTO v_id, v_ref;

  PERFORM public.log_audit_event('CREATE', 'evaluations', v_id::text, 'SUCCESS',
    format('Submissão pública registada para a empresa %s (Serviço: %s)', v_client, v_service_name),
    'public@aeternu.co.ao');

  RETURN jsonb_build_object('success', true, 'id', v_id, 'reference', v_ref,
                            'status', 'PENDING_REVIEW', 'message', 'Avaliação submetida com sucesso.');
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. GESTÃO INTERNA DE AVALIAÇÕES
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.associate_evaluation_client(p_evaluation_id uuid, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_eval public.evaluations%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_email text := public.current_user_email();
BEGIN
  IF COALESCE(public.current_user_role()::text, '') NOT IN ('ADMIN', 'HR', 'DIRECTOR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN, HR ou DIRECTOR podem associar clientes.';
  END IF;
  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  IF v_eval.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'Avaliação já homologada é imutável.'; END IF;
  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado ou inativo.'; END IF;

  UPDATE public.evaluations
  SET client_id = p_client_id, client_name = v_client.company_name, updated_at = now()
  WHERE id = p_evaluation_id;

  PERFORM public.log_audit_event('UPDATE', 'evaluations', p_evaluation_id::text, 'SUCCESS',
    format('Avaliação %s associada ao cliente oficial %s', v_eval.reference, v_client.company_name), v_email);

  RETURN jsonb_build_object('success', true, 'evaluationId', p_evaluation_id, 'clientName', v_client.company_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_evaluation_provider(p_evaluation_id uuid, p_provider_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_eval public.evaluations%ROWTYPE;
  v_prov public.providers%ROWTYPE;
  v_email text := public.current_user_email();
BEGIN
  IF COALESCE(public.current_user_role()::text, '') NOT IN ('ADMIN', 'HR', 'DIRECTOR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN, HR ou DIRECTOR podem atribuir trabalhadores.';
  END IF;
  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  IF v_eval.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'Avaliação já homologada é imutável.'; END IF;
  SELECT * INTO v_prov FROM public.providers WHERE id = p_provider_id AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Prestador não encontrado ou inativo.'; END IF;

  DELETE FROM public.evaluation_workers WHERE evaluation_id = p_evaluation_id;
  INSERT INTO public.evaluation_workers (evaluation_id, provider_id, assigned_by)
  VALUES (p_evaluation_id, p_provider_id, v_email);

  UPDATE public.evaluations
  SET provider_id = p_provider_id, provider_name_input = v_prov.name, updated_at = now()
  WHERE id = p_evaluation_id;

  PERFORM public.log_audit_event('UPDATE', 'evaluations', p_evaluation_id::text, 'SUCCESS',
    format('Prestador %s atribuído à avaliação %s', v_prov.name, v_eval.reference), v_email);

  RETURN jsonb_build_object('success', true, 'evaluationId', p_evaluation_id,
                            'providerId', p_provider_id, 'providerName', v_prov.name);
END;
$$;

-- Critérios de avaliação: gestão (ADMIN/HR) validada no servidor
CREATE OR REPLACE FUNCTION public.save_evaluation_criteria(p_criteria jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c jsonb;
  v_email text := public.current_user_email();
  v_total numeric;
  v_count integer;
BEGIN
  IF COALESCE(public.current_user_role()::text, '') NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN e HR podem gerir critérios.';
  END IF;
  IF jsonb_typeof(p_criteria) <> 'array' THEN
    RAISE EXCEPTION 'Lista de critérios inválida.';
  END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(p_criteria) LOOP
    IF COALESCE(c->>'id', '') = '' OR COALESCE(c->>'categoryName', '') = '' THEN
      RAISE EXCEPTION 'Cada critério requer identificador e nome.';
    END IF;
    IF (c->>'maxScore')::numeric <= 0 THEN
      RAISE EXCEPTION 'A pontuação máxima do critério "%" deve ser positiva.', c->>'categoryName';
    END IF;
    INSERT INTO public.evaluation_criteria
      (id, category_name, description, weight_percentage, max_score, min_score, active, display_order, updated_at, updated_by)
    VALUES
      (c->>'id', c->>'categoryName', c->>'description', (c->>'weightPercentage')::numeric,
       (c->>'maxScore')::numeric, COALESCE((c->>'minScore')::numeric, 0),
       COALESCE((c->>'active')::boolean, true), COALESCE((c->>'order')::integer, 1), now(), v_email)
    ON CONFLICT (id) DO UPDATE SET
      category_name = EXCLUDED.category_name, description = EXCLUDED.description,
      weight_percentage = EXCLUDED.weight_percentage, max_score = EXCLUDED.max_score,
      min_score = EXCLUDED.min_score, active = EXCLUDED.active, display_order = EXCLUDED.display_order,
      updated_at = now(), updated_by = v_email;
  END LOOP;

  SELECT COALESCE(SUM(weight_percentage), 0), COUNT(*) INTO v_total, v_count
  FROM public.evaluation_criteria WHERE active;
  IF v_count = 0 OR abs(v_total - 100) > 0.01 THEN
    RAISE EXCEPTION 'A soma dos pesos dos critérios ativos deve ser exatamente 100%% (soma atual: %)', v_total;
  END IF;

  PERFORM public.log_audit_event('UPDATE', 'evaluation_criteria', NULL, 'SUCCESS',
    format('Critérios de avaliação atualizados (%s critérios)', jsonb_array_length(p_criteria)), v_email);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_criteria_passing_threshold(p_passing_threshold numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text := public.current_user_email();
BEGIN
  IF COALESCE(public.current_user_role()::text, '') NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN e HR podem alterar o limiar.';
  END IF;
  IF p_passing_threshold IS NULL OR p_passing_threshold < 0 OR p_passing_threshold > 100 THEN
    RAISE EXCEPTION 'O limiar de aprovação deve estar entre 0 e 100.';
  END IF;

  UPDATE public.criteria_configurations
  SET passing_threshold = p_passing_threshold, version = version + 1,
      updated_at = now(), updated_by = v_email
  WHERE is_active;
  IF NOT FOUND THEN
    INSERT INTO public.criteria_configurations (passing_threshold, version, is_active, updated_by)
    VALUES (p_passing_threshold, 1, true, v_email);
  END IF;

  PERFORM public.log_audit_event('UPDATE', 'criteria_configurations', NULL, 'SUCCESS',
    format('Limiar de aprovação definido para %s%%', p_passing_threshold), v_email);

  RETURN jsonb_build_object('success', true, 'passingThreshold', p_passing_threshold);
END;
$$;

-- HOMOLOGAÇÃO: cálculo soberano no servidor, imutável após gravação.
-- Fórmula (igual a evaluationUtils.ts): soma de (classificação / pontuação máxima) × peso.
CREATE OR REPLACE FUNCTION public.calculate_and_finalize_evaluation(
  p_evaluation_id uuid,
  p_criterion_ratings jsonb,
  p_custom_threshold numeric DEFAULT NULL,
  p_threshold_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_eval public.evaluations%ROWTYPE;
  v_email text := public.current_user_email();
  v_total numeric;
  v_count integer;
  v_threshold numeric;
  v_score numeric := 0;
  v_class text;
  v_now timestamptz := clock_timestamp();
  v_snapshot jsonb;
  v_criteria jsonb := '[]'::jsonb;
  c record;
  v_rating numeric;
BEGIN
  IF COALESCE(public.current_user_role()::text, '') NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN e HR podem homologar avaliações.';
  END IF;

  SELECT * INTO v_eval FROM public.evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Avaliação não encontrada.'; END IF;
  IF v_eval.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta avaliação já se encontra homologada e é imutável.';
  END IF;
  IF p_criterion_ratings IS NULL OR jsonb_typeof(p_criterion_ratings) <> 'object' THEN
    RAISE EXCEPTION 'Classificações por critério inválidas.';
  END IF;

  SELECT COALESCE(SUM(weight_percentage), 0), COUNT(*) INTO v_total, v_count
  FROM public.evaluation_criteria WHERE active;
  IF v_count = 0 OR abs(v_total - 100) > 0.01 THEN
    RAISE EXCEPTION 'A soma dos pesos dos critérios ativos deve ser exatamente 100%% (soma atual: %)', v_total;
  END IF;

  FOR c IN SELECT * FROM public.evaluation_criteria WHERE active ORDER BY display_order, id LOOP
    v_rating := NULL;
    IF COALESCE(p_criterion_ratings ->> c.id, '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      v_rating := (p_criterion_ratings ->> c.id)::numeric;
    END IF;
    IF v_rating IS NULL OR v_rating < c.min_score OR v_rating > c.max_score THEN
      RAISE EXCEPTION 'Classificação inválida ou em falta para o critério: %', c.category_name;
    END IF;

    v_score := v_score + (v_rating / c.max_score) * c.weight_percentage;
    v_criteria := v_criteria || jsonb_build_object(
      'criterionId', c.id, 'categoryName', c.category_name, 'weightPercentage', c.weight_percentage,
      'rating', v_rating, 'maxScore', c.max_score,
      'weightedContribution', round((v_rating / c.max_score) * c.weight_percentage, 3));
  END LOOP;

  IF p_custom_threshold IS NOT NULL THEN
    IF p_custom_threshold < 0 OR p_custom_threshold > 100 THEN
      RAISE EXCEPTION 'O limiar personalizado deve estar entre 0 e 100.';
    END IF;
    IF p_threshold_override_reason IS NULL OR length(btrim(p_threshold_override_reason)) < 5 THEN
      RAISE EXCEPTION 'É obrigatório indicar uma justificação válida para a alteração do limiar.';
    END IF;
    v_threshold := p_custom_threshold;
  ELSE
    SELECT cc.passing_threshold INTO v_threshold FROM public.criteria_configurations cc
    WHERE cc.is_active ORDER BY cc.version DESC LIMIT 1;
    v_threshold := COALESCE(v_threshold, 70);
  END IF;

  v_score := round(v_score, 2);
  v_class := CASE WHEN v_score >= v_threshold THEN 'POSITIVE' ELSE 'NEGATIVE' END;

  v_snapshot := jsonb_build_object(
    'passingThreshold', v_threshold, 'totalWeight', v_total,
    'overrideReason', p_threshold_override_reason, 'evaluatedCriteria', v_criteria,
    'calculatedAt', v_now, 'calculatedBy', v_email);

  UPDATE public.evaluations
  SET technical_score = v_score, final_classification = v_class, finalized_at = v_now,
      finalized_by = v_email, criteria_snapshot = v_snapshot, criterion_ratings = p_criterion_ratings,
      status = 'REVIEWED', updated_at = v_now
  WHERE id = p_evaluation_id;

  PERFORM public.log_audit_event('UPDATE', 'evaluations', p_evaluation_id::text, 'SUCCESS',
    format('Avaliação %s homologada com pontuação técnica de %s%%', v_eval.reference, v_score), v_email);

  RETURN jsonb_build_object(
    'success', true, 'evaluationId', p_evaluation_id,
    'finalScore', v_score, 'finalClassification', v_class, 'snapshot', v_snapshot,
    'finalizedBy', v_email, 'finalizedAt', v_now);
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. TRIGGERS DE IMUTABILIDADE (avaliações homologadas)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_finalized_evaluation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION 'Avaliação homologada não pode ser eliminada.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.finalized_at IS NOT NULL AND (
       (NEW.technical_score, NEW.final_classification, NEW.finalized_at, NEW.finalized_by,
        NEW.criteria_snapshot, NEW.criterion_ratings, NEW.satisfaction_rating, NEW.nps_score,
        NEW.comment, NEW.client_name, NEW.service_name, NEW.service_date, NEW.evaluation_date,
        NEW.audio_recording_url, NEW.detailed_answers, NEW.questions_snapshot, NEW.reference)
       IS DISTINCT FROM
       (OLD.technical_score, OLD.final_classification, OLD.finalized_at, OLD.finalized_by,
        OLD.criteria_snapshot, OLD.criterion_ratings, OLD.satisfaction_rating, OLD.nps_score,
        OLD.comment, OLD.client_name, OLD.service_name, OLD.service_date, OLD.evaluation_date,
        OLD.audio_recording_url, OLD.detailed_answers, OLD.questions_snapshot, OLD.reference)
     ) THEN
    RAISE EXCEPTION 'Avaliação homologada é imutável: resultados e respostas não podem ser alterados.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS evaluations_guard_finalized ON public.evaluations;
CREATE TRIGGER evaluations_guard_finalized
  BEFORE UPDATE OR DELETE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.guard_finalized_evaluation();

-- ----------------------------------------------------------------------------
-- 9. VISTAS PÚBLICAS MÍNIMAS (formulário anónimo)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_public_clients AS
  SELECT id, company_name, internal_code FROM public.clients WHERE status = 'ACTIVE';

CREATE OR REPLACE VIEW public.v_public_providers AS
  SELECT id, name, internal_code, services FROM public.providers WHERE status = 'ACTIVE';

CREATE OR REPLACE VIEW public.v_public_services AS
  SELECT id, name, code, description, evaluation_indicator FROM public.services WHERE status = 'ACTIVE';

-- DROP antes do CREATE: a 1001 acrescenta colunas à vista; sem o DROP, a re-execução falha ("cannot drop columns from view")
DROP VIEW IF EXISTS public.v_public_form_questions;
CREATE OR REPLACE VIEW public.v_public_form_questions AS
  SELECT id, version_id, text, description, category, type, required, active, display_order,
         service_id, options, conditional_on
  FROM public.form_questions WHERE active = true;

-- ----------------------------------------------------------------------------
-- 10. ACESSO POR PRESTADOR (ver apenas as avaliações homologadas que lhe foram atribuídas)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_provider_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT provider_id FROM public.profiles WHERE id = auth.uid() AND active = true LIMIT 1
$$;

-- ----------------------------------------------------------------------------
-- 11. RLS: remover políticas antigas e criar políticas restritivas
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','app_pages','access_profiles','clients','services','providers','form_versions',
    'form_categories','form_questions','evaluation_criteria','criteria_configurations','evaluations',
    'evaluation_workers','hr_cases','audit_logs','employees','employee_documents','teams',
    'activities','worker_notifications','provider_permission_audits'
  ] LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- profiles: cada utilizador vê o seu; ADMIN/HR vêem todos. Escrita apenas via Edge Function (service role).
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_hr_or_admin());

-- access_profiles / app_pages
CREATE POLICY access_profiles_select ON public.access_profiles FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY access_profiles_write ON public.access_profiles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY app_pages_select ON public.app_pages FOR SELECT TO authenticated USING (true);

-- clients / services / providers (operacional: equipa interna pode gerir)
CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY clients_write ON public.clients FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY services_select ON public.services FOR SELECT TO anon, authenticated
  USING (status = 'ACTIVE' OR public.is_staff());
CREATE POLICY services_write ON public.services FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY providers_select ON public.providers FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY providers_write ON public.providers FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

-- formulário e critérios
CREATE POLICY form_versions_select ON public.form_versions FOR SELECT TO anon, authenticated
  USING (status = 'PUBLISHED' OR public.is_staff());
CREATE POLICY form_versions_write ON public.form_versions FOR ALL TO authenticated
  USING (public.is_hr_or_admin()) WITH CHECK (public.is_hr_or_admin());

CREATE POLICY form_categories_select ON public.form_categories FOR SELECT TO anon, authenticated
  USING (active = true OR public.is_staff());
CREATE POLICY form_categories_write ON public.form_categories FOR ALL TO authenticated
  USING (public.is_hr_or_admin()) WITH CHECK (public.is_hr_or_admin());

CREATE POLICY form_questions_select ON public.form_questions FOR SELECT TO anon, authenticated
  USING (active = true OR public.is_staff());
CREATE POLICY form_questions_write ON public.form_questions FOR ALL TO authenticated
  USING (public.is_hr_or_admin()) WITH CHECK (public.is_hr_or_admin());

CREATE POLICY criteria_select ON public.evaluation_criteria FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY config_select ON public.criteria_configurations FOR SELECT TO authenticated USING (public.is_staff());
-- escrita de critérios/limiar apenas por RPC SECURITY DEFINER (save_evaluation_criteria, set_criteria_passing_threshold)

-- avaliações: NENHUMA inserção direta (apenas submit_evaluation). Leitura interna. Atualização de estado por ADMIN/HR.
CREATE POLICY evaluations_select ON public.evaluations FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY evaluations_update ON public.evaluations FOR UPDATE TO authenticated
  USING (public.is_hr_or_admin()) WITH CHECK (public.is_hr_or_admin());

-- trabalhadores atribuídos: ADMIN/HR veem tudo; prestador vê só as suas avaliações homologadas
CREATE POLICY evaluation_workers_select ON public.evaluation_workers FOR SELECT TO authenticated
  USING (public.is_hr_or_admin() OR (provider_id = public.current_provider_id()));
CREATE POLICY evaluation_workers_write ON public.evaluation_workers FOR ALL TO authenticated
  USING (public.is_hr_or_admin()) WITH CHECK (public.is_hr_or_admin());

CREATE POLICY hr_cases_all ON public.hr_cases FOR ALL TO authenticated
  USING (public.is_hr_or_admin()) WITH CHECK (public.is_hr_or_admin());

-- auditoria: leitura ADMIN/HR; escrita apenas por funções SECURITY DEFINER (sem política de INSERT)
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (public.is_hr_or_admin());

-- funcionários e documentos: ADMIN/HR
CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated USING (public.is_hr_or_admin());
CREATE POLICY employees_self ON public.employees FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY employee_documents_all ON public.employee_documents FOR ALL TO authenticated
  USING (public.is_hr_or_admin()) WITH CHECK (public.is_hr_or_admin());

-- equipas, atividades, notificações e auditoria de permissões
CREATE POLICY teams_select ON public.teams FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY teams_write ON public.teams FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY activities_select ON public.activities FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY activities_write ON public.activities FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY worker_notifications_select ON public.worker_notifications FOR SELECT TO authenticated
  USING (public.is_hr_or_admin() OR provider_id = public.current_provider_id());
CREATE POLICY worker_notifications_write ON public.worker_notifications FOR ALL TO authenticated
  USING (public.is_hr_or_admin()) WITH CHECK (public.is_hr_or_admin());
CREATE POLICY provider_permission_audits_all ON public.provider_permission_audits FOR ALL TO authenticated
  USING (public.is_hr_or_admin()) WITH CHECK (public.is_hr_or_admin());

-- Utilizador confirma a troca da palavra-passe inicial (apenas a própria conta)
CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ok boolean;
BEGIN
  UPDATE public.profiles SET must_change_password = false, updated_at = now()
  WHERE id = auth.uid() AND active = true;
  v_ok := FOUND;
  UPDATE public.employees SET must_change_password = false, updated_at = now()
  WHERE user_id = auth.uid();
  RETURN v_ok;
END;
$$;

-- ----------------------------------------------------------------------------
-- 12. PRIVILÉGIOS (grants): anon e authenticated apenas o necessário
-- ----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

GRANT SELECT ON public.services, public.form_versions, public.form_categories, public.form_questions TO anon;
GRANT SELECT ON public.v_public_clients, public.v_public_providers, public.v_public_services, public.v_public_form_questions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles, public.access_profiles, public.clients, public.services, public.providers,
  public.form_versions, public.form_categories, public.form_questions, public.evaluations,
  public.evaluation_workers, public.hr_cases, public.employees, public.employee_documents,
  public.teams, public.activities, public.worker_notifications, public.provider_permission_audits
  TO authenticated;
GRANT SELECT ON public.app_pages, public.evaluation_criteria, public.criteria_configurations, public.audit_logs TO authenticated;

-- Funções: remover EXECUTE de PUBLIC e conceder apenas o necessário
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.current_user_role(), public.current_user_email(), public.is_staff(),
  public.is_hr_or_admin(), public.is_admin(), public.role_level(public.user_role),
  public.current_provider_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_evaluation(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_must_change_password(),
  public.get_my_access(), public.has_page(text), public.touch_last_login(),
  public.log_system_audit(text, text, text, text, text),
  public.associate_evaluation_client(uuid, uuid), public.assign_evaluation_provider(uuid, uuid),
  public.calculate_and_finalize_evaluation(uuid, jsonb, numeric, text),
  public.save_evaluation_criteria(jsonb), public.set_criteria_passing_threshold(numeric)
  TO authenticated;
-- log_audit_event e next_employee_number: apenas internas/service_role (sem GRANT a anon/authenticated)
GRANT EXECUTE ON FUNCTION public.next_employee_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, text, text, text, text) TO service_role;

-- service_role (Edge Functions) mantém acesso total via BYPASSRLS
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ----------------------------------------------------------------------------
-- 13. STORAGE PRIVADO (áudios e documentos de funcionários)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('evaluation-audio', 'evaluation-audio', false)
      ON CONFLICT (id) DO UPDATE SET public = false;
    INSERT INTO storage.buckets (id, name, public) VALUES ('employee-documents', 'employee-documents', false)
      ON CONFLICT (id) DO UPDATE SET public = false;

    DROP POLICY IF EXISTS sicsc_audio_anon_insert ON storage.objects;
    DROP POLICY IF EXISTS sicsc_audio_staff_select ON storage.objects;
    DROP POLICY IF EXISTS sicsc_docs_hr_all ON storage.objects;

    CREATE POLICY sicsc_audio_anon_insert ON storage.objects FOR INSERT TO anon, authenticated
      WITH CHECK (bucket_id = 'evaluation-audio' AND name LIKE 'submissions/%');
    CREATE POLICY sicsc_audio_staff_select ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'evaluation-audio' AND public.is_staff());
    CREATE POLICY sicsc_docs_hr_all ON storage.objects FOR ALL TO authenticated
      USING (bucket_id = 'employee-documents' AND public.is_hr_or_admin())
      WITH CHECK (bucket_id = 'employee-documents' AND public.is_hr_or_admin());
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 14. RECONCILIAÇÃO: perfis legados cujo id não coincide com o utilizador de autenticação
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    UPDATE public.profiles p
    SET id = u.id
    FROM auth.users u
    WHERE lower(u.email) = p.email
      AND p.id <> u.id
      AND NOT EXISTS (SELECT 1 FROM public.profiles x WHERE x.id = u.id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 15. DADOS INICIAIS DE CRITÉRIOS (só se não existirem)
-- ----------------------------------------------------------------------------
INSERT INTO public.evaluation_criteria (id, category_name, description, weight_percentage, max_score, min_score, active, display_order, updated_by)
VALUES
  ('crit-qualidade',   'Qualidade',    'Conformidade técnica, acabamento e excelência da execução do serviço', 40, 5, 0, true, 1, 'Sistema SICSC'),
  ('crit-pontualidade','Pontualidade', 'Cumprimento dos horários de início, conclusão e tempos de resposta', 20, 5, 0, true, 2, 'Sistema SICSC'),
  ('crit-seguranca',   'Segurança',    'Uso obrigatório de EPIs, cumprimento das normas de HST e integridade', 25, 5, 0, true, 3, 'Sistema SICSC'),
  ('crit-atendimento', 'Atendimento',  'Postura profissional, comunicação clara e cordialidade com o cliente', 15, 5, 0, true, 4, 'Sistema SICSC')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.criteria_configurations (passing_threshold, version, is_active, updated_by)
SELECT 70.00, 1, true, 'Sistema SICSC'
WHERE NOT EXISTS (SELECT 1 FROM public.criteria_configurations WHERE is_active);


-- ----------------------------------------------------------------------------
-- 16. CALENDÁRIO: colunas usadas pelo frontend (insertActivityInDb / fetchActivitiesFromDb)
-- ----------------------------------------------------------------------------
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS start_time text NOT NULL DEFAULT '08:00';
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS end_time text NOT NULL DEFAULT '17:00';
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS team_name text;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS assigned_provider_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS supervisor_name text;
ALTER TABLE public.activities ALTER COLUMN status SET DEFAULT 'SCHEDULED';

-- ----------------------------------------------------------------------------
-- 17. MENSAGENS INTERNAS: conversas diretas e grupos, apenas entre membros
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'DIRECT' CHECK (kind IN ('DIRECT', 'GROUP'));
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.messages (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '' CHECK (length(btrim(body)) BETWEEN 1 AND 4000);
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conv_members_profile ON public.conversation_members (profile_id);

-- É membro? (SECURITY DEFINER evita recursão nas políticas)
CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversation_members m
                 WHERE m.conversation_id = p_conversation_id AND m.profile_id = auth.uid())
$$;

-- Diretório de destinatários: nome, papel e departamento (nunca e-mail)
CREATE OR REPLACE FUNCTION public.list_message_recipients()
RETURNS TABLE (id uuid, name text, role public.user_role, department text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.name, p.role, p.department
  FROM public.profiles p
  WHERE p.active = true AND p.id <> auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.active = true)
  ORDER BY p.name
$$;

CREATE OR REPLACE FUNCTION public.create_conversation(p_kind text, p_title text, p_member_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_ids uuid[];
  v_n integer;
  v_title text;
  v_id uuid;
  v_existing uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_me AND active) THEN
    RAISE EXCEPTION 'Sem perfil ativo.';
  END IF;
  IF p_kind NOT IN ('DIRECT', 'GROUP') THEN
    RAISE EXCEPTION 'Tipo de conversa inválido.';
  END IF;

  SELECT array_agg(DISTINCT x) INTO v_ids
  FROM unnest(COALESCE(p_member_ids, '{}'::uuid[])) AS x
  WHERE x IS NOT NULL AND x <> v_me;
  v_n := COALESCE(array_length(v_ids, 1), 0);
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Selecione pelo menos um destinatário.';
  END IF;
  IF (SELECT count(*) FROM public.profiles WHERE id = ANY (v_ids) AND active) <> v_n THEN
    RAISE EXCEPTION 'Um dos destinatários não existe ou está inativo.';
  END IF;

  IF p_kind = 'DIRECT' THEN
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Uma conversa direta tem exatamente um destinatário.';
    END IF;
    SELECT c.id INTO v_existing FROM public.conversations c
    WHERE c.kind = 'DIRECT'
      AND (SELECT count(*) FROM public.conversation_members m WHERE m.conversation_id = c.id) = 2
      AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id AND m.profile_id = v_me)
      AND EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = c.id AND m.profile_id = v_ids[1])
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
    v_title := NULL;
  ELSE
    IF length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 2 AND 80 THEN
      RAISE EXCEPTION 'O nome do grupo deve ter entre 2 e 80 caracteres.';
    END IF;
    v_title := btrim(p_title);
  END IF;

  INSERT INTO public.conversations (kind, title, created_by) VALUES (p_kind, v_title, v_me) RETURNING id INTO v_id;
  INSERT INTO public.conversation_members (conversation_id, profile_id, added_by) VALUES (v_id, v_me, v_me);
  INSERT INTO public.conversation_members (conversation_id, profile_id, added_by)
    SELECT v_id, x, v_me FROM unnest(v_ids) AS x;
  RETURN v_id;
END;
$$;

-- Criador do grupo ou ADMIN acrescenta membros
CREATE OR REPLACE FUNCTION public.add_group_members(p_conversation_id uuid, p_member_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_conv public.conversations%ROWTYPE;
  v_added integer;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND OR v_conv.kind <> 'GROUP' THEN
    RAISE EXCEPTION 'Grupo não encontrado.';
  END IF;
  IF v_conv.created_by IS DISTINCT FROM v_me AND public.current_user_role()::text IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Apenas o criador do grupo ou um Administrador pode acrescentar membros.';
  END IF;
  INSERT INTO public.conversation_members (conversation_id, profile_id, added_by)
  SELECT p_conversation_id, p.id, v_me
  FROM public.profiles p
  WHERE p.id = ANY (COALESCE(p_member_ids, '{}'::uuid[])) AND p.active = true AND p.id <> v_me
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_added;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_message(p_conversation_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Não é membro desta conversa.';
  END IF;
  IF length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'A mensagem deve ter entre 1 e 4000 caracteres.';
  END IF;
  INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES (p_conversation_id, auth.uid(), btrim(p_body))
  RETURNING id INTO v_id;
  UPDATE public.conversations SET updated_at = now() WHERE id = p_conversation_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH u AS (
    UPDATE public.conversation_members SET last_read_at = now()
    WHERE conversation_id = p_conversation_id AND profile_id = auth.uid() RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM u)
$$;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_member_select ON public.conversations;
DROP POLICY IF EXISTS conv_members_member_select ON public.conversation_members;
DROP POLICY IF EXISTS messages_member_select ON public.messages;
CREATE POLICY conversations_member_select ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_member(id));
CREATE POLICY conv_members_member_select ON public.conversation_members FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));
CREATE POLICY messages_member_select ON public.messages FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));

REVOKE ALL ON public.conversations, public.conversation_members, public.messages FROM anon, authenticated;
GRANT SELECT ON public.conversations, public.conversation_members, public.messages TO authenticated;
REVOKE ALL ON FUNCTION public.is_conversation_member(uuid), public.list_message_recipients(),
  public.create_conversation(text, text, uuid[]), public.add_group_members(uuid, uuid[]),
  public.send_message(uuid, text), public.mark_conversation_read(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid), public.list_message_recipients(),
  public.create_conversation(text, text, uuid[]), public.add_group_members(uuid, uuid[]),
  public.send_message(uuid, text), public.mark_conversation_read(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 18. LOGIN CONFIGURÁVEL: identificador de acesso, nome completo, número de funcionário ou e-mail
--     O administrador escolhe quais os métodos ativos (login_settings).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.login_settings (id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1));
ALTER TABLE public.login_settings ADD COLUMN IF NOT EXISTS allow_access_identifier boolean NOT NULL DEFAULT true;
ALTER TABLE public.login_settings ADD COLUMN IF NOT EXISTS allow_full_name boolean NOT NULL DEFAULT true;
ALTER TABLE public.login_settings ADD COLUMN IF NOT EXISTS allow_employee_number boolean NOT NULL DEFAULT true;
ALTER TABLE public.login_settings ADD COLUMN IF NOT EXISTS allow_email boolean NOT NULL DEFAULT true;
ALTER TABLE public.login_settings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.login_settings ADD COLUMN IF NOT EXISTS updated_by text;
INSERT INTO public.login_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.login_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS login_settings_read ON public.login_settings;
CREATE POLICY login_settings_read ON public.login_settings FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.login_settings FROM anon, authenticated;
GRANT SELECT ON public.login_settings TO anon, authenticated;

-- Normalização idêntica a src/lib/authIdentifier.ts
CREATE OR REPLACE FUNCTION public.normalize_login_text(p text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 translate(lower(btrim(COALESCE(p, ''))),
                   'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'),
                 '[\s_\-]+', '.', 'g'),
               '[^a-z0-9.]', '', 'g'),
             '\.{2,}', '.', 'g'),
           '^\.+|\.+$', '', 'g')
$$;

-- Métodos ativos (público: apenas valores booleanos)
CREATE OR REPLACE FUNCTION public.get_login_methods()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'access_identifier', s.allow_access_identifier,
    'full_name', s.allow_full_name,
    'employee_number', s.allow_employee_number,
    'email', s.allow_email)
  FROM public.login_settings s WHERE s.id = 1
$$;

-- Resolve o identificador introduzido no e-mail técnico da conta.
-- Só devolve um e-mail se a correspondência for única, a conta estiver ativa e o método estiver ativo.
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
    IF NOT COALESCE(s.allow_email, false) THEN RETURN NULL; END IF;
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
      (COALESCE(s.allow_access_identifier, false) AND e.access_identifier = v_norm)
      OR (COALESCE(s.allow_full_name, false) AND public.normalize_login_text(e.full_name) = v_norm)
      OR (COALESCE(s.allow_employee_number, false) AND upper(e.employee_number) = upper(v))
    );
  IF v_count = 1 THEN RETURN v_email; END IF;
  RETURN NULL;
END;
$$;

-- Administrador define os métodos de login (pelo menos um ativo)
CREATE OR REPLACE FUNCTION public.update_login_settings(p_settings jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  s public.login_settings%ROWTYPE;
  v_ai boolean; v_fn boolean; v_en boolean; v_em boolean;
  v_email text := public.current_user_email();
BEGIN
  IF COALESCE(public.current_user_role()::text, '') <> 'ADMIN' THEN
    RAISE EXCEPTION 'Apenas o Administrador pode configurar o login.';
  END IF;
  SELECT * INTO s FROM public.login_settings WHERE id = 1;
  v_ai := COALESCE((p_settings->>'access_identifier')::boolean, s.allow_access_identifier);
  v_fn := COALESCE((p_settings->>'full_name')::boolean, s.allow_full_name);
  v_en := COALESCE((p_settings->>'employee_number')::boolean, s.allow_employee_number);
  v_em := COALESCE((p_settings->>'email')::boolean, s.allow_email);
  IF NOT (v_ai OR v_fn OR v_en OR v_em) THEN
    RAISE EXCEPTION 'Pelo menos um método de login deve estar ativo.';
  END IF;
  UPDATE public.login_settings
  SET allow_access_identifier = v_ai, allow_full_name = v_fn, allow_employee_number = v_en,
      allow_email = v_em, updated_at = now(), updated_by = v_email
  WHERE id = 1;
  PERFORM public.log_audit_event('UPDATE', 'login_settings', '1', 'SUCCESS',
    format('Métodos de login: identificador=%s, nome=%s, nº funcionário=%s, e-mail=%s', v_ai, v_fn, v_en, v_em), v_email);
  RETURN jsonb_build_object('access_identifier', v_ai, 'full_name', v_fn, 'employee_number', v_en, 'email', v_em);
END;
$$;

-- ----------------------------------------------------------------------------
-- 19. LIMITE DE SUBMISSÕES PÚBLICAS POR ENDEREÇO (30 por hora)
-- ----------------------------------------------------------------------------
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS submitted_ip text;
CREATE INDEX IF NOT EXISTS idx_evaluations_submitted_ip ON public.evaluations (submitted_ip, created_at);

CREATE OR REPLACE FUNCTION public.submit_evaluation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_client text;
  v_service_id uuid;
  v_service_name text;
  v_provider_id uuid;
  v_provider_name text;
  v_sat numeric;
  v_sat_int integer;
  v_nps integer;
  v_dur integer;
  v_audio text;
  v_version uuid;
  v_follow boolean;
  v_id uuid;
  v_ref text;
  v_types text[];
  v_answers jsonb;
  v_snapshot jsonb;
  v_date date;
  v_ip text;
BEGIN
  -- Limite por endereço (x-forwarded-for enviado pela plataforma)
  v_ip := left(COALESCE(
            NULLIF(btrim(split_part(COALESCE(
              (COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::json) ->> 'x-forwarded-for', ''), ',', 1)), ''),
            'desconhecido'), 64);
  IF (SELECT count(*) FROM public.evaluations
      WHERE submitted_ip = v_ip AND created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'Demasiadas submissões a partir deste endereço. Tente novamente mais tarde.';
  END IF;

  v_client := left(btrim(COALESCE(p_payload->>'clientName', p_payload->>'clientNameInput', '')), 200);
  IF length(v_client) < 2 THEN
    RAISE EXCEPTION 'O nome da empresa cliente é obrigatório (mínimo 2 caracteres).';
  END IF;

  SELECT s.id, s.name INTO v_service_id, v_service_name
  FROM public.services s
  WHERE s.id::text = btrim(COALESCE(p_payload->>'serviceId', '')) AND s.status = 'ACTIVE';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O serviço selecionado é inválido ou encontra-se inativo.';
  END IF;

  IF COALESCE(p_payload->>'satisfactionRating', '') !~ '^[0-9]+(\.[0-9]+)?$' THEN
    RAISE EXCEPTION 'A classificação de satisfação é obrigatória (valor de 1 a 5).';
  END IF;
  v_sat := (p_payload->>'satisfactionRating')::numeric;
  v_sat_int := round(v_sat)::integer;
  IF v_sat_int NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'A classificação de satisfação deve estar entre 1 e 5.';
  END IF;

  v_nps := NULL;
  IF COALESCE(p_payload->>'npsScore', '') ~ '^[0-9]+(\.[0-9]+)?$' THEN
    v_nps := round((p_payload->>'npsScore')::numeric)::integer;
    IF v_nps NOT BETWEEN 0 AND 10 THEN
      RAISE EXCEPTION 'O NPS deve estar entre 0 e 10.';
    END IF;
  END IF;

  v_audio := NULLIF(btrim(COALESCE(p_payload->>'audioRecordingUrl', '')), '');
  IF v_audio IS NOT NULL AND v_audio !~ '^submissions/[A-Za-z0-9._/-]{1,200}$' THEN
    RAISE EXCEPTION 'Referência de áudio inválida.';
  END IF;
  v_dur := NULL;
  IF COALESCE(p_payload->>'audioDurationSeconds', '') ~ '^[0-9]+$' THEN
    v_dur := (p_payload->>'audioDurationSeconds')::integer;
  END IF;
  IF v_dur IS NOT NULL AND v_dur > 45 THEN
    RAISE EXCEPTION 'A duração máxima permitida para o áudio é de 45 segundos.';
  END IF;
  IF v_audio IS NULL THEN v_dur := NULL; END IF;

  IF COALESCE(p_payload->>'providerId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT pr.id, pr.name INTO v_provider_id, v_provider_name
    FROM public.providers pr
    WHERE pr.id = (p_payload->>'providerId')::uuid AND pr.status = 'ACTIVE';
  END IF;

  SELECT fv.id INTO v_version FROM public.form_versions fv
  WHERE fv.status = 'PUBLISHED' ORDER BY fv.version_number DESC LIMIT 1;

  v_types := ARRAY(SELECT jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p_payload->'serviceTypesProvided') = 'array' THEN p_payload->'serviceTypesProvided' ELSE '[]'::jsonb END));

  v_answers := CASE WHEN jsonb_typeof(p_payload->'detailedAnswers') = 'object' THEN p_payload->'detailedAnswers' ELSE '{}'::jsonb END;
  v_snapshot := CASE WHEN jsonb_typeof(p_payload->'questionsSnapshot') = 'array' THEN p_payload->'questionsSnapshot' ELSE '[]'::jsonb END;

  v_date := CURRENT_DATE;
  IF COALESCE(p_payload->>'serviceDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    v_date := (p_payload->>'serviceDate')::date;
  END IF;

  v_follow := (v_sat_int <= 2) OR (v_nps IS NOT NULL AND v_nps <= 6);

  INSERT INTO public.evaluations (
    client_name, client_name_input, service_id, service_name, provider_id, provider_name_input,
    form_version_id, service_date, satisfaction_rating, nps_score, comment,
    audio_recording_url, audio_duration_seconds, service_types_provided,
    detailed_answers, questions_snapshot, status, requires_follow_up, corrective_action_status, submitted_ip
  ) VALUES (
    v_client, v_client, v_service_id, v_service_name, v_provider_id,
    left(NULLIF(btrim(COALESCE(p_payload->>'providerName', '')), ''), 200),
    v_version, v_date, v_sat_int, v_nps, left(p_payload->>'comment', 5000),
    v_audio, v_dur, v_types, v_answers, v_snapshot,
    'PENDING_REVIEW', v_follow, CASE WHEN v_follow THEN 'PENDING' ELSE 'NOT_NEEDED' END, v_ip
  )
  RETURNING id, reference INTO v_id, v_ref;

  PERFORM public.log_audit_event('CREATE', 'evaluations', v_id::text, 'SUCCESS',
    format('Submissão pública registada para a empresa %s (Serviço: %s)', v_client, v_service_name),
    'public@aeternu.co.ao');

  RETURN jsonb_build_object('success', true, 'id', v_id, 'reference', v_ref,
                            'status', 'PENDING_REVIEW', 'message', 'Avaliação submetida com sucesso.');
END;
$$;

-- ----------------------------------------------------------------------------
-- 20. LIMITES DE UPLOAD (tipo e tamanho) nos buckets privados
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit') THEN
    UPDATE storage.buckets SET file_size_limit = 10485760,
      allowed_mime_types = ARRAY['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/x-m4a']
      WHERE id = 'evaluation-audio';
    UPDATE storage.buckets SET file_size_limit = 10485760,
      allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']
      WHERE id = 'employee-documents';
  END IF;
END $$;

-- Privilégios das novas funções
REVOKE ALL ON FUNCTION public.normalize_login_text(text), public.get_login_methods(),
  public.resolve_login_email(text), public.update_login_settings(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_login_text(text), public.get_login_methods(),
  public.resolve_login_email(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_login_settings(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.submit_evaluation(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_evaluation(jsonb) TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 21. CLIENTES: cadastro completo e metas com prazo
-- ----------------------------------------------------------------------------
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS nif text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT 'Luanda';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS sector text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contract_start date;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contract_end date;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS notes text;
CREATE UNIQUE INDEX IF NOT EXISTS clients_nif_key ON public.clients (nif) WHERE nif IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_nif_format') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_nif_format CHECK (nif IS NULL OR nif ~ '^[0-9]{9,14}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_email_format') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_email_format CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_phone_format') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_phone_format CHECK (phone IS NULL OR phone ~ '^\+?[0-9 ()-]{7,20}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_name_min') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_name_min CHECK (company_name IS NULL OR length(btrim(company_name)) >= 2) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_contract_dates') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_contract_dates CHECK (contract_start IS NULL OR contract_end IS NULL OR contract_end >= contract_start) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.client_goals (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
ALTER TABLE public.client_goals ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.client_goals ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '' CHECK (length(btrim(title)) BETWEEN 2 AND 150);
ALTER TABLE public.client_goals ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.client_goals ADD COLUMN IF NOT EXISTS metric text NOT NULL DEFAULT 'CSAT' CHECK (metric IN ('CSAT', 'NPS', 'EVALUATION_COUNT'));
ALTER TABLE public.client_goals ADD COLUMN IF NOT EXISTS target_value numeric(7,2) NOT NULL DEFAULT 80 CHECK (target_value > 0);
ALTER TABLE public.client_goals ADD COLUMN IF NOT EXISTS due_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.client_goals ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'EM_CURSO', 'CONCLUIDA', 'NAO_CUMPRIDA'));
ALTER TABLE public.client_goals ADD COLUMN IF NOT EXISTS achieved_at timestamptz;
ALTER TABLE public.client_goals ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.client_goals ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.client_goals ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_client_goals_client ON public.client_goals (client_id, due_date);

ALTER TABLE public.client_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_goals_staff_all ON public.client_goals;
CREATE POLICY client_goals_staff_all ON public.client_goals FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
REVOKE ALL ON public.client_goals FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_goals TO authenticated;

COMMIT;

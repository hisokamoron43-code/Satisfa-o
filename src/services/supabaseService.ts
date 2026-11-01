import { identifierToAuthEmail } from '../lib/authIdentifier';
import type { ClientGoal, GoalMetric, GoalStatus } from '../types';
/**
 * @file supabaseService.ts
 * @description Supabase client integration & data service layer for SICSC (AETERNU).
 * Connects directly to the Supabase project PostgreSQL instance with Row Level Security (RLS).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  Client, 
  ServiceItem, 
  Provider, 
  Evaluation, 
  HRCase, 
  AuditLog, 
  UserProfile, 
  UserRole,
  FormQuestion,
  FormCategoryItem,
  Team,
  Activity,
  WorkerNotification,
  ProviderPermissionAudit,
  EvaluationCriterion
} from '../types';

// Provided Supabase project credentials
const getCleanUrl = (url: string) => url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env : {};
const rawUrl = (env?.VITE_SUPABASE_URL as string) || '';
const rawKey = (env?.VITE_SUPABASE_ANON_KEY as string) || '';

/** Configuração em falta: a aplicação mostra um ecrã de erro em vez de ligar a um projeto por omissão. */
export const SUPABASE_CONFIG_ERROR: string | null =
  !rawUrl || !rawKey
    ? 'Configuração em falta: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente de build.'
    : null;

export const SUPABASE_URL = getCleanUrl(rawUrl || 'https://configuracao-em-falta.invalid');
export const SUPABASE_ANON_KEY = rawKey || 'configuracao-em-falta';

// Initialize official Supabase client
try {
  Object.keys(window.localStorage).filter(k => k.startsWith('sb-')).forEach(k => window.localStorage.removeItem(k));
} catch { /* armazenamento indisponível */ }

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // Tokens só em sessionStorage: não ficam no localStorage e terminam ao fechar o separador
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
  },
});

export interface ConnectionTestResult {
  connected: boolean;
  message: string;
  tablesFound?: boolean;
  timestamp: string;
  latencyMs?: number;
}

/**
 * Tests connection to the Supabase database.
 */
export async function testSupabaseConnection(): Promise<ConnectionTestResult> {
  const startTime = Date.now();
  try {
    const { data, error, status } = await supabase
      .from('clients')
      .select('id')
      .limit(1);

    const latencyMs = Date.now() - startTime;

    if (error) {
      // 42P01 is PostgreSQL "relation does not exist" -> Supabase is reachable, but tables need to be created.
      if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist')) {
        return {
          connected: true,
          tablesFound: false,
          latencyMs,
          message: 'Ligação ao Supabase estabelecida com sucesso! No entanto, as tabelas ainda não foram criadas. Execute o script SQL no editor do Supabase.',
          timestamp: new Date().toLocaleTimeString('pt-PT')
        };
      }
      return {
        connected: false,
        latencyMs,
        message: `Falha na consulta: ${error.message} (Código: ${error.code || status})`,
        timestamp: new Date().toLocaleTimeString('pt-PT')
      };
    }

    return {
      connected: true,
      tablesFound: true,
      latencyMs,
      message: `Conectado com sucesso ao projeto Supabase (${latencyMs}ms). Tabelas ativas e operacionais.`,
      timestamp: new Date().toLocaleTimeString('pt-PT')
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `Erro de rede ou configuração: ${err?.message || 'Incapaz de alcançar o servidor'}`,
      timestamp: new Date().toLocaleTimeString('pt-PT')
    };
  }
}

/**
 * AUTHENTICATION & PROFILES Service
 */

/**
 * Signs in a user using Supabase Auth (email + password).
 */
export async function signInWithSupabase(
  email: string, 
  password: string
): Promise<{ success: boolean; user?: UserProfile; error?: string }> {
  try {
    // Aceita e-mail legado ou identificador de acesso (convertido para o e-mail técnico)
    const { data: resolvedEmail, error: resolveError } = await supabase.rpc('resolve_login_email', { p_login: email.trim() });
    if (resolveError || !resolvedEmail) {
      return { success: false, error: 'Credenciais inválidas. Verifique os seus dados.' };
    }
    const cleanEmail = String(resolvedEmail);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: password,
    });

    if (error) {
      let friendly = error.message;
      if (error.message.includes('Invalid login credentials')) {
        friendly = 'Credenciais inválidas. Verifique o e-mail e a palavra-passe criados no Supabase.';
      } else if (error.message.includes('Email not confirmed')) {
        friendly = 'O e-mail ainda não foi confirmado. Aceda ao painel do Supabase -> Authentication -> Users e confirme o utilizador, ou desative "Confirm email" nas definições de Auth.';
      } else if (error.message.includes('fetch') || error.message.includes('network')) {
        friendly = 'Erro de rede ao comunicar com o Supabase. Verifique a ligação à internet.';
      }
      return { success: false, error: friendly };
    }

    if (!data.user) {
      return { success: false, error: 'Utilizador não encontrado no sistema.' };
    }

    // Retrieve or provision user profile in public.profiles table
    const profile = await getOrCreateUserProfile(data.user);
    return { success: true, user: profile };
  } catch (err: any) {
    await signOutFromSupabase();
    return { success: false, error: err?.message || 'Erro inesperado durante a autenticação.' };
  }
}

/**
 * Signs out from Supabase Auth.
 */
export async function signOutFromSupabase(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    // Graceful signout
  }
}

/**
 * Checks for an active Supabase session on startup.
 */
export async function getCurrentSupabaseUser(): Promise<UserProfile | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user) return null;
    return await getOrCreateUserProfile(session.user);
  } catch {
    return null;
  }
}

/**
 * Carrega o perfil ATIVO do utilizador autenticado, pelo id de autenticação.
 * Não cria perfis: uma conta sem perfil ativo não tem acesso ao sistema.
 */
export async function getOrCreateUserProfile(authUser: any): Promise<UserProfile> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, department, avatar_url, active, must_change_password')
    .eq('id', authUser.id)
    .maybeSingle();

  if (error || !profile) {
    throw new Error('Conta sem perfil de acesso. Contacte o Administrador.');
  }
  if (profile.active !== true) {
    throw new Error('Conta desativada. Contacte o Administrador.');
  }

  const { data: access, error: accessError } = await supabase.rpc('get_my_access');
  const pages: string[] = !accessError && access && Array.isArray(access.pages) ? access.pages : [];

  return {
    id: profile.id,
    name: profile.name || String(profile.email || '').split('@')[0],
    email: profile.email,
    role: profile.role,
    department: profile.department || 'Operações',
    avatarUrl: profile.avatar_url,
    active: true,
    lastLogin: new Date().toISOString(),
    allowedPages: pages,
    mustChangePassword: Boolean(profile.must_change_password),
  } as UserProfile;
}

export async function fetchClientsFromDb(): Promise<Client[] | null> {
  try {
    // 1. Tentar tabela completa (autorizado para colaboradores/gestores autenticados)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data.map((item: any) => ({
        id: item.id,
        companyName: item.company_name,
        internalCode: item.internal_code,
        contactPerson: item.contact_person || '',
        nif: item.nif || undefined,
        address: item.address || undefined,
        city: item.city || undefined,
        sector: item.sector || undefined,
        contractStart: item.contract_start || undefined,
        contractEnd: item.contract_end || undefined,
        notes: item.notes || undefined,
        email: item.email || '',
        phone: item.phone || '',
        contractedServices: item.contracted_services || [],
        status: item.status || 'ACTIVE',
        createdAt: item.created_at ? item.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10),
      }));
    }

    // 2. Fallback seguro para vista pública v_public_clients (formulário de cliente anónimo)
    // Protege PII confidencial (contactos, emails, telefones) expondo apenas campos necessários
    const { data: viewData, error: viewError } = await supabase
      .from('v_public_clients')
      .select('id, company_name, internal_code')
      .order('company_name');

    if (!viewError && viewData) {
      return viewData.map((item: any) => ({
        id: item.id,
        companyName: item.company_name,
        internalCode: item.internal_code,
        contactPerson: '',
        email: '',
        phone: '',
        contractedServices: [],
        status: 'ACTIVE',
        createdAt: new Date().toISOString().substring(0, 10),
      }));
    }

    return null;
  } catch (e) {
    return null;
  }
}

export async function insertClientInDb(client: Omit<Client, 'id' | 'createdAt'>): Promise<{ success: boolean; id?: string; data?: Client; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('clients')
      .insert({
        company_name: client.companyName,
        internal_code: client.internalCode,
        contact_person: client.contactPerson,
        nif: client.nif || null,
        address: client.address || null,
        city: client.city || null,
        sector: client.sector || null,
        contract_start: client.contractStart || null,
        contract_end: client.contractEnd || null,
        notes: client.notes || null,
        email: client.email,
        phone: client.phone,
        contracted_services: client.contractedServices,
        status: client.status,
      })
      .select('*')
      .single();

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      id: data.id,
      data: {
        id: data.id,
        companyName: data.company_name,
        internalCode: data.internal_code,
        contactPerson: data.contact_person || '',
        email: data.email || '',
        phone: data.phone || '',
        contractedServices: data.contracted_services || [],
        status: data.status,
        createdAt: data.created_at ? data.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10),
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de rede ou falha na inserção do cliente.' };
  }
}

export async function updateClientInDb(id: string, updated: Partial<Client>): Promise<{ success: boolean; error?: string }> {
  try {
    const payload: any = {};
    if (updated.companyName) payload.company_name = updated.companyName;
    if (updated.internalCode) payload.internal_code = updated.internalCode;
    if (updated.contactPerson !== undefined) payload.contact_person = updated.contactPerson;
    if (updated.nif !== undefined) payload.nif = updated.nif || null;
    if (updated.address !== undefined) payload.address = updated.address || null;
    if (updated.city !== undefined) payload.city = updated.city || null;
    if (updated.sector !== undefined) payload.sector = updated.sector || null;
    if (updated.contractStart !== undefined) payload.contract_start = updated.contractStart || null;
    if (updated.contractEnd !== undefined) payload.contract_end = updated.contractEnd || null;
    if (updated.notes !== undefined) payload.notes = updated.notes || null;
    if (updated.email) payload.email = updated.email;
    if (updated.phone !== undefined) payload.phone = updated.phone;
    if (updated.contractedServices) payload.contracted_services = updated.contractedServices;
    if (updated.status) payload.status = updated.status;

    const { error } = await supabase.from('clients').update(payload).eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de rede ao atualizar cliente.' };
  }
}

/**
 * SERVICES Service
 */
export async function fetchServicesFromDb(): Promise<ServiceItem[] | null> {
  try {
    const { data, error } = await supabase.from('services').select('*').order('name');
    if (!error && data && data.length > 0) {
      return data.map((item: any) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        description: item.description || '',
        status: item.status || 'ACTIVE',
        evaluationIndicator: item.evaluation_indicator || 'CSAT_AND_NPS',
      }));
    }

    // Fallback para a vista pública autorizada v_public_services
    const { data: vData, error: vErr } = await supabase
      .from('v_public_services')
      .select('*')
      .order('name');

    if (!vErr && vData && vData.length > 0) {
      return vData.map((item: any) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        description: item.description || '',
        status: 'ACTIVE',
        evaluationIndicator: item.evaluation_indicator || 'CSAT_AND_NPS',
      }));
    }

    return null;
  } catch {
    return null;
  }
}

export async function insertServiceInDb(srv: Omit<ServiceItem, 'id'>): Promise<{ success: boolean; id?: string; data?: ServiceItem; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('services')
      .insert({
        name: srv.name,
        code: srv.code,
        description: srv.description,
        status: srv.status,
        evaluation_indicator: srv.evaluationIndicator,
      })
      .select('*')
      .single();

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      id: data.id,
      data: {
        id: data.id,
        name: data.name,
        code: data.code,
        description: data.description || '',
        status: data.status,
        evaluationIndicator: data.evaluation_indicator,
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de rede ao inserir serviço.' };
  }
}

export async function updateServiceInDb(id: string, updated: Partial<ServiceItem>): Promise<{ success: boolean; error?: string }> {
  try {
    const payload: any = {};
    if (updated.name !== undefined) payload.name = updated.name;
    if (updated.code !== undefined) payload.code = updated.code;
    if (updated.description !== undefined) payload.description = updated.description;
    if (updated.status !== undefined) payload.status = updated.status;
    if (updated.evaluationIndicator !== undefined) payload.evaluation_indicator = updated.evaluationIndicator;

    const { error } = await supabase.from('services').update(payload).eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao atualizar serviço.' };
  }
}

export async function deleteOrDeactivateServiceInDb(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('services').update({ status: 'INACTIVE' }).eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao desativar serviço.' };
  }
}

/**
 * PROVIDERS Service
 */
export async function fetchProvidersFromDb(): Promise<Provider[] | null> {
  try {
    // 1. Tentar tabela completa (autorizado para colaboradores autenticados)
    const { data, error } = await supabase.from('providers').select('*').order('name');
    if (!error && data) {
      return data.map((item: any) => ({
        id: item.id,
        internalCode: item.internal_code,
        name: item.name,
        professionalEmail: item.professional_email,
        services: item.services || [],
        status: item.status || 'ACTIVE',
        createdAt: item.created_at ? item.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10),
        evaluationAccessAuthorized: !!item.evaluation_access_authorized,
        accessAuthorizedAt: item.access_authorized_at,
        accessAuthorizedBy: item.access_authorized_by,
      }));
    }

    // 2. Fallback seguro para vista pública v_public_providers (formulário de cliente anónimo)
    // Oculta e-mails e histórico administrativo de autorizações
    const { data: viewData, error: viewError } = await supabase
      .from('v_public_providers')
      .select('id, name, internal_code, services')
      .order('name');

    if (!viewError && viewData) {
      return viewData.map((item: any) => ({
        id: item.id,
        internalCode: item.internal_code,
        name: item.name,
        professionalEmail: '',
        services: item.services || [],
        status: 'ACTIVE',
        createdAt: new Date().toISOString().substring(0, 10),
        evaluationAccessAuthorized: false,
      }));
    }

    return null;
  } catch {
    return null;
  }
}

export function isValidUuid(str?: string): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
}

export async function insertProviderInDb(prov: Omit<Provider, 'id' | 'createdAt'>): Promise<{ success: boolean; id?: string; data?: Provider; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('providers')
      .insert({
        internal_code: prov.internalCode,
        name: prov.name,
        professional_email: prov.professionalEmail,
        services: prov.services,
        status: prov.status,
        evaluation_access_authorized: prov.evaluationAccessAuthorized,
      })
      .select('*')
      .single();

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      id: data.id,
      data: {
        id: data.id,
        internalCode: data.internal_code,
        name: data.name,
        professionalEmail: data.professional_email,
        services: data.services || [],
        status: data.status,
        createdAt: data.created_at ? data.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10),
        evaluationAccessAuthorized: !!data.evaluation_access_authorized,
        accessAuthorizedAt: data.access_authorized_at,
        accessAuthorizedBy: data.access_authorized_by,
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de rede ao inserir prestador.' };
  }
}

export async function updateProviderInDb(
  id: string, 
  prov: Partial<Provider>
): Promise<{ success: boolean; error?: string }> {
  try {
    const updatePayload: Record<string, any> = {};
    if (prov.name !== undefined) updatePayload.name = prov.name;
    if (prov.internalCode !== undefined) updatePayload.internal_code = prov.internalCode;
    if (prov.professionalEmail !== undefined) updatePayload.professional_email = prov.professionalEmail;
    if (prov.services !== undefined) updatePayload.services = prov.services;
    if (prov.status !== undefined) updatePayload.status = prov.status;
    if (prov.evaluationAccessAuthorized !== undefined) {
      updatePayload.evaluation_access_authorized = prov.evaluationAccessAuthorized;
      updatePayload.access_authorized_at = prov.accessAuthorizedAt || new Date().toISOString();
      updatePayload.access_authorized_by = prov.accessAuthorizedBy || 'RH';
    }

    const { error } = await supabase
      .from('providers')
      .update(updatePayload)
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao atualizar prestador.' };
  }
}

export async function deleteOrDeactivateProviderInDb(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('providers')
      .update({ status: 'INACTIVE' })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao desativar prestador.' };
  }
}

/**
 * EVALUATIONS Service
 */
export async function fetchEvaluationsFromDb(): Promise<Evaluation[] | null> {
  try {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*, clients(company_name), services(name), providers(name)')
      .order('evaluation_date', { ascending: false });

    if (error || !data) return null;

    return data.map((item: any) => ({
      id: item.id,
      reference: item.reference,
      clientId: item.client_id,
      clientName: item.clients?.company_name || item.client_name_input || 'Cliente AETERNU',
      clientNameInput: item.client_name_input || undefined,
      serviceId: item.service_id,
      serviceName: item.services?.name || 'Serviço',
      providerId: item.provider_id,
      providerName: item.providers?.name || item.provider_name_input || 'Técnico',
      providerNameInput: item.provider_name_input || undefined,
      serviceDate: item.service_date,
      evaluationDate: item.evaluation_date,
      satisfactionRating: item.satisfaction_rating,
      npsScore: item.nps_score,
      comment: item.comment || '',
      status: item.status || 'PENDING_REVIEW',
      requiresFollowUp: !!item.requires_follow_up,
      correctiveActionStatus: item.corrective_action_status || 'NOT_NEEDED',
      technicalScore: item.technical_score !== undefined && item.technical_score !== null ? Number(item.technical_score) : undefined,
      finalClassification: item.final_classification || undefined,
      finalizedAt: item.finalized_at || undefined,
      finalizedBy: item.finalized_by || undefined,
      criteriaSnapshot: item.criteria_snapshot || undefined,
      criterionRatings: item.criterion_ratings || undefined,
    }));
  } catch {
    return null;
  }
}

export async function finalizeEvaluationViaRpc(
  evaluationId: string,
  criterionRatings: Record<string, number>,
  customThreshold?: number,
  thresholdOverrideReason?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('calculate_and_finalize_evaluation', {
      p_evaluation_id: evaluationId,
      p_criterion_ratings: criterionRatings,
      p_custom_threshold: customThreshold !== undefined ? customThreshold : null,
      p_threshold_override_reason: thresholdOverrideReason || null
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha de comunicação com o servidor Supabase.' };
  }
}

export async function fetchEvaluationByReference(reference: string): Promise<Evaluation | null> {
  try {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*, clients(company_name, internal_code), services(name, code), providers(name, internal_code)')
      .eq('reference', reference.trim())
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      reference: data.reference,
      clientId: data.client_id || '',
      clientName: data.clients?.company_name || data.client_name_input || 'Cliente AETERNU',
      clientNameInput: data.client_name_input || undefined,
      serviceId: data.service_id || '',
      serviceName: data.services?.name || 'Serviço',
      providerId: data.provider_id || '',
      providerName: data.providers?.name || data.provider_name_input || 'Técnico',
      providerNameInput: data.provider_name_input || undefined,
      serviceDate: data.service_date,
      evaluationDate: data.evaluation_date,
      satisfactionRating: data.satisfaction_rating,
      npsScore: data.nps_score,
      comment: data.comment || '',
      status: data.status || 'PENDING_REVIEW',
      requiresFollowUp: !!data.requires_follow_up,
      correctiveActionStatus: data.corrective_action_status || 'NOT_NEEDED',
    };
  } catch {
    return null;
  }
}

export async function fetchEvaluationById(id: string): Promise<Evaluation | null> {
  try {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*, clients(company_name, internal_code), services(name, code), providers(name, internal_code)')
      .eq('id', id)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      reference: data.reference,
      clientId: data.client_id || '',
      clientName: data.clients?.company_name || data.client_name_input || 'Cliente AETERNU',
      clientNameInput: data.client_name_input || undefined,
      serviceId: data.service_id || '',
      serviceName: data.services?.name || 'Serviço',
      providerId: data.provider_id || '',
      providerName: data.providers?.name || data.provider_name_input || 'Técnico',
      providerNameInput: data.provider_name_input || undefined,
      serviceDate: data.service_date,
      evaluationDate: data.evaluation_date,
      satisfactionRating: data.satisfaction_rating,
      npsScore: data.nps_score,
      comment: data.comment || '',
      status: data.status || 'PENDING_REVIEW',
      requiresFollowUp: !!data.requires_follow_up,
      correctiveActionStatus: data.corrective_action_status || 'NOT_NEEDED',
    };
  } catch {
    return null;
  }
}

export async function updateEvaluationStatusInDb(
  id: string,
  status: Evaluation['status'],
  correctiveStatus: Evaluation['correctiveActionStatus']
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('evaluations')
      .update({
        status,
        corrective_action_status: correctiveStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao atualizar estado da avaliação.' };
  }
}

/**
 * AUDIT LOGS Service
 */
export async function insertAuditLogInDb(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      user_email: log.userEmail,
      user_name: log.userName,
      operation_type: log.operationType,
      affected_entity: log.affectedEntity,
      record_id: log.recordId,
      result: log.result,
      details: log.details,
    });
  } catch {
    // Audit log push failure should not break client operation
  }
}

export async function fetchAuditLogsFromDb(): Promise<AuditLog[] | null> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error || !data) return null;

    return data.map((item: any) => ({
      id: item.id,
      timestamp: item.timestamp ? item.timestamp.replace('T', ' ').substring(0, 19) : new Date().toISOString().substring(0, 19),
      userEmail: item.user_email,
      userName: item.user_name,
      operationType: item.operation_type,
      affectedEntity: item.affected_entity,
      recordId: item.record_id,
      result: item.result,
      details: item.details,
    }));
  } catch {
    return null;
  }
}

/**
 * HUMAN RESOURCES Service
 */
export async function fetchHRCasesFromDb(): Promise<HRCase[] | null> {
  try {
    const { data, error } = await supabase
      .from('hr_cases')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return null;

    return data.map((item: any) => ({
      id: item.id,
      evaluationId: item.evaluation_id,
      occurrenceType: item.occurrence_type,
      internalNotes: item.internal_notes,
      assignedTo: item.assigned_to,
      correctiveAction: item.corrective_action || '',
      status: item.status,
      resolutionDate: item.resolution_date,
      createdAt: item.created_at ? item.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10),
      updatedAt: item.updated_at ? item.updated_at.substring(0, 10) : new Date().toISOString().substring(0, 10),
    }));
  } catch {
    return null;
  }
}

export async function insertHRCaseInDb(hrCase: Omit<HRCase, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; id?: string; data?: HRCase; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('hr_cases')
      .insert({
        evaluation_id: hrCase.evaluationId && hrCase.evaluationId.includes('-') && hrCase.evaluationId.length > 30 ? hrCase.evaluationId : null,
        occurrence_type: hrCase.occurrenceType,
        internal_notes: hrCase.internalNotes,
        assigned_to: hrCase.assignedTo,
        corrective_action: hrCase.correctiveAction,
        status: hrCase.status,
      })
      .select('*')
      .single();

    if (error) return { success: false, error: error.message };
    return {
      success: true,
      id: data.id,
      data: {
        id: data.id,
        evaluationId: data.evaluation_id,
        occurrenceType: data.occurrence_type,
        internalNotes: data.internal_notes,
        assignedTo: data.assigned_to,
        correctiveAction: data.corrective_action || '',
        status: data.status,
        resolutionDate: data.resolution_date,
        createdAt: data.created_at ? data.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10),
        updatedAt: data.updated_at ? data.updated_at.substring(0, 10) : new Date().toISOString().substring(0, 10),
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de rede ao criar ocorrência de RH.' };
  }
}

export async function updateHRCaseInDb(id: string, updated: Partial<HRCase>): Promise<{ success: boolean; error?: string }> {
  try {
    const payload: any = { updated_at: new Date().toISOString() };
    if (updated.occurrenceType !== undefined) payload.occurrence_type = updated.occurrenceType;
    if (updated.internalNotes !== undefined) payload.internal_notes = updated.internalNotes;
    if (updated.assignedTo !== undefined) payload.assigned_to = updated.assignedTo;
    if (updated.correctiveAction !== undefined) payload.corrective_action = updated.correctiveAction;
    if (updated.status !== undefined) payload.status = updated.status;
    if (updated.resolutionDate !== undefined) payload.resolution_date = updated.resolutionDate;

    const { error } = await supabase.from('hr_cases').update(payload).eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao atualizar ocorrência de RH.' };
  }
}

/**
 * PROFILES Service - Fetch all registered profiles from Supabase
 */
export async function fetchProfilesFromDb(): Promise<UserProfile[] | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('name');

    if (error || !data) return null;

    return data.map((item: any) => ({
      id: item.id,
      name: item.name || item.email?.split('@')[0],
      email: item.email,
      role: item.role,
      department: item.department || 'Geral',
      avatarUrl: item.avatar_url,
      active: item.active ?? true,
      lastLogin: item.created_at ? item.created_at.substring(0, 10) : undefined
    }));
  } catch {
    return null;
  }
}

/**
 * FORM QUESTIONS Service
 */
export async function fetchFormQuestionsFromDb(): Promise<FormQuestion[] | null> {
  try {
    // 1. Tentar ler directamente de form_questions (para staff)
    const { data, error } = await supabase
      .from('form_questions')
      .select('*')
      .order('display_order', { ascending: true });

    if (!error && data && data.length > 0) {
      return data.map((item: any) => ({
        id: item.id,
        text: item.text,
        description: item.description || '',
        category: item.category,
        type: item.type,
        required: item.required ?? true,
        active: item.active ?? true,
        order: item.display_order || 1,
        service_id: item.service_id || undefined
      }));
    }

    // 2. Fallback para vista pública segura v_public_form_questions
    const { data: vData, error: vErr } = await supabase
      .from('v_public_form_questions')
      .select('*')
      .order('display_order', { ascending: true });

    if (!vErr && vData && vData.length > 0) {
      return vData.map((item: any) => ({
        id: item.id,
        text: item.text,
        description: item.description || '',
        category: item.category,
        type: item.type,
        required: item.required ?? true,
        active: true,
        order: item.display_order || 1,
        service_id: item.service_id || undefined
      }));
    }

    return null;
  } catch {
    return null;
  }
}

export async function insertFormQuestionInDb(question: Omit<FormQuestion, 'id'>): Promise<{ success: boolean; data?: FormQuestion; error?: string }> {
  try {
    const qId = `qst-${Date.now()}`;
    const payload: any = {
      id: qId,
      text: question.text,
      description: question.description || null,
      category: question.category,
      type: question.type,
      required: question.required,
      active: question.active,
      display_order: question.order || 1,
      service_id: question.service_id || null,
      updated_by: 'RH AETERNU'
    };

    const { data, error } = await supabase
      .from('form_questions')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (error.message?.includes('schema cache') || error.message?.includes('form_questions') || error.code === '42P01' || error.code === 'PGRST102') {
        console.warn('Form questions PostgREST schema cache notice on remote Supabase:', error.message);
        return {
          success: true,
          data: {
            id: qId,
            text: question.text,
            description: question.description,
            category: question.category,
            type: question.type,
            required: question.required,
            active: question.active,
            order: question.order || 1,
            service_id: question.service_id
          }
        };
      }
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: {
        id: data.id,
        text: data.text,
        description: data.description,
        category: data.category,
        type: data.type,
        required: data.required,
        active: data.active,
        order: data.display_order,
        service_id: data.service_id || undefined
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function updateFormQuestionInDb(id: string, updated: Partial<FormQuestion>): Promise<{ success: boolean; error?: string }> {
  try {
    const payload: any = { updated_at: new Date().toISOString() };
    if (updated.text !== undefined) payload.text = updated.text;
    if (updated.description !== undefined) payload.description = updated.description;
    if (updated.category !== undefined) payload.category = updated.category;
    if (updated.type !== undefined) payload.type = updated.type;
    if (updated.required !== undefined) payload.required = updated.required;
    if (updated.active !== undefined) payload.active = updated.active;
    if (updated.order !== undefined) payload.display_order = updated.order;
    if (updated.service_id !== undefined) payload.service_id = updated.service_id || null;

    const { error } = await supabase
      .from('form_questions')
      .update(payload)
      .eq('id', id);

    if (error) {
      if (error.message?.includes('schema cache') || error.message?.includes('form_questions') || error.code === '42P01' || error.code === 'PGRST102') {
        console.warn('Form questions PostgREST schema cache notice on remote Supabase:', error.message);
        return { success: true };
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function deleteFormQuestionInDb(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('form_questions')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.message?.includes('schema cache') || error.message?.includes('form_questions') || error.code === '42P01' || error.code === 'PGRST102') {
        console.warn('Form questions PostgREST schema cache notice on remote Supabase:', error.message);
        return { success: true };
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * FORM CATEGORIES Service
 */
export const DEFAULT_FORM_CATEGORIES: FormCategoryItem[] = [
  {
    id: 'QUALIDADE',
    name: 'Qualidade Técnica & Rigor',
    code: 'QUALIDADE',
    description: 'Critérios de execução técnica, acabamento, rigor e conformidade com os padrões AETERNU.',
    color: '#8CBF26',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    active: true
  },
  {
    id: 'PONTUALIDADE',
    name: 'Pontualidade & Prazos',
    code: 'PONTUALIDADE',
    description: 'Cumprimento dos prazos estabelecidos, horários de chegada e tempo de resposta.',
    color: '#00A3E0',
    badgeBg: 'bg-sky-100 text-sky-800 border-sky-300',
    active: true
  },
  {
    id: 'SEGURANCA',
    name: 'Segurança & Proteção',
    code: 'SEGURANCA',
    description: 'Medidas de proteção individual/coletiva, segurança da informação e integridade das instalações.',
    color: '#E05A47',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
    active: true
  },
  {
    id: 'ATENDIMENTO',
    name: 'Atendimento & Cordialidade',
    code: 'ATENDIMENTO',
    description: 'Postura profissional, comunicação, empatia e facilidade de contacto dos técnicos.',
    color: '#9B51E0',
    badgeBg: 'bg-purple-100 text-purple-800 border-purple-300',
    active: true
  },
  {
    id: 'GERAL',
    name: 'Satisfação Geral & Recomendação',
    code: 'GERAL',
    description: 'Percepção global do cliente, pontuação NPS e intenção de recomendação da empresa.',
    color: '#2D6A28',
    badgeBg: 'bg-slate-100 text-slate-800 border-slate-300',
    active: true
  }
];

export async function fetchFormCategoriesFromDb(): Promise<FormCategoryItem[]> {
  try {
    const { data, error } = await supabase
      .from('form_categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (!error && data && data.length > 0) {
      const dbCats: FormCategoryItem[] = data.map((item: any) => ({
        id: item.id || item.code,
        name: item.name,
        code: item.code || item.id,
        description: item.description || '',
        color: item.color || '#8CBF26',
        badgeBg: item.badge_bg || 'bg-slate-100 text-slate-800 border-slate-300',
        active: item.active ?? true,
        display_order: item.display_order ?? 1
      }));

      // Ensure system categories are represented if missing
      const mergedMap = new Map<string, FormCategoryItem>();
      DEFAULT_FORM_CATEGORIES.forEach(c => mergedMap.set(c.code, c));
      dbCats.forEach(c => mergedMap.set(c.code, c));
      return Array.from(mergedMap.values()).sort((a, b) => (a.display_order ?? 1) - (b.display_order ?? 1));
    }

    return DEFAULT_FORM_CATEGORIES;
  } catch {
    return DEFAULT_FORM_CATEGORIES;
  }
}

export async function insertFormCategoryInDb(category: Omit<FormCategoryItem, 'id'>): Promise<{ success: boolean; data?: FormCategoryItem; error?: string }> {
  try {
    const catCode = (category.code || category.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')).trim();
    const catId = `cat-${Date.now()}`;
    const payload = {
      id: catId,
      code: catCode,
      name: category.name,
      description: category.description || null,
      color: category.color || '#8CBF26',
      badge_bg: category.badgeBg || 'bg-slate-100 text-slate-800 border-slate-300',
      active: category.active ?? true,
      display_order: category.display_order ?? 99
    };

    const { data, error } = await supabase
      .from('form_categories')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (error.message?.includes('schema cache') || error.message?.includes('form_categories') || error.code === '42P01' || error.code === 'PGRST102') {
        console.warn('Form categories PostgREST schema notice:', error.message);
        return {
          success: true,
          data: {
            id: catCode,
            code: catCode,
            name: category.name,
            description: category.description,
            color: category.color || '#8CBF26',
            badgeBg: category.badgeBg || 'bg-emerald-100 text-emerald-800 border-emerald-300',
            active: category.active ?? true,
            display_order: category.display_order ?? 99
          }
        };
      }
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: {
        id: data.id || data.code,
        code: data.code,
        name: data.name,
        description: data.description || '',
        color: data.color || '#8CBF26',
        badgeBg: data.badge_bg || 'bg-brand/20 text-slate-900 border-brand',
        active: data.active ?? true,
        display_order: data.display_order ?? 1
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function updateFormCategoryInDb(
  id: string,
  updates: Partial<FormCategoryItem>
): Promise<{ success: boolean; data?: FormCategoryItem; error?: string }> {
  try {
    const payload: Record<string, any> = {
      updated_at: new Date().toISOString()
    };

    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.code !== undefined) payload.code = updates.code.trim();
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.color !== undefined) payload.color = updates.color;
    if (updates.badgeBg !== undefined) payload.badge_bg = updates.badgeBg;
    if (updates.active !== undefined) payload.active = updates.active;
    if (updates.display_order !== undefined) payload.display_order = updates.display_order;

    const { data, error } = await supabase
      .from('form_categories')
      .update(payload)
      .or(`id.eq.${id},code.eq.${id}`)
      .select('*')
      .maybeSingle();

    if (error) {
      if (error.message?.includes('schema cache') || error.message?.includes('form_categories') || error.code === '42P01' || error.code === 'PGRST102') {
        console.warn('Form categories PostgREST schema notice on update:', error.message);
        return {
          success: true,
          data: {
            id,
            code: updates.code || id,
            name: updates.name || id,
            description: updates.description,
            color: updates.color || '#8CBF26',
            badgeBg: updates.badgeBg || 'bg-slate-100 text-slate-800 border-slate-300',
            active: updates.active ?? true,
            display_order: updates.display_order ?? 1
          }
        };
      }
      return { success: false, error: error.message };
    }

    // If category code changed, also update any questions pointing to the old code
    if (updates.code && updates.code !== id) {
      await supabase
        .from('form_questions')
        .update({ category: updates.code })
        .eq('category', id);
    }

    const updatedCategory: FormCategoryItem = {
      id: data?.id || id,
      code: data?.code || updates.code || id,
      name: data?.name || updates.name || id,
      description: data?.description ?? updates.description ?? '',
      color: data?.color || updates.color || '#8CBF26',
      badgeBg: data?.badge_bg || updates.badgeBg || 'bg-slate-100 text-slate-800 border-slate-300',
      active: data?.active ?? updates.active ?? true,
      display_order: data?.display_order ?? updates.display_order ?? 1
    };

    return { success: true, data: updatedCategory };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function deleteFormCategoryInDb(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('form_categories')
      .delete()
      .or(`id.eq.${id},code.eq.${id}`);

    if (error) {
      if (error.message?.includes('schema cache') || error.message?.includes('form_categories') || error.code === '42P01' || error.code === 'PGRST102') {
        console.warn('Form categories PostgREST schema notice:', error.message);
        return { success: true };
      }
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * TEAMS Service
 */
export async function fetchTeamsFromDb(): Promise<Team[] | null> {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('name');

    if (error || !data) return null;

    return data.map((t: any) => ({
      id: t.id,
      name: t.name,
      code: t.code,
      department: t.department || 'Operações',
      supervisorName: t.supervisor_name,
      status: t.status || 'ACTIVE',
      membersCount: t.members_count || 0,
      createdAt: t.created_at ? t.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10)
    }));
  } catch {
    return null;
  }
}

export async function insertTeamInDb(team: Omit<Team, 'id' | 'createdAt'>): Promise<{ success: boolean; data?: Team; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('teams')
      .insert({
        name: team.name,
        code: team.code,
        department: team.department,
        supervisor_name: team.supervisorName || null,
        status: team.status || 'ACTIVE',
        members_count: team.membersCount || 0
      })
      .select('*')
      .single();

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: {
        id: data.id,
        name: data.name,
        code: data.code,
        department: data.department,
        supervisorName: data.supervisor_name,
        status: data.status,
        membersCount: data.members_count,
        createdAt: data.created_at?.substring(0, 10) || new Date().toISOString().substring(0, 10)
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function deleteTeamInDb(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * ACTIVITIES Service
 */
export async function fetchActivitiesFromDb(): Promise<Activity[] | null> {
  try {
    const { data, error } = await supabase
      .from('activities')
      .select('*, clients(company_name), services(name)')
      .order('activity_date', { ascending: false });

    if (error || !data) return null;

    return data.map((a: any) => ({
      id: a.id,
      title: a.title,
      description: a.description || undefined,
      clientId: a.client_id || undefined,
      clientName: a.clients?.company_name || undefined,
      serviceId: a.service_id || undefined,
      serviceName: a.services?.name || undefined,
      location: a.location,
      activityDate: a.activity_date,
      startTime: a.start_time,
      endTime: a.end_time,
      teamId: a.team_id || undefined,
      teamName: a.team_name || undefined,
      assignedProviderIds: a.assigned_provider_ids || [],
      supervisorName: a.supervisor_name || undefined,
      status: a.status || 'SCHEDULED'
    }));
  } catch {
    return null;
  }
}

export async function insertActivityInDb(activity: Omit<Activity, 'id'>): Promise<{ success: boolean; data?: Activity; error?: string }> {
  try {
    const payload = {
      title: activity.title,
      description: activity.description || null,
      client_id: activity.clientId || null,
      service_id: activity.serviceId || null,
      location: activity.location,
      activity_date: activity.activityDate,
      start_time: activity.startTime,
      end_time: activity.endTime,
      team_id: activity.teamId || null,
      team_name: activity.teamName || null,
      assigned_provider_ids: activity.assignedProviderIds || [],
      supervisor_name: activity.supervisorName || null,
      status: activity.status || 'SCHEDULED'
    };

    const { data, error } = await supabase
      .from('activities')
      .insert(payload)
      .select('*')
      .single();

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: {
        id: data.id,
        title: data.title,
        description: data.description,
        clientId: data.client_id,
        serviceId: data.service_id,
        location: data.location,
        activityDate: data.activity_date,
        startTime: data.start_time,
        endTime: data.end_time,
        teamId: data.team_id,
        teamName: data.team_name,
        assignedProviderIds: data.assigned_provider_ids,
        supervisorName: data.supervisor_name,
        status: data.status
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function deleteActivityInDb(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * WORKER NOTIFICATIONS Service
 */
export async function fetchWorkerNotificationsFromDb(): Promise<WorkerNotification[] | null> {
  try {
    const { data, error } = await supabase
      .from('worker_notifications')
      .select('*')
      .order('notified_at', { ascending: false });

    if (error || !data) return null;

    return data.map((n: any) => ({
      id: n.id,
      evaluationId: n.evaluation_id,
      evaluationReference: n.evaluation_reference,
      providerId: n.provider_id,
      providerName: n.provider_name,
      finalScore: Number(n.final_score),
      resultStatus: n.result_status,
      notifiedAt: n.notified_at ? n.notified_at.replace('T', ' ').substring(0, 19) : new Date().toISOString(),
      notifiedBy: n.notified_by,
      sharedFeedback: n.shared_feedback
    }));
  } catch {
    return null;
  }
}

export async function insertWorkerNotificationInDb(
  notif: Omit<WorkerNotification, 'id' | 'notifiedAt'>
): Promise<{ success: boolean; data?: WorkerNotification; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('worker_notifications')
      .insert({
        evaluation_id: notif.evaluationId,
        evaluation_reference: notif.evaluationReference,
        provider_id: notif.providerId,
        provider_name: notif.providerName || null,
        final_score: notif.finalScore,
        result_status: notif.resultStatus,
        notified_by: notif.notifiedBy,
        shared_feedback: notif.sharedFeedback || null
      })
      .select('*')
      .single();

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: {
        id: data.id,
        evaluationId: data.evaluation_id,
        evaluationReference: data.evaluation_reference,
        providerId: data.provider_id,
        providerName: data.provider_name,
        finalScore: Number(data.final_score),
        resultStatus: data.result_status,
        notifiedAt: data.notified_at ? data.notified_at.replace('T', ' ').substring(0, 19) : new Date().toISOString(),
        notifiedBy: data.notified_by,
        sharedFeedback: data.shared_feedback
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * PROVIDER PERMISSION AUDITS Service
 */
export async function fetchProviderPermissionAuditsFromDb(): Promise<ProviderPermissionAudit[] | null> {
  try {
    const { data, error } = await supabase
      .from('provider_permission_audits')
      .select('*')
      .order('changed_at', { ascending: false });

    if (error || !data) return null;

    return data.map((a: any) => ({
      id: a.id,
      providerId: a.provider_id,
      providerName: a.provider_name,
      previousState: a.previous_state,
      newState: a.new_state,
      changedBy: a.changed_by,
      changedAt: a.changed_at ? a.changed_at.replace('T', ' ').substring(0, 19) : new Date().toISOString(),
      reason: a.reason
    }));
  } catch {
    return null;
  }
}

export async function insertProviderPermissionAuditInDb(
  audit: Omit<ProviderPermissionAudit, 'id' | 'changedAt'>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('provider_permission_audits')
      .insert({
        provider_id: audit.providerId,
        provider_name: audit.providerName,
        previous_state: audit.previousState,
        new_state: audit.newState,
        changed_by: audit.changedBy,
        reason: audit.reason
      });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * SUBMIT EVALUATION VIA SOVEREIGN SERVER RPC (submit_evaluation)
 */
export async function submitEvaluationViaRpc(
  payload: any
): Promise<{ success: boolean; id?: string; reference?: string; status?: string; error?: string }> {
  try {
    const answersArray = Array.isArray(payload.answers) && payload.answers.length > 0
      ? payload.answers
      : payload.detailedAnswers
      ? Object.entries(payload.detailedAnswers).map(([qId, val]: [string, any]) => ({
          questionId: qId,
          rating: val.rating,
          textAnswer: val.textAnswer,
          audioUrl: val.audioUrl
        }))
      : [];

    const clientNameClean = (payload.clientNameInput || payload.clientName || '').trim();
    if (!clientNameClean || clientNameClean.length < 2) {
      return { success: false, error: 'Identificação da empresa cliente é obrigatória (mínimo 2 caracteres).' };
    }
    if (clientNameClean.length > 200) {
      return { success: false, error: 'Identificação da empresa cliente excede o limite máximo permitido de 200 caracteres.' };
    }

    const rawServiceId = payload.serviceId ? String(payload.serviceId).trim() : '';
    if (!rawServiceId) {
      return { success: false, error: 'É obrigatório selecionar um serviço válido. A avaliação não foi gravada.' };
    }
    if (!isValidUuid(rawServiceId)) {
      return { success: false, error: 'Identificador de serviço inválido (formato UUID esperado).' };
    }

    const sanitizedPayload = {
      ...payload,
      clientName: clientNameClean,
      clientNameInput: clientNameClean,
      clientId: isValidUuid(payload.clientId) ? payload.clientId : null,
      serviceId: rawServiceId,
      providerId: isValidUuid(payload.providerId) ? payload.providerId : null,
      audioRecordingUrl: payload.audioRecordingUrl ? payload.audioRecordingUrl : null,
      audioDurationSeconds: (payload.audioRecordingUrl && payload.audioDurationSeconds) ? Number(payload.audioDurationSeconds) : 0,
      answers: answersArray
    };

    // Tentar executar a função soberana validada de RPC da migração 005 / 009
    const { data, error } = await supabase.rpc('submit_evaluation', {
      p_payload: sanitizedPayload
    });

    if (!error && data && data.success) {
      return {
        success: true,
        id: data.id,
        reference: data.reference,
        status: data.status || 'PENDING_REVIEW'
      };
    }

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: 'Falha ao processar submissão.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro inesperado na submissão.' };
  }
}

/**
 * ASSOCIATE EVALUATION WITH OFFICIAL CLIENT (HR / ADMIN)
 */
export async function associateEvaluationClientViaRpc(
  evaluationId: string,
  clientId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    if (!isValidUuid(evaluationId)) {
      return { success: false, error: 'Identificador de avaliação inválido (formato UUID esperado).' };
    }
    if (!isValidUuid(clientId)) {
      return { success: false, error: 'Identificador de cliente inválido (formato UUID esperado).' };
    }

    // Execução estrita da procedure soberana associate_evaluation_client (sem fallback inseguro)
    const { data, error } = await supabase.rpc('associate_evaluation_client', {
      p_evaluation_id: evaluationId,
      p_client_id: clientId
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && data.success) {
      return { success: true, data };
    }

    return { success: false, error: data?.error || 'Falha ao associar cliente à avaliação.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de comunicação ao associar cliente.' };
  }
}

/**
 * ASSIGN EVALUATION TO OFFICIAL ACTIVE PROVIDER (HR / ADMIN / DIRECTOR)
 */
export async function assignEvaluationProviderViaRpc(
  evaluationId: string,
  providerId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    if (!isValidUuid(evaluationId)) {
      return { success: false, error: 'Identificador de avaliação inválido (formato UUID esperado).' };
    }
    if (!isValidUuid(providerId)) {
      return { success: false, error: 'Identificador de funcionário inválido (formato UUID esperado).' };
    }

    const { data, error } = await supabase.rpc('assign_evaluation_provider', {
      p_evaluation_id: evaluationId,
      p_provider_id: providerId
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && data.success) {
      return { success: true, data };
    }

    return { success: false, error: data?.error || 'Falha ao atribuir funcionário à avaliação.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro de comunicação ao atribuir funcionário.' };
  }
}

/**
 * AUDIO UPLOAD TO PRIVATE STORAGE BUCKET (evaluation-audio)
 */
export async function uploadEvaluationAudio(
  audioBlob: Blob
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const filename = `submissions/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.webm`;
    
    const { data, error } = await supabase.storage
      .from('evaluation-audio')
      .upload(filename, audioBlob, {
        contentType: audioBlob.type || 'audio/webm',
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, path: data.path };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro no envio do ficheiro de áudio.' };
  }
}

/**
 * UNFORGEABLE AUDIT LOGGING VIA SERVER RPC (log_system_audit)
 */
export async function logAuditActionViaRpc(
  operationType: string,
  affectedEntity: string,
  recordId?: string,
  result: string = 'SUCCESS',
  details: string = ''
): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_system_audit', {
      p_operation_type: operationType,
      p_affected_entity: affectedEntity,
      p_record_id: recordId || null,
      p_result: result,
      p_details: details
    });

    if (error) {
      // Sem fallback: a escrita direta gravaria um ator falso. A falha fica no servidor (RPC).
      return;
    }
  } catch {
    // Silencioso para não interromper fluxos críticos
  }
}

/**
 * EVALUATION CRITERIA & CONFIGURATION Service (Migration 004 Integration)
 */

export async function fetchEvaluationCriteriaFromDb(): Promise<EvaluationCriterion[] | null> {
  try {
    const { data, error } = await supabase
      .from('evaluation_criteria')
      .select('*')
      .order('display_order', { ascending: true });

    if (error || !data || data.length === 0) return null;

    return data.map((item: any) => ({
      id: item.id,
      categoryName: item.category_name || item.categoryName || 'Critério',
      description: item.description || '',
      weightPercentage: Number(item.weight_percentage ?? item.weightPercentage ?? 0),
      maxScore: Number(item.max_score ?? item.maxScore ?? 5),
      minScore: Number(item.min_score ?? item.minScore ?? 0),
      active: item.active ?? true,
      order: item.display_order ?? item.order ?? 1,
      updatedAt: item.updated_at,
      updatedBy: item.updated_by
    }));
  } catch {
    return null;
  }
}

export async function saveEvaluationCriteriaToDb(
  criteriaList: EvaluationCriterion[],
  updatedBy: string = 'Recursos Humanos'
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Invocar a procedure RPC oficial no Supabase (migração 004)
    const payload = criteriaList.map(c => ({
      id: c.id,
      categoryName: c.categoryName,
      description: c.description || '',
      weightPercentage: Number(c.weightPercentage),
      maxScore: Number(c.maxScore),
      minScore: Number(c.minScore ?? 0),
      active: !!c.active,
      order: Number(c.order || 1)
    }));

    const { data: rpcData, error: rpcError } = await supabase.rpc('save_evaluation_criteria', {
      p_criteria: payload
    });

    if (!rpcError && rpcData && rpcData.success) {
      return { success: true };
    }

    if (rpcError && rpcError.code !== '42883' && !rpcError.message.includes('not exist')) {
      return { success: false, error: rpcError.message };
    }

    // 2. Fallback directo na tabela evaluation_criteria
    const records = criteriaList.map(c => ({
      id: c.id,
      category_name: c.categoryName,
      description: c.description || null,
      weight_percentage: Number(c.weightPercentage),
      max_score: Number(c.maxScore),
      min_score: Number(c.minScore ?? 0),
      active: !!c.active,
      display_order: Number(c.order || 1),
      updated_at: new Date().toISOString(),
      updated_by: updatedBy
    }));

    const { error: upsertErr } = await supabase
      .from('evaluation_criteria')
      .upsert(records, { onConflict: 'id' });

    if (upsertErr) {
      return { success: false, error: upsertErr.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao gravar critérios no Supabase.' };
  }
}

export async function fetchCriteriaConfigurationFromDb(): Promise<{ passingThreshold: number } | null> {
  try {
    const { data, error } = await supabase
      .from('criteria_configurations')
      .select('passing_threshold')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return { passingThreshold: Number(data.passing_threshold) };
  } catch {
    return null;
  }
}

export async function savePassingThresholdToDb(
  threshold: number,
  updatedBy: string = 'Recursos Humanos'
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Invocar a procedure RPC oficial no Supabase (migração 004)
    const { data: rpcData, error: rpcError } = await supabase.rpc('set_criteria_passing_threshold', {
      p_passing_threshold: threshold
    });

    if (!rpcError && rpcData && rpcData.success) {
      return { success: true };
    }

    if (rpcError && rpcError.code !== '42883' && !rpcError.message.includes('not exist')) {
      return { success: false, error: rpcError.message };
    }

    // 2. Fallback na tabela criteria_configurations
    const { error } = await supabase
      .from('criteria_configurations')
      .insert({
        passing_threshold: threshold,
        is_active: true,
        updated_by: updatedBy,
        updated_at: new Date().toISOString()
      });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao gravar limiar no Supabase.' };
  }
}

/**
 * SQL Schema DDL ready to execute in the Supabase SQL Editor.
 */
export const SUPABASE_MIGRATION_SCHEMA_SQL = '-- Execute supabase/migrations/1000_producao_consolidada.sql no SQL Editor do Supabase, após backup.';

// ============================================================================
// MENSAGENS INTERNAS (conversas diretas e grupos, apenas entre membros)
// ============================================================================
export interface MessageRecipient { id: string; name: string; role: string; department: string; }
export interface ConversationMember { id: string; name: string; }
export interface ConversationSummary {
  id: string; kind: 'DIRECT' | 'GROUP'; title: string; createdBy?: string;
  members: ConversationMember[]; updatedAt: string; unread: number; lastBody?: string;
}
export interface ChatMessage { id: string; senderId?: string; senderName: string; body: string; createdAt: string; }

export async function fetchMessageRecipients(): Promise<MessageRecipient[]> {
  const { data, error } = await supabase.rpc('list_message_recipients');
  if (error || !data) return [];
  return (data as any[]).map(r => ({ id: r.id, name: r.name, role: r.role, department: r.department }));
}

export async function fetchConversations(meId: string, meName: string): Promise<ConversationSummary[]> {
  const { data: mine, error } = await supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at, conversations(id, kind, title, created_by, updated_at)')
    .eq('profile_id', meId);
  if (error || !mine || mine.length === 0) return [];

  const ids = (mine as any[]).map(m => m.conversation_id);
  const { data: members } = await supabase.from('conversation_members').select('conversation_id, profile_id').in('conversation_id', ids);
  const names = new Map<string, string>((await fetchMessageRecipients()).map(r => [r.id, r.name]));
  names.set(meId, meName);

  const out: ConversationSummary[] = [];
  for (const m of mine as any[]) {
    const conv = m.conversations;
    if (!conv) continue;
    const convMembers: ConversationMember[] = ((members as any[]) ?? [])
      .filter(x => x.conversation_id === conv.id)
      .map(x => ({ id: x.profile_id, name: names.get(x.profile_id) ?? 'Utilizador' }));
    const { data: last } = await supabase.from('messages').select('body').eq('conversation_id', conv.id)
      .order('created_at', { ascending: false }).limit(1);
    let unreadQuery = supabase.from('messages').select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id).neq('sender_id', meId);
    if (m.last_read_at) unreadQuery = unreadQuery.gt('created_at', m.last_read_at);
    const { count } = await unreadQuery;
    const other = convMembers.find(x => x.id !== meId);
    out.push({
      id: conv.id, kind: conv.kind, createdBy: conv.created_by ?? undefined,
      title: conv.kind === 'GROUP' ? (conv.title || 'Grupo') : (other?.name ?? 'Conversa'),
      members: convMembers, updatedAt: conv.updated_at, unread: count ?? 0,
      lastBody: (last as any[])?.[0]?.body,
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function fetchMessages(conversationId: string, meId: string, meName: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase.from('messages')
    .select('id, sender_id, body, created_at').eq('conversation_id', conversationId)
    .order('created_at', { ascending: false }).limit(200);
  if (error || !data) return [];
  const names = new Map<string, string>((await fetchMessageRecipients()).map(r => [r.id, r.name]));
  names.set(meId, meName);
  return (data as any[]).reverse().map(r => ({
    id: r.id, senderId: r.sender_id ?? undefined,
    senderName: r.sender_id ? (names.get(r.sender_id) ?? 'Utilizador') : 'Conta removida',
    body: r.body, createdAt: r.created_at,
  }));
}

export async function sendMessageInDb(conversationId: string, body: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc('send_message', { p_conversation_id: conversationId, p_body: body });
  return error ? { success: false, error: error.message } : { success: true };
}

export async function createConversationInDb(kind: 'DIRECT' | 'GROUP', title: string, memberIds: string[]): Promise<{ success: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('create_conversation', { p_kind: kind, p_title: title || null, p_member_ids: memberIds });
  return error ? { success: false, error: error.message } : { success: true, id: data as string };
}

export async function addGroupMembersInDb(conversationId: string, memberIds: string[]): Promise<{ success: boolean; added?: number; error?: string }> {
  const { data, error } = await supabase.rpc('add_group_members', { p_conversation_id: conversationId, p_member_ids: memberIds });
  return error ? { success: false, error: error.message } : { success: true, added: data as number };
}

export async function markConversationReadInDb(conversationId: string): Promise<void> {
  await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
}

// ============================================================================
// CONFIGURAÇÃO DE LOGIN (métodos aceites pelo sistema)
// ============================================================================
export interface LoginMethods { access_identifier: boolean; full_name: boolean; employee_number: boolean; email: boolean; }

export async function fetchLoginMethods(): Promise<LoginMethods> {
  const { data, error } = await supabase.rpc('get_login_methods');
  if (error || !data) return { access_identifier: true, full_name: true, employee_number: true, email: true };
  return data as LoginMethods;
}

export async function saveLoginMethodsInDb(methods: LoginMethods): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc('update_login_settings', { p_settings: methods });
  return error ? { success: false, error: error.message } : { success: true };
}

// ============================================================================
// METAS DE CLIENTES
// ============================================================================
const mapGoal = (r: any): ClientGoal => ({
  id: r.id, clientId: r.client_id, title: r.title, description: r.description || undefined,
  metric: r.metric, targetValue: Number(r.target_value), dueDate: r.due_date, status: r.status,
  achievedAt: r.achieved_at || undefined, createdBy: r.created_by || undefined, createdAt: r.created_at,
});

export async function fetchClientGoals(): Promise<ClientGoal[]> {
  const { data, error } = await supabase.from('client_goals').select('*').order('due_date', { ascending: true });
  if (error || !data) return [];
  return (data as any[]).map(mapGoal);
}

export async function saveClientGoalInDb(
  goal: { id?: string; clientId: string; title: string; description?: string; metric: GoalMetric; targetValue: number; dueDate: string; status?: GoalStatus },
  createdBy: string
): Promise<{ success: boolean; error?: string }> {
  const payload: Record<string, unknown> = {
    client_id: goal.clientId, title: goal.title.trim(), description: goal.description?.trim() || null,
    metric: goal.metric, target_value: goal.targetValue, due_date: goal.dueDate, updated_at: new Date().toISOString(),
  };
  if (goal.status) payload.status = goal.status;
  if (goal.status === 'CONCLUIDA') payload.achieved_at = new Date().toISOString();
  const res = goal.id
    ? await supabase.from('client_goals').update(payload).eq('id', goal.id)
    : await supabase.from('client_goals').insert({ ...payload, created_by: createdBy });
  return res.error ? { success: false, error: res.error.message } : { success: true };
}

export async function setClientGoalStatusInDb(id: string, status: GoalStatus): Promise<{ success: boolean; error?: string }> {
  const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString(), achieved_at: status === 'CONCLUIDA' ? new Date().toISOString() : null };
  const { error } = await supabase.from('client_goals').update(payload).eq('id', id);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function deleteClientGoalInDb(id: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('client_goals').delete().eq('id', id);
  return error ? { success: false, error: error.message } : { success: true };
}

/**
 * @file employeesService.ts
 * @description Camada de Serviços para Funcionários, Dossiê Documental e Perfis de Acesso.
 * Sistema: SICSC — AETERNU LDA.
 * 
 * Separação Arquitetural:
 * - Operações de Leitura: Diretas contra o Supabase com Row Level Security (RLS).
 * - Operações Privilegiadas (Criação de Contas, Ativação, Reset de Senha): Mediadas pela Edge Function 'admin-employees'.
 * - Dossiê Privado: Armazenamento no bucket 'employee-documents' e URLs temporárias assinadas (300s).
 */

import { supabase, isSupabaseConfigured } from './supabaseService';
import { UserRole } from '../types';

export type EmployeeCategory = 'TECNICO' | 'SUPERVISOR' | 'ADMINISTRATIVO' | 'GESTAO' | 'DIRECAO' | 'OUTRO';
export type ProfessionalStatus = 'ATIVO' | 'FERIAS' | 'LICENCA' | 'SUSPENSO' | 'INATIVO' | 'DESLIGADO';
export type AccountStatus = 'SEM_ACESSO' | 'ATIVA' | 'DESATIVADA' | 'BLOQUEADA';
export type DocumentType = 'BI' | 'CV' | 'FOTO' | 'CONTRATO' | 'CERTIFICADO' | 'CARTA_CONDUCAO' | 'REGISTO_CRIMINAL' | 'ATESTADO_MEDICO' | 'OUTRO';
export type DocumentStatus = 'VALIDO' | 'EXPIRADO' | 'SUBSTITUIDO' | 'ARQUIVADO';

export interface EmployeePersonalData {
  birthDate?: string;
  gender?: string;
  maritalStatus?: string;
  nationality?: string;
  biNumber?: string;
  nif?: string;
}

export interface EmployeeContacts {
  phone?: string;
  contactEmail?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface EmployeeProfessionalData {
  jobTitle?: string;
  department?: string;
  teamId?: string;
  teamName?: string;
  supervisorId?: string;
  supervisorName?: string;
  contractType?: string;
  admissionDate?: string;
  departureDate?: string;
  specialty?: string;
  notes?: string;
  /** Salário base em Kz (opcional; visível apenas a RH/Administração e ao próprio colaborador). */
  salary?: number;
}

export interface Employee {
  id: string;
  employeeNumber: string;
  fullName: string;
  accessIdentifier?: string;
  category: EmployeeCategory;
  personalData: EmployeePersonalData;
  contacts: EmployeeContacts;
  professionalData: EmployeeProfessionalData;
  accessProfileId?: string;
  accessProfileName?: string;
  baseRole?: UserRole;
  extraPages: string[];
  revokedPages: string[];
  professionalStatus: ProfessionalStatus;
  accountStatus: AccountStatus;
  userId?: string;
  mustChangePassword: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccessProfile {
  id: string;
  name: string;
  description: string;
  baseRole: UserRole;
  pages: string[];
  isSystem: boolean;
  isActive: boolean;
  employeesCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  documentType: DocumentType;
  originalFilename: string;
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
  expiryDate?: string;
  uploadedAt: string;
  uploadedBy: string;
  status: DocumentStatus;
}

export interface MyAccessResult {
  authenticated: boolean;
  baseRole: UserRole | null;
  pages: string[];
  mustChangePassword: boolean;
  accountStatus: AccountStatus;
  professionalStatus?: ProfessionalStatus;
  employeeId: string | null;
}

export interface FetchEmployeesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  department?: string;
  status?: string;
  profileId?: string;
}

export interface CreateEmployeePayload {
  fullName: string;
  category: EmployeeCategory;
  employeeNumber?: string;
  allowedPages?: string[];
  accessProfileId?: string;
  accessIdentifier?: string;
  initialPassword?: string;
  createSystemAccount: boolean;
  personalData?: EmployeePersonalData;
  contacts?: EmployeeContacts;
  professionalData?: EmployeeProfessionalData;
}

export interface UpdateEmployeePayload {
  fullName?: string;
  category?: EmployeeCategory;
  personalData?: EmployeePersonalData;
  contacts?: EmployeeContacts;
  professionalData?: EmployeeProfessionalData;
  professionalStatus?: ProfessionalStatus;
}

export const DEFAULT_ACCESS_PROFILES: AccessProfile[] = [
  {
    id: 'ap-admin',
    name: 'Administração Geral & HST',
    description: 'Acesso total a todas as funcionalidades técnicas, de gestão e parametrização do sistema.',
    baseRole: 'ADMIN',
    pages: ['dashboard', 'clients', 'calendar', 'services', 'providers', 'evaluations', 'evaluation_analysis', 'form_editor', 'hr', 'employees', 'access_profiles', 'reports', 'users', 'audit', 'messages', 'settings'],
    isSystem: true,
    isActive: true,
    employeesCount: 1,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  },
  {
    id: 'ap-hr',
    name: 'Recursos Humanos & Homologação',
    description: 'Gestão de colaboradores, processos disciplinares e homologação técnica de avaliações.',
    baseRole: 'HR',
    pages: ['dashboard', 'evaluations', 'evaluation_analysis', 'form_editor', 'hr', 'employees', 'reports', 'messages'],
    isSystem: true,
    isActive: true,
    employeesCount: 1,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  },
  {
    id: 'ap-director',
    name: 'Direção Executiva & Estratégica',
    description: 'Supervisão de relatórios executivos, metas contratuais e satisfação corporativa.',
    baseRole: 'DIRECTOR',
    pages: ['dashboard', 'clients', 'services', 'providers', 'evaluations', 'reports', 'messages'],
    isSystem: true,
    isActive: true,
    employeesCount: 1,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  },
  {
    id: 'ap-operational',
    name: 'Supervisão e Agendamento de Terreno',
    description: 'Gestão de clientes, cronograma de intervenções, turnos e alocação de equipas.',
    baseRole: 'OPERATIONAL',
    pages: ['dashboard', 'clients', 'calendar', 'services', 'providers', 'evaluations', 'messages'],
    isSystem: true,
    isActive: true,
    employeesCount: 1,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  },
  {
    id: 'ap-provider',
    name: 'Técnico de Terreno & Prestador',
    description: 'Acesso às avaliações atribuídas e comunicação interna.',
    baseRole: 'PROVIDER',
    pages: ['dashboard', 'evaluations', 'messages'],
    isSystem: true,
    isActive: true,
    employeesCount: 4,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  }
];

export const DEFAULT_EMPLOYEES: Employee[] = [
  {
    id: 'emp-001',
    employeeNumber: 'AET-001',
    fullName: 'Dr. António Silva',
    accessIdentifier: 'antonio.silva',
    category: 'GESTAO',
    personalData: { biNumber: '003418291LA042', nif: '5401123901', nationality: 'Angolana' },
    contacts: { phone: '+244 923 111 222', contactEmail: 'antonio.silva@aeternu.co.ao', address: 'Luanda, Angola' },
    professionalData: { jobTitle: 'Administrador do Sistema & Diretor Geral', department: 'Direção Geral', admissionDate: '2023-01-15' },
    accessProfileId: 'ap-admin',
    accessProfileName: 'Administração Geral & HST',
    baseRole: 'ADMIN',
    extraPages: [],
    revokedPages: [],
    professionalStatus: 'ATIVO',
    accountStatus: 'ATIVA',
    mustChangePassword: false,
    lastLoginAt: '2026-11-01 08:30:00',
    createdAt: '2023-01-15',
    updatedAt: '2026-11-01'
  },
  {
    id: 'emp-002',
    employeeNumber: 'AET-002',
    fullName: 'Dra. Maria Fernandes',
    accessIdentifier: 'maria.fernandes',
    category: 'ADMINISTRATIVO',
    personalData: { biNumber: '002918472LA031', nif: '5408892110', nationality: 'Angolana' },
    contacts: { phone: '+244 912 333 444', contactEmail: 'maria.fernandes@aeternu.co.ao', address: 'Luanda, Angola' },
    professionalData: { jobTitle: 'Gestora de Recursos Humanos & Qualidade', department: 'Recursos Humanos', admissionDate: '2023-03-01' },
    accessProfileId: 'ap-hr',
    accessProfileName: 'Recursos Humanos & Homologação',
    baseRole: 'HR',
    extraPages: [],
    revokedPages: [],
    professionalStatus: 'ATIVO',
    accountStatus: 'ATIVA',
    mustChangePassword: false,
    lastLoginAt: '2026-11-01 08:00:00',
    createdAt: '2023-03-01',
    updatedAt: '2026-11-01'
  },
  {
    id: 'emp-003',
    employeeNumber: 'AET-003',
    fullName: 'Eng. Carlos Ferreira',
    accessIdentifier: 'carlos.ferreira',
    category: 'DIRECAO',
    personalData: { biNumber: '004182910LA045', nif: '5412239014', nationality: 'Angolana' },
    contacts: { phone: '+244 924 555 666', contactEmail: 'carlos.ferreira@aeternu.co.ao', address: 'Luanda, Angola' },
    professionalData: { jobTitle: 'Diretor de Operações e HST', department: 'Direção Executiva', admissionDate: '2023-02-01' },
    accessProfileId: 'ap-director',
    accessProfileName: 'Direção Executiva & Estratégica',
    baseRole: 'DIRECTOR',
    extraPages: [],
    revokedPages: [],
    professionalStatus: 'ATIVO',
    accountStatus: 'ATIVA',
    mustChangePassword: false,
    lastLoginAt: '2026-10-31 17:00:00',
    createdAt: '2023-02-01',
    updatedAt: '2026-10-31'
  },
  {
    id: 'emp-004',
    employeeNumber: 'AET-004',
    fullName: 'Paulo Sousa',
    accessIdentifier: 'paulo.sousa',
    category: 'SUPERVISOR',
    personalData: { biNumber: '001928471LA029', nif: '5403348192', nationality: 'Angolana' },
    contacts: { phone: '+244 931 777 888', contactEmail: 'paulo.sousa@aeternu.co.ao', address: 'Luanda, Angola' },
    professionalData: { jobTitle: 'Supervisor de Operações de Terreno', department: 'Operações', admissionDate: '2023-05-10' },
    accessProfileId: 'ap-operational',
    accessProfileName: 'Supervisão e Agendamento de Terreno',
    baseRole: 'OPERATIONAL',
    extraPages: [],
    revokedPages: [],
    professionalStatus: 'ATIVO',
    accountStatus: 'ATIVA',
    mustChangePassword: false,
    lastLoginAt: '2026-10-30 09:15:00',
    createdAt: '2023-05-10',
    updatedAt: '2026-10-30'
  },
  {
    id: 'emp-005',
    employeeNumber: 'AET-005',
    fullName: 'Mateus Domingos',
    accessIdentifier: 'mateus.domingos',
    category: 'TECNICO',
    personalData: { biNumber: '005829103LA039', nif: '5410982341', nationality: 'Angolana' },
    contacts: { phone: '+244 923 456 781', contactEmail: 'mateus.domingos@aeternu.co.ao', address: 'Luanda, Angola' },
    professionalData: { jobTitle: 'Técnico Especialista em Desinfestação e HST', department: 'Equipa Técnica Alfa', admissionDate: '2024-02-10' },
    accessProfileId: 'ap-provider',
    accessProfileName: 'Técnico de Terreno & Prestador',
    baseRole: 'PROVIDER',
    extraPages: [],
    revokedPages: [],
    professionalStatus: 'ATIVO',
    accountStatus: 'ATIVA',
    mustChangePassword: false,
    lastLoginAt: '2026-11-01 07:45:00',
    createdAt: '2024-02-10',
    updatedAt: '2026-11-01'
  }
];

// Decisão de projeto: nenhum dado do sistema fica no navegador. Funções inertes (ramos legados inalcançáveis).
function getEmpStore<T>(_key: string, def: T): T { return def; }
function setEmpStore<T>(_key: string, _val: T): void { /* intencionalmente vazio */ }

// ----------------------------------------------------------------------------
// 1. CONSULTA E GESTÃO DE ACESSO SOBERANO (RPC)
// ----------------------------------------------------------------------------

/**
 * Invoca a procedure SQL soberana get_my_access() para recuperar o acesso efetivo do utilizador.
 */
export async function getMyAccess(): Promise<MyAccessResult> {
  if (!isSupabaseConfigured) {
    return { authenticated: false, baseRole: null, pages: [], mustChangePassword: false, accountStatus: 'SEM_ACESSO', employeeId: null };
  }
  try {
    const { data, error } = await supabase.rpc('get_my_access');
    if (error || !data) {
      return {
        authenticated: false,
        baseRole: null,
        pages: [],
        mustChangePassword: false,
        accountStatus: 'SEM_ACESSO',
        employeeId: null
      };
    }

    const pages = Array.isArray(data.pages) ? data.pages : [];
    return {
      authenticated: Boolean(data.authenticated),
      baseRole: data.base_role || null,
      pages,
      mustChangePassword: Boolean(data.must_change_password),
      accountStatus: data.account_status || 'SEM_ACESSO',
      professionalStatus: data.professional_status,
      employeeId: data.employee_id || null
    };
  } catch (err) {
    console.error('Falha ao obter my_access:', err);
    return {
      authenticated: false,
      baseRole: null,
      pages: [],
      mustChangePassword: false,
      accountStatus: 'SEM_ACESSO',
      employeeId: null
    };
  }
}

/**
 * Verifica se a sessão atual tem permissão efetiva para uma página específica.
 */
export async function hasPage(pageKey: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { data, error } = await supabase.rpc('has_page', { p_page_key: pageKey });
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

/**
 * Atualiza o marcador de último login do colaborador autenticado.
 */
export async function touchLastLogin(): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  try {
    const { data, error } = await supabase.rpc('touch_last_login');
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// 2. CONSULTAS DE FUNCIONÁRIOS (LEITURA RLS)
// ----------------------------------------------------------------------------

/**
 * Lista colaboradores com suporte a paginação no servidor, pesquisa e filtros.
 */
export async function fetchEmployees(params: FetchEmployeesParams = {}): Promise<{
  employees: Employee[];
  totalCount: number;
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    let list = getEmpStore('employees', DEFAULT_EMPLOYEES);
    if (params.search && params.search.trim()) {
      const s = params.search.trim().toLowerCase();
      list = list.filter(e =>
        e.fullName.toLowerCase().includes(s) ||
        e.employeeNumber.toLowerCase().includes(s) ||
        (e.accessIdentifier && e.accessIdentifier.toLowerCase().includes(s))
      );
    }
    if (params.category && params.category !== 'all') {
      list = list.filter(e => e.category === params.category);
    }
    if (params.status && params.status !== 'all') {
      list = list.filter(e => e.professionalStatus === params.status);
    }
    return { employees: list, totalCount: list.length };
  }
  try {
    const page = params.page || 1;
    const pageSize = params.pageSize || 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('employees')
      .select('*, access_profiles(name, base_role)', { count: 'exact' });

    if (params.search && params.search.trim()) {
      const s = params.search.trim().toLowerCase();
      query = query.or(`full_name.ilike.%${s}%,employee_number.ilike.%${s}%,access_identifier.ilike.%${s}%`);
    }

    if (params.category && params.category !== 'all') {
      query = query.eq('category', params.category);
    }

    if (params.status && params.status !== 'all') {
      query = query.eq('professional_status', params.status);
    }

    if (params.profileId && params.profileId !== 'all') {
      query = query.eq('access_profile_id', params.profileId);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      const fallbackList = getEmpStore('employees', DEFAULT_EMPLOYEES);
      return { employees: fallbackList, totalCount: fallbackList.length };
    }

    const employees: Employee[] = (data || []).map((row: any) => ({
      id: row.id,
      employeeNumber: row.employee_number,
      fullName: row.full_name,
      accessIdentifier: row.access_identifier,
      category: row.category,
      personalData: row.personal_data || {},
      contacts: row.contacts || {},
      professionalData: row.professional_data || {},
      accessProfileId: row.access_profile_id,
      accessProfileName: row.access_profiles?.name,
      baseRole: row.access_profiles?.base_role,
      extraPages: row.allowed_pages || [],
      revokedPages: [],
      professionalStatus: row.professional_status,
      accountStatus: row.account_status,
      userId: row.user_id,
      mustChangePassword: Boolean(row.must_change_password),
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return { employees, totalCount: count || 0 };
  } catch (err: any) {
    return { employees: [], totalCount: 0, error: err?.message || 'Erro de rede ao carregar colaboradores.' };
  }
}

/**
 * Consulta o dossiê e os dados completos de um funcionário por ID.
 */
export async function fetchEmployeeById(id: string): Promise<{
  employee: Employee | null;
  documents: EmployeeDocument[];
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    const list = getEmpStore('employees', DEFAULT_EMPLOYEES);
    const found = list.find(e => e.id === id) || null;
    return { employee: found, documents: [] };
  }
  try {
    const { data: empData, error: empErr } = await supabase
      .from('employees')
      .select('*, access_profiles(name, base_role)')
      .eq('id', id)
      .maybeSingle();

    if (empErr || !empData) {
      return { employee: null, documents: [], error: empErr?.message || 'Colaborador não encontrado.' };
    }

    const { data: docsData } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('employee_id', id)
      .order('uploaded_at', { ascending: false });

    const employee: Employee = {
      id: empData.id,
      employeeNumber: empData.employee_number,
      fullName: empData.full_name,
      accessIdentifier: empData.access_identifier,
      category: empData.category,
      personalData: empData.personal_data || {},
      contacts: empData.contacts || {},
      professionalData: empData.professional_data || {},
      accessProfileId: empData.access_profile_id,
      accessProfileName: empData.access_profiles?.name,
      baseRole: empData.access_profiles?.base_role,
      extraPages: empData.allowed_pages || [],
      revokedPages: [],
      professionalStatus: empData.professional_status,
      accountStatus: empData.account_status,
      userId: empData.user_id,
      mustChangePassword: Boolean(empData.must_change_password),
      lastLoginAt: empData.last_login_at,
      createdAt: empData.created_at,
      updatedAt: empData.updated_at
    };

    const documents: EmployeeDocument[] = (docsData || []).map((d: any) => ({
      id: d.id,
      employeeId: d.employee_id,
      documentType: d.document_type,
      originalFilename: d.original_filename,
      storagePath: d.storage_path,
      fileSizeBytes: Number(d.file_size_bytes),
      mimeType: d.mime_type,
      expiryDate: d.expiry_date,
      uploadedAt: d.uploaded_at,
      uploadedBy: d.uploaded_by,
      status: d.status
    }));

    return { employee, documents };
  } catch (err: any) {
    return { employee: null, documents: [], error: err?.message || 'Erro ao carregar detalhes do colaborador.' };
  }
}

// ----------------------------------------------------------------------------
// 3. CONSULTA E GESTÃO DE PERFIS DE ACESSO
// ----------------------------------------------------------------------------

/**
 * Consulta a lista de perfis de acesso registados.
 */
export async function fetchAccessProfiles(): Promise<AccessProfile[]> {
  if (!isSupabaseConfigured) {
    return getEmpStore('access_profiles', DEFAULT_ACCESS_PROFILES);
  }
  try {
    const { data, error } = await supabase
      .from('access_profiles')
      .select('*')
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });

    if (error || !data) return getEmpStore('access_profiles', DEFAULT_ACCESS_PROFILES);

    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      baseRole: row.base_role,
      pages: row.pages || [],
      isSystem: Boolean(row.is_system),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  } catch (err) {
    console.error('Falha ao listar perfis de acesso:', err);
    return getEmpStore('access_profiles', DEFAULT_ACCESS_PROFILES);
  }
}

/**
 * Criação ou duplicação de um perfil de acesso.
 */
export async function createAccessProfile(profile: {
  name: string;
  description: string;
  baseRole: UserRole;
  pages: string[];
}): Promise<{ success: boolean; profile?: AccessProfile; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('access_profiles')
      .insert({
        name: profile.name.trim(),
        description: profile.description.trim(),
        base_role: profile.baseRole,
        pages: profile.pages,
        is_system: false,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      profile: {
        id: data.id,
        name: data.name,
        description: data.description,
        baseRole: data.base_role,
        pages: data.pages || [],
        isSystem: data.is_system,
        isActive: data.is_active,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao criar perfil de acesso.' };
  }
}

/**
 * Atualiza um perfil de acesso existente.
 */
export async function updateAccessProfile(
  id: string,
  updates: Partial<Pick<AccessProfile, 'name' | 'description' | 'baseRole' | 'pages' | 'isActive'>>
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (updates.description !== undefined) payload.description = updates.description.trim();
    if (updates.baseRole !== undefined) payload.base_role = updates.baseRole;
    if (updates.pages !== undefined) payload.pages = updates.pages;
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;

    const { error } = await supabase
      .from('access_profiles')
      .update(payload)
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao atualizar perfil de acesso.' };
  }
}

/**
 * Elimina um perfil de acesso, validando se é de sistema ou se está em uso por funcionários.
 */
export async function deleteAccessProfile(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Verificar se é perfil de sistema
    const { data: profile, error: pErr } = await supabase
      .from('access_profiles')
      .select('is_system, name')
      .eq('id', id)
      .single();

    if (pErr || !profile) {
      return { success: false, error: 'Perfil de acesso não encontrado.' };
    }

    if (profile.is_system) {
      return { success: false, error: `O perfil de sistema "${profile.name}" está protegido e não pode ser eliminado.` };
    }

    // 2. Verificar se existem funcionários associados
    const { count, error: countErr } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('access_profile_id', id);

    if (!countErr && count && count > 0) {
      return { success: false, error: `Impossível eliminar o perfil pois existem ${count} funcionário(s) associados. Transfira os funcionários para outro perfil antes de eliminar.` };
    }

    // 3. Eliminar do Supabase
    const { error: delErr } = await supabase
      .from('access_profiles')
      .delete()
      .eq('id', id);

    if (delErr) {
      return { success: false, error: delErr.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao eliminar perfil de acesso.' };
  }
}

// ----------------------------------------------------------------------------
// 4. OPERAÇÕES ADMINISTRATIVAS (VIA EDGE FUNCTION 'admin-employees')
// ----------------------------------------------------------------------------

/**
 * Função genérica para invocar a Edge Function com o token da sessão ativa.
 */
export async function callAdminEmployeesFunction(action: string, data: any): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    const employees = getEmpStore('employees', DEFAULT_EMPLOYEES);
    if (action === 'create_employee') {
      const newId = `emp-${Date.now()}`;
      const newEmp: Employee = {
        id: newId,
        employeeNumber: data.employeeNumber || `AET-${Math.floor(100 + Math.random() * 900)}`,
        fullName: data.fullName,
        accessIdentifier: data.accessIdentifier,
        category: data.category || 'ADMINISTRATIVO',
        personalData: data.personalData || {},
        contacts: data.contacts || {},
        professionalData: data.professionalData || {},
        accessProfileId: data.accessProfileId || 'ap-admin',
        accessProfileName: 'Perfil Administrador',
        baseRole: 'ADMIN',
        extraPages: data.allowedPages || [],
        revokedPages: [],
        professionalStatus: 'ATIVO',
        accountStatus: 'ATIVA',
        mustChangePassword: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setEmpStore('employees', [newEmp, ...employees]);
      return { success: true, data: { employee: newEmp } };
    }
    if (action === 'update_employee') {
      const empId = data.employeeId;
      const updates = data.updates;
      const updated = employees.map(e => e.id === empId ? { ...e, ...updates, updatedAt: new Date().toISOString() } : e);
      setEmpStore('employees', updated);
      const found = updated.find(e => e.id === empId);
      return { success: true, data: { employee: found } };
    }
    if (action === 'set_account_status') {
      const updated = employees.map(e => e.id === data.employeeId ? { ...e, accountStatus: data.status, updatedAt: new Date().toISOString() } : e);
      setEmpStore('employees', updated);
      return { success: true };
    }
    if (action === 'update_access') {
      const updated = employees.map(e => e.id === data.employeeId ? { ...e, extraPages: data.allowedPages, updatedAt: new Date().toISOString() } : e);
      setEmpStore('employees', updated);
      return { success: true };
    }
    if (action === 'reset_password') {
      return { success: true };
    }
    if (action === 'change_identifier') {
      const updated = employees.map(e => e.id === data.employeeId ? { ...e, accessIdentifier: data.newIdentifier, updatedAt: new Date().toISOString() } : e);
      setEmpStore('employees', updated);
      return { success: true, data: { normalizedId: data.newIdentifier } };
    }
    return { success: true, data: {} };
  }
  try {
    const { data: resData, error } = await supabase.functions.invoke('admin-employees', {
      body: { action, data }
    });

    if (error) {
      return { success: false, error: await describeAdminFunctionError(error) };
    }

    if (resData?.error) {
      return { success: false, error: resData.error };
    }

    return { success: true, data: resData };
  } catch (err: any) {
    return { success: false, error: await describeAdminFunctionError(err) };
  }
}

/**
 * Traduz um erro de supabase.functions.invoke numa mensagem útil.
 * Em respostas não-2xx o supabase-js só devolve "Edge Function returned a non-2xx status code";
 * a mensagem real enviada pela função (ex.: "A palavra-passe inicial deve ter...") vem no corpo
 * da resposta (error.context) e tem de ser lida aqui, senão o utilizador nunca a vê.
 */
async function describeAdminFunctionError(error: any): Promise<string> {
  const ctx = error?.context;
  if (ctx && typeof ctx.status === 'number') {
    let serverMsg = '';
    try {
      const body = await (typeof ctx.clone === 'function' ? ctx.clone() : ctx).json();
      serverMsg = String(body?.error ?? body?.message ?? '');
    } catch {
      /* corpo vazio ou não JSON */
    }
    if (ctx.status === 404) {
      return 'A função administrativa (admin-employees) não está publicada neste projeto do Supabase.';
    }
    if (ctx.status === 401 && /invalid jwt/i.test(serverMsg)) {
      return 'O Supabase recusou a sessão antes de chegar à função (Invalid JWT). Publique a função admin-employees com --no-verify-jwt.';
    }
    if (ctx.status === 401) {
      return serverMsg || 'Sessão inválida ou expirada. Termine a sessão e entre novamente.';
    }
    if (serverMsg) return serverMsg;
    return `A função administrativa respondeu com o erro ${ctx.status}.`;
  }
  if (error?.name === 'FunctionsFetchError') {
    return 'Não foi possível contactar a função administrativa. Confirme que admin-employees está publicada e que o segredo ALLOWED_ORIGINS inclui o endereço deste site.';
  }
  return error?.message || 'Falha ao executar operação administrativa.';
}

export async function checkEmployeeDuplicates(params: {
  employeeNumber?: string;
  accessIdentifier?: string;
  biNumber?: string;
  email?: string;
  excludeId?: string;
}): Promise<{
  hasDuplicate: boolean;
  duplicateField?: string;
  message?: string;
}> {
  if (!isSupabaseConfigured) {
    const list = getEmpStore('employees', DEFAULT_EMPLOYEES);
    if (params.employeeNumber) {
      const num = params.employeeNumber.trim().toLowerCase();
      if (list.some(e => e.id !== params.excludeId && e.employeeNumber.toLowerCase() === num)) {
        return { hasDuplicate: true, duplicateField: 'employeeNumber', message: `Já existe um funcionário registado com o número interno "${params.employeeNumber}".` };
      }
    }
    if (params.accessIdentifier) {
      const id = params.accessIdentifier.trim().toLowerCase();
      if (list.some(e => e.id !== params.excludeId && (e.accessIdentifier || '').toLowerCase() === id)) {
        return { hasDuplicate: true, duplicateField: 'accessIdentifier', message: `Já existe um funcionário com o identificador de acesso "${params.accessIdentifier}".` };
      }
    }
    return { hasDuplicate: false };
  }
  try {
    // 1. Verificar número de funcionário
    if (params.employeeNumber && params.employeeNumber.trim()) {
      const cleanNum = params.employeeNumber.trim();
      let query = supabase.from('employees').select('id, employee_number').ilike('employee_number', cleanNum);
      if (params.excludeId) query = query.neq('id', params.excludeId);
      const { data, error } = await query.limit(1);
      if (!error && data && data.length > 0) {
        return {
          hasDuplicate: true,
          duplicateField: 'employeeNumber',
          message: `Já existe um funcionário registado com o número interno "${cleanNum}".`
        };
      }
    }

    // 2. Verificar identificador de acesso
    if (params.accessIdentifier && params.accessIdentifier.trim()) {
      const cleanId = params.accessIdentifier.trim().toLowerCase();
      let query = supabase.from('employees').select('id, access_identifier').ilike('access_identifier', cleanId);
      if (params.excludeId) query = query.neq('id', params.excludeId);
      const { data, error } = await query.limit(1);
      if (!error && data && data.length > 0) {
        return {
          hasDuplicate: true,
          duplicateField: 'accessIdentifier',
          message: `Já existe um funcionário com o identificador de acesso "${cleanId}".`
        };
      }
    }

    // 3. Verificar BI no personal_data
    if (params.biNumber && params.biNumber.trim()) {
      const cleanBI = params.biNumber.trim().toUpperCase();
      let query = supabase.from('employees').select('id, personal_data');
      if (params.excludeId) query = query.neq('id', params.excludeId);
      const { data, error } = await query;
      if (!error && data) {
        const found = data.find((row: any) => {
          const bi = row.personal_data?.biNumber;
          return bi && bi.toString().trim().toUpperCase() === cleanBI;
        });
        if (found) {
          return {
            hasDuplicate: true,
            duplicateField: 'biNumber',
            message: `Já existe um colaborador registado com o Bilhete de Identidade "${cleanBI}".`
          };
        }
      }
    }

    // 4. Verificar email no contacts ou nos prestadores para evitar duplicados entre funcionários e prestadores
    if (params.email && params.email.trim()) {
      const cleanEmail = params.email.trim().toLowerCase();
      const { data: provData } = await supabase
        .from('providers')
        .select('id, name, professional_email')
        .ilike('professional_email', cleanEmail)
        .limit(1);
      if (provData && provData.length > 0) {
        return {
          hasDuplicate: true,
          duplicateField: 'email',
          message: `O endereço de e-mail (${cleanEmail}) já se encontra associado ao prestador técnico "${provData[0].name}".`
        };
      }
    }

    return { hasDuplicate: false };
  } catch (err: any) {
    console.warn('Erro ao verificar duplicados:', err);
    return { hasDuplicate: false };
  }
}

/** Converte uma linha da tabela employees no modelo do frontend. */
export function mapEmployeeRow(data: any): Employee {
  return {
    id: data.id,
    employeeNumber: data.employee_number,
    fullName: data.full_name,
    accessIdentifier: data.access_identifier || undefined,
    category: data.category,
    personalData: data.personal_data || {},
    contacts: data.contacts || {},
    professionalData: data.professional_data || {},
    accessProfileId: data.access_profile_id || undefined,
    extraPages: data.allowed_pages || [],
    revokedPages: [],
    professionalStatus: data.professional_status,
    accountStatus: data.account_status,
    userId: data.user_id || undefined,
    mustChangePassword: Boolean(data.must_change_password),
    lastLoginAt: data.last_login_at || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Criação de colaborador (com ou sem conta). Passa SEMPRE pela Edge Function:
 * validação, papel de dados e conta são decididos no servidor. Não há inserção direta.
 */
export async function createEmployee(payload: CreateEmployeePayload): Promise<{
  success: boolean;
  employee?: Employee;
  error?: string;
}> {
  const res = await callAdminEmployeesFunction('create_employee', payload);
  if (!res.success) return { success: false, error: res.error };
  return { success: true, employee: mapEmployeeRow(res.data?.employee) };
}

export async function createEmployeeViaAdmin(payload: CreateEmployeePayload): Promise<{
  success: boolean;
  employee?: Employee;
  error?: string;
}> {
  const res = await callAdminEmployeesFunction('create_employee', payload);
  if (!res.success) return { success: false, error: res.error };
  return { success: true, employee: res.data?.employee };
}

export async function updateEmployeeViaAdmin(employeeId: string, updates: UpdateEmployeePayload): Promise<{
  success: boolean;
  employee?: Employee;
  error?: string;
}> {
  const res = await callAdminEmployeesFunction('update_employee', { employeeId, updates });
  if (!res.success) return { success: false, error: res.error };
  return { success: true, employee: res.data?.employee ? mapEmployeeRow(res.data.employee) : undefined };
}

export async function setEmployeeAccountStatusViaAdmin(employeeId: string, status: AccountStatus): Promise<{
  success: boolean;
  error?: string;
}> {
  return callAdminEmployeesFunction('set_account_status', { employeeId, status });
}

/** Define as páginas visíveis (a Edge Function recalcula o papel de dados). Apenas ADMIN. */
export async function updateEmployeeAccessViaAdmin(
  employeeId: string,
  allowedPages: string[]
): Promise<{ success: boolean; error?: string }> {
  return callAdminEmployeesFunction('update_access', { employeeId, allowedPages });
}

export async function resetEmployeePasswordViaAdmin(employeeId: string, newPassword: string): Promise<{
  success: boolean;
  error?: string;
}> {
  return callAdminEmployeesFunction('reset_password', { employeeId, newPassword });
}

export async function changeEmployeeIdentifierViaAdmin(employeeId: string, newIdentifier: string): Promise<{
  success: boolean;
  normalizedId?: string;
  error?: string;
}> {
  const res = await callAdminEmployeesFunction('change_identifier', { employeeId, newIdentifier });
  if (!res.success) return { success: false, error: res.error };
  return { success: true, normalizedId: res.data?.normalizedId };
}

export async function auditDocumentViewViaAdmin(documentId: string, filename: string, actionType: 'VIEW' | 'DOWNLOAD'): Promise<void> {
  await callAdminEmployeesFunction('audit_document_view', { documentId, filename, actionType });
}

// ----------------------------------------------------------------------------
// 5. GESTÃO DO DOSSIÊ DIGITAL (STORAGE PRIVADO & URLs ASSINADAS)
// ----------------------------------------------------------------------------

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

/**
 * Validação rigorosa do tipo real do ficheiro através de "Magic Bytes" (Assinatura Binária do Ficheiro).
 * Impede que ficheiros executáveis (.exe, .sh, .bat), scripts ou ficheiros disfarçados com extensão .pdf sejam aceites.
 */
export async function validateFileMagicBytes(file: File): Promise<{ valid: boolean; detectedMime?: string; error?: string }> {
  try {
    const slice = file.slice(0, 16);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (bytes.length < 4) {
      return { valid: false, error: 'Ficheiro demasiado pequeno ou corrompido.' };
    }

    // PDF: %PDF- (0x25 0x50 0x44 0x46)
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return { valid: true, detectedMime: 'application/pdf' };
    }

    // JPEG: 0xFF 0xD8 0xFF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return { valid: true, detectedMime: 'image/jpeg' };
    }

    // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return { valid: true, detectedMime: 'image/png' };
    }

    // WEBP: "RIFF" .... "WEBP"
    if (bytes.length >= 12 &&
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return { valid: true, detectedMime: 'image/webp' };
    }

    return { 
      valid: false, 
      error: 'Assinatura binária do ficheiro inválida ou não reconhecida. Ficheiros executáveis (.exe, scripts) ou ficheiros com extensões adulteradas são terminantemente rejeitados.' 
    };
  } catch (err: any) {
    return { valid: false, error: `Falha ao inspecionar a assinatura do ficheiro: ${err?.message || 'Erro de leitura'}` };
  }
}

/**
 * Sanitiza o nome do ficheiro para armazenamento seguro em bucket.
 * Remove caminhos de path traversal (..) e caracteres especiais.
 */
function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'documento';
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_');
}

/**
 * Envia um documento para o bucket privado 'employee-documents' e guarda os metadados.
 */
export async function uploadEmployeeDocument(
  employeeId: string,
  file: File,
  documentType: DocumentType,
  expiryDate?: string,
  uploaderName: string = 'Recursos Humanos'
): Promise<{ success: boolean; document?: EmployeeDocument; error?: string }> {
  if (!isSupabaseConfigured) {
    const docId = `doc-${Date.now()}`;
    return {
      success: true,
      document: {
        id: docId,
        employeeId,
        documentType,
        originalFilename: file.name,
        storagePath: `mock/${docId}_${file.name}`,
        fileSizeBytes: file.size,
        mimeType: file.type,
        expiryDate: expiryDate || undefined,
        uploadedAt: new Date().toISOString(),
        uploadedBy: uploaderName,
        status: 'VALIDO'
      }
    };
  }
  try {
    if (!file) {
      return { success: false, error: 'Ficheiro não fornecido.' };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { success: false, error: 'O ficheiro excede o tamanho máximo permitido de 15MB.' };
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return { success: false, error: 'Formato de ficheiro não suportado. Apenas PDF, JPEG, PNG ou WEBP são aceites.' };
    }

    // Inspecionar Magic Bytes reais do ficheiro
    const magicCheck = await validateFileMagicBytes(file);
    if (!magicCheck.valid) {
      return { success: false, error: magicCheck.error || 'Ficheiro rejeitado por violação de integridade.' };
    }

    const cleanName = sanitizeFileName(file.name);
    const storagePath = `${employeeId}/${documentType.toLowerCase()}_${Date.now()}_${cleanName}`;

    // Upload seguro para o bucket privado
    const { error: uploadError } = await supabase.storage
      .from('employee-documents')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      return { success: false, error: `Falha no armazenamento: ${uploadError.message}` };
    }

    // Registo de metadados na base de dados
    const { data: docRecord, error: dbError } = await supabase
      .from('employee_documents')
      .insert({
        employee_id: employeeId,
        document_type: documentType,
        original_filename: file.name,
        storage_path: storagePath,
        file_size_bytes: file.size,
        mime_type: file.type,
        expiry_date: expiryDate || null,
        uploaded_by: uploaderName,
        status: 'VALIDO'
      })
      .select()
      .single();

    if (dbError) {
      // Compensação: remove o ficheiro se falhar a persistência na BD
      await supabase.storage.from('employee-documents').remove([storagePath]);
      return { success: false, error: `Erro ao registar metadados do documento: ${dbError.message}` };
    }

    return {
      success: true,
      document: {
        id: docRecord.id,
        employeeId: docRecord.employee_id,
        documentType: docRecord.document_type,
        originalFilename: docRecord.original_filename,
        storagePath: docRecord.storage_path,
        fileSizeBytes: Number(docRecord.file_size_bytes),
        mimeType: docRecord.mime_type,
        expiryDate: docRecord.expiry_date,
        uploadedAt: docRecord.uploaded_at,
        uploadedBy: docRecord.uploaded_by,
        status: docRecord.status
      }
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro no upload do documento.' };
  }
}

/**
 * Gera URL assinada temporária (300 segundos) para visualização ou descarregamento seguro.
 */
export async function getEmployeeDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds: number = 300
): Promise<{ signedUrl: string | null; error?: string }> {
  if (!isSupabaseConfigured) {
    return { signedUrl: '#' };
  }
  try {
    const { data, error } = await supabase.storage
      .from('employee-documents')
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return { signedUrl: null, error: error?.message || 'Erro ao gerar URL assinada.' };
    }

    return { signedUrl: data.signedUrl };
  } catch (err: any) {
    return { signedUrl: null, error: err?.message || 'Falha ao obter URL assinada.' };
  }
}

/**
 * Remove um documento do armazenamento e da base de dados.
 */
export async function deleteEmployeeDocument(
  documentId: string,
  storagePath: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { success: true };
  }
  try {
    // 1. Remover do storage
    const { error: storageErr } = await supabase.storage
      .from('employee-documents')
      .remove([storagePath]);

    if (storageErr) {
      console.warn('Aviso: Ficheiro não encontrado no storage durante remoção:', storageErr.message);
    }

    // 2. Remover da tabela employee_documents
    const { error: dbErr } = await supabase
      .from('employee_documents')
      .delete()
      .eq('id', documentId);

    if (dbErr) {
      return { success: false, error: dbErr.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao eliminar documento.' };
  }
}

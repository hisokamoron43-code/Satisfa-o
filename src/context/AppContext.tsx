import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { CLIENT_IMPORT_BATCH_SIZE, type ClientInput } from '../services/clientImport';
import { 
  UserProfile, Client, ServiceItem, Provider, Evaluation, HRCase, ProviderPermissionAudit, AuditLog, UserRole, FormQuestion,
  EvaluationCriterion, EvaluationHistoricalSnapshot, AuditorReview, WorkerNotification, Team, Activity, FormCategoryItem, EvaluationQueueCounts
} from '../types';
import { 
  MOCK_USERS, MOCK_CLIENTS, MOCK_SERVICES, MOCK_PROVIDERS, MOCK_EVALUATIONS, MOCK_HR_CASES, MOCK_PERMISSION_AUDITS, MOCK_AUDIT_LOGS, INITIAL_FORM_QUESTIONS 
} from '../data/mockData';
import {
  DEFAULT_EVALUATION_CRITERIA,
  DEFAULT_PASSING_THRESHOLD,
  validateCriteriaConfiguration,
  getQueueStatus
} from '../services/evaluationUtils';
import {
  fetchClientsFromDb,
  insertClientInDb,
  updateClientInDb,
  fetchServicesFromDb,
  insertServiceInDb,
  updateServiceInDb,
  deleteOrDeactivateServiceInDb,
  fetchProvidersFromDb,
  insertProviderInDb,
  updateProviderInDb,
  deleteOrDeactivateProviderInDb,
  fetchEvaluationsFromDb,
  updateEvaluationStatusInDb,
  finalizeEvaluationViaRpc,
  fetchHRCasesFromDb,
  insertHRCaseInDb,
  updateHRCaseInDb,
  fetchAuditLogsFromDb,
  insertAuditLogInDb,
  logAuditActionViaRpc,
  fetchProfilesFromDb,
  fetchFormQuestionsFromDb,
  insertFormQuestionInDb,
  updateFormQuestionInDb,
  deleteFormQuestionInDb,
  fetchFormCategoriesFromDb,
  insertFormCategoryInDb,
  updateFormCategoryInDb,
  deleteFormCategoryInDb,
  DEFAULT_FORM_CATEGORIES,
  fetchTeamsFromDb,
  insertTeamInDb,
  deleteTeamInDb,
  fetchActivitiesFromDb,
  insertActivityInDb,
  deleteActivityInDb,
  deleteClientInDb,
  insertClientsChunkInDb,
  fetchWorkerNotificationsFromDb,
  insertWorkerNotificationInDb,
  fetchProviderPermissionAuditsFromDb,
  insertProviderPermissionAuditInDb,
  fetchEvaluationCriteriaFromDb,
  saveEvaluationCriteriaToDb,
  fetchCriteriaConfigurationFromDb,
  savePassingThresholdToDb,
  submitEvaluationViaRpc,
  associateEvaluationClientViaRpc,
  assignEvaluationProviderViaRpc,
  updateEvaluationScoresInDb,
  assignEvaluationTeamInDb,
  testSupabaseConnection,
  signInWithSupabase,
  signOutFromSupabase,
  getCurrentSupabaseUser,
  getOrCreateUserProfile,
  supabase,
  isSupabaseConfigured,
  isValidUuid,
} from '../services/supabaseService';

interface AppContextType {
  currentUser: UserProfile | null;
  systemUsers: UserProfile[];
  isAuthChecking: boolean;
  activeRole: UserRole;
  login: (email: string, password?: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  
  // Data lists
  clients: Client[];
  services: ServiceItem[];
  providers: Provider[];
  evaluations: Evaluation[];
  hrCases: HRCase[];
  permissionAudits: ProviderPermissionAudit[];
  auditLogs: AuditLog[];
  formQuestions: FormQuestion[];

  // Criteria & Calculation System (RH & Qualidade)
  criteria: EvaluationCriterion[];
  passingThreshold: number;
  updateCriteria: (newCriteria: EvaluationCriterion[]) => Promise<{ success: boolean; errors?: string[] }>;
  updatePassingThreshold: (threshold: number) => Promise<{ success: boolean; error?: string }>;
  finalizeEvaluation: (
    evaluationId: string,
    ratings: Record<string, number>,
    customThreshold?: number,
    thresholdOverrideReason?: string,
    auditorReview?: AuditorReview
  ) => Promise<{ success: boolean; snapshot?: EvaluationHistoricalSnapshot; error?: string }>;
  
  // Worker Notifications & Result Communication
  workerNotifications: WorkerNotification[];
  sendWorkerNotification: (notification: Omit<WorkerNotification, 'id' | 'notifiedAt'>) => Promise<{ success: boolean; data?: WorkerNotification; error?: string }>;

  // Teams & Operational Calendar Schedule
  teams: Team[];
  addTeam: (team: Omit<Team, 'id' | 'createdAt'>) => Promise<{ success: boolean; data?: Team; error?: string }>;
  deleteTeam: (id: string) => Promise<{ success: boolean; error?: string }>;
  activities: Activity[];
  addActivity: (activity: Omit<Activity, 'id'>) => Promise<{ success: boolean; hasConflict: boolean; data?: Activity; error?: string }>;
  deleteActivity: (id: string) => Promise<{ success: boolean; error?: string }>;
  /** Desfaz a última alteração do calendário (criar ou eliminar atividade). */
  undoLastActivityChange: () => Promise<{ success: boolean; error?: string }>;
  activityUndoLabel: string | null;
  activityUndoCount: number;
  
  // Actions
  addClient: (client: Omit<Client, 'id' | 'createdAt'>) => Promise<{ success: boolean; data?: Client; error?: string }>;
  deleteClient: (id: string) => Promise<{ success: boolean; error?: string }>;
  importClients: (rows: ClientInput[], onProgress?: (done: number, total: number) => void) => Promise<{ created: number; failed: Array<{ index: number; error: string }> }>;
  updateClient: (id: string, updated: Partial<Client>) => Promise<{ success: boolean; error?: string }>;
  toggleClientStatus: (id: string) => Promise<{ success: boolean; error?: string }>;
  
  addService: (service: Omit<ServiceItem, 'id'>) => Promise<{ success: boolean; data?: ServiceItem; error?: string }>;
  updateService: (id: string, updated: Partial<ServiceItem>) => Promise<{ success: boolean; error?: string }>;
  toggleServiceStatus: (id: string) => Promise<{ success: boolean; error?: string }>;
  
  addProvider: (provider: Omit<Provider, 'id' | 'createdAt'>) => Promise<{ success: boolean; data?: Provider; error?: string }>;
  updateProvider: (id: string, updated: Partial<Provider>) => Promise<{ success: boolean; error?: string }>;
  deleteProvider: (id: string) => Promise<{ success: boolean; error?: string }>;
  toggleProviderAccess: (providerId: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  
  addEvaluation: (evaluation: Omit<Evaluation, 'id' | 'reference' | 'evaluationDate'>) => Promise<{ success: boolean; id?: string; reference?: string; error?: string }>;
  updateEvaluationStatus: (id: string, status: Evaluation['status'], correctiveStatus: Evaluation['correctiveActionStatus']) => Promise<{ success: boolean; error?: string }>;
  associateEvaluationClient: (evaluationId: string, clientId: string) => Promise<{ success: boolean; error?: string }>;
  assignEvaluationProvider: (evaluationId: string, providerId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
  assignEvaluationTeam: (evaluationId: string, teamId: string, teamName?: string) => Promise<{ success: boolean; error?: string }>;
  updateEvaluationScores: (evaluationId: string, updates: {
    satisfactionRating?: number;
    npsScore?: number;
    technicalScore?: number;
    finalClassification?: 'POSITIVE' | 'NEGATIVE';
    status?: Evaluation['status'];
    criterionRatings?: Record<string, number>;
    comment?: string;
    notes?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  
  addHRCase: (hrCase: Omit<HRCase, 'id' | 'createdAt' | 'updatedAt'>) => Promise<{ success: boolean; data?: HRCase; error?: string }>;
  updateHRCase: (id: string, updated: Partial<HRCase>) => Promise<{ success: boolean; error?: string }>;

  // Form Questions & Configuration Management for HR
  addFormQuestion: (question: Omit<FormQuestion, 'id'>) => Promise<{ success: boolean; data?: FormQuestion; error?: string }>;
  updateFormQuestion: (id: string, updated: Partial<FormQuestion>) => Promise<{ success: boolean; error?: string }>;
  deleteFormQuestion: (id: string) => Promise<{ success: boolean; error?: string }>;
  toggleFormQuestionActive: (id: string) => Promise<{ success: boolean; error?: string }>;

  // Form Categories Management (Editáveis e agrupamento dinâmico)
  formCategories: FormCategoryItem[];
  addFormCategory: (category: Omit<FormCategoryItem, 'id'>) => Promise<{ success: boolean; data?: FormCategoryItem; error?: string }>;
  updateFormCategory: (id: string, updated: Partial<FormCategoryItem>) => Promise<{ success: boolean; data?: FormCategoryItem; error?: string }>;
  deleteFormCategory: (id: string) => Promise<{ success: boolean; error?: string }>;
  refreshFormCategories: () => Promise<void>;

  // Navigation / UI state
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isClientFormOpen: boolean;
  setIsClientFormOpen: (open: boolean) => void;
  selectedEvaluationForAnalysis: Evaluation | null;
  setSelectedEvaluationForAnalysis: (evaluation: Evaluation | null) => void;
  evaluationQueueCounts: EvaluationQueueCounts;

  // Supabase state
  isSupabaseConnected: boolean | null;
  isSyncing: boolean;
  refreshFromSupabase: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Authentication: starts as null to show login page on startup
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [systemUsers, setSystemUsers] = useState<UserProfile[]>([]);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(false);
  const [activeRole, setActiveRoleState] = useState<UserRole>('ADMIN');

  const getInitialTab = (): string => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      if (hash) return hash;
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam) return tabParam;
    }
    return 'dashboard';
  };

  const [activeTab, setActiveTabState] = useState<string>(getInitialTab);

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      try {
        window.history.replaceState(null, '', `#${tab}`);
      } catch {}
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      if (hash && hash !== activeTab) {
        setActiveTabState(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  // Real production data: starts completely empty for serious operational use
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [hrCases, setHrCases] = useState<HRCase[]>([]);
  const [permissionAudits, setPermissionAudits] = useState<ProviderPermissionAudit[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Formulário de Satisfação AETERNU: Perguntas geridas pelo RH (Fonte oficial: Supabase)
  const [formQuestions, setFormQuestions] = useState<FormQuestion[]>([]);

  // Critérios de Avaliação Ponderada de RH (Fonte oficial: Supabase evaluation_criteria)
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>(DEFAULT_EVALUATION_CRITERIA);

  // Limiar de Aprovação de RH (Fonte oficial: Supabase criteria_configurations)
  const [passingThreshold, setPassingThreshold] = useState<number>(DEFAULT_PASSING_THRESHOLD);

  // Notificações de Resultados aos Trabalhadores (Fonte oficial: Supabase worker_notifications)
  const [workerNotifications, setWorkerNotifications] = useState<WorkerNotification[]>([]);

  // Equipas Operacionais (Fonte oficial: Supabase teams)
  const [teams, setTeams] = useState<Team[]>([]);

  // Cronograma / Actividades do Calendário (Fonte oficial: Supabase activities)
  const [activities, setActivities] = useState<Activity[]>([]);

  // Categorias do Formulário AETERNU: Editáveis e dinâmicas (Fonte oficial: Supabase form_categories)
  const [formCategories, setFormCategories] = useState<FormCategoryItem[]>(DEFAULT_FORM_CATEGORIES);

  const [isClientFormOpen, setIsClientFormOpen] = useState<boolean>(false);
  const [selectedEvaluationForAnalysis, setSelectedEvaluationForAnalysis] = useState<Evaluation | null>(null);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Sync / hydrate data from Supabase
  const refreshFromSupabase = async () => {
    setIsSyncing(true);
    try {
      const conn = await testSupabaseConnection();
      setIsSupabaseConnected(conn.connected);

      if (conn.connected) {
        const [
          dbClients,
          dbServices,
          dbProviders,
          dbEvals,
          dbHRCases,
          dbLogs,
          dbProfiles,
          dbQuestions,
          dbTeams,
          dbActivities,
          dbNotifs,
          dbPermAudits,
          dbCriteria,
          dbConfig,
          dbCategories
        ] = await Promise.all([
          fetchClientsFromDb(),
          fetchServicesFromDb(),
          fetchProvidersFromDb(),
          fetchEvaluationsFromDb(),
          fetchHRCasesFromDb(),
          fetchAuditLogsFromDb(),
          fetchProfilesFromDb(),
          fetchFormQuestionsFromDb(),
          fetchTeamsFromDb(),
          fetchActivitiesFromDb(),
          fetchWorkerNotificationsFromDb(),
          fetchProviderPermissionAuditsFromDb(),
          fetchEvaluationCriteriaFromDb(),
          fetchCriteriaConfigurationFromDb(),
          fetchFormCategoriesFromDb()
        ]);

        if (dbClients !== null) setClients(dbClients);
        if (dbServices !== null) setServices(dbServices);
        if (dbProviders !== null) setProviders(dbProviders);
        if (dbEvals !== null) setEvaluations(dbEvals);
        if (dbHRCases !== null) setHrCases(dbHRCases);
        if (dbLogs !== null) setAuditLogs(dbLogs);
        if (dbProfiles !== null && dbProfiles.length > 0) setSystemUsers(dbProfiles);
        if (dbQuestions !== null && dbQuestions.length > 0) setFormQuestions(dbQuestions);
        if (dbTeams !== null) setTeams(dbTeams);
        if (dbActivities !== null) setActivities(dbActivities);
        if (dbNotifs !== null) setWorkerNotifications(dbNotifs);
        if (dbPermAudits !== null) setPermissionAudits(dbPermAudits);
        if (dbCriteria !== null && dbCriteria.length > 0) setCriteria(dbCriteria);
        if (dbConfig !== null && dbConfig.passingThreshold !== undefined) setPassingThreshold(dbConfig.passingThreshold);
        if (dbCategories !== null && dbCategories.length > 0) setFormCategories(dbCategories);
      }
    } catch {
      // Non-blocking sync failure
    } finally {
      setIsSyncing(false);
    }
  };

  // Check auth session on startup
  useEffect(() => {
    let isMounted = true;

    const checkInitialSession = async () => {
      try {
        const user = await getCurrentSupabaseUser();
        if (isMounted) {
          if (user) {
            setCurrentUser(user);
            setActiveRoleState(user.role);
          } else {
            setCurrentUser(null);
          }
          // Load public catalogs from Supabase (clients, services, providers) for all users
          await refreshFromSupabase();
        }
      } catch {
        if (isMounted) setCurrentUser(null);
      } finally {
        if (isMounted) setIsAuthChecking(false);
      }
    };

    checkInitialSession();

    // Listen to real-time auth events (e.g. multi-tab sign in / sign out)
    const { data: authSubscription } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        try {
          const profile = await getOrCreateUserProfile(session.user);
          if (isMounted) {
            setCurrentUser(profile);
            setActiveRoleState(profile.role);
            refreshFromSupabase();
          }
        } catch {
          await signOutFromSupabase();
          if (isMounted) setCurrentUser(null);
        }
      } else if (event === 'SIGNED_OUT') {
        if (isMounted) {
          setCurrentUser(null);
        }
      }
    });

    return () => {
      isMounted = false;
      authSubscription?.subscription?.unsubscribe();
    };
  }, []);

  const logAction = (operationType: AuditLog['operationType'], affectedEntity: string, recordId?: string, result: AuditLog['result'] = 'SUCCESS', details: string = '') => {
    const newLog: AuditLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      userEmail: currentUser?.email || 'sistema@aeternu.co.ao',
      userName: currentUser?.name || 'Sistema SICSC',
      operationType,
      affectedEntity,
      recordId,
      result,
      details
    };
    setAuditLogs(prev => [newLog, ...prev]);

    // Push to Supabase audit_logs via sovereign RPC or database fallback
    logAuditActionViaRpc(
      operationType,
      affectedEntity,
      recordId,
      result,
      details
    );
  };

  const login = async (email: string, password?: string, role?: UserRole): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = email.trim();
    if (!password) {
      return { success: false, error: 'Introduza a palavra-passe.' };
    }

    const res = await signInWithSupabase(cleanEmail, password);
    if (res.success && res.user) {
      setCurrentUser(res.user);
      setActiveRoleState(res.user.role);
      logAction('LOGIN', 'Session', res.user.id, 'SUCCESS', `Autenticação Supabase para ${cleanEmail}`);
      await refreshFromSupabase();
      return { success: true };
    }

    return {
      success: false,
      error: res.error || 'Credenciais inválidas. Verifique o seu e-mail e palavra-passe no Supabase.'
    };
  };

  const logout = async () => {
    logAction('LOGIN', 'Session', currentUser?.id, 'SUCCESS', 'Terminou a sessão');
    await signOutFromSupabase();
    setCurrentUser(null);
  };

  const addClient = async (clientData: Omit<Client, 'id' | 'createdAt'>): Promise<{ success: boolean; data?: Client; error?: string }> => {
    const res = await insertClientInDb(clientData);
    if (!res.success || !res.data) {
      logAction('CREATE', 'Client', undefined, 'DENIED', `Falha ao criar cliente: ${res.error || 'Erro desconhecido'}`);
      return { success: false, error: res.error || 'Falha ao gravar cliente na base de dados.' };
    }

    setClients(prev => [res.data!, ...prev]);
    logAction('CREATE', 'Client', res.data.id, 'SUCCESS', `Criado cliente: ${res.data.companyName}`);
    return { success: true, data: res.data };
  };

  const updateClient = async (id: string, updated: Partial<Client>): Promise<{ success: boolean; error?: string }> => {
    const res = await updateClientInDb(id, updated);
    if (!res.success) {
      logAction('UPDATE', 'Client', id, 'DENIED', `Falha ao atualizar cliente ID ${id}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao atualizar cliente no Supabase.' };
    }

    setClients(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
    logAction('UPDATE', 'Client', id, 'SUCCESS', `Atualizado cliente ID ${id}`);
    return { success: true };
  };

  const toggleClientStatus = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const target = clients.find(c => c.id === id);
    if (!target) return { success: false, error: 'Cliente não encontrado.' };

    const newStatus = target.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const res = await updateClientInDb(id, { status: newStatus });
    if (!res.success) {
      logAction('UPDATE', 'Client', id, 'DENIED', `Falha ao alterar estado do cliente ID ${id}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao alterar estado do cliente no Supabase.' };
    }

    setClients(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
    logAction('UPDATE', 'Client', id, 'SUCCESS', `Alterado estado do cliente para ${newStatus}`);
    return { success: true };
  };

  const deleteClient = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const c = clients.find(item => item.id === id);
    const res = await deleteClientInDb(id);
    if (!res.success) {
      logAction('DELETE', 'Client', id, 'DENIED', `Falha ao eliminar cliente ID ${id}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao eliminar cliente.' };
    }
    setClients(prev => prev.filter(item => item.id !== id));
    setActivities(prev => prev.map(a => (a.clientId === id ? { ...a, clientId: undefined } : a)));
    setEvaluations(prev => prev.map(e => (e.clientId === id ? { ...e, clientId: undefined } : e)));
    logAction('DELETE', 'Client', id, 'SUCCESS', `Cliente eliminado: ${c?.companyName || id}`);
    return { success: true };
  };

  // Importação em lote: blocos de CLIENT_IMPORT_BATCH_SIZE, um pedido de cada vez
  const importClients = async (rows: ClientInput[], onProgress?: (done: number, total: number) => void) => {
    const created: Client[] = [];
    const failed: Array<{ index: number; error: string }> = [];
    for (let start = 0; start < rows.length; start += CLIENT_IMPORT_BATCH_SIZE) {
      const chunk = rows.slice(start, start + CLIENT_IMPORT_BATCH_SIZE);
      const results = await insertClientsChunkInDb(chunk);
      results.forEach((r, i) => {
        if (r.ok && r.client) created.push(r.client);
        else failed.push({ index: start + i, error: r.error || 'Erro desconhecido' });
      });
      onProgress?.(Math.min(start + chunk.length, rows.length), rows.length);
    }
    if (created.length > 0) setClients(prev => [...created, ...prev]);
    logAction('CREATE', 'Client', undefined, failed.length > 0 ? 'WARNING' : 'SUCCESS',
      `Importação em lote de clientes: ${created.length} criados, ${failed.length} com erro`);
    return { created: created.length, failed };
  };

  const addService = async (serviceData: Omit<ServiceItem, 'id'>): Promise<{ success: boolean; data?: ServiceItem; error?: string }> => {
    const res = await insertServiceInDb(serviceData);
    if (!res.success || !res.data) {
      logAction('CREATE', 'Service', undefined, 'DENIED', `Falha ao criar serviço: ${res.error || 'Erro desconhecido'}`);
      return { success: false, error: res.error || 'Falha ao gravar serviço no Supabase.' };
    }

    setServices(prev => [res.data!, ...prev]);
    logAction('CREATE', 'Service', res.data.id, 'SUCCESS', `Criado serviço: ${res.data.name}`);
    return { success: true, data: res.data };
  };

  const updateService = async (id: string, updated: Partial<ServiceItem>): Promise<{ success: boolean; error?: string }> => {
    const res = await updateServiceInDb(id, updated);
    if (!res.success) {
      logAction('UPDATE', 'Service', id, 'DENIED', `Falha ao atualizar serviço ID ${id}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao atualizar serviço no Supabase.' };
    }

    setServices(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s));
    logAction('UPDATE', 'Service', id, 'SUCCESS', `Atualizado serviço ID ${id}`);
    return { success: true };
  };

  const toggleServiceStatus = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const target = services.find(s => s.id === id);
    if (!target) return { success: false, error: 'Serviço não encontrado.' };

    const newStatus = target.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const res = await updateServiceInDb(id, { status: newStatus });
    if (!res.success) {
      logAction('UPDATE', 'Service', id, 'DENIED', `Falha ao alterar estado do serviço ID ${id}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao alterar estado do serviço no Supabase.' };
    }

    setServices(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
    logAction('UPDATE', 'Service', id, 'SUCCESS', `Alterado estado do serviço para ${newStatus}`);
    return { success: true };
  };

  const addProvider = async (providerData: Omit<Provider, 'id' | 'createdAt'>): Promise<{ success: boolean; data?: Provider; error?: string }> => {
    const res = await insertProviderInDb(providerData);
    if (!res.success || !res.data) {
      logAction('CREATE', 'Provider', undefined, 'DENIED', `Falha ao criar prestador: ${res.error || 'Erro desconhecido'}`);
      return { success: false, error: res.error || 'Falha ao gravar prestador no Supabase.' };
    }

    setProviders(prev => [res.data!, ...prev]);
    logAction('CREATE', 'Provider', res.data.id, 'SUCCESS', `Criado prestador: ${res.data.name}`);
    return { success: true, data: res.data };
  };

  const updateProvider = async (id: string, updated: Partial<Provider>): Promise<{ success: boolean; error?: string }> => {
    const res = await updateProviderInDb(id, updated);
    if (!res.success) {
      logAction('UPDATE', 'Provider', id, 'DENIED', `Falha ao atualizar prestador ID ${id}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao atualizar prestador no Supabase.' };
    }

    setProviders(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
    logAction('UPDATE', 'Provider', id, 'SUCCESS', `Atualizado prestador ID ${id}`);
    return { success: true };
  };

  const deleteProvider = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const prov = providers.find(p => p.id === id);
    const provName = prov?.name || id;

    const res = await deleteOrDeactivateProviderInDb(id);
    if (res.success) {
      setProviders(prev => prev.filter(p => p.id !== id));
      logAction('DELETE', 'Provider', id, 'SUCCESS', `Removido/desativado prestador: ${provName}`);
      return { success: true };
    } else {
      logAction('DELETE', 'Provider', id, 'DENIED', `Falha ao remover prestador: ${res.error}`);
      return { success: false, error: res.error };
    }
  };

  const toggleProviderAccess = async (providerId: string, reason: string): Promise<{ success: boolean; error?: string }> => {
    const prov = providers.find(p => p.id === providerId);
    if (!prov) return { success: false, error: 'Prestador não encontrado.' };

    const previousState = prov.evaluationAccessAuthorized;
    const newState = !previousState;
    const authorizedAt = new Date().toISOString();
    const authorizedBy = currentUser?.name || 'RH';

    const res = await updateProviderInDb(providerId, {
      evaluationAccessAuthorized: newState,
      accessAuthorizedAt: authorizedAt,
      accessAuthorizedBy: authorizedBy
    });

    if (!res.success) {
      logAction(newState ? 'GRANT_ACCESS' : 'REVOKE_ACCESS', 'ProviderPermission', providerId, 'DENIED', `Falha ao alterar acesso de ${prov.name}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao persistir permissão no Supabase.' };
    }

    // Persistir registo de auditoria de permissão de prestador no Supabase
    await insertProviderPermissionAuditInDb({
      providerId,
      providerName: prov.name,
      previousState,
      newState,
      changedBy: authorizedBy,
      reason: reason || 'Atualização administrativa de privilégios de acesso a avaliações.'
    });

    setProviders(prev => prev.map(p => p.id === providerId ? {
      ...p,
      evaluationAccessAuthorized: newState,
      accessAuthorizedAt: authorizedAt.replace('T', ' ').substring(0, 19),
      accessAuthorizedBy: authorizedBy
    } : p));

    const auditEntry: ProviderPermissionAudit = {
      id: `prm-audit-${Date.now()}`,
      providerId,
      providerName: prov.name,
      previousState,
      newState,
      changedBy: authorizedBy,
      changedAt: authorizedAt.replace('T', ' ').substring(0, 19),
      reason: reason || 'Atualização administrativa de privilégios de acesso a avaliações.'
    };
    setPermissionAudits(prev => [auditEntry, ...prev]);

    logAction(
      newState ? 'GRANT_ACCESS' : 'REVOKE_ACCESS',
      'ProviderPermission',
      providerId,
      'SUCCESS',
      `Acesso a avaliações ${newState ? 'concedido' : 'revogado'} para ${prov.name}. Motivo: ${reason}`
    );

    return { success: true };
  };

  const addEvaluation = async (
    evalData: Omit<Evaluation, 'id' | 'reference' | 'evaluationDate'>
  ): Promise<{ success: boolean; id?: string; reference?: string; error?: string }> => {
    // 1. Invocar a procedure soberana no Supabase via RPC (ou fallback gracioso validado)
    const dbResult = await submitEvaluationViaRpc(evalData);

    if (!dbResult.success) {
      logAction('CREATE', 'Evaluation', undefined, 'DENIED', `Falha ao submeter avaliação para ${evalData.clientName}: ${dbResult.error}`);
      return { success: false, error: dbResult.error };
    }

    const finalId = dbResult.id || `eval-${Date.now()}`;
    const finalRef = dbResult.reference || `AVAL-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const newEval: Evaluation = {
      ...evalData,
      id: finalId,
      reference: finalRef,
      evaluationDate: new Date().toISOString().substring(0, 10),
      status: (dbResult.status as Evaluation['status']) || 'PENDING_REVIEW',
      correctiveActionStatus: evalData.requiresFollowUp ? 'PENDING' : 'NOT_NEEDED'
    };

    setEvaluations(prev => [newEval, ...prev]);
    logAction('CREATE', 'Evaluation', finalId, 'SUCCESS', `Submetida nova avaliação ${finalRef} para ${newEval.clientName}`);

    // Notificação imediata ao gestor (Edge Function notify-evaluation).
    // Só é enviado o identificador: o servidor lê a avaliação da base de dados. Falha silenciosa:
    // a avaliação já está guardada e o aviso por e-mail nunca deve bloquear o cliente.
    if (isSupabaseConfigured && isValidUuid(finalId)) {
      supabase.functions
        .invoke('notify-evaluation', { body: { evaluation_id: finalId } })
        .then(({ error }) => {
          if (error) console.warn('Notificação ao gestor não enviada.');
        })
        .catch(() => console.warn('Notificação ao gestor não enviada.'));
    }

    return { success: true, id: finalId, reference: finalRef };
  };

  const updateEvaluationStatus = async (
    id: string, 
    status: Evaluation['status'], 
    correctiveStatus: Evaluation['correctiveActionStatus']
  ): Promise<{ success: boolean; error?: string }> => {
    const res = await updateEvaluationStatusInDb(id, status, correctiveStatus);
    if (!res.success) {
      logAction('UPDATE', 'Evaluation', id, 'DENIED', `Falha ao atualizar estado da avaliação ID ${id}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao atualizar estado da avaliação no Supabase.' };
    }

    setEvaluations(prev => prev.map(e => {
      if (e.id === id) {
        logAction('UPDATE', 'Evaluation', id, 'SUCCESS', `Atualizado estado da avaliação ${e.reference} para ${status}`);
        return { ...e, status, correctiveActionStatus: correctiveStatus };
      }
      return e;
    }));
    return { success: true };
  };

  const associateEvaluationClient = async (
    evaluationId: string, 
    clientId: string
  ): Promise<{ success: boolean; error?: string }> => {
    const targetClient = clients.find(c => c.id === clientId);
    if (!targetClient) {
      return { success: false, error: 'Cliente oficial não encontrado no sistema.' };
    }

    const res = await associateEvaluationClientViaRpc(evaluationId, clientId);
    if (!res.success) {
      logAction('UPDATE', 'Evaluation', evaluationId, 'DENIED', `Falha ao associar cliente: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao associar cliente na base de dados.' };
    }

    setEvaluations(prev => prev.map(e => {
      if (e.id === evaluationId) {
        logAction('UPDATE', 'Evaluation', evaluationId, 'SUCCESS', `Associada avaliação ${e.reference} ao cliente oficial "${targetClient.companyName}".`);
        return {
          ...e,
          clientId: targetClient.id,
          clientName: targetClient.companyName,
          clientNameInput: e.clientNameInput || e.clientName
        };
      }
      return e;
    }));

    return { success: true };
  };

  const assignEvaluationProvider = async (
    evaluationId: string,
    providerId: string
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    const targetProvider = providers.find(p => p.id === providerId);
    if (!targetProvider) {
      return { success: false, error: 'Funcionário/prestador não encontrado no sistema.' };
    }
    if (targetProvider.status !== 'ACTIVE') {
      return { success: false, error: 'O funcionário/prestador selecionado encontra-se inativo.' };
    }

    const targetEval = evaluations.find(e => e.id === evaluationId);
    if (targetEval?.finalizedAt) {
      return { success: false, error: 'Esta avaliação já se encontra homologada e não pode ter o funcionário alterado.' };
    }

    const res = await assignEvaluationProviderViaRpc(evaluationId, providerId);
    if (!res.success) {
      logAction('UPDATE', 'Evaluation', evaluationId, 'DENIED', `Falha ao atribuir funcionário: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao atribuir funcionário na base de dados.' };
    }

    setEvaluations(prev => prev.map(e => {
      if (e.id === evaluationId) {
        logAction('UPDATE', 'Evaluation', evaluationId, 'SUCCESS', `Atribuído técnico "${targetProvider.name}" à avaliação ${e.reference}.`);
        return {
          ...e,
          providerId: targetProvider.id,
          providerName: targetProvider.name,
          providerNameInput: targetProvider.name
        };
      }
      return e;
    }));

    return { success: true, data: res.data };
  };

  const assignEvaluationTeam = async (
    evaluationId: string,
    teamId: string,
    teamName?: string
  ): Promise<{ success: boolean; error?: string }> => {
    const targetTeam = teams.find(t => t.id === teamId);
    const resolvedTeamName = teamName || targetTeam?.name || 'Equipa Técnica';

    const res = await assignEvaluationTeamInDb(evaluationId, teamId, resolvedTeamName);
    if (!res.success) {
      logAction('UPDATE', 'Evaluation', evaluationId, 'DENIED', `Falha ao atribuir equipa: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao atribuir equipa na base de dados.' };
    }

    setEvaluations(prev => prev.map(e => {
      if (e.id === evaluationId) {
        logAction('UPDATE', 'Evaluation', evaluationId, 'SUCCESS', `Atribuída equipa "${resolvedTeamName}" à avaliação ${e.reference}.`);
        return {
          ...e,
          teamId,
          teamName: resolvedTeamName
        };
      }
      return e;
    }));

    return { success: true };
  };

  const updateEvaluationScores = async (
    evaluationId: string,
    updates: {
      satisfactionRating?: number;
      npsScore?: number;
      technicalScore?: number;
      finalClassification?: 'POSITIVE' | 'NEGATIVE';
      status?: Evaluation['status'];
      criterionRatings?: Record<string, number>;
      comment?: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    const targetEval = evaluations.find(e => e.id === evaluationId);
    if (!targetEval) return { success: false, error: 'Avaliação não encontrada.' };

    const updatePayload = {
      satisfactionRating: updates.satisfactionRating !== undefined ? updates.satisfactionRating : targetEval.satisfactionRating,
      npsScore: updates.npsScore !== undefined ? updates.npsScore : targetEval.npsScore,
      technicalScore: updates.technicalScore !== undefined ? updates.technicalScore : targetEval.technicalScore,
      finalClassification: updates.finalClassification || targetEval.finalClassification,
      status: updates.status || targetEval.status,
      criterionRatings: updates.criterionRatings || targetEval.criterionRatings,
      comment: updates.comment !== undefined ? updates.comment : targetEval.comment,
      finalizedAt: updates.technicalScore !== undefined ? (targetEval.finalizedAt || new Date().toISOString()) : targetEval.finalizedAt,
      finalizedBy: updates.technicalScore !== undefined ? (targetEval.finalizedBy || currentUser?.name || 'Administrador') : targetEval.finalizedBy,
    };

    const res = await updateEvaluationScoresInDb(evaluationId, updatePayload);
    if (!res.success) {
      logAction('UPDATE', 'EvaluationScore', evaluationId, 'DENIED', `Falha ao atualizar pontuação: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao atualizar pontuação.' };
    }

    setEvaluations(prev => prev.map(e => {
      if (e.id === evaluationId) {
        logAction('UPDATE', 'EvaluationScore', evaluationId, 'SUCCESS', `Ajustada pontuação da avaliação ${e.reference}: CSAT ${updates.satisfactionRating ?? e.satisfactionRating}/5, Técnico ${updates.technicalScore ?? e.technicalScore}%`);
        return {
          ...e,
          ...updatePayload
        };
      }
      return e;
    }));

    return { success: true };
  };

  const addHRCase = async (hrCaseData: Omit<HRCase, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; data?: HRCase; error?: string }> => {
    const res = await insertHRCaseInDb(hrCaseData);
    if (!res.success || !res.data) {
      logAction('CREATE', 'HRCase', undefined, 'DENIED', `Falha ao criar ocorrência de RH: ${res.error || 'Erro desconhecido'}`);
      return { success: false, error: res.error || 'Falha ao persistir ocorrência de RH no Supabase.' };
    }

    setHrCases(prev => [res.data!, ...prev]);
    logAction('CREATE', 'HRCase', res.data.id, 'SUCCESS', `Criada ocorrência de RH para avaliação ${res.data.evaluationId}`);
    return { success: true, data: res.data };
  };

  const updateHRCase = async (id: string, updated: Partial<HRCase>): Promise<{ success: boolean; error?: string }> => {
    const res = await updateHRCaseInDb(id, updated);
    if (!res.success) {
      logAction('UPDATE', 'HRCase', id, 'DENIED', `Falha ao atualizar ocorrência de RH ID ${id}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao atualizar ocorrência de RH no Supabase.' };
    }

    setHrCases(prev => prev.map(c => {
      if (c.id === id) {
        logAction('UPDATE', 'HRCase', id, 'SUCCESS', `Atualizada ocorrência de RH ID ${id}`);
        return {
          ...c,
          ...updated,
          updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };
      }
      return c;
    }));
    return { success: true };
  };

  // Form Questions Management for RH (Persisted in Supabase form_questions table)
  const addFormQuestion = async (questionData: Omit<FormQuestion, 'id'>): Promise<{ success: boolean; data?: FormQuestion; error?: string }> => {
    const res = await insertFormQuestionInDb(questionData);
    if (!res.success || !res.data) {
      logAction('CREATE', 'FormQuestion', undefined, 'DENIED', `Falha ao adicionar questão ao formulário: ${res.error || 'Erro desconhecido'}`);
      return { success: false, error: res.error || 'Falha ao gravar questão no Supabase.' };
    }

    setFormQuestions(prev => [...prev, res.data!]);
    logAction('CREATE', 'FormQuestion', res.data.id, 'SUCCESS', `Adicionada questão: "${res.data.text.substring(0, 35)}..."`);
    return { success: true, data: res.data };
  };

  const updateFormQuestion = async (id: string, updated: Partial<FormQuestion>): Promise<{ success: boolean; error?: string }> => {
    const res = await updateFormQuestionInDb(id, updated);
    if (!res.success) {
      logAction('UPDATE', 'FormQuestion', id, 'DENIED', `Falha ao atualizar questão ID ${id}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao atualizar questão no Supabase.' };
    }

    setFormQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updated } : q));
    logAction('UPDATE', 'FormQuestion', id, 'SUCCESS', `Atualizada questão do formulário ID ${id}`);
    return { success: true };
  };

  const deleteFormQuestion = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const res = await deleteFormQuestionInDb(id);
    if (!res.success) {
      logAction('DELETE', 'FormQuestion', id, 'DENIED', `Falha ao eliminar questão ID ${id}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao eliminar questão no Supabase.' };
    }

    setFormQuestions(prev => prev.filter(q => q.id !== id));
    logAction('DELETE', 'FormQuestion', id, 'SUCCESS', `Eliminada questão do formulário ID ${id}`);
    return { success: true };
  };

  const toggleFormQuestionActive = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const q = formQuestions.find(item => item.id === id);
    if (!q) return { success: false, error: 'Questão não encontrada.' };

    const nextActive = !q.active;
    const res = await updateFormQuestionInDb(id, { active: nextActive });
    if (!res.success) {
      logAction('UPDATE', 'FormQuestion', id, 'DENIED', `Falha ao alterar estado da questão ID ${id}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao alterar estado da questão no Supabase.' };
    }

    setFormQuestions(prev => prev.map(item => item.id === id ? { ...item, active: nextActive } : item));
    logAction('UPDATE', 'FormQuestion', id, 'SUCCESS', `${nextActive ? 'Ativada' : 'Desativada'} questão "${q.text.substring(0, 30)}..." no formulário de satisfação`);
    return { success: true };
  };

  // Gestão de Categorias do Formulário (Editáveis e agrupadas)
  const refreshFormCategories = async (): Promise<void> => {
    try {
      const dbCats = await fetchFormCategoriesFromDb();
      if (dbCats && dbCats.length > 0) {
        setFormCategories(dbCats);
      }
    } catch {
      // non-blocking
    }
  };

  const addFormCategory = async (category: Omit<FormCategoryItem, 'id'>): Promise<{ success: boolean; data?: FormCategoryItem; error?: string }> => {
    if (activeRole !== 'ADMIN' && activeRole !== 'HR' && activeRole !== 'DIRECTOR') {
      return { success: false, error: 'Acesso negado: apenas Administradores ou Recursos Humanos podem criar categorias.' };
    }
    const res = await insertFormCategoryInDb(category);
    if (res.success && res.data) {
      setFormCategories(prev => {
        const filtered = prev.filter(c => c.code !== res.data!.code && c.id !== res.data!.id);
        return [...filtered, res.data!].sort((a, b) => (a.display_order ?? 1) - (b.display_order ?? 1));
      });
      logAction('CREATE', 'FormCategory', res.data.code, 'SUCCESS', `Criada nova categoria de formulário: ${res.data.name}`);
    }
    return res;
  };

  const updateFormCategory = async (id: string, updated: Partial<FormCategoryItem>): Promise<{ success: boolean; data?: FormCategoryItem; error?: string }> => {
    if (activeRole !== 'ADMIN' && activeRole !== 'HR' && activeRole !== 'DIRECTOR') {
      return { success: false, error: 'Acesso negado: apenas Administradores ou Recursos Humanos podem editar categorias.' };
    }
    const res = await updateFormCategoryInDb(id, updated);
    if (res.success && res.data) {
      setFormCategories(prev => {
        return prev.map(c => (c.id === id || c.code === id) ? res.data! : c)
          .sort((a, b) => (a.display_order ?? 1) - (b.display_order ?? 1));
      });
      // If code changed, update in-memory questions
      if (updated.code && updated.code !== id) {
        setFormQuestions(prev => prev.map(q => q.category === id ? { ...q, category: updated.code! } : q));
      }
      logAction('UPDATE', 'FormCategory', id, 'SUCCESS', `Atualizada categoria de formulário: ${res.data.name}`);
    }
    return res;
  };

  const deleteFormCategory = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (activeRole !== 'ADMIN' && activeRole !== 'HR') {
      return { success: false, error: 'Acesso negado: apenas Administradores ou Recursos Humanos podem remover categorias.' };
    }
    const count = formQuestions.filter(q => q.category === id).length;
    if (count > 0) {
      return { success: false, error: `Não é possível eliminar esta categoria porque existem ${count} pergunta(s) associada(s) a ela.` };
    }
    const res = await deleteFormCategoryInDb(id);
    if (res.success) {
      setFormCategories(prev => prev.filter(c => c.id !== id && c.code !== id));
      logAction('DELETE', 'FormCategory', id, 'SUCCESS', `Eliminada categoria de formulário ID ${id}`);
    }
    return res;
  };

  // Gestão de Critérios de Avaliação Ponderada (0 a 100% - Persistência Oficial no Supabase)
  const updateCriteria = async (newCriteria: EvaluationCriterion[]): Promise<{ success: boolean; errors?: string[] }> => {
    if (activeRole !== 'ADMIN' && activeRole !== 'HR') {
      return { success: false, errors: ['Acesso negado: apenas Recursos Humanos ou Administradores podem gerir critérios.'] };
    }

    const validation = validateCriteriaConfiguration(newCriteria);
    if (!validation.isValid) {
      logAction('UPDATE', 'CriteriaConfiguration', undefined, 'WARNING', `Tentativa de configurar critérios com soma de pesos inválida (${validation.totalWeight}%). Rejeitado.`);
      return { success: false, errors: validation.errors };
    }

    const res = await saveEvaluationCriteriaToDb(newCriteria, currentUser?.name || 'Recursos Humanos');
    if (!res.success) {
      logAction('UPDATE', 'CriteriaConfiguration', undefined, 'DENIED', `Falha ao gravar critérios no Supabase: ${res.error}`);
      return { success: false, errors: [res.error || 'Falha ao persistir critérios na base de dados Supabase.'] };
    }

    setCriteria(newCriteria);
    logAction('UPDATE', 'CriteriaConfiguration', undefined, 'SUCCESS', `Critérios de avaliação gravados e validados no Supabase: soma de pesos 100.0%.`);
    return { success: true };
  };

  const updatePassingThreshold = async (threshold: number): Promise<{ success: boolean; error?: string }> => {
    if (activeRole !== 'ADMIN' && activeRole !== 'HR') {
      return { success: false, error: 'Acesso negado: apenas Recursos Humanos ou Administradores podem configurar o limiar.' };
    }

    if (isNaN(threshold) || threshold < 0 || threshold > 100) {
      return { success: false, error: 'O limiar de aprovação deve ser um valor numérico entre 0 e 100%.' };
    }

    const res = await savePassingThresholdToDb(threshold, currentUser?.name || 'Recursos Humanos');
    if (!res.success) {
      logAction('UPDATE', 'PassingThreshold', undefined, 'DENIED', `Falha ao gravar limiar no Supabase: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao persistir limiar no Supabase.' };
    }

    setPassingThreshold(threshold);
    logAction('UPDATE', 'PassingThreshold', undefined, 'SUCCESS', `Limiar de aprovação atualizado e persistido no Supabase: ${threshold}%.`);
    return { success: true };
  };

  // Homologação de Avaliação Soberana no Servidor com Snapshot Imutável e Cálculo Ponderado Estrito
  const finalizeEvaluation = async (
    evaluationId: string,
    ratings: Record<string, number>,
    customThreshold?: number,
    thresholdOverrideReason?: string,
    auditorReview?: AuditorReview
  ): Promise<{ success: boolean; snapshot?: EvaluationHistoricalSnapshot; error?: string }> => {
    if (activeRole !== 'ADMIN' && activeRole !== 'HR') {
      return { success: false, error: 'Acesso negado: apenas colaboradores de Recursos Humanos ou Administradores podem homologar avaliações.' };
    }

    const targetEval = evaluations.find(e => e.id === evaluationId);
    if (!targetEval) {
      return { success: false, error: 'Avaliação não encontrada no sistema.' };
    }

    // Proteção de Imutabilidade: Avaliações já homologadas NÃO podem ser reescritas
    if (targetEval.finalizedAt && targetEval.criteriaSnapshot) {
      return {
        success: false,
        error: `Esta avaliação já foi homologada em ${targetEval.finalizedAt} por ${targetEval.finalizedBy || 'RH'} e possui um snapshot imutável auditado.`
      };
    }

    // O servidor só aceita um limiar personalizado com justificação. Se o valor é o limiar ativo
    // (caso normal), não se envia nada e o servidor usa o limiar oficial.
    const thresholdToUse =
      customThreshold !== undefined && customThreshold !== passingThreshold && thresholdOverrideReason
        ? customThreshold
        : undefined;

    // 1. Invocar a procedure transacional oficial no Supabase via RPC
    const rpcResult = await finalizeEvaluationViaRpc(
      evaluationId,
      ratings,
      thresholdToUse,
      thresholdToUse !== undefined ? thresholdOverrideReason : undefined,
      auditorReview
    );

    let finalScore: number;
    let finalClassification: 'POSITIVE' | 'NEGATIVE';
    let finalizedSnapshot: EvaluationHistoricalSnapshot;
    let finalizedBy: string;
    let finalizedAt: string;

    if (rpcResult.success && rpcResult.data) {
      // Usar estritamente os resultados oficiais calculados pelo servidor PostgreSQL
      finalScore = Number(rpcResult.data.finalScore);
      finalClassification = rpcResult.data.finalClassification;
      finalizedSnapshot = rpcResult.data.snapshot;
      finalizedBy = rpcResult.data.finalizedBy || currentUser?.email || 'Recursos Humanos';
      finalizedAt = rpcResult.data.finalizedAt || new Date().toISOString();
    } else {
      const errMsg = rpcResult.error || 'Erro desconhecido ao invocar homologação no servidor.';
      logAction('UPDATE', 'Evaluation', evaluationId, 'DENIED', `Homologação rejeitada pelo servidor: ${errMsg}`);
      return {
        success: false,
        error: errMsg
      };
    }

    // 2. Atualizar estado local APENAS após validação e confirmação
    setEvaluations(prev => prev.map(e => {
      if (e.id === evaluationId) {
        return {
          ...e,
          status: 'REVIEWED',
          technicalScore: finalScore,
          finalClassification: finalClassification,
          finalizedAt,
          finalizedBy,
          criteriaSnapshot: finalizedSnapshot,
          criterionRatings: ratings,
          auditorReview: auditorReview && Object.keys(auditorReview).length > 0 ? auditorReview : e.auditorReview
        };
      }
      return e;
    }));

    // 3. Despacho de notificação aos técnicos persistida no Supabase
    if (targetEval.providerId || targetEval.providerName) {
      const notifPayload: Omit<WorkerNotification, 'id' | 'notifiedAt'> = {
        evaluationId,
        evaluationReference: targetEval.reference,
        providerId: targetEval.providerId || 'prov-geral',
        providerName: targetEval.providerName || 'Equipa Técnica Operacional',
        finalScore,
        resultStatus: finalClassification,
        notifiedBy: finalizedBy,
        sharedFeedback: targetEval.comment || 'Desempenho homologado pelo Departamento de Recursos Humanos.'
      };
      
      insertWorkerNotificationInDb(notifPayload).then(res => {
        if (res.success && res.data) {
          setWorkerNotifications(prev => [res.data!, ...prev]);
        }
      });
    }

    logAction(
      'UPDATE',
      'Evaluation',
      evaluationId,
      'SUCCESS',
      `Avaliação ${targetEval.reference} homologada com pontuação ${finalScore}% (${finalClassification}). Snapshot histórico imutável gerado.`
    );

    return { success: true, snapshot: finalizedSnapshot };
  };

  const sendWorkerNotification = async (notifData: Omit<WorkerNotification, 'id' | 'notifiedAt'>): Promise<{ success: boolean; data?: WorkerNotification; error?: string }> => {
    const res = await insertWorkerNotificationInDb(notifData);
    if (!res.success || !res.data) {
      logAction('EXPORT', 'WorkerNotification', undefined, 'DENIED', `Falha ao enviar notificação ao trabalhador: ${res.error || 'Erro desconhecido'}`);
      return { success: false, error: res.error || 'Falha ao persistir notificação no Supabase.' };
    }

    setWorkerNotifications(prev => [res.data!, ...prev]);
    logAction('EXPORT', 'WorkerNotification', res.data.id, 'SUCCESS', `Resultado da avaliação persistido no Supabase para ${res.data.providerName || res.data.providerId}`);
    return { success: true, data: res.data };
  };

  // Gestão de Equipas (Persistida Oficialmente no Supabase teams)
  const addTeam = async (teamData: Omit<Team, 'id' | 'createdAt'>): Promise<{ success: boolean; data?: Team; error?: string }> => {
    const res = await insertTeamInDb(teamData);
    if (!res.success || !res.data) {
      logAction('CREATE', 'Team', undefined, 'DENIED', `Falha ao criar equipa: ${res.error || 'Erro desconhecido'}`);
      return { success: false, error: res.error || 'Falha ao persistir equipa no Supabase.' };
    }

    setTeams(prev => [res.data!, ...prev]);
    logAction('CREATE', 'Team', res.data.id, 'SUCCESS', `Criada nova equipa operacional: ${res.data.name} (${res.data.code})`);
    return { success: true, data: res.data };
  };

  const deleteTeam = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const t = teams.find(item => item.id === id);
    const res = await deleteTeamInDb(id);
    if (!res.success) {
      logAction('DELETE', 'Team', id, 'DENIED', `Falha ao eliminar equipa ID ${id}: ${res.error}`);
      return { success: false, error: res.error || 'Falha ao eliminar equipa no Supabase.' };
    }

    setTeams(prev => prev.filter(item => item.id !== id));
    logAction('DELETE', 'Team', id, 'SUCCESS', `Removida equipa operacional: ${t?.name || id}`);
    return { success: true };
  };

  // Gestão de Cronograma / Actividades do Calendário (Persistida Oficialmente no Supabase activities)
  const addActivity = async (actData: Omit<Activity, 'id'>): Promise<{ success: boolean; hasConflict: boolean; data?: Activity; error?: string }> => {
    // Detecção estrita de conflitos de horário na mesma equipa e data
    const hasConflict = activities.some(a => 
      a.activityDate === actData.activityDate &&
      a.teamName === actData.teamName &&
      (
        (actData.startTime >= a.startTime && actData.startTime < a.endTime) ||
        (actData.endTime > a.startTime && actData.endTime <= a.endTime) ||
        (actData.startTime <= a.startTime && actData.endTime >= a.endTime)
      )
    );

    const payloadWithStatus = {
      ...actData,
      status: (hasConflict ? 'CONFLICT' : 'SCHEDULED') as Activity['status']
    };

    const res = await insertActivityInDb(payloadWithStatus);
    if (!res.success || !res.data) {
      logAction('CREATE', 'Activity', undefined, 'DENIED', `Falha ao agendar actividade: ${res.error || 'Erro desconhecido'}`);
      return { success: false, hasConflict, error: res.error || 'Falha ao persistir actividade no Supabase.' };
    }

    setActivities(prev => [res.data!, ...prev]);
    const createdId = res.data.id;
    pushActivityUndo({ label: `Agendar "${res.data.title}" (${res.data.activityDate})`, run: () => removeActivityById(createdId) });
    logAction(
      'CREATE', 
      'Activity', 
      res.data.id, 
      hasConflict ? 'WARNING' : 'SUCCESS', 
      `Actividade agendada e persistida: "${res.data.title}" para ${res.data.activityDate} (${res.data.startTime}-${res.data.endTime}) - Equipa ${res.data.teamName}.${hasConflict ? ' [ALERTA: CONFLITO DE HORÁRIO]' : ''}`
    );

    return { success: true, hasConflict, data: res.data };
  };

  // Desfazer do calendário: pilha das últimas alterações. Atividades recriadas ao desfazer uma eliminação
  // recebem novo id; o mapa de aliases mantém os registos anteriores válidos.
  type ActivityUndo = { label: string; run: () => Promise<{ success: boolean; error?: string }> };
  const [activityUndo, setActivityUndo] = useState<ActivityUndo[]>([]);
  const activityAlias = useRef<Record<string, string>>({});
  const resolveActivityId = (id: string) => {
    let current = id;
    for (let guard = 0; activityAlias.current[current] && guard < 50; guard++) current = activityAlias.current[current];
    return current;
  };
  const pushActivityUndo = (entry: ActivityUndo) => setActivityUndo(prev => [...prev.slice(-19), entry]);

  const removeActivityById = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const real = resolveActivityId(id);
    const res = await deleteActivityInDb(real);
    if (!res.success) return { success: false, error: res.error || 'Falha ao cancelar actividade no Supabase.' };
    setActivities(prev => prev.filter(item => item.id !== real));
    return { success: true };
  };

  const restoreActivity = async (snapshot: Activity): Promise<{ success: boolean; error?: string }> => {
    const { id: oldId, ...payload } = snapshot;
    const res = await insertActivityInDb(payload as Omit<Activity, 'id'>);
    if (!res.success || !res.data) return { success: false, error: res.error || 'Falha ao repor actividade.' };
    activityAlias.current[oldId] = res.data.id;
    setActivities(prev => [res.data!, ...prev]);
    return { success: true };
  };

  const deleteActivity = async (id: string): Promise<{ success: boolean; error?: string }> => {
    const a = activities.find(item => item.id === id);
    const res = await removeActivityById(id);
    if (!res.success) {
      logAction('DELETE', 'Activity', id, 'DENIED', `Falha ao cancelar actividade ID ${id}: ${res.error}`);
      return { success: false, error: res.error };
    }
    if (a) pushActivityUndo({ label: `Cancelar "${a.title}" (${a.activityDate})`, run: () => restoreActivity(a) });
    logAction('DELETE', 'Activity', id, 'SUCCESS', `Actividade cancelada/eliminada: ${a?.title || id}`);
    return { success: true };
  };

  const undoLastActivityChange = async (): Promise<{ success: boolean; error?: string }> => {
    const last = activityUndo[activityUndo.length - 1];
    if (!last) return { success: false, error: 'Não há alterações ao calendário para desfazer.' };
    const res = await last.run();
    if (!res.success) {
      logAction('UPDATE', 'Activity', undefined, 'DENIED', `Falha ao desfazer (${last.label}): ${res.error}`);
      return { success: false, error: res.error };
    }
    setActivityUndo(prev => prev.slice(0, -1));
    logAction('UPDATE', 'Activity', undefined, 'SUCCESS', `Alteração do calendário desfeita: ${last.label}`);
    return { success: true };
  };

  // Filtro de Menor Privilégio por Perfil de Acesso (RBAC)
  const filteredEvaluations = React.useMemo(() => {
    if (activeRole === 'PROVIDER') {
      const currentProv = providers.find(p => 
        (currentUser?.providerId && p.id === currentUser.providerId) ||
        (currentUser?.email && p.professionalEmail?.toLowerCase() === currentUser.email?.toLowerCase()) ||
        (p.name?.toLowerCase() === currentUser?.name?.toLowerCase())
      ) || providers.find(p => p.status === 'ACTIVE');

      // Se o prestador não possui autorização concedida e registada pelo RH, não vê nenhuma avaliação
      if (!currentProv || !currentProv.evaluationAccessAuthorized) {
        return [];
      }
      return evaluations.filter(e => e.providerId === currentProv.id || e.providerName === currentProv.name);
    }
    return evaluations;
  }, [activeRole, currentUser, providers, evaluations]);

  const filteredHRCases = React.useMemo(() => {
    if (activeRole === 'ADMIN' || activeRole === 'HR') {
      return hrCases;
    }
    return [];
  }, [activeRole, hrCases]);

  const filteredAuditLogs = React.useMemo(() => {
    if (activeRole === 'ADMIN' || activeRole === 'HR') {
      return auditLogs;
    }
    return [];
  }, [activeRole, auditLogs]);

  const evaluationQueueCounts = React.useMemo(() => {
    let unassignedClient = 0;
    let unassignedProvider = 0;
    let readyToFinalize = 0;
    let homologated = 0;

    evaluations.forEach(ev => {
      const q = getQueueStatus(ev);
      if (q === 'UNASSIGNED_CLIENT') unassignedClient++;
      else if (q === 'UNASSIGNED_PROVIDER') unassignedProvider++;
      else if (q === 'READY_TO_FINALIZE') readyToFinalize++;
      else if (q === 'HOMOLOGATED') homologated++;
    });

    return {
      total: evaluations.length,
      unassignedClient,
      unassignedProvider,
      readyToFinalize,
      homologated
    };
  }, [evaluations]);

  return (
    <AppContext.Provider value={{
      currentUser,
      systemUsers,
      isAuthChecking,
      activeRole,
      login,
      logout,
      clients,
      services,
      providers,
      evaluations: filteredEvaluations,
      evaluationQueueCounts,
      hrCases: filteredHRCases,
      permissionAudits,
      auditLogs: filteredAuditLogs,
      formQuestions,
      criteria,
      passingThreshold,
      updateCriteria,
      updatePassingThreshold,
      finalizeEvaluation,
      workerNotifications,
      sendWorkerNotification,
      teams,
      addTeam,
      deleteTeam,
      activities,
      addActivity,
      deleteActivity,
      undoLastActivityChange,
      activityUndoLabel: activityUndo.length > 0 ? activityUndo[activityUndo.length - 1].label : null,
      activityUndoCount: activityUndo.length,
      addClient,
      deleteClient,
      importClients,
      updateClient,
      toggleClientStatus,
      addService,
      updateService,
      toggleServiceStatus,
      addProvider,
      updateProvider,
      deleteProvider,
      toggleProviderAccess,
      addEvaluation,
      updateEvaluationStatus,
      associateEvaluationClient,
      assignEvaluationProvider,
      assignEvaluationTeam,
      updateEvaluationScores,
      addHRCase,
      updateHRCase,
      addFormQuestion,
      updateFormQuestion,
      deleteFormQuestion,
      toggleFormQuestionActive,
      formCategories,
      addFormCategory,
      updateFormCategory,
      deleteFormCategory,
      refreshFormCategories,
      activeTab,
      setActiveTab,
      isClientFormOpen,
      setIsClientFormOpen,
      selectedEvaluationForAnalysis,
      setSelectedEvaluationForAnalysis,
      isSupabaseConnected,
      isSyncing,
      refreshFromSupabase
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

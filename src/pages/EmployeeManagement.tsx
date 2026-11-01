import React, { useState, useEffect, useMemo } from 'react';
import { 
  Employee, 
  EmployeeCategory, 
  ProfessionalStatus, 
  AccountStatus, 
  AccessProfile,
  EmployeeDocument,
  DocumentType,
  fetchEmployees, 
  fetchEmployeeById,
  fetchAccessProfiles, 
  createAccessProfile,
  createEmployee, 
  checkEmployeeDuplicates,
  uploadEmployeeDocument,
  getEmployeeDocumentSignedUrl,
  deleteEmployeeDocument
} from '../services/employeesService';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types';
import { APP_PAGES, APP_PAGE_MAP, ROLE_HIERARCHY_LEVEL } from '../config/pages';
import { updateEmployeeViaAdmin, updateEmployeeAccessViaAdmin, changeEmployeeIdentifierViaAdmin, resetEmployeePasswordViaAdmin } from '../services/employeesService';
import { isStrongPassword } from '../lib/authIdentifier';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador', HR: 'Recursos Humanos', DIRECTOR: 'Direção',
  OPERATIONAL: 'Operacional', PROVIDER: 'Prestador',
};
const MIN_PASSWORD_LENGTH = 8;
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  RefreshCw, 
  ShieldCheck, 
  Lock, 
  Unlock, 
  FileText, 
  Phone, 
  Mail, 
  Briefcase, 
  Building2, 
  Calendar, 
  Eye, 
  Download, 
  Trash2, 
  Upload, 
  X, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  ShieldAlert,
  ChevronRight,
  UserCheck,
  Award,
  Clock
} from 'lucide-react';
import { KpiDetailModal } from '../components/analytics/KpiDetailModal';

export const EmployeeManagement: React.FC = () => {
  const { currentUser, evaluations, services, clients } = useApp();


  // Estados da Listagem
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedKpiModal, setSelectedKpiModal] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('all');

  // Perfis de Acesso disponíveis no Supabase
  const [accessProfiles, setAccessProfiles] = useState<AccessProfile[]>([]);

  // Modal de Criação de Funcionário
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Campos do Formulário de Criação
  const [fullName, setFullName] = useState<string>('');
  const [employeeNumber, setEmployeeNumber] = useState<string>('');
  const [category, setCategory] = useState<EmployeeCategory>('TECNICO');
  const [jobTitle, setJobTitle] = useState<string>('');
  const [department, setDepartment] = useState<string>('Operações');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [biNumber, setBiNumber] = useState<string>('');
  const [nif, setNif] = useState<string>('');
  const [admissionDate, setAdmissionDate] = useState<string>(new Date().toISOString().substring(0, 10));
  const [specialty, setSpecialty] = useState<string>('');

  // Conta de Acesso ao Sistema
  const [createAccount, setCreateAccount] = useState<boolean>(false);
  const [accessIdentifier, setAccessIdentifier] = useState<string>('');
  // Edição de dados do colaborador (dossiê): ADMIN e HR
  const canManageEmployees = currentUser?.role === 'ADMIN' || currentUser?.role === 'HR';
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('OUTRO');
  const [editStatus, setEditStatus] = useState('ATIVO');
  const [editPages, setEditPages] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editIdent, setEditIdent] = useState('');
  const [editNewPwd, setEditNewPwd] = useState('');
  const [accessMsg, setAccessMsg] = useState<string | null>(null);
  // Páginas que o colaborador poderá ver (definidas por quem o cria)
  const [selectedPages, setSelectedPages] = useState<string[]>([]);

  // Autoridade do utilizador que cria: só pode conceder páginas de nível igual ou inferior ao seu
  const myLevel = ROLE_HIERARCHY_LEVEL[(currentUser?.role ?? 'PROVIDER') as UserRole] ?? 0;
  const canGrantPage = (key: string) => {
    const page = APP_PAGE_MAP[key];
    return !!page && myLevel >= (ROLE_HIERARCHY_LEVEL[page.requiredBaseRole] ?? 0);
  };
  const togglePage = (key: string) =>
    setSelectedPages(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  const derivedRole: string = (() => {
    let max = 0;
    for (const k of selectedPages) max = Math.max(max, ROLE_HIERARCHY_LEVEL[APP_PAGE_MAP[k]?.requiredBaseRole] ?? 0);
    const entry = Object.entries(ROLE_HIERARCHY_LEVEL).find(([, lvl]) => lvl === (max || 1));
    return entry ? entry[0] : 'PROVIDER';
  })();
  const [initialPassword, setInitialPassword] = useState<string>('');



  // Modal de Detalhes / Dossiê Digital do Colaborador
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeDocs, setEmployeeDocs] = useState<EmployeeDocument[]>([]);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);
  const [isDocUploading, setIsDocUploading] = useState<boolean>(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [docUploadSuccess, setDocUploadSuccess] = useState<string | null>(null);
  const [selectedDocType, setSelectedDocType] = useState<DocumentType>('BI');
  const [docExpiryDate, setDocExpiryDate] = useState<string>('');

  // Carregar lista de colaboradores do Supabase
  const loadEmployees = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetchEmployees({
        page: 1,
        pageSize: 100,
        search: searchTerm,
        category: selectedCategory,
        status: selectedStatus,
        profileId: selectedProfileId
      });

      if (res.error) {
        setFetchError(res.error);
        setEmployees([]);
        setTotalCount(0);
      } else {
        setEmployees(res.employees);
        setTotalCount(res.totalCount);
      }
    } catch (err: any) {
      setFetchError(err?.message || 'Erro ao comunicar com a base de dados.');
    } finally {
      setIsLoading(false);
    }
  };

  // Carregar perfis de acesso
  const loadProfiles = async () => {
    try {
      const list = await fetchAccessProfiles();
      setAccessProfiles(list);
    } catch (err) {
      console.warn('Falha ao carregar perfis de acesso:', err);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadEmployees();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedCategory, selectedStatus, selectedProfileId]);

  // Gerador automático de código de funcionário
  const generateEmployeeNumber = () => {
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    setEmployeeNumber(`AET-${randomCode}`);
  };

  // Sugerir identificador canónico com base no nome
  const handleNameChange = (val: string) => {
    setFullName(val);
    if (!accessIdentifier || accessIdentifier.includes('.')) {
      const parts = val.trim().toLowerCase().split(/\s+/);
      if (parts.length >= 2) {
        const first = parts[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const last = parts[parts.length - 1].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        setAccessIdentifier(`${first}.${last}`);
      } else if (parts.length === 1 && parts[0]) {
        setAccessIdentifier(parts[0].normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      }
    }
  };

  // Submissão do Formulário de Criação com Validação de Duplicados
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    // Validações básicas no cliente
    if (!fullName.trim()) {
      setFormError('O nome completo do funcionário é obrigatório.');
      return;
    }

    const cleanNum = employeeNumber.trim();
    if (!cleanNum) {
      setFormError('O número interno de funcionário é obrigatório.');
      return;
    }

    if (createAccount && !accessIdentifier.trim()) {
      setFormError('Para criar uma conta de acesso ao sistema, introduza um identificador de acesso.');
      return;
    }

    if (createAccount && selectedPages.length === 0) {
      setFormError('Selecione pelo menos uma página que este colaborador poderá ver.');
      return;
    }

    if (createAccount && !isStrongPassword(initialPassword)) {
      setFormError('A palavra-passe inicial deve ter pelo menos 8 caracteres, com letras e números.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Validação estrita de duplicados diretamente no Supabase
      const dupCheck = await checkEmployeeDuplicates({
        employeeNumber: cleanNum,
        accessIdentifier: createAccount ? accessIdentifier.trim() : undefined,
        biNumber: biNumber.trim() || undefined,
        email: email.trim() || undefined
      });

      if (dupCheck.hasDuplicate) {
        setFormError(dupCheck.message || 'Dados duplicados detetados na base de dados.');
        setIsSubmitting(false);
        return;
      }

      // 2. Persistência real na base de dados Supabase
      const res = await createEmployee({
        fullName: fullName.trim(),
        employeeNumber: cleanNum,
        category,
        allowedPages: createAccount ? selectedPages : [],
        accessIdentifier: createAccount && accessIdentifier.trim() ? accessIdentifier.trim() : undefined,
        initialPassword: createAccount && initialPassword ? initialPassword : undefined,
        createSystemAccount: createAccount,
        personalData: {
          biNumber: biNumber.trim() || undefined,
          nif: nif.trim() || undefined
        },
        contacts: {
          phone: phone.trim() || undefined,
          contactEmail: email.trim() || undefined
        },
        professionalData: {
          jobTitle: jobTitle.trim() || undefined,
          department: department.trim() || undefined,
          specialty: specialty.trim() || undefined,
          admissionDate: admissionDate || undefined
        }
      });

      if (!res.success || !res.employee) {
        setFormError(res.error || 'Não foi possível registar o funcionário.');
        setIsSubmitting(false);
        return;
      }

      setFormSuccess(`Colaborador "${res.employee.fullName}" registado com sucesso no SICSC (Código: ${res.employee.employeeNumber})!`);
      
      // Recarregar listagem
      await loadEmployees();

      // Fechar modal após 1.5s
      setTimeout(() => {
        setIsCreateModalOpen(false);
        // Reset formulário
        setFullName('');
        setEmployeeNumber('');
        setJobTitle('');
        setPhone('');
        setEmail('');
        setBiNumber('');
        setNif('');
        setSpecialty('');
        setCreateAccount(false);
        setAccessIdentifier('');
        setInitialPassword('');
        setSelectedPages([]);
        setFormSuccess(null);
      }, 1500);

    } catch (err: any) {
      setFormError(err?.message || 'Erro inesperado ao gravar na base de dados.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Abrir Dossiê do Colaborador
  const handleOpenDetails = async (emp: Employee) => {
    setSelectedEmployee(emp);
    setIsDetailsModalOpen(true);
    setDocUploadError(null);
    setDocUploadSuccess(null);

    // Carregar detalhes completos e lista de documentos do Supabase
    try {
      const res = await fetchEmployeeById(emp.id);
      if (res.employee) {
        setSelectedEmployee(res.employee);
      }
      setEmployeeDocs(res.documents);
    } catch (err) {
      console.warn('Erro ao carregar documentos do colaborador:', err);
    }
  };

  // Upload de Documento no Bucket Privado
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEmployee) return;

    setIsDocUploading(true);
    setDocUploadError(null);
    setDocUploadSuccess(null);

    try {
      const res = await uploadEmployeeDocument(
        selectedEmployee.id,
        file,
        selectedDocType,
        docExpiryDate || undefined,
        currentUser?.name || 'Recursos Humanos'
      );

      if (!res.success || !res.document) {
        setDocUploadError(res.error || 'Erro no upload do documento.');
      } else {
        setDocUploadSuccess(`Documento "${file.name}" carregado com sucesso no dossiê!`);
        setEmployeeDocs(prev => [res.document!, ...prev]);
        setDocExpiryDate('');
      }
    } catch (err: any) {
      setDocUploadError(err?.message || 'Falha ao processar ficheiro.');
    } finally {
      setIsDocUploading(false);
      // Limpar input
      e.target.value = '';
    }
  };

  // Visualizar / Baixar Documento via URL Assinada
  const handleDownloadDoc = async (doc: EmployeeDocument) => {
    try {
      const res = await getEmployeeDocumentSignedUrl(doc.storagePath, 300);
      if (res.signedUrl) {
        window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        alert(res.error || 'Não foi possível gerar ligação segura de acesso ao documento.');
      }
    } catch (err: any) {
      alert('Erro ao aceder ao documento: ' + err?.message);
    }
  };

  // Eliminar Documento
  const handleDeleteDoc = async (doc: EmployeeDocument) => {
    if (!confirm(`Tem a certeza que deseja eliminar o documento "${doc.originalFilename}"?`)) {
      return;
    }

    try {
      const res = await deleteEmployeeDocument(doc.id, doc.storagePath);
      if (!res.success) {
        alert(res.error || 'Erro ao eliminar documento.');
      } else {
        setEmployeeDocs(prev => prev.filter(d => d.id !== doc.id));
      }
    } catch (err: any) {
      alert('Falha ao eliminar documento: ' + err?.message);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-['Inter',sans-serif]">
      {/* CABEÇALHO */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-brand-dark text-white flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Gestão de Funcionários</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Cadastro centralizado de colaboradores, controlo de acessos RBAC e dossiê documental digital da AETERNU.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadEmployees}
            disabled={isLoading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-brand-dark' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            onClick={() => {
              generateEmployeeNumber();
              setFormError(null);
              setFormSuccess(null);
              setIsCreateModalOpen(true);
            }}
            className="px-4 py-2.5 bg-brand hover:bg-[#7fae22] text-slate-950 rounded-xl text-xs font-black transition flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Funcionário</span>
          </button>
        </div>
      </div>

      {/* Interactive KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setSelectedKpiModal('total')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Total de Funcionários</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{totalCount || employees.length}</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
              {employees.filter(e => e.professionalStatus === 'ATIVO').length} Ativos
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver métricas e alocação &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('csat')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Técnicos de Campo</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">
              {employees.filter(e => e.category === 'TECNICO').length}
            </span>
            <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded-full">
              Operacional
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver avaliações de técnicos &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('pending')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Contas com Acesso ao Sistema</span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">
              {employees.filter(e => e.accountStatus === 'ATIVA').length}
            </span>
            <span className="text-[10px] bg-purple-100 text-purple-800 font-extrabold px-2 py-0.5 rounded-full">
              RBAC Ativo
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver perfis e credenciais &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('sla')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Dossiês Documentais Regulares</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">98.6%</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full">
              Conformidade Legal
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver regulamentação do trabalho &rarr;</p>
        </button>
      </div>

      {/* BARRA DE FILTROS E PESQUISA */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Pesquisa por Texto */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute inset-y-0 left-3.5 my-auto w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por nome, código interno, identificador..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          {/* Filtro por Categoria */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="all">Todas as Categorias</option>
              <option value="TECNICO">Técnico Operacional</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="ADMINISTRATIVO">Administrativo</option>
              <option value="GESTAO">Gestão / Coordenação</option>
              <option value="DIRECAO">Direção</option>
              <option value="OUTRO">Outro</option>
            </select>
          </div>

          {/* Filtro por Estado Profissional */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="all">Todos os Estados</option>
              <option value="ATIVO">Ativo</option>
              <option value="FERIAS">Em Férias</option>
              <option value="LICENCA">Licença</option>
              <option value="SUSPENSO">Suspenso</option>
              <option value="INATIVO">Inativo</option>
              <option value="DESLIGADO">Desligado</option>
            </select>
          </div>

          {/* Filtro por Perfil de Acesso */}
          <div>
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="all">Todos os Perfis</option>
              {accessProfiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Indicadores de Contagem */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
          <span>{totalCount} colaboradores encontrados</span>
          <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Dados em tempo real do Supabase
          </span>
        </div>
      </div>

      {/* MENSAGEM DE ERRO NA CONSULTA */}
      {fetchError && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Aviso de Consulta</span>
            <span>{fetchError}</span>
          </div>
        </div>
      )}

      {/* LISTAGEM DE COLABORADORES */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-xs font-semibold">A carregar colaboradores do Supabase...</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">Nenhum funcionário encontrado</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Não existem registos correspondentes aos filtros aplicados ou a base de dados ainda não tem colaboradores registados.
            </p>
            <button
              onClick={() => {
                generateEmployeeNumber();
                setIsCreateModalOpen(true);
              }}
              className="mt-4 px-4 py-2 bg-brand-dark text-white rounded-xl text-xs font-bold hover:bg-brand-deep transition cursor-pointer"
            >
              Criar Primeiro Funcionário
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Código</th>
                  <th className="py-3.5 px-4">Nome & Identificador</th>
                  <th className="py-3.5 px-4">Categoria / Função</th>
                  <th className="py-3.5 px-4">Contactos</th>
                  <th className="py-3.5 px-4">Estado</th>
                  <th className="py-3.5 px-4">Conta de Acesso</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => {
                  const isAccountActive = emp.accountStatus === 'ATIVA';
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition">
                      {/* Código */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {emp.employeeNumber}
                      </td>

                      {/* Nome & Identificador */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm">{emp.fullName}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          {emp.accessIdentifier ? (
                            <span className="font-mono text-emerald-700">@{emp.accessIdentifier}</span>
                          ) : (
                            <span className="text-slate-400 italic">Sem conta de acesso</span>
                          )}
                        </div>
                      </td>

                      {/* Categoria / Função */}
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                          {emp.category}
                        </span>
                        <div className="text-[11px] text-slate-600 font-medium mt-0.5">
                          {emp.professionalData.jobTitle || emp.professionalData.department || 'Operações'}
                        </div>
                      </td>

                      {/* Contactos */}
                      <td className="py-3.5 px-4 text-slate-600 space-y-0.5">
                        {emp.contacts.phone && (
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{emp.contacts.phone}</span>
                          </div>
                        )}
                        {emp.contacts.contactEmail && (
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[150px]">{emp.contacts.contactEmail}</span>
                          </div>
                        )}
                      </td>

                      {/* Estado Profissional */}
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 w-max ${
                          emp.professionalStatus === 'ATIVO' 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                            : emp.professionalStatus === 'FERIAS'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${emp.professionalStatus === 'ATIVO' ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                          {emp.professionalStatus}
                        </span>
                      </td>

                      {/* Conta de Acesso */}
                      <td className="py-3.5 px-4">
                        {emp.accountStatus === 'ATIVA' ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1 w-max">
                            <Lock className="w-3 h-3 text-emerald-600" /> Ativa ({(emp.extraPages || []).length} página(s))
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-medium flex items-center gap-1 w-max">
                            <Unlock className="w-3 h-3 text-slate-400" /> Sem Acesso
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenDetails(emp)}
                          className="px-3 py-1.5 bg-brand-dark hover:bg-brand-deep text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 ml-auto cursor-pointer shadow-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Dossiê & Ficha</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL: CRIAR NOVO FUNCIONÁRIO COM VALIDAÇÃO DE DUPLICADOS       */}
      {/* ============================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 animate-fadeIn">
            {/* Topo do Modal */}
            <div className="p-6 bg-brand-deep text-white flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand text-slate-950 flex items-center justify-center font-black">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">Registar Novo Funcionário</h3>
                  <p className="text-xs text-emerald-100/80">Validação rigorosa de duplicados contra o Supabase</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo do Formulário */}
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-5">
              {/* Notificações de Erro e Sucesso */}
              {formError && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-start gap-2.5 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Impossível Registar</span>
                    <span>{formError}</span>
                  </div>
                </div>
              )}

              {formSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-start gap-2.5 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Sucesso</span>
                    <span>{formSuccess}</span>
                  </div>
                </div>
              )}

              {/* SECÇÃO 1: DADOS PRINCIPAIS */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-brand-dark" />
                  <span>Identificação Geral</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Nome Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="ex: João Manuel da Silva"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold text-slate-700 uppercase">
                        Código Interno / Número *
                      </label>
                      <button
                        type="button"
                        onClick={generateEmployeeNumber}
                        className="text-[10px] text-brand-dark font-bold hover:underline"
                      >
                        Gerar Automático
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={employeeNumber}
                      onChange={(e) => setEmployeeNumber(e.target.value.toUpperCase())}
                      placeholder="ex: AET-1024"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Categoria Profissional *
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as EmployeeCategory)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                    >
                      <option value="TECNICO">Técnico Operacional</option>
                      <option value="SUPERVISOR">Supervisor</option>
                      <option value="ADMINISTRATIVO">Administrativo</option>
                      <option value="GESTAO">Gestão / Coordenação</option>
                      <option value="DIRECAO">Direção</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECÇÃO 2: ENQUADRAMENTO PROFISSIONAL */}
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4 text-brand-dark" />
                  <span>Enquadramento & Contactos</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Função / Cargo
                    </label>
                    <input
                      type="text"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      placeholder="ex: Técnico de Desinfestação"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Departamento
                    </label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="ex: Higiene & Ambiente"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Data de Admissão
                    </label>
                    <input
                      type="date"
                      value={admissionDate}
                      onChange={(e) => setAdmissionDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Telefone Profissional
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+244 9..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      E-mail Profissional
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="colaborador@aeternu.co.ao"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Bilhete de Identidade (BI)
                    </label>
                    <input
                      type="text"
                      value={biNumber}
                      onChange={(e) => setBiNumber(e.target.value.toUpperCase())}
                      placeholder="ex: 001234567LA042"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                </div>
              </div>

              {/* SECÇÃO 3: CONTA DE ACESSO AO SISTEMA */}
              <div className="pt-3 border-t border-slate-100">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="createAccountCheckbox"
                        checked={createAccount}
                        onChange={(e) => setCreateAccount(e.target.checked)}
                        className="w-4 h-4 accent-brand-dark rounded cursor-pointer"
                      />
                      <label htmlFor="createAccountCheckbox" className="text-xs font-bold text-slate-900 cursor-pointer">
                        Criar Conta de Acesso ao Sistema SICSC
                      </label>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {createAccount ? 'Perfil de acesso será vinculado' : 'Sem conta de utilizador'}
                    </span>
                  </div>

                  {createAccount && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 animate-fadeIn">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                          Identificador Canónico *
                        </label>
                        <input
                          type="text"
                          required={createAccount}
                          value={accessIdentifier}
                          onChange={(e) => setAccessIdentifier(e.target.value.toLowerCase())}
                          placeholder="ex: joao.silva"
                          className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                      </div>

                      <div className="sm:col-span-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] font-bold text-slate-700 uppercase">
                            Páginas visíveis para este colaborador *
                          </label>
                          <div className="flex items-center gap-3 text-[10px] font-bold">
                            <button type="button" onClick={() => setSelectedPages(APP_PAGES.filter(p => canGrantPage(p.key)).map(p => p.key))} className="text-brand-dark hover:underline cursor-pointer">Marcar todas</button>
                            <button type="button" onClick={() => setSelectedPages([])} className="text-slate-500 hover:underline cursor-pointer">Limpar</button>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500">Só ficam visíveis as páginas marcadas. O papel de dados é definido pela página de maior exigência.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto p-3 bg-slate-50 border border-slate-200 rounded-xl">
                          {APP_PAGES.map((page) => {
                            const allowed = canGrantPage(page.key);
                            const checked = selectedPages.includes(page.key);
                            return (
                              <label key={page.key} className={`flex items-start gap-2 p-2 rounded-lg border ${allowed ? 'bg-white border-slate-200 cursor-pointer hover:border-brand' : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'}`}>
                                <input type="checkbox" className="mt-0.5 accent-brand-dark" disabled={!allowed} checked={checked} onChange={() => togglePage(page.key)} />
                                <span className="text-xs">
                                  <span className="font-bold text-slate-900 block">{page.name}</span>
                                  <span className="text-[10px] text-slate-500">{page.section} · requer {ROLE_LABEL[page.requiredBaseRole]}{allowed ? '' : ' (sem autoridade para conceder)'}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-slate-600">
                          Papel de dados resultante: <strong>{ROLE_LABEL[derivedRole]}</strong> · {selectedPages.length} página(s) selecionada(s)
                        </p>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                          Palavra-passe Inicial
                        </label>
                        <input
                          type="password"
                          value={initialPassword}
                          required={createAccount}
                          onChange={(e) => setInitialPassword(e.target.value)}
                          placeholder="Mínimo 8 caracteres"
                          className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Botões do Rodapé do Modal */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-brand-dark hover:bg-brand-deep text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>A validar e guardar...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Registar Funcionário</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: DETALHES DO FUNCIONÁRIO E DOSSIÊ DOCUMENTAL DIGITAL     */}
      {/* ============================================================== */}
      {editOpen && selectedEmployee && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">Editar dados · {selectedEmployee.employeeNumber}</h3>
              <button onClick={() => setEditOpen(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer text-lg">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="sm:col-span-3 text-[11px] font-bold text-slate-700 uppercase">Nome completo
                  <input value={editName} onChange={e => setEditName(e.target.value)} maxLength={150}
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm normal-case font-normal" />
                </label>
                <label className="text-[11px] font-bold text-slate-700 uppercase">Categoria
                  <select value={editCategory} onChange={e => setEditCategory(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm normal-case font-normal">
                    {['TECNICO', 'SUPERVISOR', 'ADMINISTRATIVO', 'GESTAO', 'DIRECAO', 'OUTRO'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="sm:col-span-2 text-[11px] font-bold text-slate-700 uppercase">Estado profissional
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm normal-case font-normal">
                    {['ATIVO', 'FERIAS', 'LICENCA', 'SUSPENSO', 'INATIVO', 'DESLIGADO'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              {selectedEmployee.userId && (
                <div className="p-3 border border-slate-200 rounded-xl space-y-3">
                  <p className="text-[11px] font-bold text-slate-700 uppercase">Acesso à conta</p>
                  {currentUser?.role === 'ADMIN' && (
                    <div className="flex gap-2">
                      <input value={editIdent} onChange={e => setEditIdent(e.target.value)} placeholder="Identificador de acesso"
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                      <button type="button" onClick={async () => {
                        setAccessMsg(null);
                        const r = await changeEmployeeIdentifierViaAdmin(selectedEmployee.id, editIdent.trim());
                        setAccessMsg(r.success ? 'Identificador atualizado.' : (r.error || 'Não foi possível atualizar o identificador.'));
                        if (r.success) await loadEmployees();
                      }} className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer">Alterar identificador</button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input type="password" value={editNewPwd} onChange={e => setEditNewPwd(e.target.value)}
                      placeholder="Nova palavra-passe (8+ caracteres, letras e números)"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm" />
                    <button type="button" onClick={async () => {
                      setAccessMsg(null);
                      if (!isStrongPassword(editNewPwd)) { setAccessMsg('A palavra-passe deve ter pelo menos 8 caracteres, com letras e números.'); return; }
                      const r = await resetEmployeePasswordViaAdmin(selectedEmployee.id, editNewPwd);
                      setAccessMsg(r.success ? 'Palavra-passe redefinida. O colaborador terá de a alterar no próximo acesso.' : (r.error || 'Não foi possível redefinir a palavra-passe.'));
                      if (r.success) setEditNewPwd('');
                    }} className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer">Redefinir</button>
                  </div>
                  {accessMsg && <p className="text-xs text-slate-700">{accessMsg}</p>}
                </div>
              )}
              {['SUSPENSO', 'INATIVO', 'DESLIGADO'].includes(editStatus) && selectedEmployee.userId && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  Ao guardar com este estado, a conta de acesso deste colaborador é desativada.
                </p>
              )}
              <div>
                <p className="text-[11px] font-bold text-slate-700 uppercase mb-2">
                  Páginas visíveis {selectedEmployee.userId ? '' : '(só ficam ativas quando existir conta de acesso)'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  {APP_PAGES.map(page => {
                    const allowed = canGrantPage(page.key);
                    return (
                      <label key={page.key} className={`flex items-start gap-2 p-2 rounded-lg border bg-white ${allowed ? 'cursor-pointer border-slate-200' : 'opacity-60 cursor-not-allowed border-slate-200'}`}>
                        <input type="checkbox" className="mt-0.5 accent-brand-dark" disabled={!allowed}
                          checked={editPages.includes(page.key)}
                          onChange={() => setEditPages(p => p.includes(page.key) ? p.filter(k => k !== page.key) : [...p, page.key])} />
                        <span className="text-xs"><span className="font-bold text-slate-900 block">{page.name}</span>
                          <span className="text-[10px] text-slate-500">{page.section} · requer {ROLE_LABEL[page.requiredBaseRole]}</span></span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {editError && <p className="text-xs text-rose-600 font-medium">{editError}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditOpen(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer">Cancelar</button>
                <button disabled={editSaving} onClick={async () => {
                  setEditError(null);
                  if (editName.trim().length < 2) { setEditError('O nome deve ter pelo menos 2 caracteres.'); return; }
                  if (selectedEmployee.userId && editPages.length === 0) { setEditError('Uma conta de acesso precisa de pelo menos uma página.'); return; }
                  setEditSaving(true);
                  const r1 = await updateEmployeeViaAdmin(selectedEmployee.id, {
                    fullName: editName.trim(), category: editCategory as any, professionalStatus: editStatus as any,
                  });
                  if (!r1.success) { setEditSaving(false); setEditError(r1.error || 'Não foi possível guardar os dados.'); return; }
                  if (selectedEmployee.userId) {
                    const r2 = await updateEmployeeAccessViaAdmin(selectedEmployee.id, editPages);
                    if (!r2.success) { setEditSaving(false); setEditError(r2.error || 'Dados guardados, mas as páginas não foram atualizadas.'); await loadEmployees(); return; }
                  }
                  setEditSaving(false);
                  setEditOpen(false);
                  await loadEmployees();
                  setSelectedEmployee(r1.employee ?? selectedEmployee);
                }} className="px-4 py-2 bg-brand-dark disabled:opacity-60 text-white rounded-xl text-xs font-bold cursor-pointer">
                  {editSaving ? 'A guardar…' : 'Guardar alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isDetailsModalOpen && selectedEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 animate-fadeIn">
            {/* Topo do Dossiê */}
            <div className="p-6 bg-brand-deep text-white flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-brand text-slate-950 flex items-center justify-center font-black text-lg">
                  {selectedEmployee.fullName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">{selectedEmployee.fullName}</h3>
                  <div className="text-xs text-emerald-100/80 flex items-center gap-2">
                    <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-[10px]">
                      {selectedEmployee.employeeNumber}
                    </span>
                    <span>&bull;</span>
                    <span>{selectedEmployee.category}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canManageEmployees && (
                  <button
                    onClick={() => {
                      setEditName(selectedEmployee.fullName);
                      setEditCategory(selectedEmployee.category);
                      setEditStatus(selectedEmployee.professionalStatus);
                      setEditPages(selectedEmployee.extraPages || []);
                      setEditError(null);
                      setEditIdent(selectedEmployee.accessIdentifier || '');
                      setEditNewPwd('');
                      setAccessMsg(null);
                      setEditOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                  >
                    Editar dados
                  </button>
                )}
                <button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* CARTÃO RESUMO DE INFORMAÇÕES */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Departamento & Função</span>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {selectedEmployee.professionalData.jobTitle || 'Não especificado'}
                  </p>
                  <p className="text-slate-600">{selectedEmployee.professionalData.department || 'Operações'}</p>
                </div>

                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Contactos</span>
                  <p className="font-bold text-slate-900 mt-0.5">{selectedEmployee.contacts.phone || 'Sem telefone'}</p>
                  <p className="text-slate-600">{selectedEmployee.contacts.contactEmail || 'Sem e-mail'}</p>
                </div>

                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Conta & Segurança</span>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      selectedEmployee.accountStatus === 'ATIVA' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {selectedEmployee.accountStatus}
                    </span>
                    {selectedEmployee.extraPages && selectedEmployee.extraPages.length > 0 && (
                      <span className="text-slate-600 font-medium">({selectedEmployee.extraPages.length} página(s))</span>
                    )}
                  </div>
                  {selectedEmployee.accessIdentifier && (
                    <p className="font-mono text-[10px] text-slate-500 mt-0.5">@{selectedEmployee.accessIdentifier}</p>
                  )}
                </div>
              </div>

              {/* SECÇÃO DO DOSSIÊ DOCUMENTAL DIGITAL */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                      <FileText className="w-4 h-4 text-brand-dark" />
                      <span>Dossiê Documental Digital (Bucket Privado)</span>
                    </h4>
                    <p className="text-xs text-slate-500">
                      Documentos com validação por Magic Bytes (Assinatura Binária) e links assinados de 300 segundos.
                    </p>
                  </div>
                </div>

                {/* Notificações de Upload */}
                {docUploadError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span>{docUploadError}</span>
                  </div>
                )}
                {docUploadSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{docUploadSuccess}</span>
                  </div>
                )}

                {/* FORMULÁRIO DE UPLOAD DE NOVO DOCUMENTO */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-900 block mb-2">Adicionar Novo Documento</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                        Tipo de Documento
                      </label>
                      <select
                        value={selectedDocType}
                        onChange={(e) => setSelectedDocType(e.target.value as DocumentType)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand"
                      >
                        <option value="BI">Bilhete de Identidade (BI)</option>
                        <option value="CV">Curriculum Vitae (CV)</option>
                        <option value="CONTRATO">Contrato de Trabalho</option>
                        <option value="CERTIFICADO">Certificado de Habilitações</option>
                        <option value="CARTA_CONDUCAO">Carta de Condução</option>
                        <option value="REGISTO_CRIMINAL">Registo Criminal</option>
                        <option value="ATESTADO_MEDICO">Atestado Médico / HST</option>
                        <option value="OUTRO">Outro Documento</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                        Data de Validade (opcional)
                      </label>
                      <input
                        type="date"
                        value={docExpiryDate}
                        onChange={(e) => setDocExpiryDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand"
                      />
                    </div>

                    <div>
                      <label className="w-full px-4 py-2 bg-brand-dark hover:bg-brand-deep text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs">
                        {isDocUploading ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>A Carregar...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Selecionar e Enviar</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp"
                          disabled={isDocUploading}
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-2">
                    Formatos aceites: PDF, PNG, JPEG, WEBP. Tamanho máximo: 15MB.
                  </span>
                </div>

                {/* LISTA DE DOCUMENTOS DO COLABORADOR */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-800">
                    Documentos Arquivados ({employeeDocs.length})
                  </span>

                  {employeeDocs.length === 0 ? (
                    <div className="p-6 bg-white border border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs">
                      Nenhum documento anexado ao dossiê deste colaborador.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {employeeDocs.map((doc) => (
                        <div
                          key={doc.id}
                          className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-brand-dark flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">{doc.originalFilename}</p>
                              <div className="text-[10px] text-slate-500 flex items-center gap-2">
                                <span className="font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  {doc.documentType}
                                </span>
                                <span>{(doc.fileSizeBytes / 1024).toFixed(1)} KB</span>
                                <span>&bull;</span>
                                <span>Enviado a {new Date(doc.uploadedAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDownloadDoc(doc)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                              title="Visualizar via URL temporária assinada"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Aceder</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteDoc(doc)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                              title="Eliminar documento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK PROFILE CREATION MODAL */}

      {/* Universal KPI Detail Modal */}
      {selectedKpiModal && (
        <KpiDetailModal
          kpiType={selectedKpiModal as any}
          isOpen={!!selectedKpiModal}
          onClose={() => setSelectedKpiModal(null)}
          evaluations={evaluations}
          services={services}
          clients={clients}
        />
      )}
    </div>
  );
};

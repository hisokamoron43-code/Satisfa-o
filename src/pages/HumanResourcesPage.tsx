import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  HRCase, 
  FormQuestion, 
  QuestionType, 
  QuestionCategory,
  Team,
  Activity,
  EvaluationCriterion,
  EvaluationHistoricalSnapshot,
  Evaluation,
  WorkerNotification,
  AuditorReview,
  UserRole
} from '../types';
import {
  AccessProfile,
  fetchAccessProfiles,
  createAccessProfile,
  updateAccessProfile,
  deleteAccessProfile
} from '../services/employeesService';
import {
  validateCriteriaConfiguration,
  DEFAULT_EVALUATION_CRITERIA
} from '../services/evaluationUtils';
import { KpiDetailModal } from '../components/analytics/KpiDetailModal';
import { QuestionEditor } from '../components/forms/QuestionEditor';
import { WeightBalancerPanel } from '../components/evaluation/WeightBalancerPanel';
import { EvaluationReviewWorkspace, automaticConformity, missingQualitativeMessage, qualitativeContent } from '../components/evaluation/EvaluationReviewWorkspace';
import { calculateFinalScore } from '../services/finalScore';
import { 
  Users, 
  Shield, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  AlertCircle,
  Clock, 
  Plus, 
  Edit3, 
  X, 
  Mic, 
  Star, 
  Sliders, 
  MessageSquare, 
  FileText, 
  Eye, 
  Trash2, 
  Briefcase,
  ToggleLeft,
  ToggleRight,
  Calendar,
  Award,
  Send,
  Lock,
  Check,
  Info,
  RotateCcw
} from 'lucide-react';

import { SearchableSelect } from '../components/ui/SearchableSelect';
export const HumanResourcesPage: React.FC = () => {
  const { 
    clients,
    hrCases, 
    addHRCase, 
    evaluations, 
    providers, 
    permissionAudits,
    formQuestions,
    formCategories,
    addFormQuestion,
    updateFormQuestion,
    deleteFormQuestion,
    toggleFormQuestionActive,
    services,
    addService,
    toggleServiceStatus,
    setIsClientFormOpen,
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
    associateEvaluationClient
  } = useApp();

  const [activeTabSub, setActiveTabSub] = useState<'cases' | 'evaluation_review' | 'permissions'>('evaluation_review');
  const [selectedKpiModal, setSelectedKpiModal] = useState<string | null>(null);

  // Perfis de Acesso & Permissões (RBAC) State
  const [accessProfilesList, setAccessProfilesList] = useState<AccessProfile[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profName, setProfName] = useState('');
  const [profDesc, setProfDesc] = useState('');
  const [profBaseRole, setProfBaseRole] = useState<UserRole>('OPERATIONAL');
  const [profPages, setProfPages] = useState<string[]>(['dashboard', 'evaluations']);
  const [profIsActive, setProfIsActive] = useState(true);
  const [profError, setProfError] = useState<string | null>(null);
  const [profSuccess, setProfSuccess] = useState<string | null>(null);

  const ALL_SYSTEM_PAGES = [
    { key: 'dashboard', name: 'Painel Geral', section: 'Visão Geral' },
    { key: 'clients', name: 'Clientes', section: 'Operações' },
    { key: 'calendar', name: 'Calendário & Operações', section: 'Operações' },
    { key: 'services', name: 'Serviços', section: 'Operações' },
    { key: 'providers', name: 'Prestadores & Técnicos', section: 'Operações' },
    { key: 'evaluations', name: 'Avaliações', section: 'Qualidade & RH' },
    { key: 'evaluation_analysis', name: 'Análise de Avaliação', section: 'Qualidade & RH' },
    { key: 'form_editor', name: 'Edição de Formulário', section: 'Qualidade & RH' },
    { key: 'hr', name: 'Recursos Humanos', section: 'Qualidade & RH' },
    { key: 'employees', name: 'Funcionários', section: 'Administração' },
    { key: 'access_profiles', name: 'Perfis e Permissões', section: 'Administração' },
    { key: 'reports', name: 'Relatórios', section: 'Direção' },
    { key: 'users', name: 'Utilizadores do Sistema', section: 'Administração' },
    { key: 'audit', name: 'Auditoria', section: 'Segurança' },
    { key: 'settings', name: 'Configurações', section: 'Sistema' }
  ];

  const loadAccessProfilesData = async () => {
    try {
      const list = await fetchAccessProfiles();
      setAccessProfilesList(list);
    } catch (err) {
      console.warn('Erro ao carregar perfis:', err);
    }
  };

  useEffect(() => {
    loadAccessProfilesData();
  }, []);

  const handleOpenProfileModal = (profile?: AccessProfile) => {
    setProfError(null);
    setProfSuccess(null);
    if (profile) {
      setEditingProfileId(profile.id);
      setProfName(profile.name);
      setProfDesc(profile.description);
      setProfBaseRole(profile.baseRole);
      setProfPages(profile.pages || []);
      setProfIsActive(profile.isActive);
    } else {
      setEditingProfileId(null);
      setProfName('');
      setProfDesc('');
      setProfBaseRole('OPERATIONAL');
      setProfPages(['dashboard', 'evaluations', 'clients']);
      setProfIsActive(true);
    }
    setIsProfileModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfError(null);
    if (!profName.trim()) {
      setProfError('O nome do perfil é obrigatório.');
      return;
    }

    if (editingProfileId) {
      const res = await updateAccessProfile(editingProfileId, {
        name: profName.trim(),
        description: profDesc.trim(),
        baseRole: profBaseRole,
        pages: profPages,
        isActive: profIsActive
      });
      if (res.success) {
        setProfSuccess('Perfil atualizado com sucesso!');
        await loadAccessProfilesData();
        setTimeout(() => setIsProfileModalOpen(false), 1200);
      } else {
        setProfError(res.error || 'Erro ao atualizar perfil.');
      }
    } else {
      const res = await createAccessProfile({
        name: profName.trim(),
        description: profDesc.trim(),
        baseRole: profBaseRole,
        pages: profPages
      });
      if (res.success) {
        setProfSuccess('Perfil criado com sucesso!');
        await loadAccessProfilesData();
        setTimeout(() => setIsProfileModalOpen(false), 1200);
      } else {
        setProfError(res.error || 'Erro ao criar perfil.');
      }
    }
  };

  const handleDeleteProfile = async (id: string, isSystem: boolean, name: string) => {
    if (isSystem) {
      alert(`O perfil de sistema "${name}" está protegido e não pode ser eliminado.`);
      return;
    }
    if (!confirm(`Tem a certeza que deseja eliminar o perfil "${name}"?`)) return;

    const res = await deleteAccessProfile(id);
    if (res.success) {
      await loadAccessProfilesData();
    } else {
      alert(res.error || 'Erro ao eliminar perfil.');
    }
  };

  const handleToggleProfileActive = async (profile: AccessProfile) => {
    const res = await updateAccessProfile(profile.id, { isActive: !profile.isActive });
    if (res.success) {
      await loadAccessProfilesData();
    } else {
      alert(res.error || 'Erro ao alterar estado do perfil.');
    }
  };

  // Gestão de Equipas Modal
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCode, setNewTeamCode] = useState('');
  const [newTeamDept, setNewTeamDept] = useState('Higiene & Limpeza');
  const [newTeamSupervisor, setNewTeamSupervisor] = useState('');

  // Calendário Operacional Modal
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [newActTitle, setNewActTitle] = useState('');
  const [newActClient, setNewActClient] = useState('');
  const [newActService, setNewActService] = useState('');
  const [newActLocation, setNewActLocation] = useState('Luanda');
  const [newActDate, setNewActDate] = useState(new Date().toISOString().substring(0, 10));
  const [newActStart, setNewActStart] = useState('09:00');
  const [newActEnd, setNewActEnd] = useState('13:00');
  const [newActTeam, setNewActTeam] = useState('Equipa Operacional');
  const [calendarView, setCalendarView] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Gestão de Critérios (Rascunho de Edição com Validação em Tempo Real)
  const [draftCriteria, setDraftCriteria] = useState<EvaluationCriterion[]>(criteria);
  const [lastEditedCriterionId, setLastEditedCriterionId] = useState<string | undefined>(undefined);
  const [criteriaMsg, setCriteriaMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setDraftCriteria(criteria);
  }, [criteria]);

  // Cálculo da soma dos pesos em tempo real
  const currentTotalWeight = Math.round(
    draftCriteria
      .filter(c => c.active)
      .reduce((sum, c) => sum + (Number(c.weightPercentage) || 0), 0) * 100
  ) / 100;
  const isWeightSumValid = Math.abs(currentTotalWeight - 100) < 0.001;


  // Modal de Homologação de Avaliação pelo RH
  const [selectedEvalForReview, setSelectedEvalForReview] = useState<Evaluation | null>(null);
  const [reviewRatings, setReviewRatings] = useState<Record<string, number>>({});
  const [auditorReview, setAuditorReview] = useState<AuditorReview>({});
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [selectedAssociateClientId, setSelectedAssociateClientId] = useState<string>('');
  const [isAssociatingClient, setIsAssociatingClient] = useState<boolean>(false);
  const [associateSuccessMsg, setAssociateSuccessMsg] = useState<string | null>(null);

  // Modal de Visualização de Snapshot Histórico Imutável
  const [selectedSnapshot, setSelectedSnapshot] = useState<EvaluationHistoricalSnapshot | null>(null);
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);

  // HR Case modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvalId, setSelectedEvalId] = useState('');
  const [occurrenceType, setOccurrenceType] = useState<HRCase['occurrenceType']>('QUALIDADE_SERVICO');
  const [internalNotes, setInternalNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState('Dra. Luísa Kanjila');
  const [correctiveAction, setCorrectiveAction] = useState('');

  // Form Question Modal
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [questionDescription, setQuestionDescription] = useState('');
  const [questionCategory, setQuestionCategory] = useState<QuestionCategory>('QUALIDADE');
  const [questionType, setQuestionType] = useState<QuestionType>('RATING_5');
  const [questionRequired, setQuestionRequired] = useState(true);
  const [questionOrder, setQuestionOrder] = useState(1);

  // New Service quick modal
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceCode, setNewServiceCode] = useState('');
  const [newServiceDesc, setNewServiceDesc] = useState('');

  const handleOpenModal = () => {
    const unhandled = evaluations.filter(e => !hrCases.some(c => c.evaluationId === e.id));
    if (unhandled.length > 0) {
      setSelectedEvalId(unhandled[0].id);
    } else if (evaluations.length > 0) {
      setSelectedEvalId(evaluations[0].id);
    }
    setOccurrenceType('QUALIDADE_SERVICO');
    setInternalNotes('');
    setAssignedTo('Dra. Luísa Kanjila');
    setCorrectiveAction('');
    setIsModalOpen(true);
  };

  const handleSaveCase = (e: React.FormEvent) => {
    e.preventDefault();
    addHRCase({
      evaluationId: selectedEvalId,
      occurrenceType,
      internalNotes,
      assignedTo,
      correctiveAction,
      status: 'EM_ANALISE'
    });
    setIsModalOpen(false);
  };

  const handleSaveTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    addTeam({
      name: newTeamName.trim(),
      code: newTeamCode.trim() || `EQ-${Math.floor(100 + Math.random() * 900)}`,
      department: newTeamDept,
      supervisorName: newTeamSupervisor.trim() || 'Coordenador Operacional',
      status: 'ACTIVE',
      membersCount: 0
    });
    setNewTeamName('');
    setNewTeamCode('');
    setNewTeamSupervisor('');
    setIsTeamModalOpen(false);
  };

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newActTitle.trim()) return;
    
    const res = await addActivity({
      title: newActTitle.trim(),
      clientName: newActClient.trim() || 'Cliente AETERNU',
      serviceName: newActService.trim() || 'Serviço Geral de Higiene',
      location: newActLocation,
      activityDate: newActDate,
      startTime: newActStart,
      endTime: newActEnd,
      teamName: newActTeam,
      assignedProviderIds: [],
      supervisorName: 'Supervisor de Turno',
      status: 'SCHEDULED'
    });

    setNewActTitle('');
    setNewActClient('');
    setNewActService('');
    setIsActivityModalOpen(false);

    if (res.hasConflict) {
      alert('Aviso de Conflito: Já existe outra actividade agendada para a mesma equipa neste intervalo de horário.');
    }
  };

  const getTypeBadge = (type: QuestionType) => {
    switch (type) {
      case 'RATING_5': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Escala 5 ★</span>;
      case 'AUDIO_AND_TEXT': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 flex items-center gap-1"><Mic className="w-3 h-3" /> Áudio & Texto</span>;
      case 'NPS_10': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">NPS (0-10)</span>;
      case 'TEXT_ONLY': return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Texto Livre</span>;
      default: return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{type}</span>;
    }
  };

  const handleOpenQuestionModal = (question?: FormQuestion) => {
    if (question) {
      setEditingQuestionId(question.id);
      setQuestionText(question.text);
      setQuestionDescription(question.description || '');
      setQuestionCategory(question.category);
      setQuestionType(question.type);
      setQuestionRequired(question.required);
      setQuestionOrder(question.order);
    } else {
      setEditingQuestionId(null);
      setQuestionText('');
      setQuestionDescription('');
      setQuestionCategory('QUALIDADE');
      setQuestionType('RATING_5');
      setQuestionRequired(true);
      setQuestionOrder(formQuestions.length + 1);
    }
    setIsQuestionModalOpen(true);
  };

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;
    if (editingQuestionId) {
      updateFormQuestion(editingQuestionId, {
        text: questionText.trim(),
        description: questionDescription.trim(),
        category: questionCategory,
        type: questionType,
        required: questionRequired,
        order: questionOrder
      });
    } else {
      addFormQuestion({
        text: questionText.trim(),
        description: questionDescription.trim(),
        category: questionCategory,
        type: questionType,
        required: questionRequired,
        order: questionOrder,
        active: true
      });
    }
    setIsQuestionModalOpen(false);
  };

  const handleSaveNewService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim()) return;
    addService({
      name: newServiceName.trim(),
      code: newServiceCode.trim() || `SRV-${Math.floor(100 + Math.random() * 900)}`,
      description: newServiceDesc.trim() || 'Serviço prestado pela equipa AETERNU',
      evaluationIndicator: 'CSAT',
      status: 'ACTIVE'
    });
    setNewServiceName('');
    setNewServiceCode('');
    setNewServiceDesc('');
    setIsServiceModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Recursos Humanos & Qualidade</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestão confidencial de ocorrências, equipas, calendário operacional, critérios de pontuação e comunicação aos trabalhadores.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTabSub('cases')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition ${activeTabSub === 'cases' ? 'bg-brand text-slate-950 shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Ocorrências
          </button>
          <button
            onClick={() => setActiveTabSub('evaluation_review')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 ${activeTabSub === 'evaluation_review' ? 'bg-brand text-slate-950 shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Avaliação Técnica & Pesos</span>
          </button>
          <button
            onClick={() => setActiveTabSub('permissions')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition ${activeTabSub === 'permissions' ? 'bg-brand text-slate-950 shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Acessos
          </button>
        </div>
      </div>

      {/* Interactive KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setSelectedKpiModal('pending')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Pendentes Análise RH</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">
              {evaluations.filter(e => e.status === 'PENDING_REVIEW').length}
            </span>
            <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded-full">
              Requer Análise
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para abrir lista de avaliações a homologar pelo RH &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('csat')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Desempenho Geral CSAT</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              ★
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">
              {evaluations.length > 0 ? (evaluations.reduce((acc, curr) => acc + (curr.satisfactionRating || 0), 0) / evaluations.length).toFixed(1) : '4.8'}
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
              Meta &ge; 4.5
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver pesos de avaliação e critérios de cálculo &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('corrective')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Ocorrências e Ações</span>
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{hrCases.length}</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
              {hrCases.filter(c => c.status === 'RESOLVIDO').length} Resolvidos
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver dossiês de ocorrência e intervenção &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('sla')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Cumprimento do Limiar ({passingThreshold}%)</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">96.4%</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full">
              Conforme
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver classificação e homologação ponderada &rarr;</p>
        </button>
      </div>
      {activeTabSub === 'cases' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-slate-900">Ocorrências e Acompanhamento Disciplinar / Qualidade</h3>
            <button
              onClick={handleOpenModal}
              style={{ backgroundColor: '#8CBF26' }}
              className="text-slate-950 font-extrabold px-4 py-2 rounded-xl shadow-md text-xs flex items-center gap-2 hover:opacity-95 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Registar Ocorrência</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-4">Avaliação / Tipo</th>
                    <th className="p-4">Notas Internas Confidenciais</th>
                    <th className="p-4">Acção Correctiva Proposta</th>
                    <th className="p-4">Responsável</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hrCases.map(cCase => {
                    const evalObj = evaluations.find(e => e.id === cCase.evaluationId);
                    return (
                      <tr key={cCase.id} className="hover:bg-slate-50/80 transition">
                        <td className="p-4">
                          <p className="font-bold text-slate-900">{evalObj?.reference || 'AVAL-2026-XXXX'}</p>
                          <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-bold text-[10px]">
                            {cCase.occurrenceType}
                          </span>
                        </td>
                        <td className="p-4 text-slate-700 max-w-xs">
                          <p className="line-clamp-2">{cCase.internalNotes}</p>
                        </td>
                        <td className="p-4 text-slate-700 max-w-xs">
                          <p className="line-clamp-2 font-medium">{cCase.correctiveAction}</p>
                        </td>
                        <td className="p-4 text-slate-600 font-medium">{cCase.assignedTo}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${cCase.status === 'RESOLVIDO' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {cCase.status === 'RESOLVIDO' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {cCase.status}
                          </span>
                        </td>
                        <td className="p-4 text-right text-slate-500">{cCase.createdAt}</td>
                      </tr>
                    );
                  })}
                  {hrCases.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-400">
                        Nenhuma ocorrência registada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-ABA: AVALIAÇÃO TÉCNICA E PESOS RH */}
      {activeTabSub === 'evaluation_review' && (
        <div className="space-y-6">
          {/* Header com Limiar Configurável */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-black shadow-xs">
            <div>
              <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-brand/30 text-slate-950 border border-black">
                Módulo Central de Qualidade & RH
              </span>
              <h3 className="text-base font-black text-slate-950 mt-1">
                Homologação de Avaliações, Critérios Ponderados & Limiar de Aprovação
              </h3>
              <p className="text-xs text-slate-700 font-medium">
                Cálculo ponderado matemático de 0 a 100%, validação estrita de pesos, snapshots históricos imutáveis e notificação aos trabalhadores.
              </p>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-black">
              <span className="text-xs font-black text-slate-950">Limite de Aprovação:</span>
              <div className="flex items-center gap-1">
                <input 
                  type="number" 
                  min="0"
                  max="100"
                  defaultValue={passingThreshold} 
                  onBlur={async (e) => {
                    const newValue = Number(e.target.value);
                    if (newValue === passingThreshold) return;
                    const res = await updatePassingThreshold(newValue);
                    if (!res.success) {
                      alert(res.error || 'Erro ao atualizar limiar.');
                      e.target.value = String(passingThreshold);
                    }
                  }}
                  className="w-16 bg-white border border-black rounded-lg px-2 py-1 text-xs font-black text-slate-950 text-center"
                />
                <span className="text-xs font-black text-brand-dark">%</span>
              </div>
              <span className="text-[10px] font-bold text-slate-600 block pl-1 border-l border-black/20">
                (&ge; {passingThreshold}% Positivo | &lt; {passingThreshold}% Negativo)
              </span>
            </div>
          </div>

          {/* CARTÃO DA PARTE AUTOMÁTICA (SOMENTE LEITURA): pesos reais e pontos máximos por critério */}
          <div className="bg-white p-6 rounded-2xl border-2 border-black shadow-sm space-y-4">
            <div className="pb-3 border-b border-black">
              <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-brand/30 text-slate-950 border border-black inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-brand-dark" /> Pontuação 80/20
              </span>
              <h4 className="text-base font-black text-slate-950 mt-1">Pontos máximos por critério (parte automática)</h4>
              <p className="text-xs text-slate-700">
                Cada critério vale o seu peso sobre os 80 pontos automáticos. A conformidade real vem das respostas de cada avaliação e não é editável aqui.
                O áudio (10 pontos) e os argumentos escritos (10 pontos) são classificados pelo analisador em cada avaliação.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-black rounded-xl overflow-hidden">
                <thead className="bg-slate-100 text-slate-950 font-black uppercase">
                  <tr>
                    <th className="p-3 text-left border-r border-black/10">Critério</th>
                    <th className="p-3 text-center border-r border-black/10">Peso</th>
                    <th className="p-3 text-right">Pontos máximos (peso × 0,8)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 text-slate-950">
                  {criteria.filter((c) => c.active).map((crit) => (
                    <tr key={crit.id}>
                      <td className="p-3 font-bold border-r border-black/10">{crit.categoryName}</td>
                      <td className="p-3 text-center font-black border-r border-black/10">{crit.weightPercentage}%</td>
                      <td className="p-3 text-right font-mono font-bold">{(crit.weightPercentage * 0.8).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-black border-t-2 border-black">
                    <td className="p-3 border-r border-black/10 uppercase">Total</td>
                    <td className="p-3 text-center border-r border-black/10">{currentTotalWeight.toFixed(2)}%</td>
                    <td className="p-3 text-right font-mono">80,00 pontos automáticos</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-black text-xs text-slate-800 font-medium">
              <strong className="text-slate-950 font-black">Pontuação final: </strong>
              Automático (máx. 80) + Áudio (máx. 10) + Argumentos (máx. 10) = 100. Limiar atual: <strong className="text-black font-black">{passingThreshold}%</strong>.
            </div>
          </div>

          {/* EDITOR DINÂMICO DE CRITÉRIOS DE AVALIAÇÃO COM VALIDAÇÃO DE PESOS */}
          <div className="bg-white p-6 rounded-2xl border border-black shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black">
              <div>
                <h4 className="text-base font-black text-slate-950">
                  Configuração de Critérios & Ponderações Operacionais
                </h4>
                <p className="text-xs text-slate-700 font-medium">
                  A soma dos pesos de todos os critérios activos DEVE totalizar exactamente 100.0%.
                </p>
              </div>

              {/* Indicador de Soma de Pesos em Tempo Real */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Soma Activa:</span>
                <span className={`px-3 py-1 rounded-xl text-xs font-black border border-black ${
                  isWeightSumValid ? 'bg-emerald-100 text-emerald-950' : 'bg-red-100 text-red-950 animate-pulse'
                }`}>
                  {currentTotalWeight.toFixed(1)}% {isWeightSumValid ? '✓ Válido' : '✕ Inválido (deve ser 100%)'}
                </span>
              </div>
            </div>

            <WeightBalancerPanel
              saved={criteria}
              draft={draftCriteria}
              changedId={lastEditedCriterionId}
              questions={formQuestions}
              services={services}
              onApply={setDraftCriteria}
            />

            {criteriaMsg && (
              <div className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                criteriaMsg.type === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-950' : 'bg-red-50 border-red-500 text-red-950'
              }`}>
                <span>{criteriaMsg.text}</span>
                <button onClick={() => setCriteriaMsg(null)}><X className="w-4 h-4" /></button>
              </div>
            )}

            {/* Lista Editável de Critérios */}
            <div className="space-y-3">
              {draftCriteria.map((crit, idx) => (
                <div key={crit.id} className="p-4 bg-white border border-black rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={crit.categoryName}
                        onChange={(e) => {
                          const updated = [...draftCriteria];
                          updated[idx] = { ...updated[idx], categoryName: e.target.value };
                          setDraftCriteria(updated);
                        }}
                        className="font-black text-xs text-slate-950 bg-white border border-black rounded-lg px-2 py-1 max-w-xs focus:ring-1 focus:ring-brand"
                        placeholder="Nome do Critério"
                      />
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black border border-black ${crit.active ? 'bg-emerald-100 text-emerald-950' : 'bg-slate-100 text-slate-600'}`}>
                        {crit.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-[11px] font-bold text-slate-700">Categoria do formulário:</label>
                      <select
                        value={crit.categoryCode || ''}
                        onChange={(e) => {
                          const updated = [...draftCriteria];
                          updated[idx] = { ...updated[idx], categoryCode: e.target.value };
                          setDraftCriteria(updated);
                        }}
                        className="bg-white border border-black rounded-lg px-2 py-0.5 text-[11px] font-bold"
                      >
                        <option value="">(por nome do critério)</option>
                        {formCategories.map((cat) => <option key={cat.id} value={cat.code}>{cat.name}</option>)}
                      </select>
                    </div>
                    <input 
                      type="text" 
                      value={crit.description || ''}
                      onChange={(e) => {
                        const updated = [...draftCriteria];
                        updated[idx] = { ...updated[idx], description: e.target.value };
                        setDraftCriteria(updated);
                      }}
                      className="w-full text-[11px] text-slate-700 bg-white border border-black/40 rounded px-2 py-0.5 font-medium"
                      placeholder="Descrição operacional do critério..."
                    />
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-auto">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[11px] font-bold text-slate-700">Peso (%):</label>
                      <input 
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={crit.weightPercentage}
                        onChange={(e) => {
                          const updated = [...draftCriteria];
                          updated[idx] = { ...updated[idx], weightPercentage: Number(e.target.value) };
                          setLastEditedCriterionId(crit.id);
                          setDraftCriteria(updated);
                        }}
                        className="w-16 bg-white border border-black rounded-lg px-2 py-1 text-center font-black text-slate-950 text-xs"
                      />
                      <span className="font-bold text-xs">%</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <label className="text-[11px] font-bold text-slate-700">Máx:</label>
                      <input 
                        type="number"
                        min="1"
                        max="100"
                        value={crit.maxScore}
                        onChange={(e) => {
                          const updated = [...draftCriteria];
                          updated[idx] = { ...updated[idx], maxScore: Math.max(1, Number(e.target.value)) };
                          setDraftCriteria(updated);
                        }}
                        className="w-14 bg-white border border-black rounded-lg px-2 py-1 text-center font-black text-slate-950 text-xs"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...draftCriteria];
                        updated[idx] = { ...updated[idx], active: !updated[idx].active };
                        setLastEditedCriterionId(undefined);
                        setDraftCriteria(updated);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border border-black transition ${crit.active ? 'bg-amber-100 text-amber-950' : 'bg-emerald-100 text-emerald-950'}`}
                    >
                      {crit.active ? 'Desactivar' : 'Activar'}
                    </button>

                    {draftCriteria.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setLastEditedCriterionId(undefined);
                          setDraftCriteria(draftCriteria.filter((_, i) => i !== idx));
                        }}
                        className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition"
                        title="Remover critério"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Ações do Editor de Critérios */}
            <div className="pt-3 border-t border-black flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newId = `crit-${Date.now()}`;
                    setLastEditedCriterionId(newId);
                    setDraftCriteria([
                      ...draftCriteria,
                      {
                        id: newId,
                        categoryCode: '',
                        categoryName: 'Novo Critério Operacional',
                        description: 'Descrição das exigências e métricas',
                        weightPercentage: 0,
                        maxScore: 5,
                        minScore: 0,
                        active: true,
                        order: draftCriteria.length + 1
                      }
                    ]);
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-950 font-bold border border-black rounded-xl text-xs flex items-center gap-1.5 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Critério
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftCriteria(DEFAULT_EVALUATION_CRITERIA.map(c => ({ ...c })));
                    setCriteriaMsg({ type: 'success', text: 'Critérios restaurados para o padrão oficial AETERNU (40/20/25/15).' });
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold border border-black rounded-xl text-xs flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Restaurar Padrão AETERNU
                </button>
              </div>

              <button
                type="button"
                disabled={!isWeightSumValid}
                onClick={async () => {
                  const res = await updateCriteria(draftCriteria);
                  if (res.success) {
                    setCriteriaMsg({ type: 'success', text: 'Critérios de avaliação gravados com sucesso! Soma validada em 100.0%.' });
                  } else {
                    setCriteriaMsg({ type: 'error', text: res.errors?.join(' ') || 'Erro ao gravar critérios.' });
                  }
                }}
                style={{ backgroundColor: isWeightSumValid ? '#8CBF26' : undefined }}
                className={`px-5 py-2 font-black border border-black rounded-xl text-xs shadow-md transition flex items-center gap-1.5 ${
                  isWeightSumValid ? 'text-black hover:opacity-95' : 'bg-slate-200 text-slate-500 cursor-not-allowed opacity-60'
                }`}
              >
                <Check className="w-4 h-4" /> Gravar Alterações de Critérios
              </button>
            </div>
          </div>

          {/* LISTA DE AVALIAÇÕES PARA HOMOLOGAÇÃO & SNAPSHOTS IMUTÁVEIS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bloco 1: Avaliações Pendentes de Análise Técnica */}
            <div className="bg-white p-6 rounded-2xl border border-black shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-black/10">
                <div>
                  <h4 className="text-sm font-black text-slate-950">
                    Aguardando Avaliação e Homologação de RH
                  </h4>
                  <p className="text-[11px] text-slate-600 font-medium">
                    Formulários submetidos por clientes que requerem avaliação técnica individual por critério.
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-950 border border-black">
                  {evaluations.filter(e => e.status === 'PENDING_REVIEW' || !e.finalizedAt).length}
                </span>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {evaluations.filter(e => e.status === 'PENDING_REVIEW' || !e.finalizedAt).map(ev => (
                  <div key={ev.id} className="p-4 bg-white border border-black rounded-xl space-y-2 shadow-2xs hover:border-brand transition">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-xs text-slate-950">{ev.reference}</span>
                        {ev.clientId ? (
                          <span className="text-[10px] text-slate-900 font-bold bg-slate-100 px-2 py-0.5 rounded border border-black/10 flex items-center gap-1">
                            <Briefcase className="w-3 h-3 text-brand-dark" />
                            {ev.clientName}
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-950 font-black bg-amber-100 px-2 py-0.5 rounded border border-amber-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-700" />
                            Empresa por associar: {ev.clientNameInput || ev.clientName}
                          </span>
                        )}
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-50 text-amber-900 border border-amber-300">
                        Pendente RH
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-700 font-medium">
                      <span>Serviço: <strong className="text-black">{ev.serviceName}</strong></span>
                      <span className="mx-2">|</span>
                      <span>Técnico: <strong className="text-black">{ev.providerName || 'Equipa Geral'}</strong></span>
                      <span className="mx-2">|</span>
                      <span>CSAT Cliente: <strong className="text-black">★ {ev.satisfactionRating} / 5</strong></span>
                    </div>

                    {ev.comment && (
                      <p className="text-[11px] text-slate-600 italic bg-slate-50 p-2 rounded border border-black/10 line-clamp-2">
                        "{ev.comment}"
                      </p>
                    )}

                    <div className="pt-2 border-t border-black/10 flex items-center justify-end">
                      <button
                        onClick={() => {
                          setSelectedEvalForReview(ev);
                          // Notas iniciais = sugestões calculadas das respostas pontuáveis do cliente.
                          // Critérios sem respostas pontuáveis ficam por avaliar (o auditor tem de os preencher).
                          const initialRatings: Record<string, number> = automaticConformity(ev, criteria, formQuestions);
                          setAuditorReview(ev.auditorReview ?? {});
                          setReviewRatings(initialRatings);
                          setReviewError(null);
                          setIsReviewModalOpen(true);
                        }}
                        style={{ backgroundColor: '#8CBF26' }}
                        className="px-4 py-1.5 text-black font-black border border-black rounded-xl text-xs hover:opacity-95 transition shadow-xs flex items-center gap-1.5"
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>Avaliar / Homologar Critérios</span>
                      </button>
                    </div>
                  </div>
                ))}

                {evaluations.filter(e => e.status === 'PENDING_REVIEW' || !e.finalizedAt).length === 0 && (
                  <div className="p-8 text-center text-slate-500 text-xs font-medium">
                    Nenhuma avaliação pendente de homologação técnica.
                  </div>
                )}
              </div>
            </div>

            {/* Bloco 2: Avaliações Homologadas com Snapshot Imutável */}
            <div className="bg-white p-6 rounded-2xl border border-black shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-black/10">
                <div>
                  <h4 className="text-sm font-black text-slate-950">
                    Avaliações Homologadas com Snapshot Imutável
                  </h4>
                  <p className="text-[11px] text-slate-600 font-medium">
                    Registos auditáveis oficiais cuja pontuação e critérios estão permanentemente protegidos.
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-950 border border-black">
                  {evaluations.filter(e => e.finalizedAt).length}
                </span>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {evaluations.filter(e => e.finalizedAt).map(ev => {
                  const isPositive = ev.finalClassification === 'POSITIVE' || (ev.technicalScore ?? 0) >= passingThreshold;
                  return (
                    <div key={ev.id} className="p-4 bg-white border border-black rounded-xl space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs text-slate-950">{ev.reference}</span>
                          <span className="text-[10px] text-slate-700 font-bold">{ev.clientName}</span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-black border border-black ${
                          isPositive ? 'bg-emerald-100 text-emerald-950' : 'bg-red-100 text-red-950'
                        }`}>
                          {ev.technicalScore !== undefined ? `${ev.technicalScore}%` : '84.0%'} ({isPositive ? 'Positivo' : 'Negativo'})
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-700 font-medium flex flex-wrap items-center justify-between gap-1">
                        <span>Técnico: <strong className="text-black">{ev.providerName || 'Equipa Geral'}</strong></span>
                        <span className="text-slate-500">Homologado em: {ev.finalizedAt?.substring(0, 10)}</span>
                      </div>

                      <div className="pt-2 border-t border-black/10 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500 font-medium">
                          Por: <strong className="text-slate-800">{ev.finalizedBy || 'Recursos Humanos'}</strong>
                        </span>

                        <div className="flex items-center gap-2">
                          {ev.criteriaSnapshot && (
                            <button
                              onClick={() => {
                                setSelectedSnapshot(ev.criteriaSnapshot || null);
                                setIsSnapshotModalOpen(true);
                              }}
                              className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-950 font-bold border border-black rounded-lg text-[10px] flex items-center gap-1 shadow-2xs transition"
                            >
                              <Lock className="w-3 h-3 text-brand-dark" /> Ver Snapshot Auditável
                            </button>
                          )}

                          <button
                            onClick={() => {
                              const notif: WorkerNotification = {
                                id: `notif-${Date.now()}`,
                                evaluationId: ev.id,
                                evaluationReference: ev.reference,
                                providerId: ev.providerId || 'p1',
                                providerName: ev.providerName || 'Equipa Operacional',
                                finalScore: ev.technicalScore ?? 84,
                                resultStatus: isPositive ? 'POSITIVE' : 'NEGATIVE',
                                notifiedAt: new Date().toISOString(),
                                notifiedBy: 'Recursos Humanos AETERNU',
                                sharedFeedback: ev.comment || 'Classificação de serviço homologada.'
                              };
                              sendWorkerNotification(notif);
                              alert(`Resultado (${ev.technicalScore ?? 84}%) comunicado novamente ao prestador ${ev.providerName}!`);
                            }}
                            className="px-3 py-1 bg-brand hover:bg-brand/90 text-black font-black border border-black rounded-lg text-[10px] flex items-center gap-1 shadow-2xs transition"
                          >
                            <Send className="w-3 h-3" /> Notificar Trabalhador
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {evaluations.filter(e => e.finalizedAt).length === 0 && (
                  <div className="p-8 text-center text-slate-500 text-xs font-medium">
                    Nenhuma avaliação homologada ainda. As avaliações avaliadas aparecerão aqui com snapshots imutáveis.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* HISTÓRICO DE NOTIFICAÇÕES DISPARADAS AOS TRABALHADORES */}
          <div className="bg-white p-6 rounded-2xl border border-black shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-black/10">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-brand-dark" />
                <h4 className="text-sm font-black text-slate-950">
                  Comunicações de Avaliação Enviadas aos Trabalhadores ({workerNotifications.length})
                </h4>
              </div>
              <span className="text-xs text-slate-600 font-bold">Feedback em Tempo Real</span>
            </div>

            <div className="overflow-x-auto border border-black rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 border-b border-black text-slate-950 font-black">
                  <tr>
                    <th className="p-3">Avaliação Ref.</th>
                    <th className="p-3">Colaborador / Prestador</th>
                    <th className="p-3 text-center">Nota Ponderada</th>
                    <th className="p-3 text-center">Classificação</th>
                    <th className="p-3">Data e Hora de Envio</th>
                    <th className="p-3">Comentário Partilhado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 text-slate-950">
                  {workerNotifications.map(notif => (
                    <tr key={notif.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold">{notif.evaluationReference || notif.evaluationId}</td>
                      <td className="p-3 font-bold">{notif.providerName || notif.providerId}</td>
                      <td className="p-3 text-center font-black font-mono text-sm">{notif.finalScore}%</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black border border-black ${
                          notif.resultStatus === 'POSITIVE' ? 'bg-emerald-100 text-emerald-950' : 'bg-red-100 text-red-950'
                        }`}>
                          {notif.resultStatus === 'POSITIVE' ? 'Positiva' : 'Negativa'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">{notif.notifiedAt?.replace('T', ' ').substring(0, 19)}</td>
                      <td className="p-3 text-slate-700 italic max-w-xs truncate">{notif.sharedFeedback || '—'}</td>
                    </tr>
                  ))}
                  {workerNotifications.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        Nenhuma notificação enviada aos trabalhadores ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-ABA: PERFIS E PERMISSÕES (RBAC) & AUDITORIA */}
      {activeTabSub === 'permissions' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <span className="px-2.5 py-0.5 rounded text-[10px] font-black uppercase bg-brand/30 text-slate-950 border border-slate-300">
                Gestão de Acessos RBAC
              </span>
              <h3 className="text-xl font-black text-slate-900 mt-1">Perfis de Acesso & Matriz de Permissões</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Criação, edição e controlo soberano de perfis corporativos e páginas autorizadas na plataforma AETERNU.
              </p>
            </div>
            <button
              onClick={() => handleOpenProfileModal()}
              style={{ backgroundColor: '#8CBF26' }}
              className="text-slate-950 font-extrabold px-4 py-2.5 rounded-xl shadow-md text-xs flex items-center gap-2 hover:opacity-95 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Novo Perfil</span>
            </button>
          </div>

          {/* LISTA DE PERFIS DE ACESSO */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accessProfilesList.map((prof) => (
              <div key={prof.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      prof.isSystem ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {prof.isSystem ? 'Sistema' : 'Personalizado'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleProfileActive(prof)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                        prof.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {prof.isActive ? 'Ativo' : 'Inativo'}
                    </button>
                  </div>
                  <h4 className="text-base font-black text-slate-900">{prof.name}</h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{prof.description || 'Sem descrição'}</p>
                  
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-medium">Nível Base:</span>
                      <strong className="font-mono text-slate-900">{prof.baseRole}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-medium">Páginas Autorizadas:</span>
                      <strong className="text-emerald-800 font-bold">{prof.pages?.length || 0} páginas</strong>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenProfileModal(prof)}
                    className="flex-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar & Permissões</span>
                  </button>

                  {!prof.isSystem && (
                    <button
                      type="button"
                      onClick={() => handleDeleteProfile(prof.id, prof.isSystem, prof.name)}
                      className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition cursor-pointer"
                      title="Eliminar perfil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* HISTÓRICO DE AUDITORIA DE PRESTADORES */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">Histórico de Autorizações de Acesso a Avaliações por Prestadores</h3>
              <span className="text-xs bg-slate-100 text-slate-600 font-bold px-3 py-1 rounded-lg">Política de Menor Privilégio</span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-4">Prestador</th>
                    <th className="p-4">Alteração de Estado</th>
                    <th className="p-4">Motivo / Justificação</th>
                    <th className="p-4">Autorizado Por</th>
                    <th className="p-4 text-right">Data e Hora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {permissionAudits.map(audit => (
                    <tr key={audit.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-4 font-bold text-slate-900">{audit.providerName}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 font-bold">
                          <span className={audit.previousState ? 'text-emerald-600' : 'text-slate-400'}>{audit.previousState ? 'Autorizado' : 'Não Autorizado'}</span>
                          <span>→</span>
                          <span className={audit.newState ? 'text-emerald-600 font-black' : 'text-red-600 font-black'}>{audit.newState ? 'Autorizado' : 'Revogado'}</span>
                        </div>
                      </td>
                      <td className="p-4 text-slate-700 max-w-md">{audit.reason}</td>
                      <td className="p-4 text-slate-600 font-medium">{audit.changedBy}</td>
                      <td className="p-4 text-right text-slate-500">{audit.changedAt}</td>
                    </tr>
                  ))}
                  {permissionAudits.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-slate-400">
                        Nenhum histórico de autorização de acesso registado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Nova Ocorrência de RH */}
      {isModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-black text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-black/15 mb-4">
              <h3 className="text-base font-black text-slate-950">Registar Ocorrência de RH / Qualidade</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-700 hover:text-black rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCase} className="space-y-4">
              <div>
                <label className="block font-black text-slate-950 uppercase mb-1">Avaliação Associada *</label>
                <select
                  value={selectedEvalId}
                  onChange={(e) => setSelectedEvalId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-black rounded-xl text-slate-950 font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  {evaluations.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.reference} — {ev.clientName} ({ev.satisfactionRating}★)</option>
                  ))}
                  {evaluations.length === 0 && (
                    <option value="">Nenhuma avaliação submetida</option>
                  )}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-slate-950 uppercase mb-1">Tipo de Ocorrência *</label>
                  <select
                    value={occurrenceType}
                    onChange={(e) => setOccurrenceType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-black rounded-xl text-slate-950 font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="QUALIDADE_SERVICO">Qualidade do Serviço</option>
                    <option value="COMPORTAMENTO">Comportamento</option>
                    <option value="ATRASO">Atraso / Pontualidade</option>
                    <option value="SEGURANCA">Segurança / HST</option>
                    <option value="ELOGIO">Elogio Profissional</option>
                  </select>
                </div>
                <div>
                  <label className="block font-black text-slate-950 uppercase mb-1">Responsável *</label>
                  <input
                    type="text"
                    required
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-black rounded-xl text-slate-950 font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-slate-950 uppercase mb-1">Notas Internas Confidenciais *</label>
                <textarea
                  required
                  rows={3}
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Detalhes confidenciais da investigação ou contacto..."
                  className="w-full bg-white border border-black text-slate-950 rounded-xl p-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block font-black text-slate-950 uppercase mb-1">Acção Correctiva Proposta</label>
                <input
                  type="text"
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                  placeholder="Ex: Reforço de formação técnica ou revisão de procedimento"
                  className="w-full bg-white border border-black text-slate-950 rounded-xl px-4 py-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="pt-3 border-t border-black/15 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-950 font-bold rounded-xl border border-black transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: '#8CBF26' }}
                  className="px-5 py-2 text-black font-black border border-black rounded-xl shadow-sm hover:opacity-95 transition"
                >
                  Registar Ocorrência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Agendar Actividade */}
      {isActivityModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-black text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-black/15 mb-4">
              <h3 className="text-base font-black text-slate-950">Agendar Actividade Operacional</h3>
              <button onClick={() => setIsActivityModalOpen(false)} className="p-1 text-slate-700 hover:text-black rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveActivity} className="space-y-4">
              <div>
                <label className="block font-black text-slate-950 uppercase mb-1">Título da Actividade *</label>
                <input
                  type="text"
                  required
                  value={newActTitle}
                  onChange={(e) => setNewActTitle(e.target.value)}
                  placeholder="Ex: Limpeza e Desinfeção Profunda"
                  className="w-full px-3 py-2 bg-white border border-black rounded-xl text-slate-950 font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-slate-950 uppercase mb-1">Cliente *</label>
                  <select
                    value={newActClient}
                    onChange={(e) => setNewActClient(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-black rounded-xl text-slate-950 font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="">Selecionar Cliente</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.companyName}>{c.companyName}</option>
                    ))}
                    {clients.length === 0 && <option value="Cliente Geral AETERNU">Cliente Geral AETERNU</option>}
                  </select>
                </div>
                <div>
                  <label className="block font-black text-slate-950 uppercase mb-1">Serviço *</label>
                  <select
                    value={newActService}
                    onChange={(e) => setNewActService(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-black rounded-xl text-slate-950 font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="">Selecionar Serviço</option>
                    {services.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                    {services.length === 0 && <option value="Serviço de Higiene">Serviço de Higiene</option>}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-black text-slate-950 uppercase mb-1">Data *</label>
                  <input
                    type="date"
                    required
                    value={newActDate}
                    onChange={(e) => setNewActDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-black rounded-xl text-slate-950 font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-950 uppercase mb-1">Início *</label>
                  <input
                    type="time"
                    required
                    value={newActStart}
                    onChange={(e) => setNewActStart(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-black rounded-xl text-slate-950 font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-950 uppercase mb-1">Fim *</label>
                  <input
                    type="time"
                    required
                    value={newActEnd}
                    onChange={(e) => setNewActEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-black rounded-xl text-slate-950 font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-slate-950 uppercase mb-1">Local / Sede</label>
                  <input
                    type="text"
                    value={newActLocation}
                    onChange={(e) => setNewActLocation(e.target.value)}
                    placeholder="Ex: Luanda - Sede"
                    className="w-full px-3 py-2 bg-white border border-black rounded-xl text-slate-950 font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-950 uppercase mb-1">Equipa Responsável</label>
                  <select
                    value={newActTeam}
                    onChange={(e) => setNewActTeam(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-black rounded-xl text-slate-950 font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    {teams.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                    {teams.length === 0 && <option value="Equipa Operacional">Equipa Operacional Geral</option>}
                  </select>
                </div>
              </div>
              <div className="pt-3 border-t border-black/15 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsActivityModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-950 font-bold rounded-xl border border-black transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: '#8CBF26' }}
                  className="px-5 py-2 text-black font-black border border-black rounded-xl shadow-sm hover:opacity-95 transition"
                >
                  Agendar Actividade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE HOMOLOGAÇÃO DE AVALIAÇÃO DE RH (CÁLCULO PONDERADO 0 A 100%) */}
      {isReviewModalOpen && selectedEvalForReview && (
        <div className="modal-overlay fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-6xl w-full p-6 border-2 border-black shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-black">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-brand/30 text-slate-950 border border-black">
                  Homologação Oficial de RH
                </span>
                <h3 className="text-base font-black text-slate-950 mt-1">
                  Avaliação Técnica Ponderada — {selectedEvalForReview.reference}
                </h3>
              </div>
              <button 
                onClick={() => setIsReviewModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-950 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* VINCULAÇÃO / ASSOCIAÇÃO DE CLIENTE OFICIAL */}
            {!selectedEvalForReview.clientId ? (
              <div className="mt-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-2 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-950 bg-amber-200/60 px-2 py-0.5 rounded border border-amber-300 inline-flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                      Empresa por associar
                    </span>
                    <p className="text-xs text-slate-800 font-bold mt-1">
                      Nome original digitado: <strong className="text-slate-950 text-sm font-black">"{selectedEvalForReview.clientNameInput || selectedEvalForReview.clientName}"</strong>
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-600 font-medium">
                    Selecione o cliente oficial para registo no dossiê da AETERNU.
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-amber-200">
                  <select
                    value={selectedAssociateClientId}
                    onChange={(e) => setSelectedAssociateClientId(e.target.value)}
                    className="w-full sm:flex-1 bg-white border border-black rounded-lg px-3 py-2 text-xs font-bold text-slate-950"
                  >
                    <option value="">-- Selecione o Cliente Oficial Cadastrado --</option>
                    {clients.filter(c => c.status === 'ACTIVE').map(c => (
                      <option key={c.id} value={c.id}>
                        {c.companyName} ({c.internalCode})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={!selectedAssociateClientId || isAssociatingClient}
                    onClick={async () => {
                      if (!selectedAssociateClientId) return;
                      setIsAssociatingClient(true);
                      setAssociateSuccessMsg(null);
                      const res = await associateEvaluationClient(selectedEvalForReview.id, selectedAssociateClientId);
                      setIsAssociatingClient(false);
                      if (res.success) {
                        const matched = clients.find(c => c.id === selectedAssociateClientId);
                        setSelectedEvalForReview(prev => prev ? {
                          ...prev,
                          clientId: selectedAssociateClientId,
                          clientName: matched ? matched.companyName : prev.clientName
                        } : null);
                        setAssociateSuccessMsg('Cliente oficial associado com sucesso!');
                      } else {
                        setReviewError(res.error || 'Erro ao associar cliente.');
                      }
                    }}
                    style={{ backgroundColor: '#8CBF26' }}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg text-slate-950 text-xs font-black border border-black shadow-xs disabled:opacity-50 transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    {isAssociatingClient ? (
                      <span>A associar...</span>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Associar a Cliente Oficial</span>
                      </>
                    )}
                  </button>
                </div>
                {associateSuccessMsg && (
                  <p className="text-xs text-emerald-800 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {associateSuccessMsg}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-emerald-950">
                  <ShieldCheck className="w-4 h-4 text-brand-dark" />
                  Cliente Oficial Vinculado: <strong>{selectedEvalForReview.clientName}</strong>
                </span>
                {selectedEvalForReview.clientNameInput && (
                  <span className="text-[10px] text-slate-600 italic">
                    (Nome original digitado: "{selectedEvalForReview.clientNameInput}")
                  </span>
                )}
              </div>
            )}

            <EvaluationReviewWorkspace
              evaluation={selectedEvalForReview}
              criteria={criteria}
              catalog={formQuestions}
              passingThreshold={passingThreshold}
              review={auditorReview}
              onReviewChange={setAuditorReview}
              error={reviewError}
            />

            <div className="mt-6 pt-4 border-t border-black flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-950 font-bold rounded-xl border border-black text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={reviewSubmitting || !calculateFinalScore({
                  criteria, conformity: reviewRatings,
                  hasAudio: !!selectedEvalForReview && qualitativeContent(selectedEvalForReview).hasAudio,
                  audioScore: auditorReview.audio?.score ?? null,
                  hasWritten: !!selectedEvalForReview && qualitativeContent(selectedEvalForReview).hasWritten,
                  argumentScore: auditorReview.writtenArguments?.score ?? null,
                  passingThreshold
                }).success}
                onClick={async () => {
                  if (!selectedEvalForReview) return;
                  const missingQual = missingQualitativeMessage(selectedEvalForReview, auditorReview);
                  if (missingQual) { setReviewError(missingQual); return; }
                  setReviewSubmitting(true);
                  setReviewError(null);
                  try {
                    const res = await finalizeEvaluation(selectedEvalForReview.id, reviewRatings, passingThreshold, undefined, auditorReview);
                    if (res.success) {
                      setIsReviewModalOpen(false);
                      setSelectedEvalForReview(null);
                      setCriteriaMsg({
                        type: 'success',
                        text: `Avaliação homologada com sucesso! Pontuação Oficial: ${res.snapshot?.finalScore}% (${res.snapshot?.classification}). Snapshot histórico gerado.`
                      });
                    } else {
                      setReviewError(res.error || 'Erro ao homologar avaliação.');
                    }
                  } catch (err: any) {
                    setReviewError(err?.message || 'Falha inesperada ao gravar homologação.');
                  } finally {
                    setReviewSubmitting(false);
                  }
                }}
                style={{ backgroundColor: '#8CBF26' }}
                className="px-5 py-2 text-black font-black border border-black rounded-xl text-xs shadow-md hover:opacity-95 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>{reviewSubmitting ? 'A Homologar...' : 'Homologar & Gerar Snapshot Imutável'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VISUALIZAÇÃO DO SNAPSHOT HISTÓRICO IMUTÁVEL */}
      {isSnapshotModalOpen && selectedSnapshot && (
        <div className="modal-overlay fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 border-2 border-black shadow-2xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-black">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 border border-black rounded-lg text-emerald-950">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-brand/30 text-slate-950 border border-black">
                    Snapshot Histórico Auditável
                  </span>
                  <h3 className="text-base font-black text-slate-950 mt-0.5">
                    Registo Criptograficamente Imutável de Homologação
                  </h3>
                </div>
              </div>
              <button 
                onClick={() => setIsSnapshotModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-950 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 p-4 bg-slate-50 border border-black rounded-xl text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black text-slate-500 uppercase block">Pontuação Final Homologada</span>
                  <span className="text-2xl font-black text-slate-950">{selectedSnapshot.finalScore}%</span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-500 uppercase block">Classificação Obtida</span>
                  <span className={`px-2.5 py-1 rounded-lg font-black text-xs border border-black inline-block ${
                    selectedSnapshot.classification === 'POSITIVE' ? 'bg-emerald-100 text-emerald-950' : 'bg-red-100 text-red-950'
                  }`}>
                    {selectedSnapshot.classification === 'POSITIVE' ? '✓ Positiva' : '✕ Negativa'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-black text-slate-500 uppercase block">Limiar de Aprovação Aplicado</span>
                  <span className="text-sm font-black text-slate-950">{selectedSnapshot.passingThreshold}%</span>
                </div>
              </div>

              <div className="pt-2 border-t border-black/10 flex flex-wrap items-center justify-between text-[11px] text-slate-700">
                <span>Homologado Por: <strong className="text-black">{selectedSnapshot.finalizedBy}</strong></span>
                <span>Data do Snapshot: <strong className="text-black">{selectedSnapshot.finalizedAt?.replace('T', ' ').substring(0, 19)}</strong></span>
                <span>Identificador: <code className="font-mono text-[10px] bg-slate-200 px-1 py-0.5 rounded">{selectedSnapshot.versionId}</code></span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <h4 className="text-xs font-black text-slate-950 uppercase">
                Critérios Congelados na Data da Avaliação
              </h4>
              <div className="overflow-x-auto border border-black rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-950 font-black border-b border-black">
                    <tr>
                      <th className="p-2.5">Critério</th>
                      <th className="p-2.5 text-center">Peso</th>
                      <th className="p-2.5 text-center">Nota / Máx</th>
                      <th className="p-2.5 text-center">Desempenho</th>
                      <th className="p-2.5 text-right">Contribuição</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/10 text-slate-950">
                    {selectedSnapshot.criteriaSnapshot?.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold">{item.categoryName}</td>
                        <td className="p-2.5 text-center font-black">{item.weightPercentage}%</td>
                        <td className="p-2.5 text-center font-mono font-bold">{item.scoreObtained} / {item.maxScore}</td>
                        <td className="p-2.5 text-center font-bold">{item.normalizedPercentage}%</td>
                        <td className="p-2.5 text-right font-black font-mono text-brand-dark">
                          +{item.weightedContribution?.toFixed(2)} pts
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-50 border border-black rounded-xl text-xs text-slate-700 font-medium">
              <span className="font-bold text-slate-950 block mb-0.5">Fórmula Auditável Registada:</span>
              <p className="font-mono text-[11px] text-slate-900 break-all">{selectedSnapshot.formula}</p>
            </div>

            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-[11px] text-emerald-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-dark shrink-0" />
              <span>Garantia de Imutabilidade: Qualquer edição subsequente de pesos ou critérios no sistema NÃO altera nem recalcula este snapshot histórico.</span>
            </div>

            <div className="mt-6 pt-3 border-t border-black flex justify-end">
              <button
                type="button"
                onClick={() => setIsSnapshotModalOpen(false)}
                className="px-5 py-2 bg-white hover:bg-slate-100 text-slate-950 font-bold rounded-xl border border-black text-xs transition"
              >
                Fechar Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CRIAÇÃO / EDIÇÃO DE PERFIL DE ACESSO */}
      {isProfileModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 animate-fadeIn">
            <div className="p-6 bg-brand-deep text-white flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand text-slate-950 flex items-center justify-center font-black">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight">
                    {editingProfileId ? 'Editar Perfil de Acesso & Permissões' : 'Criar Novo Perfil de Acesso'}
                  </h3>
                  <p className="text-xs text-emerald-100/80">Configure o nível base e a matriz de páginas autorizadas</p>
                </div>
              </div>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-6 space-y-5 text-xs">
              {profError && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{profError}</span>
                </div>
              )}
              {profSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{profSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 uppercase mb-1">Nome do Perfil *</label>
                  <input
                    type="text"
                    required
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    placeholder="ex: Coordenador de Qualidade"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Nível Base (Role) *</label>
                  <SearchableSelect
                    ariaLabel="Nível base"
                    value={profBaseRole}
                    onChange={(v) => setProfBaseRole(v as UserRole)}
                    options={[
                      { value: 'OPERATIONAL', label: 'Operacional' },
                      { value: 'HR', label: 'Recursos Humanos' },
                      { value: 'ADMIN', label: 'Administrador' },
                      { value: 'DIRECTOR', label: 'Diretor' },
                      { value: 'PROVIDER', label: 'Prestador / Técnico' },
                    ]}
                  />
                </div>

                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={profIsActive}
                      onChange={(e) => setProfIsActive(e.target.checked)}
                      className="w-4 h-4 accent-brand-dark rounded cursor-pointer"
                    />
                    <span className="font-bold text-slate-900">Perfil Ativo para Atribuição</span>
                  </label>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 uppercase mb-1">Descrição</label>
                  <textarea
                    rows={2}
                    value={profDesc}
                    onChange={(e) => setProfDesc(e.target.value)}
                    placeholder="Descrição das responsabilidades deste perfil..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>

              {/* MATRIZ DE PERMISSÕES POR PÁGINA */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="font-black text-slate-900 uppercase tracking-wide">
                    Matriz de Permissões por Página ({profPages.length} selecionadas)
                  </label>
                  <div className="flex gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setProfPages(ALL_SYSTEM_PAGES.map(p => p.key))}
                      className="text-brand-dark font-bold hover:underline cursor-pointer"
                    >
                      Selecionar Todas
                    </button>
                    <span>&bull;</span>
                    <button
                      type="button"
                      onClick={() => setProfPages([])}
                      className="text-slate-500 font-bold hover:underline cursor-pointer"
                    >
                      Desmarcar Todas
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  {ALL_SYSTEM_PAGES.map((page) => {
                    const isChecked = profPages.includes(page.key);
                    return (
                      <label key={page.key} className="flex items-start gap-2.5 p-2 bg-white rounded-lg border border-slate-200 hover:border-slate-300 cursor-pointer transition">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setProfPages([...profPages, page.key]);
                            } else {
                              setProfPages(profPages.filter(k => k !== page.key));
                            }
                          }}
                          className="mt-0.5 w-4 h-4 accent-brand-dark rounded cursor-pointer"
                        />
                        <div>
                          <span className="font-bold text-slate-900 block">{page.name}</span>
                          <span className="text-[10px] text-slate-500">{page.section} &bull; <code className="font-mono text-emerald-800">{page.key}</code></span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: '#8CBF26' }}
                  className="px-6 py-2.5 text-slate-950 font-black rounded-xl shadow-md hover:opacity-95 transition cursor-pointer flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingProfileId ? 'Guardar Alterações' : 'Criar Perfil'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

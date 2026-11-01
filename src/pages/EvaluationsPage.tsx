import React, { useState, useMemo } from 'react';
import { SecureAudio } from '../components/SecureAudio';
import { useApp } from '../context/AppContext';
import { Evaluation, Client, Provider } from '../types';
import { 
  Star, 
  Search, 
  Plus, 
  Filter, 
  MessageSquare, 
  Link, 
  Shield, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  X, 
  Mic, 
  Play, 
  Pause, 
  Volume2, 
  TrendingUp, 
  Award, 
  BarChart3, 
  AlertCircle,
  Building2,
  UserCheck,
  Calendar,
  Download,
  Printer,
  Sparkles,
  ArrowRight,
  Check,
  HelpCircle,
  FileText
} from 'lucide-react';
import { KpiDetailModal } from '../components/analytics/KpiDetailModal';
import { calculateStringSimilarity } from '../services/evaluationUtils';

export const EvaluationsPage: React.FC = () => {
  const { 
    evaluations, 
    clients, 
    services, 
    providers, 
    addEvaluation, 
    associateEvaluationClient, 
    assignEvaluationProvider, 
    addHRCase,
    setIsClientFormOpen, 
    activeRole, 
    currentUser,
    setActiveTab,
    setSelectedEvaluationForAnalysis
  } = useApp();

  // Permissões
  const isProvider = activeRole === 'PROVIDER';
  const canManage = activeRole === 'ADMIN' || activeRole === 'HR' || activeRole === 'DIRECTOR';
  const canHomologate = activeRole === 'ADMIN' || activeRole === 'HR';

  // Filtros de fila de receção
  const [searchTerm, setSearchTerm] = useState('');
  const [statusQueueFilter, setStatusQueueFilter] = useState<'ALL' | 'UNASSIGNED_CLIENT' | 'UNASSIGNED_PROVIDER' | 'READY_TO_FINALIZE' | 'HOMOLOGATED'>('ALL');
  const [serviceFilter, setServiceFilter] = useState<string>('ALL');
  const [ratingFilter, setRatingFilter] = useState<string>('ALL');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');

  // Modais de ação
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [generatedToken, setGeneratedToken] = useState('');
  const [selectedKpiModal, setSelectedKpiModal] = useState<string | null>(null);

  // Audio player state
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [activeAudioRef, setActiveAudioRef] = useState<string | null>(null);

  // Modal de Associação de Empresa
  const [associatingEval, setAssociatingEval] = useState<Evaluation | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [isSubmittingAssociation, setIsSubmittingAssociation] = useState(false);
  const [associationError, setAssociationError] = useState<string | null>(null);
  const [associationSuccess, setAssociationSuccess] = useState<string | null>(null);

  // Modal de Atribuição de Funcionário
  const [assigningEval, setAssigningEval] = useState<Evaluation | null>(null);
  const [providerSearch, setProviderSearch] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [isSubmittingAssignment, setIsSubmittingAssignment] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentSuccess, setAssignmentSuccess] = useState<string | null>(null);

  // Modal de Abertura de Ocorrência de RH
  const [hrCaseEval, setHrCaseEval] = useState<Evaluation | null>(null);
  const [hrOccurrenceType, setHrOccurrenceType] = useState<'QUALIDADE_SERVICO' | 'COMPORTAMENTO' | 'ATRASO' | 'SEGURANCA' | 'ELOGIO'>('QUALIDADE_SERVICO');
  const [hrInternalNotes, setHrInternalNotes] = useState('');
  const [hrAssignedTo, setHrAssignedTo] = useState('Equipa de RH e Qualidade');
  const [hrCorrectiveAction, setHrCorrectiveAction] = useState('');
  const [isSubmittingHRCase, setIsSubmittingHRCase] = useState(false);
  const [hrCaseError, setHrCaseError] = useState<string | null>(null);
  const [hrCaseSuccess, setHrCaseSuccess] = useState<string | null>(null);

  // Modal de Impressão de Ficha de Homologação
  const [printEval, setPrintEval] = useState<Evaluation | null>(null);

  // Registo manual de avaliação
  const [manualClientId, setManualClientId] = useState('');
  const [manualServiceId, setManualServiceId] = useState('');
  const [manualProviderId, setManualProviderId] = useState('');
  const [manualServiceDate, setManualServiceDate] = useState(new Date().toISOString().substring(0, 10));
  const [manualSatisfaction, setManualSatisfaction] = useState(5);
  const [manualNps, setManualNps] = useState(9);
  const [manualComment, setManualComment] = useState('');
  const [manualRequiresFollowUp, setManualRequiresFollowUp] = useState(false);
  const [manualError, setManualError] = useState('');

  // Classificação dos 4 estados de cada avaliação na fila
  const getQueueStatus = (ev: Evaluation): 'UNASSIGNED_CLIENT' | 'UNASSIGNED_PROVIDER' | 'READY_TO_FINALIZE' | 'HOMOLOGATED' => {
    if (ev.finalizedAt) return 'HOMOLOGATED';
    if (!ev.clientId) return 'UNASSIGNED_CLIENT';
    if (!ev.providerId) return 'UNASSIGNED_PROVIDER';
    return 'READY_TO_FINALIZE';
  };

  // Contadores por estado da fila
  const queueCounts = useMemo(() => {
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

  // Lista filtrada de avaliações
  const filteredEvaluations = useMemo(() => {
    return evaluations.filter(ev => {
      const qStatus = getQueueStatus(ev);

      // Filtro por estado da fila
      if (statusQueueFilter !== 'ALL' && qStatus !== statusQueueFilter) {
        return false;
      }

      // Filtro por serviço
      if (serviceFilter !== 'ALL' && ev.serviceId !== serviceFilter) {
        return false;
      }

      // Filtro por classificação CSAT
      if (ratingFilter !== 'ALL') {
        if (ratingFilter === '5' && ev.satisfactionRating !== 5) return false;
        if (ratingFilter === '4' && ev.satisfactionRating !== 4) return false;
        if (ratingFilter === '3' && ev.satisfactionRating !== 3) return false;
        if (ratingFilter === '2' && ev.satisfactionRating !== 2) return false;
        if (ratingFilter === '1' && ev.satisfactionRating !== 1) return false;
        if (ratingFilter === 'high' && ev.satisfactionRating < 4) return false;
        if (ratingFilter === 'neutral' && ev.satisfactionRating !== 3) return false;
        if (ratingFilter === 'low' && ev.satisfactionRating > 2) return false;
      }

      // Filtro por data
      if (startDateFilter && ev.serviceDate < startDateFilter) return false;
      if (endDateFilter && ev.serviceDate > endDateFilter) return false;

      // Pesquisa de texto livre
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase().trim();
        const matchesRef = ev.reference?.toLowerCase().includes(s);
        const matchesInput = ev.clientNameInput?.toLowerCase().includes(s);
        const matchesClient = ev.clientName?.toLowerCase().includes(s);
        const matchesService = ev.serviceName?.toLowerCase().includes(s);
        const matchesProvider = ev.providerName?.toLowerCase().includes(s);
        const matchesComment = ev.comment?.toLowerCase().includes(s);

        if (!matchesRef && !matchesInput && !matchesClient && !matchesService && !matchesProvider && !matchesComment) {
          return false;
        }
      }

      return true;
    });
  }, [evaluations, statusQueueFilter, serviceFilter, ratingFilter, startDateFilter, endDateFilter, searchTerm]);

  // Cálculo de similaridade automática de clientes para o modal de associação
  const suggestedClients = useMemo(() => {
    if (!associatingEval) return [];
    const typedName = (associatingEval.clientNameInput || associatingEval.clientName || '').trim();
    if (!typedName) return [];

    return clients
      .filter(c => c.status === 'ACTIVE')
      .map(c => {
        const simName = calculateStringSimilarity(typedName, c.companyName);
        const simCode = calculateStringSimilarity(typedName, c.internalCode);
        const maxSim = Math.max(simName, simCode);
        return { client: c, similarity: maxSim };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
  }, [associatingEval, clients]);

  // Handlers de Associação de Empresa
  const handleOpenAssociateModal = (ev: Evaluation) => {
    setAssociatingEval(ev);
    setSelectedClientId('');
    setClientSearch('');
    setAssociationError(null);
    setAssociationSuccess(null);

    // Se houver uma sugestão muito forte (>= 75%), pré-selecionar
    const typedName = (ev.clientNameInput || ev.clientName || '').trim();
    if (typedName) {
      const topMatch = clients
        .filter(c => c.status === 'ACTIVE')
        .map(c => ({ id: c.id, sim: calculateStringSimilarity(typedName, c.companyName) }))
        .sort((a, b) => b.sim - a.sim)[0];

      if (topMatch && topMatch.sim >= 75) {
        setSelectedClientId(topMatch.id);
      }
    }
  };

  const handleConfirmAssociation = async () => {
    if (!associatingEval || !selectedClientId) return;
    setIsSubmittingAssociation(true);
    setAssociationError(null);
    setAssociationSuccess(null);

    const res = await associateEvaluationClient(associatingEval.id, selectedClientId);
    setIsSubmittingAssociation(false);

    if (!res.success) {
      setAssociationError(res.error || 'Falha ao associar a empresa cliente.');
    } else {
      setAssociationSuccess('Empresa cliente associada com sucesso!');
      setTimeout(() => {
        setAssociatingEval(null);
      }, 1000);
    }
  };

  // Handlers de Atribuição de Funcionário
  const handleOpenAssignModal = (ev: Evaluation) => {
    setAssigningEval(ev);
    setSelectedProviderId(ev.providerId || '');
    setProviderSearch('');
    setAssignmentError(null);
    setAssignmentSuccess(null);
  };

  const handleConfirmAssignment = async () => {
    if (!assigningEval || !selectedProviderId) return;
    setIsSubmittingAssignment(true);
    setAssignmentError(null);
    setAssignmentSuccess(null);

    const res = await assignEvaluationProvider(assigningEval.id, selectedProviderId);
    setIsSubmittingAssignment(false);

    if (!res.success) {
      setAssignmentError(res.error || 'Falha ao atribuir o funcionário/prestador.');
    } else {
      setAssignmentSuccess('Funcionário atribuído com sucesso!');
      setTimeout(() => {
        setAssigningEval(null);
      }, 1000);
    }
  };

  // Handlers de Ocorrência de RH
  const handleOpenHRCaseModal = (ev: Evaluation) => {
    setHrCaseEval(ev);
    setHrOccurrenceType(ev.satisfactionRating <= 2 ? 'QUALIDADE_SERVICO' : 'COMPORTAMENTO');
    setHrInternalNotes(`Ocorrência gerada a partir da avaliação ${ev.reference}.\nCliente: ${ev.clientNameInput || ev.clientName}\nCSAT: ${ev.satisfactionRating}/5\nNPS: ${ev.npsScore ?? 'N/A'}/10\nComentário do Cliente: "${ev.comment || 'Sem comentários'}"`);
    setHrAssignedTo('Recursos Humanos');
    setHrCorrectiveAction('Contactar o cliente para averiguação da não-conformidade e agendar reinspeção técnica.');
    setHrCaseError(null);
    setHrCaseSuccess(null);
  };

  const handleConfirmHRCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hrCaseEval) return;
    setIsSubmittingHRCase(true);
    setHrCaseError(null);
    setHrCaseSuccess(null);

    const res = await addHRCase({
      evaluationId: hrCaseEval.id,
      occurrenceType: hrOccurrenceType,
      internalNotes: hrInternalNotes.trim(),
      assignedTo: hrAssignedTo.trim(),
      correctiveAction: hrCorrectiveAction.trim(),
      status: 'ABERTO'
    });

    setIsSubmittingHRCase(false);
    if (!res.success) {
      setHrCaseError(res.error || 'Falha ao abrir caso de RH.');
    } else {
      setHrCaseSuccess('Ocorrência de RH registada com sucesso!');
      setTimeout(() => {
        setHrCaseEval(null);
      }, 1200);
    }
  };

  // Exportação para CSV
  const handleExportCSV = () => {
    if (filteredEvaluations.length === 0) return;

    const headers = [
      'Referência',
      'Data Intervenção',
      'Empresa (Digitada pelo Cliente)',
      'Empresa (Cadastrada Oficial)',
      'Código Cliente',
      'Serviço',
      'Funcionário / Prestador',
      'CSAT (1-5)',
      'NPS (0-10)',
      'Nota Técnica (%)',
      'Classificação Final',
      'Estado da Fila',
      'Homologado Em',
      'Homologado Por',
      'Comentário'
    ];

    const rows = filteredEvaluations.map(ev => {
      const q = getQueueStatus(ev);
      const queueLabel = 
        q === 'UNASSIGNED_CLIENT' ? 'Por associar empresa' :
        q === 'UNASSIGNED_PROVIDER' ? 'Por atribuir funcionário' :
        q === 'READY_TO_FINALIZE' ? 'Pronta para homologar' : 'Homologada';

      const clientObj = clients.find(c => c.id === ev.clientId);

      return [
        `"${ev.reference}"`,
        `"${ev.serviceDate}"`,
        `"${(ev.clientNameInput || ev.clientName || '').replace(/"/g, '""')}"`,
        `"${(ev.clientId ? ev.clientName : 'NÃO ASSOCIADO').replace(/"/g, '""')}"`,
        `"${clientObj?.internalCode || 'N/A'}"`,
        `"${(ev.serviceName || '').replace(/"/g, '""')}"`,
        `"${(ev.providerName || 'NÃO ATRIBUÍDO').replace(/"/g, '""')}"`,
        ev.satisfactionRating,
        ev.npsScore ?? '',
        ev.technicalScore !== undefined ? `${ev.technicalScore}%` : 'N/A',
        ev.finalClassification || 'PENDENTE',
        `"${queueLabel}"`,
        `"${ev.finalizedAt || 'N/A'}"`,
        `"${ev.finalizedBy || 'N/A'}"`,
        `"${(ev.comment || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `SICSC_Avaliacoes_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Link público
  const handleGenerateClientLink = () => {
    const token = `aet_tok_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://aeternu.co.ao';
    const link = `${origin}/?mode=form&token=${token}`;
    setGeneratedToken(link);
    setIsTokenModalOpen(true);
  };

  // Registo manual
  const handleOpenManualModal = () => {
    if (clients.length > 0) setManualClientId(clients[0].id);
    if (services.length > 0) setManualServiceId(services[0].id);
    if (providers.length > 0) setManualProviderId(providers[0].id);
    setManualServiceDate(new Date().toISOString().substring(0, 10));
    setManualSatisfaction(5);
    setManualNps(9);
    setManualComment('');
    setManualRequiresFollowUp(false);
    setManualError('');
    setIsModalOpen(true);
  };

  const handleSaveManualEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find(c => c.id === manualClientId);
    const service = services.find(s => s.id === manualServiceId);
    const provider = providers.find(p => p.id === manualProviderId);

    if (!client || !service || !provider) {
      setManualError('Selecione um cliente, serviço e prestador válidos.');
      return;
    }

    const res = await addEvaluation({
      clientId: client.id,
      clientName: client.companyName,
      clientNameInput: client.companyName,
      serviceId: service.id,
      serviceName: service.name,
      providerId: provider.id,
      providerName: provider.name,
      serviceDate: manualServiceDate,
      satisfactionRating: Number(manualSatisfaction),
      npsScore: Number(manualNps),
      comment: manualComment,
      requiresFollowUp: manualSatisfaction <= 2 || manualRequiresFollowUp,
      status: 'PENDING_REVIEW',
      correctiveActionStatus: manualSatisfaction <= 2 ? 'PENDING' : 'NOT_NEEDED'
    });

    if (!res.success) {
      setManualError(res.error || 'Erro ao gravar avaliação.');
    } else {
      setIsModalOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Fila de Receção & Avaliações</h2>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-brand/20 text-brand-dark border border-brand/30">
              Fluxo Unificado
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Receção de formulários públicos com empresa livre, associação a cliente oficial, atribuição de funcionário e encaminhamento para homologação técnica.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={filteredEvaluations.length === 0}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
            title="Exportar lista filtrada para CSV"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Exportar CSV</span>
          </button>
          {!isProvider && (
            <>
              <button
                onClick={handleGenerateClientLink}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition"
              >
                <Link className="w-4 h-4 text-brand-dark" />
                <span>Gerar Link</span>
              </button>
              <button
                onClick={handleOpenManualModal}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Registo Manual</span>
              </button>
            </>
          )}
          <button
            onClick={() => setIsClientFormOpen(true)}
            style={{ backgroundColor: '#8CBF26' }}
            className="text-slate-950 font-black px-4 py-2.5 rounded-xl shadow-md text-xs flex items-center justify-center gap-2 hover:opacity-95 transition"
          >
            <Mic className="w-4 h-4" />
            <span>Formulário Público (com Áudio)</span>
          </button>
        </div>
      </div>

      {/* FILA DE RECEÇÃO: 4 ESTADOS BEM VISÍVEIS (Pílulas / Contadores Interativos) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total */}
        <button
          onClick={() => setStatusQueueFilter('ALL')}
          className={`p-4 rounded-2xl border text-left transition ${
            statusQueueFilter === 'ALL'
              ? 'bg-slate-900 border-slate-900 text-white shadow-md'
              : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800 shadow-xs'
          }`}
        >
          <span className={`text-[10px] font-bold block uppercase tracking-wider ${statusQueueFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
            Total da Fila
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black">{queueCounts.total}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusQueueFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
              Todas
            </span>
          </div>
        </button>

        {/* 1. Por associar empresa */}
        <button
          onClick={() => setStatusQueueFilter('UNASSIGNED_CLIENT')}
          className={`p-4 rounded-2xl border text-left transition ${
            statusQueueFilter === 'UNASSIGNED_CLIENT'
              ? 'bg-amber-500 border-amber-600 text-white shadow-md ring-2 ring-amber-300'
              : 'bg-amber-50/70 border-amber-200 hover:border-amber-400 text-amber-950 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Building2 className={`w-3.5 h-3.5 ${statusQueueFilter === 'UNASSIGNED_CLIENT' ? 'text-white' : 'text-amber-700'}`} />
            <span className={`text-[10px] font-black uppercase tracking-wider ${statusQueueFilter === 'UNASSIGNED_CLIENT' ? 'text-amber-100' : 'text-amber-800'}`}>
              1. Por associar empresa
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black">{queueCounts.unassignedClient}</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusQueueFilter === 'UNASSIGNED_CLIENT' ? 'bg-white/25 text-white' : 'bg-amber-200 text-amber-900'}`}>
              Nome Livre
            </span>
          </div>
        </button>

        {/* 2. Por atribuir funcionário */}
        <button
          onClick={() => setStatusQueueFilter('UNASSIGNED_PROVIDER')}
          className={`p-4 rounded-2xl border text-left transition ${
            statusQueueFilter === 'UNASSIGNED_PROVIDER'
              ? 'bg-blue-600 border-blue-700 text-white shadow-md ring-2 ring-blue-300'
              : 'bg-blue-50/70 border-blue-200 hover:border-blue-400 text-blue-950 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <UserCheck className={`w-3.5 h-3.5 ${statusQueueFilter === 'UNASSIGNED_PROVIDER' ? 'text-white' : 'text-blue-700'}`} />
            <span className={`text-[10px] font-black uppercase tracking-wider ${statusQueueFilter === 'UNASSIGNED_PROVIDER' ? 'text-blue-100' : 'text-blue-800'}`}>
              2. Por atribuir funcionário
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black">{queueCounts.unassignedProvider}</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusQueueFilter === 'UNASSIGNED_PROVIDER' ? 'bg-white/25 text-white' : 'bg-blue-200 text-blue-900'}`}>
              Requer Técnico
            </span>
          </div>
        </button>

        {/* 3. Pronta para homologar */}
        <button
          onClick={() => setStatusQueueFilter('READY_TO_FINALIZE')}
          className={`p-4 rounded-2xl border text-left transition ${
            statusQueueFilter === 'READY_TO_FINALIZE'
              ? 'bg-purple-600 border-purple-700 text-white shadow-md ring-2 ring-purple-300'
              : 'bg-purple-50/70 border-purple-200 hover:border-purple-400 text-purple-950 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className={`w-3.5 h-3.5 ${statusQueueFilter === 'READY_TO_FINALIZE' ? 'text-white' : 'text-purple-700'}`} />
            <span className={`text-[10px] font-black uppercase tracking-wider ${statusQueueFilter === 'READY_TO_FINALIZE' ? 'text-purple-100' : 'text-purple-800'}`}>
              3. Pronta para homologar
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black">{queueCounts.readyToFinalize}</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusQueueFilter === 'READY_TO_FINALIZE' ? 'bg-white/25 text-white' : 'bg-purple-200 text-purple-900'}`}>
              Completa
            </span>
          </div>
        </button>

        {/* 4. Homologada */}
        <button
          onClick={() => setStatusQueueFilter('HOMOLOGATED')}
          className={`p-4 rounded-2xl border text-left transition col-span-2 lg:col-span-1 ${
            statusQueueFilter === 'HOMOLOGATED'
              ? 'bg-brand-dark border-brand-dark text-white shadow-md ring-2 ring-emerald-300'
              : 'bg-emerald-50/70 border-emerald-200 hover:border-emerald-400 text-emerald-950 shadow-xs'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className={`w-3.5 h-3.5 ${statusQueueFilter === 'HOMOLOGATED' ? 'text-white' : 'text-brand-dark'}`} />
            <span className={`text-[10px] font-black uppercase tracking-wider ${statusQueueFilter === 'HOMOLOGATED' ? 'text-emerald-100' : 'text-brand-dark'}`}>
              4. Homologada
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black">{queueCounts.homologated}</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusQueueFilter === 'HOMOLOGATED' ? 'bg-white/25 text-white' : 'bg-emerald-200 text-emerald-900'}`}>
              Imutável
            </span>
          </div>
        </button>
      </div>

      {/* Barra de Filtros Combináveis */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Pesquisa de texto */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por referência (AVAL-...), nome livre ou funcionário..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand transition"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Filtro por Serviço */}
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand font-medium"
            >
              <option value="ALL">Todos os Serviços</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* Filtro por CSAT */}
            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand font-medium"
            >
              <option value="ALL">Qualquer CSAT</option>
              <option value="5">★ 5 Estrelas</option>
              <option value="4">★ 4 Estrelas</option>
              <option value="3">★ 3 Estrelas</option>
              <option value="2">★ 2 Estrelas</option>
              <option value="1">★ 1 Estrela</option>
              <option value="high">Positivos (4-5★)</option>
              <option value="neutral">Neutros (3★)</option>
              <option value="low">Críticos / Insatisfeitos (1-2★)</option>
            </select>

            {/* Intervalo de Datas */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="bg-transparent text-[11px] text-slate-800 focus:outline-none"
                title="Data inicial"
              />
              <span className="text-slate-400 text-[10px]">até</span>
              <input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="bg-transparent text-[11px] text-slate-800 focus:outline-none"
                title="Data final"
              />
              {(startDateFilter || endDateFilter) && (
                <button
                  onClick={() => { setStartDateFilter(''); setEndDateFilter(''); }}
                  className="text-slate-400 hover:text-slate-600 p-0.5"
                  title="Limpar datas"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lista de Avaliações / Tabela da Fila */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">Referência & Estado</th>
                <th className="p-4">Identificação da Empresa Cliente</th>
                <th className="p-4">Serviço & Funcionário Atribuído</th>
                <th className="p-4">Perceção do Cliente (CSAT/NPS)</th>
                <th className="p-4">Nota Técnica Ponderada</th>
                <th className="p-4 text-right">Ações do Fluxo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvaluations.map(ev => {
                const qStatus = getQueueStatus(ev);
                const isCritical = ev.requiresFollowUp || ev.satisfactionRating <= 2 || (ev.npsScore !== undefined && ev.npsScore <= 6);
                const officialClient = clients.find(c => c.id === ev.clientId);

                return (
                  <tr 
                    key={ev.id} 
                    className={`hover:bg-slate-50/80 transition ${
                      isCritical && !ev.finalizedAt ? 'bg-rose-50/30' : ''
                    }`}
                  >
                    {/* Referência e Estado */}
                    <td className="p-4 align-top">
                      <div className="space-y-1">
                        <span className="font-mono font-black text-slate-950 text-sm block">
                          {ev.reference}
                        </span>
                        
                        {/* Badge de Estado da Fila */}
                        {qStatus === 'UNASSIGNED_CLIENT' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                            <AlertCircle className="w-3 h-3 text-amber-700" />
                            <span>1. Por associar empresa</span>
                          </span>
                        )}
                        {qStatus === 'UNASSIGNED_PROVIDER' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-100 text-blue-900 border border-blue-300">
                            <UserCheck className="w-3 h-3 text-blue-700" />
                            <span>2. Por atribuir funcionário</span>
                          </span>
                        )}
                        {qStatus === 'READY_TO_FINALIZE' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-100 text-purple-900 border border-purple-300">
                            <Clock className="w-3 h-3 text-purple-700" />
                            <span>3. Pronta para homologar</span>
                          </span>
                        )}
                        {qStatus === 'HOMOLOGATED' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-brand-dark" />
                            <span>4. Homologada</span>
                          </span>
                        )}

                        <span className="text-[10px] text-slate-400 block pt-0.5">
                          {ev.serviceDate}
                        </span>
                      </div>
                    </td>

                    {/* Empresa Cliente */}
                    <td className="p-4 align-top max-w-xs">
                      <div className="space-y-1.5">
                        {/* Nome original digitado */}
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">
                            Nome digitado no formulário:
                          </span>
                          <strong className="text-slate-900 font-black text-xs block">
                            "{ev.clientNameInput || ev.clientName}"
                          </strong>
                        </div>

                        {/* Estado da associação oficial */}
                        {ev.clientId ? (
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-[11px]">
                            <span className="text-[9px] text-slate-500 font-bold uppercase block">
                              Empresa Cadastrada Oficial:
                            </span>
                            <span className="font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                              <Building2 className="w-3 h-3 text-brand-dark" />
                              {officialClient?.internalCode ? `[${officialClient.internalCode}] ` : ''}
                              {ev.clientName}
                            </span>
                          </div>
                        ) : (
                          <div>
                            {canManage ? (
                              <button
                                onClick={() => handleOpenAssociateModal(ev)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-black shadow-xs transition"
                              >
                                <Building2 className="w-3 h-3" />
                                <span>Associar Empresa Cadastrada</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-amber-700 italic">
                                Aguarda associação pelo RH
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Serviço & Prestador */}
                    <td className="p-4 align-top max-w-xs">
                      <div className="space-y-1.5">
                        <div>
                          <p className="font-bold text-slate-900">{ev.serviceName}</p>
                          {ev.serviceTypesProvided && ev.serviceTypesProvided.length > 1 && (
                            <p className="text-[10px] text-slate-500">
                              {ev.serviceTypesProvided.join(' • ')}
                            </p>
                          )}
                        </div>

                        {/* Prestador / Funcionário */}
                        <div>
                          <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">
                            Funcionário / Técnico:
                          </span>
                          {ev.providerId ? (
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <span className="font-bold text-slate-800 flex items-center gap-1 text-[11px]">
                                <UserCheck className="w-3 h-3 text-brand-dark" />
                                {ev.providerName}
                              </span>
                              {!ev.finalizedAt && canManage && (
                                <button
                                  onClick={() => handleOpenAssignModal(ev)}
                                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline"
                                >
                                  Alterar
                                </button>
                              )}
                              {ev.finalizedAt && (
                                <span className="text-[9px] text-slate-400 font-medium">Imutável</span>
                              )}
                            </div>
                          ) : (
                            <div className="mt-1">
                              {canManage ? (
                                <button
                                  onClick={() => handleOpenAssignModal(ev)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black shadow-xs transition"
                                >
                                  <UserCheck className="w-3 h-3" />
                                  <span>Atribuir Funcionário</span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-blue-700 italic">
                                  Por atribuir pelo RH
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Perceção do Cliente (CSAT & NPS) */}
                    <td className="p-4 align-top">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md font-black text-[11px] ${
                            ev.satisfactionRating >= 4 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : ev.satisfactionRating === 3 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            ★ {ev.satisfactionRating} / 5
                          </span>
                          {ev.npsScore !== undefined && (
                            <span className={`px-2 py-0.5 rounded-md font-black text-[10px] ${
                              ev.npsScore >= 9 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                              ev.npsScore >= 7 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                              'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}>
                              NPS {ev.npsScore}
                            </span>
                          )}
                        </div>

                        {ev.comment && (
                          <p className="text-[11px] text-slate-600 italic line-clamp-2 max-w-xs">
                            "{ev.comment}"
                          </p>
                        )}

                        {ev.audioRecordingUrl && (
                          <button
                            onClick={() => {
                              setActiveAudioUrl(ev.audioRecordingUrl || null);
                              setActiveAudioRef(ev.reference);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold border border-rose-200 transition"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <Mic className="w-3 h-3 text-rose-500" />
                            <span>Áudio do Cliente ({ev.audioDurationSeconds ? `${ev.audioDurationSeconds}s` : 'Voz'})</span>
                          </button>
                        )}

                        {/* Indicador de Alerta de Acompanhamento RH */}
                        {isCritical && (
                          <div className="pt-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                              <AlertTriangle className="w-3 h-3 text-rose-600" />
                              <span>Requer Caso de RH</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Nota Técnica Ponderada */}
                    <td className="p-4 align-top">
                      {ev.finalizedAt ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base font-black text-slate-900">
                              {ev.technicalScore !== undefined ? `${ev.technicalScore.toFixed(1)}%` : '—'}
                            </span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                              ev.finalClassification === 'POSITIVE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {ev.finalClassification === 'POSITIVE' ? 'POSITIVA' : 'NEGATIVA'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 block font-medium">
                            Homologado por {ev.finalizedBy || 'RH'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px] block">
                          Pendente de cálculo de RH
                        </span>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="p-4 align-top text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        {/* Homologada: Ver Ficha / Imprimir */}
                        {ev.finalizedAt ? (
                          <button
                            onClick={() => setPrintEval(ev)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition"
                          >
                            <Printer className="w-3.5 h-3.5 text-slate-600" />
                            <span>Imprimir Ficha</span>
                          </button>
                        ) : (
                          /* Não homologada: Analisar & Homologar */
                          canHomologate && (
                            <button
                              onClick={() => {
                                setSelectedEvaluationForAnalysis(ev);
                                setActiveTab('evaluation-analysis');
                              }}
                              style={{ backgroundColor: qStatus === 'READY_TO_FINALIZE' ? '#8CBF26' : undefined }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black shadow-xs transition ${
                                qStatus === 'READY_TO_FINALIZE'
                                  ? 'text-slate-950 hover:opacity-95'
                                  : 'bg-slate-900 hover:bg-slate-800 text-white'
                              }`}
                            >
                              <span>Analisar / Homologar</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}

                        {/* Botão de abrir ocorrência de RH para avaliações críticas */}
                        {isCritical && canManage && (
                          <button
                            onClick={() => handleOpenHRCaseModal(ev)}
                            className="text-[10px] font-bold text-rose-700 hover:text-rose-900 underline flex items-center gap-1"
                          >
                            <AlertCircle className="w-3 h-3" />
                            <span>Abrir Caso de RH</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredEvaluations.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    <div className="max-w-xs mx-auto space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="font-bold text-slate-600">Nenhuma avaliação encontrada na fila</p>
                      <p className="text-[11px] text-slate-400">
                        {statusQueueFilter !== 'ALL'
                          ? 'Não existem avaliações no estado selecionado ou filtros ativos.'
                          : 'Aguarde a submissão de novos formulários por clientes.'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: ASSOCIAR EMPRESA CADASTRADA */}
      {associatingEval && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-900">Associar Empresa Cliente Oficial</h3>
                <p className="text-xs text-slate-500">
                  Avaliação: <span className="font-mono font-bold text-slate-800">{associatingEval.reference}</span>
                </p>
              </div>
              <button onClick={() => setAssociatingEval(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nome original preservado */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-500 block">
                Nome escrito livremente pelo cliente na submissão:
              </span>
              <p className="text-sm font-black text-slate-950 mt-0.5">
                "{associatingEval.clientNameInput || associatingEval.clientName}"
              </p>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Este nome original permanecerá guardado permanentemente para histórico e auditoria.
              </span>
            </div>

            {/* Sugestões Automáticas de Similaridade */}
            {suggestedClients.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 uppercase">
                  <Sparkles className="w-4 h-4 text-brand-dark" />
                  <span>Sugestão Inteligente de Correspondência</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {suggestedClients.map(({ client, similarity }) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setSelectedClientId(client.id)}
                      className={`p-3 rounded-xl border text-left text-xs transition flex items-center justify-between ${
                        selectedClientId === client.id
                          ? 'bg-brand/15 border-2 border-brand-dark text-slate-950'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                      }`}
                    >
                      <div>
                        <span className="font-black block">{client.companyName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Código: {client.internalCode} • Contato: {client.contactPerson}
                        </span>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        similarity >= 75 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {similarity}% similar
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pesquisa e Seleção Manual */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Ou Selecionar Manualmente da Base de Clientes Cadastrados *
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Pesquisar por nome ou código de cliente..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {clients
                  .filter(c => c.status === 'ACTIVE')
                  .filter(c => !clientSearch || c.companyName.toLowerCase().includes(clientSearch.toLowerCase()) || c.internalCode.toLowerCase().includes(clientSearch.toLowerCase()))
                  .map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedClientId(c.id)}
                      className={`w-full p-2.5 text-left text-xs transition flex items-center justify-between ${
                        selectedClientId === c.id ? 'bg-brand/20 font-black text-slate-950' : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <span>{c.companyName}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{c.internalCode}</span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Mensagens de Sucesso ou Erro */}
            {associationError && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{associationError}</span>
              </div>
            )}
            {associationSuccess && (
              <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{associationSuccess}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAssociatingEval(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAssociation}
                disabled={!selectedClientId || isSubmittingAssociation}
                style={{ backgroundColor: selectedClientId ? '#8CBF26' : undefined }}
                className="px-4 py-2 bg-slate-200 text-slate-950 font-black rounded-xl text-xs transition disabled:opacity-40"
              >
                {isSubmittingAssociation ? 'A gravar...' : 'Confirmar Associação Oficial'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ATRIBUIR FUNCIONÁRIO / TÉCNICO */}
      {assigningEval && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-900">Atribuir Funcionário à Avaliação</h3>
                <p className="text-xs text-slate-500">
                  Avaliação: <span className="font-mono font-bold text-slate-800">{assigningEval.reference}</span>
                </p>
              </div>
              <button onClick={() => setAssigningEval(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Pesquisar Técnico / Encarregado Ativo *
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={providerSearch}
                  onChange={(e) => setProviderSearch(e.target.value)}
                  placeholder="Nome ou código do técnico..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {providers
                  .filter(p => p.status === 'ACTIVE')
                  .filter(p => !providerSearch || p.name.toLowerCase().includes(providerSearch.toLowerCase()) || p.internalCode.toLowerCase().includes(providerSearch.toLowerCase()))
                  .map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProviderId(p.id)}
                      className={`w-full p-3 text-left text-xs transition flex items-center justify-between ${
                        selectedProviderId === p.id 
                          ? 'bg-blue-50 border-l-4 border-blue-600 font-black text-blue-950' 
                          : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div>
                        <span className="font-bold block">{p.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Código: {p.internalCode} • {p.services?.join(', ') || 'Geral'}
                        </span>
                      </div>
                      {selectedProviderId === p.id && (
                        <Check className="w-4 h-4 text-blue-600" />
                      )}
                    </button>
                  ))}
              </div>
            </div>

            {assignmentError && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{assignmentError}</span>
              </div>
            )}
            {assignmentSuccess && (
              <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{assignmentSuccess}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAssigningEval(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmAssignment}
                disabled={!selectedProviderId || isSubmittingAssignment}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs transition disabled:opacity-40"
              >
                {isSubmittingAssignment ? 'A gravar...' : 'Confirmar Atribuição'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ABRIR OCORRÊNCIA DE RH */}
      {hrCaseEval && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-black text-slate-900">Registar Ocorrência de RH</h3>
                <p className="text-xs text-slate-500">
                  Vinculada à Avaliação: <span className="font-mono font-bold text-slate-800">{hrCaseEval.reference}</span>
                </p>
              </div>
              <button onClick={() => setHrCaseEval(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmHRCase} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Tipo de Ocorrência *</label>
                <select
                  value={hrOccurrenceType}
                  onChange={(e) => setHrOccurrenceType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand font-medium"
                >
                  <option value="QUALIDADE_SERVICO">Não-Conformidade na Qualidade do Serviço</option>
                  <option value="COMPORTAMENTO">Postura ou Atendimento Inadequado</option>
                  <option value="ATRASO">Atraso na Execução ou Cumprimento de Prazos</option>
                  <option value="SEGURANCA">Incidente de Segurança ou Falta de EPIs</option>
                  <option value="ELOGIO">Elogio ou Desempenho Excecional</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Responsável pelo Acompanhamento *</label>
                <input
                  type="text"
                  required
                  value={hrAssignedTo}
                  onChange={(e) => setHrAssignedTo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Notas Internas & Diagnóstico *</label>
                <textarea
                  required
                  rows={3}
                  value={hrInternalNotes}
                  onChange={(e) => setHrInternalNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Ação Corretiva Proposta *</label>
                <textarea
                  required
                  rows={2}
                  value={hrCorrectiveAction}
                  onChange={(e) => setHrCorrectiveAction(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              {hrCaseError && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs">
                  {hrCaseError}
                </div>
              )}
              {hrCaseSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs">
                  {hrCaseSuccess}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setHrCaseEval(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingHRCase}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs transition disabled:opacity-40"
                >
                  {isSubmittingHRCase ? 'A gravar...' : 'Registar Ocorrência'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: FICHA DE HOMOLOGAÇÃO INSTITUCIONAL (FORMATO DE IMPRESSÃO) */}
      {printEval && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-slate-200 space-y-6 my-8 print:p-0 print:border-none print:shadow-none">
            {/* Cabeçalho da Impressão */}
            <div className="flex items-start justify-between pb-4 border-b-2 border-slate-900">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-slate-950 tracking-tight">AETERNU LDA</span>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-900 text-white">
                    SICSC
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                  Sistema Integrado de Controlo da Satisfação de Clientes • Higiene, Segurança & Ambiente
                </p>
                <h4 className="text-base font-black text-slate-900 mt-2">
                  FICHA INSTITUCIONAL DE HOMOLOGAÇÃO DE AVALIAÇÃO
                </h4>
              </div>
              <button 
                onClick={() => setPrintEval(null)} 
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg print:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metadados Oficiais */}
            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 font-semibold block text-[10px] uppercase">Referência Oficial:</span>
                <strong className="font-mono text-sm text-slate-950">{printEval.reference}</strong>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block text-[10px] uppercase">Data da Intervenção:</span>
                <strong className="text-slate-950">{printEval.serviceDate}</strong>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block text-[10px] uppercase">Empresa Cliente Oficial:</span>
                <strong className="text-slate-950">{printEval.clientName}</strong>
                {printEval.clientNameInput && printEval.clientNameInput !== printEval.clientName && (
                  <span className="text-[10px] text-slate-500 block italic">
                    (Digitado originalmente: "{printEval.clientNameInput}")
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-500 font-semibold block text-[10px] uppercase">Serviço Prestado:</span>
                <strong className="text-slate-950">{printEval.serviceName}</strong>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block text-[10px] uppercase">Funcionário / Técnico:</span>
                <strong className="text-slate-950">{printEval.providerName}</strong>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block text-[10px] uppercase">Homologado Em:</span>
                <strong className="text-slate-950">{printEval.finalizedAt?.replace('T', ' ').substring(0, 16) || '—'}</strong>
              </div>
            </div>

            {/* Perceção Inicial do Cliente */}
            <div className="space-y-2 text-xs">
              <h5 className="font-black text-slate-900 uppercase text-[11px] border-b border-slate-200 pb-1">
                1. Perceção Declarada pelo Cliente
              </h5>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">CSAT Global:</span>
                  <span className="text-sm font-black text-slate-900">★ {printEval.satisfactionRating} / 5</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Net Promoter Score (NPS):</span>
                  <span className="text-sm font-black text-slate-900">{printEval.npsScore ?? '—'} / 10</span>
                </div>
              </div>
              {printEval.comment && (
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Comentário Transcrito:</span>
                  <p className="italic text-slate-700 text-xs mt-1">"{printEval.comment}"</p>
                </div>
              )}
            </div>

            {/* Avaliação Técnica Ponderada */}
            <div className="space-y-2 text-xs">
              <h5 className="font-black text-slate-900 uppercase text-[11px] border-b border-slate-200 pb-1">
                2. Avaliação Técnica Homologada (Recursos Humanos)
              </h5>
              {printEval.criteriaSnapshot?.criteriaSnapshot && (
                <table className="w-full text-left text-[11px] border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 font-bold">
                    <tr>
                      <th className="p-2">Critério Técnico</th>
                      <th className="p-2 text-center">Peso</th>
                      <th className="p-2 text-center">Nota</th>
                      <th className="p-2 text-right">Contribuição</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {printEval.criteriaSnapshot.criteriaSnapshot.map((c, i) => (
                      <tr key={i}>
                        <td className="p-2 font-medium">{c.categoryName}</td>
                        <td className="p-2 text-center text-slate-600">{c.weightPercentage}%</td>
                        <td className="p-2 text-center font-bold">{c.scoreObtained} / {c.maxScore}</td>
                        <td className="p-2 text-right font-mono font-bold">{c.weightedContribution.toFixed(2)} pts</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Resultado Final */}
              <div className="flex items-center justify-between p-4 bg-slate-900 text-white rounded-xl mt-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Nota Técnica Final Homologada:</span>
                  <span className="text-2xl font-black">
                    {printEval.technicalScore !== undefined ? `${printEval.technicalScore.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Classificação Oficial:</span>
                  <span className={`text-sm font-black px-3 py-1 rounded-full inline-block ${
                    printEval.finalClassification === 'POSITIVE'
                      ? 'bg-brand text-slate-950'
                      : 'bg-rose-500 text-white'
                  }`}>
                    {printEval.finalClassification === 'POSITIVE' ? 'POSITIVA (APROVADO)' : 'NEGATIVA (NÃO CONFORME)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Assinatura e Autenticação */}
            <div className="pt-6 border-t border-slate-200 flex items-end justify-between text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Assinatura do Homologador Oficial:</span>
                <strong className="text-slate-900 block mt-1">{printEval.finalizedBy || 'Responsável RH'}</strong>
                <span className="text-[10px] text-slate-500">Recursos Humanos / Controlo de Qualidade</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-slate-400 block font-mono">
                  Identificador de Snapshot Imutável:
                </span>
                <span className="text-[9px] text-slate-600 font-mono">
                  {printEval.criteriaSnapshot?.versionId || `snap-${printEval.id.substring(0, 8)}`}
                </span>
              </div>
            </div>

            {/* Botões do Modal */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 print:hidden">
              <button
                type="button"
                onClick={() => setPrintEval(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs flex items-center gap-1.5 transition"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Ficha Oficial</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: REGISTO MANUAL DE AVALIAÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-black text-slate-900">Registo Manual de Avaliação</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {manualError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200">
                {manualError}
              </div>
            )}

            <form onSubmit={handleSaveManualEvaluation} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Cliente *</label>
                  <select
                    value={manualClientId}
                    onChange={(e) => setManualClientId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.companyName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Serviço *</label>
                  <select
                    value={manualServiceId}
                    onChange={(e) => setManualServiceId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    {services.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Prestador *</label>
                  <select
                    value={manualProviderId}
                    onChange={(e) => setManualProviderId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    {providers.filter(p => p.status === 'ACTIVE').map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Data do Serviço *</label>
                  <input
                    type="date"
                    required
                    value={manualServiceDate}
                    onChange={(e) => setManualServiceDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Classificação CSAT (1-5) *</label>
                  <select
                    value={manualSatisfaction}
                    onChange={(e) => setManualSatisfaction(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value={5}>5 - Excelente</option>
                    <option value={4}>4 - Muito Bom</option>
                    <option value={3}>3 - Razoável / Neutro</option>
                    <option value={2}>2 - Insatisfeito</option>
                    <option value={1}>1 - Muito Insatisfeito</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">NPS (0 a 10) *</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    required
                    value={manualNps}
                    onChange={(e) => setManualNps(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Comentário do Cliente</label>
                <textarea
                  rows={3}
                  value={manualComment}
                  onChange={(e) => setManualComment(e.target.value)}
                  placeholder="Observações fornecidas..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl"
                >
                  Gravar Avaliação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE TOKEN DE LINK */}
      {isTokenModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">Link Oficial de Avaliação</h3>
              <button onClick={() => setIsTokenModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Copie o link seguro abaixo para partilhar com o cliente corporativo para preenchimento público:
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs break-all font-mono text-slate-900 select-all">
              {generatedToken}
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(generatedToken);
                  setIsTokenModalOpen(false);
                }}
                style={{ backgroundColor: '#8CBF26' }}
                className="px-4 py-2 text-slate-950 font-bold text-xs rounded-xl"
              >
                Copiar e Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPRODUTOR DE ÁUDIO FLUTUANTE */}
      {activeAudioUrl && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-950 text-white p-4 rounded-2xl shadow-2xl border border-slate-800 flex items-center gap-3 max-w-sm">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0">
            <Volume2 className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black truncate">Depoimento de Voz do Cliente</p>
            <p className="text-[10px] text-slate-400 truncate">Avaliação {activeAudioRef}</p>
            <SecureAudio stored={activeAudioUrl} autoPlay className="w-full mt-2 h-7" />
          </div>
          <button
            onClick={() => setActiveAudioUrl(null)}
            className="p-1 text-slate-400 hover:text-white rounded-lg self-start"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { SecureAudio } from '../components/SecureAudio';
import { useApp } from '../context/AppContext';
import { Evaluation, EvaluationCriterion, Provider } from '../types';
import { 
  calculateWeightedScore, 
  CalculationResult 
} from '../services/evaluationUtils';
import { 
  CheckCircle2, 
  Clock, 
  Star, 
  Volume2, 
  FileText, 
  Building2, 
  UserCheck, 
  Calendar, 
  ShieldCheck, 
  AlertCircle, 
  Search, 
  Sliders, 
  Award, 
  Check, 
  X,
  Play,
  Info,
  Briefcase,
  AlertTriangle,
  Lock,
  ArrowRight,
  HelpCircle,
  Mic
} from 'lucide-react';
import { KpiDetailModal } from '../components/analytics/KpiDetailModal';

export const EvaluationAnalysisPage: React.FC = () => {
  const { 
    evaluations, 
    criteria, 
    passingThreshold, 
    finalizeEvaluation, 
    services, 
    clients, 
    providers,
    associateEvaluationClient,
    assignEvaluationProvider,
    activeRole,
    currentUser,
    setActiveTab,
    selectedEvaluationForAnalysis,
    setSelectedEvaluationForAnalysis
  } = useApp();

  const canHomologate = activeRole === 'ADMIN' || activeRole === 'HR';
  const isAdmin = activeRole === 'ADMIN';

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'HOMOLOGATED'>('PENDING');
  const [selectedKpiModal, setSelectedKpiModal] = useState<string | null>(null);
  
  // Modal de Análise e Homologação
  const [selectedEval, setSelectedEval] = useState<Evaluation | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reviewRatings, setReviewRatings] = useState<Record<string, number>>({});
  
  // Limiar Excecional
  const [isCustomThresholdEnabled, setIsCustomThresholdEnabled] = useState(false);
  const [customThreshold, setCustomThreshold] = useState<number>(passingThreshold);
  const [thresholdOverrideReason, setThresholdOverrideReason] = useState<string>('');

  // Confirmação final
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Associação inline se faltar cliente
  const [inlineClientId, setInlineClientId] = useState('');
  const [isAssociatingClient, setIsAssociatingClient] = useState(false);

  // Atribuição inline se faltar prestador
  const [inlineProviderId, setInlineProviderId] = useState('');
  const [isAssigningProvider, setIsAssigningProvider] = useState(false);

  // Filtragem de avaliações
  const filteredEvaluations = evaluations.filter(ev => {
    const isHomologated = !!ev.finalizedAt;
    if (statusFilter === 'PENDING' && isHomologated) return false;
    if (statusFilter === 'HOMOLOGATED' && !isHomologated) return false;

    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase().trim();
      const matchesRef = ev.reference?.toLowerCase().includes(s);
      const matchesClient = ev.clientName?.toLowerCase().includes(s) || ev.clientNameInput?.toLowerCase().includes(s);
      const matchesService = ev.serviceName?.toLowerCase().includes(s);
      const matchesProvider = ev.providerName?.toLowerCase().includes(s);
      if (!matchesRef && !matchesClient && !matchesService && !matchesProvider) return false;
    }

    return true;
  });

  const handleOpenAnalysis = (evalItem: Evaluation) => {
    setSelectedEval(evalItem);
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsCustomThresholdEnabled(false);
    setCustomThreshold(passingThreshold);
    setThresholdOverrideReason('');
    setIsConfirmModalOpen(false);

    setInlineClientId('');
    setInlineProviderId('');

    // Inicializar notas de revisão com base nas notas já existentes ou média calculada
    const initial: Record<string, number> = {};
    criteria.filter(c => c.active).forEach(c => {
      if (evalItem.criterionRatings && evalItem.criterionRatings[c.id] !== undefined) {
        initial[c.id] = evalItem.criterionRatings[c.id];
      } else {
        const minScore = c.minScore ?? 0;
        const clientScoreNormalized = Math.min(c.maxScore, Math.max(minScore, (evalItem.satisfactionRating / 5) * c.maxScore));
        initial[c.id] = Math.round(clientScoreNormalized * 10) / 10;
      }
    });
    setReviewRatings(initial);
    setIsModalOpen(true);
  };

  React.useEffect(() => {
    if (selectedEvaluationForAnalysis) {
      handleOpenAnalysis(selectedEvaluationForAnalysis);
      setSelectedEvaluationForAnalysis(null);
    }
  }, [selectedEvaluationForAnalysis]);

  const handleRatingChange = (criterionId: string, value: number) => {
    setReviewRatings(prev => ({
      ...prev,
      [criterionId]: value
    }));
  };

  // Limiar ativo no cálculo (padrão ou excecional)
  const activeCalculationThreshold = isCustomThresholdEnabled ? customThreshold : passingThreshold;

  // Cálculo em tempo real para pré-visualização no modal
  const liveCalculation: CalculationResult = calculateWeightedScore(
    reviewRatings, 
    criteria.filter(c => c.active), 
    activeCalculationThreshold
  );

  // Verificação de pré-requisitos antes de homologar
  const isMissingClient = selectedEval && !selectedEval.clientId;
  const isMissingProvider = selectedEval && !selectedEval.providerId;
  const hasPrerequisiteBlocker = isMissingClient || isMissingProvider;

  // Validação do limiar excecional
  const isThresholdChanged = isCustomThresholdEnabled && customThreshold !== passingThreshold;
  const isReasonValid = !isThresholdChanged || thresholdOverrideReason.trim().length >= 5;

  const handleOpenConfirm = () => {
    setErrorMsg(null);
    if (!canHomologate) {
      setErrorMsg('Acesso negado: apenas utilizadores com perfil de Administrador ou Recursos Humanos podem homologar.');
      return;
    }
    if (hasPrerequisiteBlocker) {
      setErrorMsg('Não é possível homologar: resolva as pendências de cliente oficial e funcionário.');
      return;
    }
    if (isThresholdChanged && !isReasonValid) {
      setErrorMsg('A aplicação de um limiar excecional exige uma justificação formal (mínimo 5 caracteres).');
      return;
    }
    setIsConfirmModalOpen(true);
  };

  const handleExecuteFinalize = async () => {
    if (!selectedEval) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const thresholdToApply = isThresholdChanged ? customThreshold : undefined;
    const reasonToApply = isThresholdChanged ? thresholdOverrideReason.trim() : undefined;

    const res = await finalizeEvaluation(selectedEval.id, reviewRatings, thresholdToApply, reasonToApply);
    setIsSubmitting(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Erro ao homologar a avaliação no servidor.');
      setIsConfirmModalOpen(false);
    } else {
      setIsConfirmModalOpen(false);
      setSuccessMsg(`Avaliação ${selectedEval.reference} homologada com sucesso! Nota Técnica: ${liveCalculation.finalScore.toFixed(1)}% (${liveCalculation.finalClassification}). O registo tornou-se imutável.`);
      
      // Atualizar objeto local selecionado
      setSelectedEval(prev => prev ? {
        ...prev,
        finalizedAt: new Date().toISOString(),
        finalizedBy: currentUser?.email || 'Recursos Humanos',
        technicalScore: liveCalculation.finalScore,
        finalClassification: liveCalculation.finalClassification
      } : null);

      setTimeout(() => {
        setIsModalOpen(false);
      }, 2500);
    }
  };

  // Associação de cliente inline
  const handleInlineAssociateClient = async () => {
    if (!selectedEval || !inlineClientId) return;
    setIsAssociatingClient(true);
    setErrorMsg(null);

    const res = await associateEvaluationClient(selectedEval.id, inlineClientId);
    setIsAssociatingClient(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Falha ao associar cliente.');
    } else {
      const c = clients.find(cl => cl.id === inlineClientId);
      setSelectedEval(prev => prev ? {
        ...prev,
        clientId: inlineClientId,
        clientName: c ? c.companyName : prev.clientName
      } : null);
    }
  };

  // Atribuição de prestador inline
  const handleInlineAssignProvider = async () => {
    if (!selectedEval || !inlineProviderId) return;
    setIsAssigningProvider(true);
    setErrorMsg(null);

    const res = await assignEvaluationProvider(selectedEval.id, inlineProviderId);
    setIsAssigningProvider(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Falha ao atribuir funcionário.');
    } else {
      const p = providers.find(pr => pr.id === inlineProviderId);
      setSelectedEval(prev => prev ? {
        ...prev,
        providerId: inlineProviderId,
        providerName: p ? p.name : prev.providerName
      } : null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* TOPO / HEADER */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Análise Técnica & Homologação</h1>
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200">
              Parecer Oficial de RH
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Revisão ponderada dos critérios técnicos oficiais, validação de pré-requisitos e gravação do snapshot imutável no Supabase.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('evaluations')}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition"
          >
            &larr; Voltar à Fila de Receção
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block">Total de Submissões</span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{evaluations.length}</span>
          <span className="text-[10px] text-slate-400 mt-1 block">Catálogo auditado</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block">Pendentes de Homologação</span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">
            {evaluations.filter(e => !e.finalizedAt).length}
          </span>
          <span className="text-[10px] text-amber-700 font-bold mt-1 block">Requer parecer de RH</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block">Homologadas Imutáveis</span>
          <span className="text-2xl font-black text-brand-dark mt-1 block">
            {evaluations.filter(e => !!e.finalizedAt).length}
          </span>
          <span className="text-[10px] text-emerald-700 font-bold mt-1 block">Auditadas com snapshot</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block">Limiar de Aprovação Ativo</span>
          <span className="text-2xl font-black text-blue-600 mt-1 block">{passingThreshold}%</span>
          <span className="text-[10px] text-blue-700 font-bold mt-1 block">Mínimo ponderado</span>
        </div>
      </div>

      {/* Filtros da Lista */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por referência, cliente ou funcionário..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
              statusFilter === 'PENDING'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Pendentes ({evaluations.filter(e => !e.finalizedAt).length})
          </button>
          <button
            onClick={() => setStatusFilter('HOMOLOGATED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
              statusFilter === 'HOMOLOGATED'
                ? 'bg-brand-dark text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Homologadas ({evaluations.filter(e => !!e.finalizedAt).length})
          </button>
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Todas ({evaluations.length})
          </button>
        </div>
      </div>

      {/* Lista de Avaliações para Análise */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredEvaluations.map(ev => {
          const isHomologated = !!ev.finalizedAt;
          const isReady = ev.clientId && ev.providerId && !isHomologated;
          const hasMissingClient = !ev.clientId;
          const hasMissingProvider = !ev.providerId;

          return (
            <div 
              key={ev.id} 
              className={`bg-white rounded-2xl border p-5 space-y-4 shadow-xs transition hover:shadow-md ${
                isHomologated 
                  ? 'border-emerald-200 bg-emerald-50/20' 
                  : isReady 
                  ? 'border-purple-200' 
                  : 'border-amber-200'
              }`}
            >
              {/* Header do Card */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-xs font-black text-slate-950 block">
                    {ev.reference}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Intervenção: {ev.serviceDate}
                  </span>
                </div>
                {isHomologated ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-950 border border-emerald-300">
                    Homologada ({ev.technicalScore !== undefined ? `${ev.technicalScore.toFixed(0)}%` : ''})
                  </span>
                ) : isReady ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-900 border border-purple-300">
                    Pronta para Homologar
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                    Pré-requisitos Pendentes
                  </span>
                )}
              </div>

              {/* Informações da Avaliação */}
              <div className="space-y-1.5 text-xs text-slate-700">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Empresa Cliente:</span>
                  <strong className="text-slate-900 font-bold block truncate">
                    {ev.clientName}
                  </strong>
                  {ev.clientNameInput && ev.clientNameInput !== ev.clientName && (
                    <span className="text-[10px] text-slate-500 block truncate">
                      (Digitado: "{ev.clientNameInput}")
                    </span>
                  )}
                  {hasMissingClient && (
                    <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded inline-block mt-0.5">
                      Falta associar cliente oficial
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Serviço & Funcionário:</span>
                  <span className="font-semibold block truncate">{ev.serviceName}</span>
                  <span className="text-[11px] text-slate-600 block truncate">
                    {ev.providerName || 'Nenhum funcionário atribuído'}
                  </span>
                  {hasMissingProvider && (
                    <span className="text-[10px] text-blue-700 font-bold bg-blue-100 px-1.5 py-0.5 rounded inline-block mt-0.5">
                      Falta atribuir funcionário
                    </span>
                  )}
                </div>

                <div className="pt-1 flex items-center justify-between border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-amber-600">★ {ev.satisfactionRating}/5</span>
                    {ev.npsScore !== undefined && (
                      <span className="text-slate-500 font-medium text-[10px]">(NPS: {ev.npsScore})</span>
                    )}
                  </div>
                  {ev.audioRecordingUrl && (
                    <span className="text-[10px] text-rose-600 font-bold flex items-center gap-0.5">
                      <Mic className="w-3 h-3" /> Áudio
                    </span>
                  )}
                </div>
              </div>

              {/* Botão de Análise */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleOpenAnalysis(ev)}
                  style={{ backgroundColor: !isHomologated && isReady ? '#8CBF26' : undefined }}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
                    isHomologated
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                      : isReady
                      ? 'text-slate-950 shadow-sm hover:opacity-95'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  {isHomologated ? (
                    <>
                      <FileText className="w-3.5 h-3.5" />
                      <span>Ver Homologação Auditada</span>
                    </>
                  ) : (
                    <>
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Avaliar & Homologar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {filteredEvaluations.length === 0 && (
          <div className="col-span-full p-12 bg-white rounded-3xl border border-slate-200 text-center text-slate-400">
            <CheckCircle2 className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-slate-700">Nenhuma avaliação encontrada</p>
            <p className="text-xs text-slate-400">Ajuste o filtro ou o termo de pesquisa acima.</p>
          </div>
        )}
      </div>

      {/* MODAL DE ANÁLISE TÉCNICA E HOMOLOGAÇÃO */}
      {isModalOpen && selectedEval && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8">
            {/* Header do Modal */}
            <div className="bg-slate-950 text-white p-6 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-black tracking-tight">Avaliação Técnica & Parecer de Qualidade</span>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/10 text-emerald-400">
                    {selectedEval.reference}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Empresa: <strong className="text-white">{selectedEval.clientName}</strong> • Intervenção: {selectedEval.serviceDate}
                </p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* FEEDBACK DE ERRO OU SUCESSO */}
              {errorMsg && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <span className="font-semibold">{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="font-semibold">{successMsg}</span>
                </div>
              )}

              {/* BLOQUEADORES DE PRÉ-REQUISITOS (CLIENTE E FUNCIONÁRIO) */}
              {hasPrerequisiteBlocker && (
                <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl space-y-3 text-xs text-rose-950">
                  <div className="flex items-center gap-2 font-black text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Pré-requisitos Obrigatórios Pendentes para Homologação</span>
                  </div>

                  {/* 1. Falta Empresa Oficial */}
                  {isMissingClient && (
                    <div className="bg-white p-3 rounded-xl border border-rose-200 space-y-2">
                      <p className="font-bold text-slate-900">
                        1. Falta associar uma empresa cliente oficial cadastrada:
                      </p>
                      <p className="text-[11px] text-slate-600">
                        O cliente escreveu no formulário: <strong className="text-slate-950">"{selectedEval.clientNameInput || selectedEval.clientName}"</strong>
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <select
                          value={inlineClientId}
                          onChange={(e) => setInlineClientId(e.target.value)}
                          className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900"
                        >
                          <option value="">-- Selecione o Cliente Oficial --</option>
                          {clients.filter(c => c.status === 'ACTIVE').map(c => (
                            <option key={c.id} value={c.id}>{c.companyName} ({c.internalCode})</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!inlineClientId || isAssociatingClient}
                          onClick={handleInlineAssociateClient}
                          className="px-3 py-1.5 bg-brand-dark text-white font-bold rounded-lg text-xs disabled:opacity-40"
                        >
                          {isAssociatingClient ? 'A gravar...' : 'Associar'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. Falta Funcionário */}
                  {isMissingProvider && (
                    <div className="bg-white p-3 rounded-xl border border-rose-200 space-y-2">
                      <p className="font-bold text-slate-900">
                        2. Falta atribuir o funcionário/técnico que realizou o serviço:
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <select
                          value={inlineProviderId}
                          onChange={(e) => setInlineProviderId(e.target.value)}
                          className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900"
                        >
                          <option value="">-- Selecione o Técnico Ativo --</option>
                          {providers.filter(p => p.status === 'ACTIVE').map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.internalCode})</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!inlineProviderId || isAssigningProvider}
                          onClick={handleInlineAssignProvider}
                          className="px-3 py-1.5 bg-blue-600 text-white font-bold rounded-lg text-xs disabled:opacity-40"
                        >
                          {isAssigningProvider ? 'A gravar...' : 'Atribuir'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* DADOS DA SUBMISSÃO DO CLIENTE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Empresa & Intervenção</span>
                  <p className="font-black text-slate-900 text-sm">{selectedEval.clientName}</p>
                  <p className="text-slate-600">Serviço: <strong className="text-slate-900">{selectedEval.serviceName}</strong></p>
                  <p className="text-slate-600">Técnico: <strong className="text-slate-900">{selectedEval.providerName || 'Por atribuir'}</strong></p>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Perceção Inicial do Cliente</span>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500 font-black text-sm">★ {selectedEval.satisfactionRating} / 5.0</span>
                    {selectedEval.npsScore !== undefined && (
                      <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-bold text-[10px]">
                        NPS {selectedEval.npsScore} / 10
                      </span>
                    )}
                  </div>
                  {selectedEval.finalizedAt && (
                    <p className="text-emerald-700 font-bold">
                      Homologado em {selectedEval.finalizedAt.substring(0, 10)} por {selectedEval.finalizedBy}
                    </p>
                  )}
                </div>
              </div>

              {/* COMENTÁRIO E ÁUDIO */}
              {(selectedEval.comment || selectedEval.audioRecordingUrl) && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Comentários e Depoimento de Voz</span>
                  {selectedEval.comment && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-700 italic">
                      "{selectedEval.comment}"
                    </div>
                  )}
                  {selectedEval.audioRecordingUrl && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-blue-950 font-bold text-xs">
                        <Volume2 className="w-4 h-4 text-blue-600" />
                        <span>Gravação de Áudio do Cliente</span>
                      </div>
                      <SecureAudio stored={selectedEval.audioRecordingUrl} className="h-8 max-w-xs" />
                    </div>
                  )}
                </div>
              )}

              {/* RESPOSTAS INDIVIDUAIS POR PERGUNTA */}
              {selectedEval.detailedAnswers && Object.keys(selectedEval.detailedAnswers).length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Respostas Detalhadas do Formulário</span>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-white">
                    {Object.entries(selectedEval.detailedAnswers).map(([qid, ans], i) => (
                      <div key={qid} className="text-xs flex items-center justify-between border-b border-slate-100 last:border-none pb-1">
                        <span className="text-slate-700 font-medium">Questão #{i + 1}</span>
                        <span className="font-bold text-brand-dark">
                          {ans.rating !== undefined ? `${ans.rating} ★` : ans.textAnswer || 'Respondido'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FORMULÁRIO DE PONTUAÇÃO DOS CRITÉRIOS ATIVOS */}
              <div className="space-y-4 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase">
                      Pontuação Técnica por Critério (RH)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Ajuste a pontuação de conformidade normativa para cada critério auditado.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-brand-dark bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    Limiar: {activeCalculationThreshold}%
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {criteria.filter(c => c.active).map(crit => {
                    const currentScore = reviewRatings[crit.id] !== undefined ? reviewRatings[crit.id] : 4;

                    return (
                      <div key={crit.id} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 text-xs">{crit.categoryName}</span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                            Peso: {crit.weightPercentage}%
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 line-clamp-1">{crit.description}</p>
                        
                        <div className="flex items-center gap-3 pt-1">
                          <input
                            type="range"
                            min={crit.minScore}
                            max={crit.maxScore}
                            step="0.5"
                            disabled={!!selectedEval.finalizedAt}
                            value={currentScore}
                            onChange={(e) => handleRatingChange(crit.id, parseFloat(e.target.value))}
                            className="flex-1 accent-brand-dark cursor-pointer"
                          />
                          <span className="font-mono text-xs font-black text-slate-900 w-12 text-right">
                            {currentScore.toFixed(1)} / {crit.maxScore}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* OPÇÃO DE LIMIAR EXCECIONAL */}
              {!selectedEval.finalizedAt && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-900 flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isCustomThresholdEnabled}
                        onChange={(e) => setIsCustomThresholdEnabled(e.target.checked)}
                        className="rounded accent-brand-dark"
                      />
                      <span>Aplicar Limiar de Aprovação Excecional</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-medium">Padrão da organização: {passingThreshold}%</span>
                  </div>

                  {isCustomThresholdEnabled && (
                    <div className="space-y-3 pt-2 border-t border-slate-200 text-xs">
                      <div className="flex items-center gap-3">
                        <label className="font-bold text-slate-700">Novo Limiar (%):</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={customThreshold}
                          onChange={(e) => setCustomThreshold(Number(e.target.value))}
                          className="w-24 px-3 py-1 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                      </div>

                      {customThreshold !== passingThreshold && (
                        <div>
                          <label className="block font-bold text-slate-700 uppercase mb-1">
                            Justificação Formal Obrigatória * (mínimo 5 caracteres)
                          </label>
                          <textarea
                            required
                            rows={2}
                            value={thresholdOverrideReason}
                            onChange={(e) => setThresholdOverrideReason(e.target.value)}
                            placeholder="Descreva o motivo técnico ou contratual para o limiar excecional..."
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* PAINEL DE CÁLCULO PONDERADO EM TEMPO REAL */}
              <div className="bg-slate-950 text-white p-5 rounded-2xl space-y-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand">
                    Resultado Ponderado em Tempo Real
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-black ${
                    liveCalculation.finalClassification === 'POSITIVE'
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-rose-500 text-white'
                  }`}>
                    {liveCalculation.finalClassification === 'POSITIVE' ? 'POSITIVA (APROVADO)' : 'NEGATIVA (NÃO CONFORME)'}
                  </span>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">
                    {liveCalculation.finalScore.toFixed(1)}%
                  </span>
                  <span className="text-xs text-slate-400">
                    face ao limiar de {activeCalculationThreshold}%
                  </span>
                </div>

                <div className="text-[10px] text-slate-400 font-mono bg-white/5 p-2 rounded-lg border border-white/10 break-all">
                  {liveCalculation.formula}
                </div>
              </div>

              {/* BOTÕES DE AÇÃO DO MODAL */}
              <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                >
                  Fechar
                </button>

                {!selectedEval.finalizedAt && canHomologate && (
                  <button
                    type="button"
                    disabled={hasPrerequisiteBlocker || !isReasonValid || !liveCalculation.success}
                    onClick={handleOpenConfirm}
                    style={{ backgroundColor: !hasPrerequisiteBlocker && isReasonValid ? '#8CBF26' : undefined }}
                    className="px-6 py-2.5 rounded-xl text-xs font-black transition shadow-md disabled:opacity-40 disabled:bg-slate-300 text-slate-950"
                  >
                    Homologar Avaliação Oficial
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO EXPLÍCITA ANTES DE HOMOLOGAR */}
      {isConfirmModalOpen && selectedEval && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900">Confirmar Homologação Definitiva</h4>
                <p className="text-xs text-slate-500">Avaliação {selectedEval.reference}</p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-950 space-y-1.5">
              <p className="font-bold">Aviso de Imutabilidade do SICSC:</p>
              <p className="leading-relaxed">
                Após homologar, esta avaliação tornar-se-á <strong>estritamente imutável</strong>. Um snapshot histórico auditado será gerado no servidor e nenhuma nota, funcionário ou dado poderá ser alterado ou eliminado.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Nota Final Calculada:</span>
                <strong className="text-slate-900 font-black">{liveCalculation.finalScore.toFixed(1)}%</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Classificação:</span>
                <strong className={`font-black ${liveCalculation.finalClassification === 'POSITIVE' ? 'text-brand-dark' : 'text-rose-600'}`}>
                  {liveCalculation.finalClassification}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Homologador:</span>
                <span className="text-slate-800 font-medium">{currentUser?.email || 'Recursos Humanos'}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleExecuteFinalize}
                style={{ backgroundColor: '#8CBF26' }}
                className="px-5 py-2 text-slate-950 font-black rounded-xl text-xs transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>A homologar...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirmar Homologação</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

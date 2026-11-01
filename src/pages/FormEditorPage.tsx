import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { FormQuestion, QuestionCategory, QuestionType, FormCategoryItem } from '../types';
import { testSupabaseConnection, ConnectionTestResult, fetchFormCategoriesFromDb } from '../services/supabaseService';
import { CategoryManager } from '../components/forms/CategoryManager';
import { QuestionEditor } from '../components/forms/QuestionEditor';
import { 
  Settings, 
  Plus, 
  Trash2, 
  Edit3, 
  Copy, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw, 
  Check, 
  Eye, 
  EyeOff, 
  Save, 
  ShieldCheck, 
  Clock, 
  Star, 
  MessageSquare, 
  HelpCircle, 
  Sparkles, 
  X,
  Globe,
  Briefcase,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

// Category Definitions & Descriptions
const CATEGORIES_CONFIG: { id: QuestionCategory; name: string; description: string; color: string; badgeBg: string }[] = [
  {
    id: 'QUALIDADE',
    name: 'Qualidade Técnica & Rigor',
    description: 'Critérios de execução técnica, acabamento, rigor e conformidade com os padrões AETERNU.',
    color: '#8CBF26',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    id: 'PONTUALIDADE',
    name: 'Pontualidade & Prazos',
    description: 'Cumprimento dos prazos estabelecidos, horários de chegada e tempo de resposta.',
    color: '#00A3E0',
    badgeBg: 'bg-sky-100 text-sky-800 border-sky-300',
  },
  {
    id: 'SEGURANCA',
    name: 'Segurança & Proteção',
    description: 'Medidas de proteção individual/coletiva, segurança da informação e integridade das instalações.',
    color: '#E05A47',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    id: 'ATENDIMENTO',
    name: 'Atendimento & Cordialidade',
    description: 'Postura profissional, comunicação, empatia e facilidade de contacto dos técnicos.',
    color: '#9B51E0',
    badgeBg: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  {
    id: 'GERAL',
    name: 'Satisfação Geral & Recomendação',
    description: 'Percepção global do cliente, pontuação NPS e intenção de recomendação da empresa.',
    color: '#2D6A28',
    badgeBg: 'bg-slate-100 text-slate-800 border-slate-300',
  },
];

export const FormEditorPage: React.FC = () => {
  const { 
    formQuestions, 
    services, 
    evaluations,
    addFormQuestion, 
    updateFormQuestion, 
    deleteFormQuestion, 
    toggleFormQuestionActive,
    currentUser,
    activeRole,
    setIsClientFormOpen
  } = useApp();

  // Active Sub-Tab View ('questions' | 'categories')
  const [activeView, setActiveView] = useState<'questions' | 'categories'>('questions');
  const [categoriesList, setCategoriesList] = useState<FormCategoryItem[]>([]);

  useEffect(() => {
    fetchFormCategoriesFromDb().then(cats => setCategoriesList(cats));
  }, []);

  // Connection status testing state
  const [dbStatus, setDbStatus] = useState<ConnectionTestResult | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);

  // Filters state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');

  // Accordion expanded categories state (all expanded by default)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    QUALIDADE: true,
    PONTUALIDADE: true,
    SEGURANCA: true,
    ATENDIMENTO: true,
    GERAL: true,
  });

  // Modal / Slide-over state for Create & Edit
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingQuestion, setEditingQuestion] = useState<FormQuestion | null>(null);

  // Form field states for Modal
  const [formText, setFormText] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formCategory, setFormCategory] = useState<QuestionCategory>('QUALIDADE');
  const [formServiceId, setFormServiceId] = useState<string>(''); // empty string = Geral/All
  const [formType, setFormType] = useState<QuestionType>('RATING_5');
  const [formRequired, setFormRequired] = useState<boolean>(true);
  const [formActive, setFormActive] = useState<boolean>(true);
  const [formOrder, setFormOrder] = useState<number>(1);
  const [formError, setFormError] = useState<string | null>(null);

  // Feedback notifications
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [unsavedChangesCount, setUnsavedChangesCount] = useState<number>(0);

  // Security checks: verify RBAC permissions
  const canEditForm = activeRole === 'ADMIN' || activeRole === 'HR';

  // Perform live database connection test
  const checkDatabaseHealth = async () => {
    setIsTestingConnection(true);
    try {
      const res = await testSupabaseConnection();
      setDbStatus(res);
    } catch {
      setDbStatus({
        connected: false,
        message: 'Falha ao comunicar com o servidor Supabase.',
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  useEffect(() => {
    checkDatabaseHealth();
  }, []);

  // Display Toast message helper
  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Toggle category expand/collapse
  const toggleCategoryExpand = (catId: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [catId]: !prev[catId]
    }));
  };

  // Filter questions based on controls
  const filteredQuestions = useMemo(() => {
    return formQuestions.filter(q => {
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesText = q.text.toLowerCase().includes(term);
        const matchesDesc = q.description ? q.description.toLowerCase().includes(term) : false;
        if (!matchesText && !matchesDesc) return false;
      }

      // Category filter
      if (selectedCategory !== 'ALL' && q.category !== selectedCategory) {
        return false;
      }

      // Service filter
      if (selectedServiceFilter !== 'ALL') {
        if (selectedServiceFilter === 'GENERAL') {
          if (q.service_id) return false;
        } else {
          if (q.service_id !== selectedServiceFilter) return false;
        }
      }

      // Status filter
      if (selectedStatusFilter === 'ACTIVE' && !q.active) return false;
      if (selectedStatusFilter === 'INACTIVE' && q.active) return false;

      // Question Type filter
      if (selectedTypeFilter !== 'ALL' && q.type !== selectedTypeFilter) return false;

      return true;
    }).sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [formQuestions, searchTerm, selectedCategory, selectedServiceFilter, selectedStatusFilter, selectedTypeFilter]);

  // Open Create Modal
  const handleOpenCreateModal = (defaultCategory?: QuestionCategory) => {
    if (!canEditForm) {
      showToast('error', 'Acesso negado: apenas Recursos Humanos ou Administradores podem gerir o formulário.');
      return;
    }

    setEditingQuestion(null);
    setFormText('');
    setFormDescription('');
    setFormCategory(defaultCategory || 'QUALIDADE');
    setFormServiceId('');
    setFormType('RATING_5');
    setFormRequired(true);
    setFormActive(true);
    setFormOrder(formQuestions.length + 1);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (question: FormQuestion) => {
    if (!canEditForm) {
      showToast('error', 'Acesso negado: apenas Recursos Humanos ou Administradores podem gerir o formulário.');
      return;
    }

    setEditingQuestion(question);
    setFormText(question.text);
    setFormDescription(question.description || '');
    setFormCategory(question.category);
    setFormServiceId(question.service_id || '');
    setFormType(question.type);
    setFormRequired(question.required);
    setFormActive(question.active);
    setFormOrder(question.order || 1);
    setFormError(null);
    setIsModalOpen(true);
  };

  // Handle Save (Create or Update)
  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formText.trim()) {
      setFormError('Por favor, introduza o texto completo da pergunta.');
      return;
    }

    const payload: Omit<FormQuestion, 'id'> = {
      text: formText.trim(),
      description: formDescription.trim() || undefined,
      category: formCategory,
      type: formType,
      required: formRequired,
      active: formActive,
      order: Number(formOrder) || 1,
      service_id: formServiceId.trim() || undefined
    };

    if (editingQuestion) {
      // Update existing
      const res = await updateFormQuestion(editingQuestion.id, payload);
      if (res.success) {
        showToast('success', 'Pergunta atualizada e persistida com sucesso no Supabase.');
        setIsModalOpen(false);
      } else {
        setFormError(res.error || 'Erro ao atualizar pergunta no Supabase.');
      }
    } else {
      // Create new
      const res = await addFormQuestion(payload);
      if (res.success) {
        showToast('success', 'Nova pergunta criada e persistida no Supabase.');
        setIsModalOpen(false);
      } else {
        setFormError(res.error || 'Erro ao criar pergunta no Supabase.');
      }
    }
  };

  const handleSaveQuestionFromEditor = async (payload: any, questionId?: string) => {
    if (questionId) {
      const res = await updateFormQuestion(questionId, payload);
      if (res.success) {
        showToast('success', 'Pergunta atualizada e persistida com sucesso no Supabase.');
      }
      return res;
    } else {
      const res = await addFormQuestion(payload);
      if (res.success) {
        showToast('success', 'Nova pergunta criada e persistida no Supabase.');
      }
      return res;
    }
  };

  // Duplicate Question
  const handleDuplicateQuestion = async (question: FormQuestion) => {
    if (!canEditForm) {
      showToast('error', 'Acesso negado.');
      return;
    }

    const newPayload: Omit<FormQuestion, 'id'> = {
      text: `${question.text} (Cópia)`,
      description: question.description,
      category: question.category,
      type: question.type,
      required: question.required,
      active: question.active,
      order: (question.order || 0) + 1,
      service_id: question.service_id
    };

    const res = await addFormQuestion(newPayload);
    if (res.success) {
      showToast('success', `Pergunta duplicada com sucesso: "${question.text.substring(0, 30)}..."`);
    } else {
      showToast('error', res.error || 'Falha ao duplicar a pergunta.');
    }
  };

  // Toggle active status directly
  const handleToggleActive = async (question: FormQuestion) => {
    if (!canEditForm) {
      showToast('error', 'Acesso negado.');
      return;
    }

    const res = await toggleFormQuestionActive(question.id);
    if (res.success) {
      showToast('success', `Estado da pergunta alterado para ${!question.active ? 'Ativa' : 'Inativa'}.`);
    } else {
      showToast('error', res.error || 'Falha ao alterar estado da pergunta.');
    }
  };

  // Safe Delete with historical answers protection check
  const handleSafeDeleteQuestion = async (question: FormQuestion) => {
    if (!canEditForm) {
      showToast('error', 'Acesso negado.');
      return;
    }

    // Check if evaluation historical records reference this question text or ID
    const hasHistoricalAnswers = evaluations.some(e => {
      if (!e.detailedAnswers) return false;
      return Object.keys(e.detailedAnswers).includes(question.id);
    });

    if (hasHistoricalAnswers) {
      // Protect historical integrity: Soft-deactivate instead of hard deleting
      if (confirm(`A pergunta "${question.text.substring(0, 45)}..." possui respostas em avaliações históricas do cliente.\n\nPara preservar a integridade dos relatórios e o histórico de RH, a pergunta será DESATIVADA em vez de eliminada fisicamente.\n\nDeseja desativar esta pergunta?`)) {
        const res = await updateFormQuestion(question.id, { active: false });
        if (res.success) {
          showToast('success', 'Pergunta desativada com sucesso para preservação do histórico.');
        } else {
          showToast('error', res.error || 'Falha ao desativar a pergunta.');
        }
      }
      return;
    }

    // Safe to hard delete
    if (confirm(`Tem a certeza que deseja eliminar permanentemente a pergunta "${question.text.substring(0, 45)}..."?\n\nEsta operação é irreversível.`)) {
      const res = await deleteFormQuestion(question.id);
      if (res.success) {
        showToast('success', 'Pergunta eliminada da base de dados com sucesso.');
      } else {
        showToast('error', res.error || 'Falha ao eliminar a pergunta.');
      }
    }
  };

  // Reordering handlers for question sequence
  const handleMoveQuestionUp = async (question: FormQuestion) => {
    if (!canEditForm) return;
    const sameCatQuestions = formQuestions
      .filter(q => q.category === question.category)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const currentIndex = sameCatQuestions.findIndex(q => q.id === question.id);
    if (currentIndex <= 0) return;
    const prevQuestion = sameCatQuestions[currentIndex - 1];

    const currentOrder = question.order || currentIndex + 1;
    const prevOrder = prevQuestion.order || currentIndex;

    await updateFormQuestion(question.id, { order: prevOrder });
    await updateFormQuestion(prevQuestion.id, { order: currentOrder });
    showToast('success', 'Ordem da pergunta atualizada no Supabase.');
  };

  const handleMoveQuestionDown = async (question: FormQuestion) => {
    if (!canEditForm) return;
    const sameCatQuestions = formQuestions
      .filter(q => q.category === question.category)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const currentIndex = sameCatQuestions.findIndex(q => q.id === question.id);
    if (currentIndex < 0 || currentIndex >= sameCatQuestions.length - 1) return;
    const nextQuestion = sameCatQuestions[currentIndex + 1];

    const currentOrder = question.order || currentIndex + 1;
    const nextOrder = nextQuestion.order || currentIndex + 2;

    await updateFormQuestion(question.id, { order: nextOrder });
    await updateFormQuestion(nextQuestion.id, { order: currentOrder });
    showToast('success', 'Ordem da pergunta atualizada no Supabase.');
  };

  // Service helper name lookup
  const getServiceName = (serviceId?: string) => {
    if (!serviceId) return null;
    const s = services.find(item => item.id === serviceId);
    return s ? `${s.name} (${s.code})` : 'Serviço Personalizado';
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      
      {/* Toast Alert Banner */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-2xl border flex items-center gap-3 animate-bounce transition-all ${
          toastMessage.type === 'success' 
            ? 'bg-slate-900 text-white border-brand' 
            : 'bg-red-900 text-white border-red-500'
        }`}>
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-6 h-6 text-brand flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
          )}
          <span className="text-sm font-bold">{toastMessage.text}</span>
        </div>
      )}

      {/* A. BARRA SUPERIOR DE GESTÃO E DIAGNÓSTICO DA LIGAÇÃO */}
      <div className="bg-slate-900 text-white p-6 md:p-8 rounded-3xl border border-slate-800 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-brand/20 text-brand rounded-2xl border border-brand/30">
              <Settings className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Editor do Formulário de Satisfação</h1>
              <p className="text-slate-400 text-sm mt-1">
                Configuração dinâmica de perguntas por categoria, associadas aos serviços AETERNU LDA.
              </p>
            </div>
          </div>
        </div>

        {/* Diagnostic & Connection Badge + Quick Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Live Supabase Connection Badge */}
          <button 
            onClick={checkDatabaseHealth}
            disabled={isTestingConnection}
            className={`px-4 py-2.5 rounded-2xl border text-xs font-extrabold flex items-center gap-2 transition-all ${
              dbStatus?.connected
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                : 'bg-red-950/80 text-red-400 border-red-800'
            }`}
            title="Clique para testar a ligação em tempo real ao Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTestingConnection ? 'animate-spin' : ''}`} />
            {dbStatus?.connected ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Supabase Conetado ({dbStatus.latencyMs ? `${dbStatus.latencyMs}ms` : 'Ativo'})</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-red-400"></span>
                <span>Sem Ligação Remota</span>
              </>
            )}
          </button>

          {/* Pending changes counter badge */}
          {unsavedChangesCount > 0 && (
            <span className="px-3 py-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-2xl text-xs font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {unsavedChangesCount} alteraç{unsavedChangesCount === 1 ? 'ão pendente' : 'ões pendentes'}
            </span>
          )}

          {/* Action Button: Pré-visualizar Formulário */}
          <button
            onClick={() => setIsClientFormOpen(true)}
            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-extrabold rounded-2xl shadow-md transition-all flex items-center gap-2 text-xs cursor-pointer"
            title="Pré-visualizar o formulário interativo de satisfação do cliente"
          >
            <Eye className="w-4 h-4 text-brand" />
            <span>Pré-visualizar Formulário</span>
          </button>

          {/* Action Button: Nova Pergunta */}
          {canEditForm && (
            <button
              onClick={() => handleOpenCreateModal()}
              className="px-5 py-3 bg-brand text-slate-950 hover:bg-[#7ab01e] font-black rounded-2xl shadow-lg transition-all flex items-center gap-2 text-sm cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>Nova Pergunta</span>
            </button>
          )}
        </div>
      </div>

      {/* SUB-NAVEGAÇÃO: PERGUNTAS VS CATEGORIAS */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveView('questions')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
            activeView === 'questions'
              ? 'bg-slate-900 text-white shadow-md'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <HelpCircle className="w-4 h-4 text-brand" />
          <span>Perguntas do Formulário</span>
          <span className="px-2 py-0.5 rounded-full bg-brand/20 text-brand text-[10px] font-black">
            {formQuestions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveView('categories')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all flex items-center gap-2 ${
            activeView === 'categories'
              ? 'bg-slate-900 text-white shadow-md'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Layers className="w-4 h-4 text-brand" />
          <span>Gestão de Categorias</span>
          <span className="px-2 py-0.5 rounded-full bg-brand/20 text-brand text-[10px] font-black">
            {categoriesList.length || 5}
          </span>
        </button>
      </div>

      {activeView === 'categories' ? (
        <CategoryManager
          questions={formQuestions}
          categories={categoriesList}
          canEdit={canEditForm}
          onCategoryAdded={(newCat) => {
            setCategoriesList(prev => [...prev, newCat]);
          }}
          onCategoryDeleted={(catId) => {
            setCategoriesList(prev => prev.filter(c => c.id !== catId));
          }}
        />
      ) : (
        <>
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Filter className="w-5 h-5 text-brand" />
            Filtros & Pesquisa Avançada
          </h2>
          <span className="text-xs text-slate-500 font-bold">
            A apresentar {filteredQuestions.length} de {formQuestions.length} perguntas
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Pesquisar pergunta..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand focus:bg-white outline-none"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none"
            >
              <option value="ALL">Todas as Categorias</option>
              {CATEGORIES_CONFIG.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Service Filter */}
          <div>
            <select
              value={selectedServiceFilter}
              onChange={(e) => setSelectedServiceFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none"
            >
              <option value="ALL">Todos os Serviços</option>
              <option value="GENERAL">🌐 Apenas Perguntas Gerais</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>🛠️ {s.name} ({s.code})</option>
              ))}
            </select>
          </div>

          {/* Active Status Filter */}
          <div>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none"
            >
              <option value="ALL">Todos os Estados</option>
              <option value="ACTIVE">🟢 Apenas Ativas</option>
              <option value="INACTIVE">🔴 Apenas Inativas</option>
            </select>
          </div>

          {/* Question Type Filter */}
          <div>
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none"
            >
              <option value="ALL">Todos os Tipos de Resposta</option>
              <option value="RATING_5">⭐ Escala 1-5 (CSAT)</option>
              <option value="NPS_10">📊 Pontuação NPS 0-10</option>
              <option value="TEXT_ONLY">💬 Texto Livre</option>
              <option value="AUDIO_AND_TEXT">🎙️ Áudio & Texto</option>
            </select>
          </div>
        </div>
      </div>

      {/* C. ORGANIZAÇÃO POR CATEGORIAS (PAINÉIS EXPANSÍVEIS) */}
      <div className="space-y-6">
        {CATEGORIES_CONFIG.map(cat => {
          // Questions belonging to this category from the filtered list
          const catQuestions = filteredQuestions.filter(q => q.category === cat.id);
          const totalCatQuestionsCount = formQuestions.filter(q => q.category === cat.id).length;
          const activeCatQuestionsCount = formQuestions.filter(q => q.category === cat.id && q.active).length;
          const isExpanded = expandedCategories[cat.id] ?? true;

          // Skip category if category filter is active and doesn't match
          if (selectedCategory !== 'ALL' && selectedCategory !== cat.id) {
            return null;
          }

          return (
            <div 
              key={cat.id} 
              className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-slate-300"
            >
              {/* Category Header Bar */}
              <div 
                className="p-5 md:p-6 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                onClick={() => toggleCategoryExpand(cat.id)}
              >
                <div className="flex items-start md:items-center gap-3.5">
                  <div 
                    className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-white shadow-md flex-shrink-0 mt-0.5 md:mt-0"
                    style={{ backgroundColor: cat.color }}
                  >
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-black text-slate-900">{cat.name}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${cat.badgeBg}`}>
                        {activeCatQuestionsCount} ativas / {totalCatQuestionsCount} total
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {cat.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end md:self-auto">
                  {canEditForm && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenCreateModal(cat.id);
                      }}
                      className="px-3.5 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4 text-brand" />
                      <span>Adicionar</span>
                    </button>
                  )}

                  <button 
                    type="button" 
                    className="p-2 text-slate-400 hover:text-slate-700 bg-white rounded-xl border border-slate-200"
                  >
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Category Body / Accordion Content */}
              {isExpanded && (
                <div className="p-5 md:p-6 bg-slate-100/40">
                  {catQuestions.length === 0 ? (
                    <div className="py-8 text-center bg-white rounded-2xl border border-dashed border-slate-300 p-6">
                      <HelpCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-700">Nenhuma pergunta encontrada nesta categoria.</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {totalCatQuestionsCount === 0 
                          ? 'Clique em "Adicionar" para criar a primeira pergunta desta dimensão.'
                          : 'Ajuste os filtros de pesquisa acima para visualizar as perguntas existentes.'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {catQuestions.map((q) => {
                        const serviceName = getServiceName(q.service_id);

                        return (
                          /* D. CARTÃO INDIVIDUAL DE PERGUNTA */
                          <div 
                            key={q.id}
                            className={`p-5 rounded-2xl bg-white border transition-all ${
                              q.active 
                                ? 'border-slate-200 hover:border-slate-300 shadow-sm' 
                                : 'border-slate-300 bg-slate-50/70 opacity-75'
                            }`}
                          >
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                              <div className="space-y-2.5 flex-1">
                                
                                {/* Header badges row */}
                                <div className="flex flex-wrap items-center gap-2">
                                  {/* Order index badge */}
                                  <span className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-black tracking-wider">
                                    ORDEM #{q.order || 1}
                                  </span>

                                  {/* Service association badge */}
                                  {q.service_id ? (
                                    <span className="px-2.5 py-1 bg-sky-100 text-sky-900 border border-sky-300 rounded-lg text-[11px] font-bold flex items-center gap-1">
                                      <Briefcase className="w-3 h-3 text-sky-600" />
                                      {serviceName}
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-[11px] font-bold flex items-center gap-1">
                                      <Globe className="w-3 h-3 text-emerald-600" />
                                      Geral (Todos os Serviços)
                                    </span>
                                  )}

                                  {/* Question type badge */}
                                  <span className="px-2.5 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-[11px] font-bold">
                                    {q.type === 'RATING_5' && '⭐ Escala 1-5 estrelas'}
                                    {q.type === 'NPS_10' && '📊 NPS 0-10'}
                                    {q.type === 'TEXT_ONLY' && '💬 Texto Livre'}
                                    {q.type === 'AUDIO_AND_TEXT' && '🎙️ Áudio & Texto'}
                                  </span>

                                  {/* Required badge */}
                                  {q.required ? (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-800 border border-red-200 rounded-md text-[10px] font-extrabold uppercase">
                                      Obrigatória
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-md text-[10px] font-extrabold uppercase">
                                      Opcional
                                    </span>
                                  )}

                                  {/* Active/Inactive badge */}
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase flex items-center gap-1 ${
                                    q.active 
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${q.active ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                                    {q.active ? 'Ativa' : 'Inativa'}
                                  </span>
                                </div>

                                {/* Question full text */}
                                <p className="text-base font-extrabold text-slate-900 leading-snug">
                                  {q.text}
                                </p>

                                {/* Question optional description */}
                                {q.description && (
                                  <p className="text-xs text-slate-500 font-medium italic">
                                    {q.description}
                                  </p>
                                )}
                              </div>

                              {/* Card Action Buttons */}
                              {canEditForm && (
                                <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200">
                                  {/* Toggle Active Switch */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleActive(q)}
                                    title={q.active ? 'Desativar pergunta' : 'Ativar pergunta'}
                                    className={`p-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1 ${
                                      q.active 
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' 
                                        : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                                    }`}
                                  >
                                    {q.active ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                                  </button>

                                  {/* Move Up */}
                                  <button
                                    type="button"
                                    onClick={() => handleMoveQuestionUp(q)}
                                    title="Subir na ordem de exibição"
                                    className="p-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 rounded-xl transition-all"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Move Down */}
                                  <button
                                    type="button"
                                    onClick={() => handleMoveQuestionDown(q)}
                                    title="Descer na ordem de exibição"
                                    className="p-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 rounded-xl transition-all"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Duplicate Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleDuplicateQuestion(q)}
                                    title="Duplicar esta pergunta"
                                    className="p-2 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 rounded-xl transition-all"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>

                                  {/* Edit Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(q)}
                                    title="Editar pergunta"
                                    className="px-3 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-xs"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-brand" />
                                    <span>Editar</span>
                                  </button>

                                  {/* Safe Delete Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleSafeDeleteQuestion(q)}
                                    title="Eliminar em segurança ou desativar"
                                    className="p-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-xl transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
        </>
      )}

      {/* QUESTION EDITOR MODAL COMPONENT */}
      <QuestionEditor
        isOpen={isModalOpen}
        question={editingQuestion}
        categories={categoriesList}
        services={services}
        defaultCategory={formCategory}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveQuestionFromEditor}
      />
    </div>
  );
};

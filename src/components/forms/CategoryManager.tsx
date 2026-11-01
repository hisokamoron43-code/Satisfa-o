import React, { useState } from 'react';
import { FormCategoryItem, FormQuestion } from '../../types';
import { useApp } from '../../context/AppContext';
import { DEFAULT_FORM_CATEGORIES } from '../../services/supabaseService';
import { 
  Layers, 
  Plus, 
  Trash2, 
  Edit3,
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Tag, 
  RefreshCw,
  Palette,
  Check,
  Eye,
  EyeOff,
  Sliders
} from 'lucide-react';

interface CategoryManagerProps {
  categories?: FormCategoryItem[];
  questions?: FormQuestion[];
  onCategoryAdded?: (category: FormCategoryItem) => void;
  onCategoryUpdated?: (category: FormCategoryItem) => void;
  onCategoryDeleted?: (categoryId: string) => void;
  canEdit?: boolean;
}

const PRESET_COLORS = [
  '#8CBF26', // Aeternu Green
  '#00A3E0', // Sky Blue
  '#E05A47', // Coral Red
  '#9B51E0', // Purple
  '#2D6A28', // Dark Green
  '#F2994A', // Orange
  '#2F80ED', // Royal Blue
  '#D97706', // Amber
  '#0D9488', // Teal
  '#E11D48', // Rose
];

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  questions: propQuestions,
  onCategoryAdded,
  onCategoryUpdated,
  onCategoryDeleted,
  canEdit = true
}) => {
  const { 
    formCategories: contextCategories,
    formQuestions: contextQuestions,
    addFormCategory: contextAddCategory,
    updateFormCategory: contextUpdateCategory,
    deleteFormCategory: contextDeleteCategory,
    refreshFormCategories
  } = useApp();

  const questions = propQuestions || contextQuestions || [];
  const categoriesList = (contextCategories && contextCategories.length > 0) 
    ? contextCategories 
    : DEFAULT_FORM_CATEGORIES;

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<FormCategoryItem | null>(null);
  
  // Form fields
  const [catName, setCatName] = useState<string>('');
  const [catCode, setCatCode] = useState<string>('');
  const [catDescription, setCatDescription] = useState<string>('');
  const [catColor, setCatColor] = useState<string>('#8CBF26');
  const [catOrder, setCatOrder] = useState<number>(1);
  const [catActive, setCatActive] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const handleManualRefresh = async () => {
    setIsLoading(true);
    try {
      await refreshFormCategories();
      showToast('success', 'Categorias sincronizadas com o Supabase.');
    } catch {
      showToast('error', 'Falha ao sincronizar categorias.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingCategory(null);
    setCatName('');
    setCatCode('');
    setCatDescription('');
    setCatColor('#8CBF26');
    setCatOrder(categoriesList.length + 1);
    setCatActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cat: FormCategoryItem) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatCode(cat.code || cat.id);
    setCatDescription(cat.description || '');
    setCatColor(cat.color || '#8CBF26');
    setCatOrder(cat.display_order ?? 1);
    setCatActive(cat.active ?? true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!catName.trim()) {
      setFormError('Por favor, introduza o nome da categoria.');
      return;
    }

    const generatedCode = (catCode.trim() || catName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_')).substring(0, 30);

    if (editingCategory) {
      // Editing existing category
      const payload: Partial<FormCategoryItem> = {
        name: catName.trim(),
        code: generatedCode,
        description: catDescription.trim() || undefined,
        color: catColor,
        display_order: Number(catOrder) || 1,
        active: catActive
      };

      const res = await contextUpdateCategory(editingCategory.id || editingCategory.code, payload);
      if (res.success && res.data) {
        if (onCategoryUpdated) onCategoryUpdated(res.data);
        showToast('success', `Categoria "${res.data.name}" atualizada com sucesso no Supabase.`);
        setIsModalOpen(false);
      } else {
        setFormError(res.error || 'Erro ao atualizar categoria no Supabase.');
      }
    } else {
      // Check duplicates for new categories
      if (categoriesList.some(c => c.id.toUpperCase() === generatedCode || c.code.toUpperCase() === generatedCode)) {
        setFormError('Já existe uma categoria com este código de identificação.');
        return;
      }

      const newCategory: Omit<FormCategoryItem, 'id'> = {
        name: catName.trim(),
        code: generatedCode,
        description: catDescription.trim() || undefined,
        color: catColor,
        badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        active: catActive,
        display_order: Number(catOrder) || (categoriesList.length + 1)
      };

      const res = await contextAddCategory(newCategory);
      if (res.success && res.data) {
        if (onCategoryAdded) onCategoryAdded(res.data);
        showToast('success', `Categoria "${res.data.name}" adicionada e persistida no Supabase.`);
        setIsModalOpen(false);
      } else {
        setFormError(res.error || 'Erro ao persistir categoria no Supabase.');
      }
    }
  };

  const handleDeleteCategory = async (cat: FormCategoryItem) => {
    if (!canEdit) {
      showToast('error', 'Sem permissão para eliminar categorias.');
      return;
    }

    // Count questions under this category
    const count = questions.filter(q => q.category === cat.id || q.category === cat.code).length;

    if (count > 0) {
      showToast('error', `Não é possível eliminar a categoria "${cat.name}" pois existem ${count} pergunta(s) associada(s) a ela.`);
      return;
    }

    const isStandard = DEFAULT_FORM_CATEGORIES.some(d => d.code === cat.code || d.id === cat.id);

    if (isStandard) {
      if (!confirm(`A categoria "${cat.name}" é uma dimensão padrão do sistema AETERNU.\n\nDeseja realmente removê-la?`)) {
        return;
      }
    } else {
      if (!confirm(`Tem a certeza que deseja eliminar permanentemente a categoria "${cat.name}"?`)) {
        return;
      }
    }

    const res = await contextDeleteCategory(cat.id || cat.code);
    if (res.success) {
      if (onCategoryDeleted) onCategoryDeleted(cat.id || cat.code);
      showToast('success', `Categoria "${cat.name}" removida com sucesso.`);
    } else {
      showToast('error', res.error || 'Falha ao eliminar categoria.');
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
      
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-2xl border flex items-center gap-3 animate-bounce transition-all ${
          toast.type === 'success' ? 'bg-slate-900 text-white border-brand' : 'bg-red-900 text-white border-red-500'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-brand" /> : <AlertTriangle className="w-5 h-5 text-red-400" />}
          <span className="text-xs font-bold">{toast.text}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-brand/20 text-brand rounded-2xl border border-brand/30">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Gestão de Categorias do Formulário</h2>
            <p className="text-xs text-slate-500 font-medium">
              Categorias editáveis para agrupamento temático das perguntas na auditoria e no formulário de satisfação.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleManualRefresh}
            disabled={isLoading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
            title="Sincronizar categorias com o Supabase"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {canEdit && (
            <button
              onClick={handleOpenAddModal}
              className="px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-800 font-bold rounded-xl text-xs transition-all flex items-center gap-2 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 text-brand" />
              <span>Nova Categoria</span>
            </button>
          )}
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categoriesList.map(cat => {
          const qCount = questions.filter(q => q.category === cat.id || q.category === cat.code).length;
          const isStandard = DEFAULT_FORM_CATEGORIES.some(d => d.code === cat.code || d.id === cat.id);

          return (
            <div 
              key={cat.id || cat.code}
              className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                cat.active === false
                  ? 'border-slate-200 bg-slate-100/50 opacity-70'
                  : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-md hover:border-slate-300'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span 
                      className="w-4 h-4 rounded-full flex-shrink-0 border border-black/10 shadow-xs" 
                      style={{ backgroundColor: cat.color || '#8CBF26' }}
                    />
                    <h3 className="text-sm font-black text-slate-900">{cat.name}</h3>
                  </div>

                  <span className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded-md text-[10px] font-black tracking-wider uppercase font-mono">
                    {cat.code || cat.id}
                  </span>
                </div>

                {cat.description ? (
                  <p className="text-xs text-slate-600 font-medium line-clamp-2">
                    {cat.description}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic font-medium">Sem descrição cadastrada.</p>
                )}

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-700">
                    Ordem #{cat.display_order ?? 1}
                  </span>
                  {isStandard && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-brand/20 text-brand-dark border border-brand/30">
                      Dimensão Oficial
                    </span>
                  )}
                  {cat.active === false && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">
                      Inativa
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200/80 text-xs">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-brand-dark" />
                  {qCount} {qCount === 1 ? 'pergunta associada' : 'perguntas associadas'}
                </span>

                {canEdit && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEditModal(cat)}
                      className="p-1.5 text-slate-600 hover:text-slate-950 hover:bg-slate-200/80 rounded-lg transition-all flex items-center gap-1 text-[11px] font-bold px-2 cursor-pointer"
                      title="Editar parâmetros desta categoria"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-brand-dark" />
                      <span>Editar</span>
                    </button>

                    <button
                      onClick={() => handleDeleteCategory(cat)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                      title="Remover categoria"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-300 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-brand/20 text-brand rounded-xl border border-brand/30">
                  {editingCategory ? <Edit3 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-black">
                    {editingCategory ? 'Editar Categoria do Formulário' : 'Nova Categoria de Pergunta'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {editingCategory ? `Ajustar parâmetros de "${editingCategory.name}"` : 'Crie uma nova dimensão temática de avaliação'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-1.5">
                  Nome da Categoria <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => {
                    setCatName(e.target.value);
                    if (!editingCategory && !catCode) {
                      setCatCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '_'));
                    }
                  }}
                  placeholder="Ex: Sustentabilidade & Gestão de Resíduos"
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-1.5">
                    Código Identificador
                  </label>
                  <input
                    type="text"
                    value={catCode}
                    onChange={(e) => setCatCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                    placeholder="Ex: SUSTENTABILIDADE"
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-1.5">
                    Ordem de Apresentação
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={catOrder}
                    onChange={(e) => setCatOrder(parseInt(e.target.value) || 1)}
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-1.5">
                  Descrição / Objetivo
                </label>
                <textarea
                  rows={2}
                  value={catDescription}
                  onChange={(e) => setCatDescription(e.target.value)}
                  placeholder="Descrição concisa dos critérios abrangidos nesta dimensão temática..."
                  className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-brand" />
                  Cor de Identificação Visual
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setCatColor(color)}
                      className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${
                        catColor === color ? 'border-slate-900 scale-110 shadow-md ring-2 ring-brand' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      {catColor === color && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                    </button>
                  ))}
                  <input
                    type="color"
                    value={catColor}
                    onChange={(e) => setCatColor(e.target.value)}
                    className="w-7 h-7 p-0 border-0 rounded-full cursor-pointer overflow-hidden"
                    title="Escolha de cor personalizada"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={catActive}
                    onChange={(e) => setCatActive(e.target.checked)}
                    className="w-4 h-4 text-brand rounded border-slate-300 focus:ring-brand"
                  />
                  <span className="text-xs font-bold text-slate-800">Categoria Ativa no Formulário</span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-brand text-slate-950 hover:bg-[#7ab01e] font-black rounded-xl text-xs shadow-md cursor-pointer"
                >
                  {editingCategory ? 'Guardar Alterações' : 'Criar Categoria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

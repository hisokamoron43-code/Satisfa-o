import React, { useState, useEffect } from 'react';
import { FormQuestion, QuestionCategory, QuestionType, FormCategoryItem, ServiceItem } from '../../types';
import { useApp } from '../../context/AppContext';
import { DEFAULT_FORM_CATEGORIES } from '../../services/supabaseService';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  AlertTriangle, 
  X, 
  Save, 
  ListPlus,
  HelpCircle,
  Briefcase,
  Globe,
  Sliders,
  Layers,
  Info
} from 'lucide-react';

interface QuestionEditorProps {
  question?: FormQuestion | null;
  categories?: FormCategoryItem[];
  services?: ServiceItem[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: any, questionId?: string) => Promise<{ success: boolean; error?: string }>;
  defaultCategory?: QuestionCategory;
}

export const QuestionEditor: React.FC<QuestionEditorProps> = ({
  question = null,
  categories: propCategories,
  services: propServices,
  isOpen,
  onClose,
  onSave,
  defaultCategory = 'QUALIDADE'
}) => {
  const { formCategories: contextCategories, services: contextServices } = useApp();
  const categories = (propCategories && propCategories.length > 0) ? propCategories : (contextCategories && contextCategories.length > 0 ? contextCategories : DEFAULT_FORM_CATEGORIES);
  const services = (propServices && propServices.length > 0) ? propServices : contextServices;
  const [text, setText] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [category, setCategory] = useState<QuestionCategory>(defaultCategory);
  const [serviceId, setServiceId] = useState<string>('');
  const [type, setType] = useState<QuestionType>('RATING_5');
  const [required, setRequired] = useState<boolean>(true);
  const [active, setActive] = useState<boolean>(true);
  const [order, setOrder] = useState<number>(1);
  const [options, setOptions] = useState<string[]>(['Opção 1', 'Opção 2']);
  const [newOptionInput, setNewOptionInput] = useState<string>('');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (question) {
      setText(question.text || '');
      setDescription(question.description || '');
      setCategory(question.category || defaultCategory);
      setServiceId(question.service_id || '');
      setType(question.type || 'RATING_5');
      setRequired(question.required ?? true);
      setActive(question.active ?? true);
      setOrder(question.order || 1);
      setOptions(question.options && question.options.length > 0 ? question.options : ['Opção 1', 'Opção 2']);
    } else {
      setText('');
      setDescription('');
      setCategory(defaultCategory);
      setServiceId('');
      setType('RATING_5');
      setRequired(true);
      setActive(true);
      setOrder(1);
      setOptions(['Opção 1', 'Opção 2']);
    }
    setFormError(null);
  }, [question, defaultCategory, isOpen]);

  if (!isOpen) return null;

  const handleAddOption = () => {
    if (!newOptionInput.trim()) return;
    setOptions(prev => [...prev, newOptionInput.trim()]);
    setNewOptionInput('');
  };

  const handleRemoveOption = (index: number) => {
    setOptions(prev => prev.filter((_, i) => i !== index));
  };

  const handleOptionChange = (index: number, val: string) => {
    setOptions(prev => prev.map((opt, i) => i === index ? val : opt));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!text.trim()) {
      setFormError('Por favor, introduza o texto completo da pergunta.');
      return;
    }

    if (type === 'MULTIPLE_CHOICE') {
      const validOpts = options.filter(o => o.trim().length > 0);
      if (validOpts.length < 2) {
        setFormError('Para perguntas de múltipla escolha, adicione pelo menos 2 opções válidas.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: Omit<FormQuestion, 'id'> = {
        text: text.trim(),
        description: description.trim() || undefined,
        category: category,
        type: type,
        required: required,
        active: active,
        order: Number(order) || 1,
        service_id: serviceId.trim() || undefined,
        options: type === 'MULTIPLE_CHOICE' ? options.filter(o => o.trim().length > 0) : undefined
      };

      const res = await onSave(payload, question?.id);
      if (res.success) {
        onClose();
      } else {
        setFormError(res.error || 'Erro ao guardar a pergunta na base de dados.');
      }
    } catch (err: any) {
      setFormError(err?.message || 'Erro inesperado ao processar o formulário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-300 shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 my-8">
        
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand/20 text-brand rounded-xl border border-brand/30">
              {question ? <Edit3 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-xl font-black">
                {question ? 'Editor de Pergunta' : 'Nova Pergunta para o Formulário'}
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Defina o texto, a categoria e o tipo de resposta com integração direta ao Supabase.
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          
          {formError && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Texto da Pergunta */}
          <div>
            <label className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-2">
              Texto da Pergunta <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex: Como avalia a pontualidade e apresentação dos técnicos AETERNU?"
              className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-brand focus:bg-white outline-none"
            />
          </div>

          {/* Instruções Adicionais */}
          <div>
            <label className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-2">
              Instruções Adicionais / Orientação ao Cliente (Opcional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Considere o tempo de chegada e a comunicação prévia."
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand focus:bg-white outline-none"
            />
          </div>

          {/* Categoria & Serviço Associado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-2">
                Categoria da Pergunta <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as QuestionCategory)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none"
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id || cat.code}>
                    {cat.name} ({cat.code || cat.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-2">
                Serviço Associado
              </label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none"
              >
                <option value="">🌐 Geral (Aparece em Todos os Serviços)</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>🛠️ {s.name} ({s.code})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tipo de Resposta & Ordem */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-2">
                Tipo de Resposta <span className="text-red-500">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as QuestionType)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none"
              >
                <option value="RATING_5">⭐ Escala 1 a 5 Estrelas (CSAT)</option>
                <option value="NPS_10">📊 Pontuação NPS (0 a 10)</option>
                <option value="SHORT_TEXT">💬 Texto Curto / Livre</option>
                <option value="MULTIPLE_CHOICE">☑️ Múltipla Escolha</option>
                <option value="AUDIO_AND_TEXT">🎙️ Gravação de Áudio + Texto</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-2">
                Ordem de Exibição
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={order}
                onChange={(e) => setOrder(parseInt(e.target.value) || 1)}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none"
              />
            </div>
          </div>

          {/* Campo Especial de Opções se for Múltipla Escolha */}
          {type === 'MULTIPLE_CHOICE' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <label className="block text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <ListPlus className="w-4 h-4 text-brand" />
                Opções de Resposta <span className="text-red-500">*</span>
              </label>

              <div className="space-y-2">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-5 text-center">{idx + 1}.</span>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Opção ${idx + 1}`}
                      className="flex-1 p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none"
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="p-2 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-xl"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add choice option input */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  value={newOptionInput}
                  onChange={(e) => setNewOptionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddOption();
                    }
                  }}
                  placeholder="Adicionar nova opção..."
                  className="flex-1 p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="px-3 py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5 text-brand" />
                  <span>Adicionar</span>
                </button>
              </div>
            </div>
          )}

          {/* Toggles: Obrigatoriedade & Estado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <label className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100/80 transition-all">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="w-4 h-4 text-brand focus:ring-brand rounded border-slate-300 cursor-pointer"
              />
              <div>
                <span className="text-xs font-black text-slate-900 block">Resposta Obrigatória</span>
                <span className="text-[10px] text-slate-500 font-medium block">Exige resposta do cliente</span>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100/80 transition-all">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 text-brand focus:ring-brand rounded border-slate-300 cursor-pointer"
              />
              <div>
                <span className="text-xs font-black text-slate-900 block">Pergunta Ativa</span>
                <span className="text-[10px] text-slate-500 font-medium block">Exibir aos clientes no formulário</span>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold rounded-2xl text-xs transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-3 bg-brand text-slate-950 hover:bg-[#7ab01e] font-black rounded-2xl text-xs shadow-lg transition-all flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{isSubmitting ? 'A guardar...' : question ? 'Guardar Pergunta' : 'Criar Pergunta'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

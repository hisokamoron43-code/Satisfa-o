import React, { useState, useEffect } from 'react';
import { FormQuestion, QuestionCategory, FormCategoryItem, ServiceItem } from '../../types';
import { useApp } from '../../context/AppContext';
import { DEFAULT_FORM_CATEGORIES } from '../../services/supabaseService';
import { QuestionTypeConfig, DEFAULT_TYPE_CONFIG, toQuestionFields, type TypeConfigValue } from './QuestionTypeConfig';
import { 
  Plus, 

  Edit3, 
  AlertTriangle, 
  X, 
  Save, 

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
  const [typeConfig, setTypeConfig] = useState<TypeConfigValue>(DEFAULT_TYPE_CONFIG);
  const [required, setRequired] = useState<boolean>(true);
  const [active, setActive] = useState<boolean>(true);
  const [order, setOrder] = useState<number>(1);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (question) {
      setText(question.text || '');
      setDescription(question.description || '');
      setCategory(question.category || defaultCategory);
      setServiceId(question.service_id || '');
      setRequired(question.required ?? true);
      setActive(question.active ?? true);
      setOrder(question.order || 1);
      setTypeConfig({
        type: question.type === 'MULTIPLE_CHOICE' ? 'SINGLE_CHOICE' : (question.type || 'RATING_5'),
        options: question.options && question.options.length > 0 ? question.options : DEFAULT_TYPE_CONFIG.options,
        optionScores: question.optionScores ?? {},
        yesScore: question.yesScore ?? 1,
        noScore: question.noScore ?? 0,
        affectsScore: question.affectsScore ?? true,
      });
    } else {
      setText('');
      setDescription('');
      setCategory(defaultCategory);
      setServiceId('');
      setTypeConfig(DEFAULT_TYPE_CONFIG);
      setRequired(true);
      setActive(true);
      setOrder(1);
    }
    setFormError(null);
  }, [question, defaultCategory, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!text.trim()) {
      setFormError('Por favor, introduza o texto completo da pergunta.');
      return;
    }

    const { fields, errors } = toQuestionFields(typeConfig);
    if (errors.length > 0) {
      setFormError(errors.join(' '));
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Omit<FormQuestion, 'id'> = {
        text: text.trim(),
        description: description.trim() || undefined,
        category: category,
        ...fields,
        required: required,
        active: active,
        order: Number(order) || 1,
        service_id: serviceId.trim() || undefined
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
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
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

          {/* Tipo de Resposta, configuração por tipo & Ordem */}
          <QuestionTypeConfig value={typeConfig} onChange={setTypeConfig} />

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

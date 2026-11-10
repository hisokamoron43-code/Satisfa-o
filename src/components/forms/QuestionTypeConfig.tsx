import React, { useState } from 'react';
import { ListPlus, Plus, Trash2 } from 'lucide-react';
import type { QuestionType } from '../../types';
import { validateQuestionConfig } from '../../services/questionScoring';

export const QUESTION_TYPE_OPTIONS: Array<{ value: QuestionType; label: string }> = [
  { value: 'RATING_5', label: '⭐ Estrelas 1 a 5 (CSAT)' },
  { value: 'RATING_10', label: '🔢 Escala numérica 1 a 10' },
  { value: 'NPS_10', label: '📊 Pontuação NPS (0 a 10)' },
  { value: 'SINGLE_CHOICE', label: '🔘 Múltipla escolha — seleção única' },
  { value: 'MULTI_CHOICE', label: '☑️ Múltipla escolha — seleção múltipla' },
  { value: 'YES_NO_NA', label: '✅ Sim / Não / Não aplicável' },
  { value: 'SHORT_TEXT', label: '💬 Pergunta aberta (texto)' },
  { value: 'AUDIO_AND_TEXT', label: '🎙️ Nota de áudio + argumento escrito' },
];

/** Estado de configuração que depende do tipo da questão. */
export interface TypeConfigValue {
  type: QuestionType;
  options: string[];
  optionScores: Record<string, number>;
  yesScore: number;
  noScore: number;
  affectsScore: boolean;
}

export const DEFAULT_TYPE_CONFIG: TypeConfigValue = {
  type: 'RATING_5',
  options: ['Opção 1', 'Opção 2'],
  optionScores: {},
  yesScore: 1,
  noScore: 0,
  affectsScore: true,
};

const CHOICE_TYPES: QuestionType[] = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'MULTIPLE_CHOICE'];
const SCORABLE: QuestionType[] = ['RATING_5', 'RATING_10', 'NPS_10', ...CHOICE_TYPES, 'YES_NO_NA'];

/** Valida e converte o estado do editor no que é gravado na questão. */
export function toQuestionFields(v: TypeConfigValue): {
  fields: { type: QuestionType; options?: string[]; optionScores?: Record<string, number>; yesScore?: number; noScore?: number; affectsScore: boolean };
  errors: string[];
} {
  const isChoice = CHOICE_TYPES.includes(v.type);
  const options = isChoice ? v.options.map((o) => o.trim()).filter(Boolean) : undefined;
  const optionScores = isChoice && options
    ? Object.fromEntries(options.filter((o) => v.optionScores[o] !== undefined).map((o) => [o, v.optionScores[o]]))
    : undefined;
  const fields = {
    type: v.type,
    options,
    optionScores,
    yesScore: v.type === 'YES_NO_NA' ? v.yesScore : undefined,
    noScore: v.type === 'YES_NO_NA' ? v.noScore : undefined,
    affectsScore: SCORABLE.includes(v.type) ? v.affectsScore : false,
  };
  const errors = validateQuestionConfig({ id: 'x', category: 'x', ...fields });
  return { fields, errors };
}

interface Props {
  value: TypeConfigValue;
  onChange: (next: TypeConfigValue) => void;
}

const input = 'p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-brand outline-none';

/** Seletor do tipo de resposta + configuração específica (opções com valor de conformidade, Sim/Não, impacto na nota). */
export const QuestionTypeConfig: React.FC<Props> = ({ value, onChange }) => {
  const [newOption, setNewOption] = useState('');
  const set = (patch: Partial<TypeConfigValue>) => onChange({ ...value, ...patch });
  const isChoice = CHOICE_TYPES.includes(value.type);

  const renameOption = (idx: number, name: string) => {
    const old = value.options[idx];
    const options = value.options.map((o, i) => (i === idx ? name : o));
    const scores = { ...value.optionScores };
    if (old in scores) { scores[name] = scores[old]; delete scores[old]; }
    set({ options, optionScores: scores });
  };
  const removeOption = (idx: number) => {
    const scores = { ...value.optionScores };
    delete scores[value.options[idx]];
    set({ options: value.options.filter((_, i) => i !== idx), optionScores: scores });
  };
  const addOption = () => {
    const name = newOption.trim();
    if (!name || value.options.includes(name)) return;
    set({ options: [...value.options, name] });
    setNewOption('');
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="qtc-type" className="block text-xs font-black text-slate-900 uppercase tracking-wider mb-2">
          Tipo de Resposta <span className="text-red-500">*</span>
        </label>
        <select
          id="qtc-type"
          value={value.type === 'MULTIPLE_CHOICE' ? 'SINGLE_CHOICE' : value.type}
          onChange={(e) => set({ type: e.target.value as QuestionType })}
          className={`w-full ${input}`}
        >
          {QUESTION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {isChoice && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <p className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <ListPlus className="w-4 h-4 text-brand" /> Opções e valor de conformidade
          </p>
          <p className="text-[11px] text-slate-600">
            O valor (0 a 1) diz quanto cada opção conta para a nota: 1 = totalmente conforme, 0 = não conforme. Opções sem valor ficam fora do cálculo.
          </p>
          <div className="space-y-2">
            {value.options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 w-5 text-center">{idx + 1}.</span>
                <input type="text" value={opt} onChange={(e) => renameOption(idx, e.target.value)} aria-label={`Texto da opção ${idx + 1}`} className={`flex-1 ${input}`} />
                {value.affectsScore && (
                  <input
                    type="number" min={0} max={1} step={0.25}
                    value={value.optionScores[opt] ?? ''}
                    onChange={(e) => {
                      const scores = { ...value.optionScores };
                      if (e.target.value === '') delete scores[opt]; else scores[opt] = Number(e.target.value);
                      set({ optionScores: scores });
                    }}
                    aria-label={`Conformidade da opção ${opt}`} placeholder="0–1" className={`w-20 text-center ${input}`}
                  />
                )}
                {value.options.length > 2 && (
                  <button type="button" onClick={() => removeOption(idx)} aria-label={`Remover opção ${opt}`} className="p-2 text-slate-400 hover:text-red-600 bg-white border border-slate-200 rounded-xl">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text" value={newOption} onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
              placeholder="Adicionar nova opção…" className={`flex-1 ${input}`}
            />
            <button type="button" onClick={addOption} className="px-3 py-2.5 bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center gap-1">
              <Plus className="w-3.5 h-3.5 text-brand" /> Adicionar
            </button>
          </div>
        </div>
      )}

      {value.type === 'YES_NO_NA' && value.affectsScore && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-2 gap-3">
          {([['yesScore', 'Conformidade de «Sim»'], ['noScore', 'Conformidade de «Não»']] as const).map(([k, label]) => (
            <label key={k} className="text-[11px] font-bold text-slate-800 space-y-1">
              {label} (0 a 1)
              <input type="number" min={0} max={1} step={0.25} value={value[k]} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<TypeConfigValue>)} className={`w-full ${input}`} />
            </label>
          ))}
          <p className="col-span-2 text-[11px] text-slate-600">«Não aplicável» fica sempre fora do cálculo da nota.</p>
        </div>
      )}

      {SCORABLE.includes(value.type) && (
        <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer">
          <input type="checkbox" checked={value.affectsScore} onChange={(e) => set({ affectsScore: e.target.checked })} className="w-4 h-4 rounded border-slate-300" />
          <span className="text-xs font-bold text-slate-900">
            Esta questão influencia a nota sugerida ao auditor
            <span className="block text-[11px] font-medium text-slate-600">Desative para perguntas só informativas.</span>
          </span>
        </label>
      )}
    </div>
  );
};

/**
 * SICSC — Conformidade das respostas por tipo de questão e nota sugerida por critério.
 *
 * Lógica pura (sem React nem Supabase). A nota SUGERIDA é um apoio ao auditor: a nota oficial
 * continua a ser a que o auditor atribui por critério e que o servidor valida e homologa.
 *
 * Conformidade de uma resposta = valor entre 0 e 1:
 *  - Estrelas / escalas:      valor ÷ máximo da escala (alinhado com a fórmula do servidor: nota ÷ máximo).
 *  - Escolha única:           valor configurado para a opção escolhida.
 *  - Escolha múltipla:        soma dos valores das opções marcadas ÷ soma dos valores positivos de todas as opções.
 *  - Sim / Não / N.A.:        valor configurado para Sim (omissão 1) e Não (omissão 0); N.A. fica fora do cálculo.
 *  - Texto aberto e áudio:    não numéricos (null); são avaliados qualitativamente pelo auditor.
 * Uma conformidade null significa "não entra no cálculo".
 */

import type { QuestionType } from '../types';
import { normalizeKey } from './weightBalancer.ts';

export interface QuestionLike {
  id: string;
  category: string;
  type: QuestionType | string;
  active?: boolean;
  serviceId?: string | null;
  options?: string[];
  optionScores?: Record<string, number>;
  yesScore?: number;
  noScore?: number;
  affectsScore?: boolean;
}

export interface AnswerLike {
  rating?: number;
  textAnswer?: string;
  audioUrl?: string;
  choice?: string;
  choices?: string[];
  yesNo?: 'YES' | 'NO' | 'NA';
}

export interface CriterionLike {
  id: string;
  categoryCode?: string;
  categoryName: string;
  maxScore: number;
  minScore?: number;
  active: boolean;
}

export interface CategoryConformity {
  /** Média das conformidades pontuáveis (0 a 1); null se nenhuma questão da categoria foi pontuável. */
  ratio: number | null;
  /** Quantas questões contribuíram para a média. */
  scored: number;
  /** Quantas questões ativas a categoria tem (neste serviço). */
  total: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Tipos cuja resposta é numérica/estruturada e pode ter conformidade. */
export const SCORABLE_TYPES: string[] = ['RATING_5', 'RATING_10', 'NPS_10', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'MULTI_CHOICE', 'YES_NO_NA'];

/** Tipos de resposta livre, avaliados qualitativamente pelo auditor. */
export const QUALITATIVE_TYPES: string[] = ['TEXT_ONLY', 'SHORT_TEXT', 'AUDIO_AND_TEXT'];

export function questionConformity(q: QuestionLike, a: AnswerLike | undefined): number | null {
  if (!a || q.affectsScore === false) return null;

  switch (q.type) {
    case 'RATING_5':
      return isNum(a.rating) && a.rating >= 1 && a.rating <= 5 ? a.rating / 5 : null;

    case 'RATING_10':
      return isNum(a.rating) && a.rating >= 1 && a.rating <= 10 ? a.rating / 10 : null;

    case 'NPS_10':
      return isNum(a.rating) && a.rating >= 0 && a.rating <= 10 ? a.rating / 10 : null;

    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE': {
      const chosen = a.choice ?? a.textAnswer;
      const v = chosen !== undefined ? q.optionScores?.[chosen] : undefined;
      return isNum(v) ? clamp01(v) : null;
    }

    case 'MULTI_CHOICE': {
      const scores = q.optionScores;
      if (!scores || !Array.isArray(a.choices)) return null;
      const denom = Object.values(scores).filter((v) => isNum(v) && v > 0).reduce((s, v) => s + v, 0);
      if (denom <= 0) return null;
      const picked = a.choices.reduce((s, c) => s + (isNum(scores[c]) ? Math.max(0, scores[c]) : 0), 0);
      return clamp01(picked / denom);
    }

    case 'YES_NO_NA':
      if (a.yesNo === 'YES') return clamp01(isNum(q.yesScore) ? q.yesScore : 1);
      if (a.yesNo === 'NO') return clamp01(isNum(q.noScore) ? q.noScore : 0);
      return null; // 'NA' ou sem resposta: fora do cálculo

    default:
      return null;
  }
}

/** Chave de ligação entre um critério do RH e as categorias do formulário. */
export function criterionKey(c: Pick<CriterionLike, 'categoryCode' | 'categoryName'>): string {
  return normalizeKey(c.categoryCode || c.categoryName);
}

/** Conformidade por categoria (chave normalizada), considerando só as questões ativas do serviço. */
export function categoryConformity(
  questions: QuestionLike[],
  answers: Record<string, AnswerLike | undefined>,
  serviceId?: string | null,
): Record<string, CategoryConformity> {
  const out: Record<string, { sum: number; scored: number; total: number }> = {};
  for (const q of questions) {
    if (q.active === false) continue;
    if (serviceId && q.serviceId && q.serviceId !== serviceId) continue;
    const k = normalizeKey(q.category);
    const bucket = (out[k] ??= { sum: 0, scored: 0, total: 0 });
    bucket.total += 1;
    const c = questionConformity(q, answers[q.id]);
    if (c !== null) {
      bucket.sum += c;
      bucket.scored += 1;
    }
  }
  const result: Record<string, CategoryConformity> = {};
  for (const [k, b] of Object.entries(out)) {
    result[k] = { ratio: b.scored > 0 ? b.sum / b.scored : null, scored: b.scored, total: b.total };
  }
  return result;
}

/** Nota sugerida (na escala do critério, 1 casa decimal) a partir da conformidade da categoria. */
export function suggestedRating(c: Pick<CriterionLike, 'maxScore' | 'minScore'>, ratio: number | null): number | null {
  if (ratio === null) return null;
  const raw = Math.round(clamp01(ratio) * c.maxScore * 10) / 10;
  return Math.min(c.maxScore, Math.max(c.minScore ?? 0, raw));
}

/** Notas sugeridas por critério ativo; critérios sem questões pontuáveis ficam de fora. */
export function suggestRatings(
  criteria: CriterionLike[],
  questions: QuestionLike[],
  answers: Record<string, AnswerLike | undefined>,
  serviceId?: string | null,
): Record<string, number> {
  const byCategory = categoryConformity(questions, answers, serviceId);
  const out: Record<string, number> = {};
  for (const c of criteria) {
    if (!c.active) continue;
    const s = suggestedRating(c, byCategory[criterionKey(c)]?.ratio ?? null);
    if (s !== null) out[c.id] = s;
  }
  return out;
}

/** Validação de configuração de uma questão (usada no editor, antes de gravar). */
export function validateQuestionConfig(q: QuestionLike): string[] {
  const errors: string[] = [];
  const needsOptions = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'MULTI_CHOICE'].includes(q.type);
  if (needsOptions) {
    const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) errors.push('A questão de escolha precisa de pelo menos 2 opções.');
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) errors.push('As opções não podem estar repetidas.');
    if (q.affectsScore !== false) {
      const scored = opts.filter((o) => isNum(q.optionScores?.[o]));
      if (scored.length === 0) errors.push('Defina o valor de conformidade (0 a 1) de pelo menos uma opção, ou desative o impacto na nota.');
      for (const o of opts) {
        const v = q.optionScores?.[o];
        if (v !== undefined && (!isNum(v) || v < 0 || v > 1)) errors.push(`O valor da opção "${o}" tem de estar entre 0 e 1.`);
      }
    }
  }
  if (q.type === 'YES_NO_NA') {
    for (const [label, v] of [['Sim', q.yesScore], ['Não', q.noScore]] as const) {
      if (v !== undefined && (!isNum(v) || v < 0 || v > 1)) errors.push(`O valor de "${label}" tem de estar entre 0 e 1.`);
    }
  }
  return errors;
}

/**
 * Conformidade (0–1) de cada critério ATIVO, a partir das respostas. Critérios sem respostas pontuáveis
 * neste serviço não aparecem no resultado. Usa a mesma chave de ligação que o servidor (category_code ou nome).
 */
export function criterionConformity(
  criteria: CriterionLike[],
  questions: QuestionLike[],
  answers: Record<string, AnswerLike | undefined>,
): Record<string, number> {
  const byCategory = categoryConformity(questions, answers, null);
  const out: Record<string, number> = {};
  for (const c of criteria) {
    if (!c.active) continue;
    const r = byCategory[criterionKey(c)]?.ratio;
    if (r !== null && r !== undefined) out[c.id] = r;
  }
  return out;
}

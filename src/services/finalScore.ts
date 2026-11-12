/**
 * SICSC — Pontuação final 80/20 (espelha calculate_and_finalize_evaluation, migrações 1003 e 1004).
 *
 * 80 pontos automáticos: conformidade das respostas do cliente por critério (0–1), ponderada pelos pesos
 *   do RH (soma 100). Critérios sem respostas pontuáveis neste serviço ficam de fora e os pesos reescalam-se.
 * Áudio (10 pontos):
 *   - sem áudio gravado: 10 pontos atribuídos automaticamente;
 *   - com áudio: nota do analisador 0–5 × 2.
 * Argumentos escritos (10 pontos):
 *   - com comentário: nota do analisador 0–5 × 2;
 *   - sem comentário: o analisador decide, pelas respostas, tudo ou nada (nota 5 = 10 pontos, nota 0 = nenhum).
 *
 * Lógica pura (sem React nem Supabase). O servidor é a fonte de verdade.
 */

import type { EvaluationCriterion } from '../types';

export const AUTOMATIC_POINTS = 80;
export const AUDIO_POINTS = 10;
export const ARGUMENT_POINTS = 10;
export const QUALITATIVE_SCALE_MAX = 5;

export interface FinalScoreInput {
  criteria: EvaluationCriterion[];
  /** Conformidade (0–1) por id de critério. Ausente = critério sem respostas pontuáveis (fica de fora). */
  conformity: Record<string, number>;
  hasAudio: boolean;
  audioScore?: number | null;
  hasWritten: boolean;
  argumentScore?: number | null;
  passingThreshold: number;
}

export interface FinalScoreResult {
  success: boolean;
  errors: string[];
  automaticPoints: number;
  audioPoints: number;
  argumentPoints: number;
  finalScore: number;
  finalClassification: 'POSITIVE' | 'NEGATIVE';
  passingThreshold: number;
  applicableWeight: number;
  breakdown: Array<{ criterionId: string; categoryName: string; weightPercentage: number; conformity: number; contribution: number }>;
}

const round = (n: number, d: number) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

const isScore = (v: number) => Number.isFinite(v) && v >= 0 && v <= QUALITATIVE_SCALE_MAX;
const hasScore = (v: number | null | undefined): v is number => v !== undefined && v !== null;

export function calculateFinalScore(input: FinalScoreInput): FinalScoreResult {
  const errors: string[] = [];
  const active = input.criteria.filter((c) => c.active);

  const total = round(active.reduce((s, c) => s + (Number.isFinite(c.weightPercentage) ? c.weightPercentage : 0), 0), 3);
  if (active.length === 0 || Math.abs(total - 100) > 0.001) {
    errors.push(`A soma dos pesos dos critérios ativos deve ser exatamente 100% (soma atual: ${total}%).`);
  }

  const applicable = active.filter((c) => input.conformity[c.id] !== undefined);
  const applicableWeight = applicable.reduce((s, c) => s + c.weightPercentage, 0);
  if (applicable.length === 0 || applicableWeight <= 0) {
    errors.push('Não há respostas pontuáveis para calcular a parte automática (80%) desta avaliação.');
  }
  for (const c of applicable) {
    const r = input.conformity[c.id];
    if (!Number.isFinite(r) || r < 0 || r > 1) errors.push(`A conformidade de "${c.categoryName}" tem de estar entre 0 e 1.`);
  }

  let automaticRaw = 0;
  const breakdown: FinalScoreResult['breakdown'] = [];
  if (errors.length === 0) {
    for (const c of applicable) {
      const r = input.conformity[c.id];
      const contribution = (r * c.weightPercentage / applicableWeight) * AUTOMATIC_POINTS;
      automaticRaw += contribution;
      breakdown.push({ criterionId: c.id, categoryName: c.categoryName, weightPercentage: c.weightPercentage, conformity: r, contribution: round(contribution, 4) });
    }
  }
  const automaticPoints = round(automaticRaw, 4);

  // Áudio
  let audioPoints = AUDIO_POINTS;
  if (input.hasAudio) {
    if (!hasScore(input.audioScore)) errors.push('Falta classificar o áudio do cliente (nota de 0 a 5).');
    else if (!isScore(input.audioScore)) errors.push('A nota do áudio tem de estar entre 0 e 5.');
    else audioPoints = round(input.audioScore * 2, 4);
  }

  // Argumentos escritos
  let argumentPoints = 0;
  if (!hasScore(input.argumentScore)) {
    errors.push(input.hasWritten
      ? 'Faltam classificar os argumentos escritos do cliente (nota de 0 a 5).'
      : 'O cliente não escreveu comentário: indique se o analisador atribui os 10 pontos dos argumentos (sim) ou não (não).');
  } else if (!isScore(input.argumentScore)) {
    errors.push('A nota dos argumentos tem de estar entre 0 e 5.');
  } else if (!input.hasWritten && input.argumentScore !== 0 && input.argumentScore !== 5) {
    errors.push('Sem comentário escrito, a decisão é tudo ou nada: use 5 (10 pontos) ou 0 (nenhum ponto).');
  } else {
    argumentPoints = round(input.argumentScore * 2, 4);
  }

  const success = errors.length === 0;
  const finalScore = success ? round(automaticPoints + audioPoints + argumentPoints, 2) : 0;
  return {
    success,
    errors,
    automaticPoints: success ? automaticPoints : 0,
    audioPoints: success ? audioPoints : 0,
    argumentPoints: success ? argumentPoints : 0,
    finalScore,
    finalClassification: finalScore >= input.passingThreshold ? 'POSITIVE' : 'NEGATIVE',
    passingThreshold: input.passingThreshold,
    applicableWeight,
    breakdown,
  };
}

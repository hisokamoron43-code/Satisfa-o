/**
 * SICSC - Sistema Integrado de Controlo da Satisfação de Clientes (AETERNU LDA)
 * Módulo de Recursos Humanos & Qualidade
 * 
 * Serviço centralizado de cálculo matemático ponderado de avaliações,
 * validação estrita de critérios e geração de snapshots imutáveis.
 */

import {
  EvaluationCriterion,
  CriterionScoreSnapshot,
  EvaluationHistoricalSnapshot,
  CriteriaConfiguration,
  Evaluation
} from '../types';

// ... (existing code)

export const getQueueStatus = (ev: Evaluation): 'UNASSIGNED_CLIENT' | 'UNASSIGNED_PROVIDER' | 'READY_TO_FINALIZE' | 'HOMOLOGATED' => {
  if (ev.finalizedAt) return 'HOMOLOGATED';
  if (!ev.clientId) return 'UNASSIGNED_CLIENT';
  if (!ev.providerId) return 'UNASSIGNED_PROVIDER';
  return 'READY_TO_FINALIZE';
};

export const DEFAULT_PASSING_THRESHOLD = 70; // 70% padrão de aprovação

export const DEFAULT_EVALUATION_CRITERIA: EvaluationCriterion[] = [
  {
    id: 'crit-qualidade',
    categoryName: 'Qualidade',
    description: 'Conformidade técnica, acabamento e excelência da execução do serviço',
    weightPercentage: 40,
    maxScore: 5,
    minScore: 0,
    active: true,
    order: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sistema SICSC'
  },
  {
    id: 'crit-pontualidade',
    categoryName: 'Pontualidade',
    description: 'Cumprimento dos horários de início, conclusão e tempos de resposta',
    weightPercentage: 20,
    maxScore: 5,
    minScore: 0,
    active: true,
    order: 2,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sistema SICSC'
  },
  {
    id: 'crit-seguranca',
    categoryName: 'Segurança',
    description: 'Uso obrigatório de EPIs, cumprimento das normas de HST e integridade',
    weightPercentage: 25,
    maxScore: 5,
    minScore: 0,
    active: true,
    order: 3,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sistema SICSC'
  },
  {
    id: 'crit-atendimento',
    categoryName: 'Atendimento',
    description: 'Postura profissional, comunicação clara e cordialidade com o cliente',
    weightPercentage: 15,
    maxScore: 5,
    minScore: 0,
    active: true,
    order: 4,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sistema SICSC'
  }
];

export interface ValidationResult {
  isValid: boolean;
  totalWeight: number;
  errors: string[];
  warnings?: string[];
}

export interface CalculationResult {
  success: boolean;
  finalScore: number;
  finalClassification: 'POSITIVE' | 'NEGATIVE';
  passingThreshold: number;
  formula: string;
  breakdown: CriterionScoreSnapshot[];
  errors?: string[];
}

/**
 * Valida a configuração dos critérios:
 * 1. Pelo menos um critério ativo.
 * 2. A soma dos pesos percentuais dos critérios ativos DEVE ser exatamente 100%.
 * 3. Pesos não podem ser negativos ou superiores a 100%.
 * 4. Pontuação máxima de cada critério deve ser estritamente maior que zero (prevenção de divisão por zero).
 */
export function validateCriteriaConfiguration(criteria: EvaluationCriterion[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const activeCriteria = criteria.filter(c => c.active);

  if (activeCriteria.length === 0) {
    errors.push('A configuração deve conter pelo menos um critério ativo.');
    return { isValid: false, totalWeight: 0, errors, warnings };
  }

  let totalWeight = 0;

  activeCriteria.forEach((crit) => {
    if (typeof crit.weightPercentage !== 'number' || isNaN(crit.weightPercentage)) {
      errors.push(`O critério "${crit.categoryName || crit.id}" possui um peso inválido.`);
      return;
    }

    if (crit.weightPercentage < 0) {
      errors.push(`O critério "${crit.categoryName}" não pode ter peso percentual negativo (${crit.weightPercentage}%).`);
    }

    if (crit.weightPercentage > 100) {
      errors.push(`O critério "${crit.categoryName}" não pode exceder 100% individualmente (${crit.weightPercentage}%).`);
    }

    if (typeof crit.maxScore !== 'number' || isNaN(crit.maxScore) || crit.maxScore <= 0) {
      errors.push(`O critério "${crit.categoryName}" deve ter pontuação máxima estritamente positiva (evita divisão por zero).`);
    }

    totalWeight += crit.weightPercentage;
  });

  // Arredondamento para 3 casas decimais para tolerância de ponto flutuante IEEE 754
  const roundedWeight = Math.round(totalWeight * 1000) / 1000;
  if (Math.abs(roundedWeight - 100) > 0.001) {
    errors.push(
      `A soma dos pesos dos critérios ativos deve ser exatamente 100.0%. Soma calculada actual: ${roundedWeight}%.`
    );
  }

  return {
    isValid: errors.length === 0,
    totalWeight: roundedWeight,
    errors,
    warnings
  };
}

/**
 * Executa o cálculo ponderado estrito:
 * Pontuação Final = Σ [ (pontuação obtida_i / pontuação máxima_i) * peso percentual_i ]
 * 
 * Regras estritas:
 * - Rejeita se a soma dos pesos != 100%
 * - Rejeita divisão por zero se maxScore <= 0
 * - Rejeita se faltar pontuação para qualquer critério ativo
 * - Rejeita pontuações menores que o mínimo ou maiores que maxScore
 * - Aplica o limiar configurável para classificação POSITIVE (>= threshold) ou NEGATIVE (< threshold)
 */
export function calculateWeightedScore(
  ratings: Record<string, number>,
  criteria: EvaluationCriterion[],
  passingThreshold: number = DEFAULT_PASSING_THRESHOLD
): CalculationResult {
  const validation = validateCriteriaConfiguration(criteria);
  if (!validation.isValid) {
    return {
      success: false,
      finalScore: 0,
      finalClassification: 'NEGATIVE',
      passingThreshold,
      formula: '',
      breakdown: [],
      errors: validation.errors
    };
  }

  const activeCriteria = criteria.filter(c => c.active);
  const errors: string[] = [];
  const breakdown: CriterionScoreSnapshot[] = [];
  let accumulatedScore = 0;
  const formulaParts: string[] = [];

  for (const crit of activeCriteria) {
    const rawScore = ratings[crit.id];

    if (rawScore === undefined || rawScore === null || isNaN(rawScore)) {
      errors.push(`Falta atribuir a pontuação para o critério obrigatório: "${crit.categoryName}".`);
      continue;
    }

    const min = crit.minScore ?? 0;
    if (rawScore < min) {
      errors.push(
        `A pontuação obtida para "${crit.categoryName}" (${rawScore}) está abaixo do limite mínimo permitido (${min}).`
      );
      continue;
    }

    if (rawScore > crit.maxScore) {
      errors.push(
        `A pontuação obtida para "${crit.categoryName}" (${rawScore}) excede a pontuação máxima permitida (${crit.maxScore}).`
      );
      continue;
    }

    if (crit.maxScore <= 0) {
      errors.push(`Divisão por zero prevenida no critério "${crit.categoryName}": pontuação máxima inválida.`);
      continue;
    }

    // Cálculo da contribuição normalizada e ponderada
    // normalizedPercentage = (score / maxScore) * 100 (ex: 4 / 5 * 100 = 80%)
    const normalizedRatio = rawScore / crit.maxScore;
    const normalizedPercentage = Math.round(normalizedRatio * 10000) / 100;
    // weightedContribution = normalizedRatio * weightPercentage (ex: 0.80 * 40 = 32 pontos)
    const weightedContribution = Math.round(normalizedRatio * crit.weightPercentage * 1000) / 1000;

    accumulatedScore += weightedContribution;

    formulaParts.push(
      `(${rawScore}/${crit.maxScore} × ${crit.weightPercentage}% = ${weightedContribution.toFixed(2)} pts)`
    );

    breakdown.push({
      criterionId: crit.id,
      categoryName: crit.categoryName,
      weightPercentage: crit.weightPercentage,
      maxScore: crit.maxScore,
      scoreObtained: rawScore,
      normalizedPercentage,
      weightedContribution
    });
  }

  if (errors.length > 0) {
    return {
      success: false,
      finalScore: 0,
      finalClassification: 'NEGATIVE',
      passingThreshold,
      formula: '',
      breakdown: [],
      errors
    };
  }

  // Pontuação final arredondada para 2 casas decimais e normalizada
  const finalScore = Math.round(accumulatedScore * 100) / 100;
  const isPositive = finalScore >= passingThreshold;
  const finalClassification: 'POSITIVE' | 'NEGATIVE' = isPositive ? 'POSITIVE' : 'NEGATIVE';

  const descriptiveFormula = `Pontuação Final = [${formulaParts.join(' + ')}] = ${finalScore.toFixed(2)}% (Limiar de aprovação: ${passingThreshold}% -> ${finalClassification})`;

  return {
    success: true,
    finalScore,
    finalClassification,
    passingThreshold,
    formula: descriptiveFormula,
    breakdown
  };
}

/**
 * Cria um snapshot histórico imutável para anexar à avaliação finalizada.
 * Esse snapshot garante que qualquer alteração futura de pesos e critérios
 * NÃO afetará os resultados de avaliações já homologadas.
 */
export function createHistoricalSnapshot(
  evaluationId: string,
  calculation: CalculationResult,
  finalizedBy: string
): EvaluationHistoricalSnapshot {
  if (!calculation.success) {
    throw new Error('Não é possível criar snapshot histórico de um cálculo inválido ou com erros.');
  }

  return {
    versionId: `snap-${evaluationId}-${Date.now()}`,
    finalizedAt: new Date().toISOString(),
    finalizedBy: finalizedBy || 'Responsável RH',
    finalScore: calculation.finalScore,
    passingThreshold: calculation.passingThreshold,
    classification: calculation.finalClassification,
    criteriaSnapshot: calculation.breakdown.map(b => ({ ...b })),
    formula: calculation.formula
  };
}

/**
 * Calcula similaridade entre duas strings (0 a 100%)
 * para sugerir a empresa correspondente ao nome livre digitado pelo cliente.
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const s2 = str2.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  
  if (s1 === s2) return 100;
  if (s1.includes(s2) || s2.includes(s1)) {
    const longer = Math.max(s1.length, s2.length);
    const shorter = Math.min(s1.length, s2.length);
    return Math.min(100, Math.round((shorter / longer) * 90) + 10);
  }

  // Bigram token overlap (Sørensen–Dice coefficient)
  const getBigrams = (str: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  };

  const bg1 = getBigrams(s1);
  const bg2 = getBigrams(s2);
  if (bg1.size === 0 || bg2.size === 0) return 0;

  let intersection = 0;
  for (const b of bg1) {
    if (bg2.has(b)) intersection++;
  }

  const score = Math.round((2.0 * intersection) / (bg1.size + bg2.size) * 100);
  return score;
}

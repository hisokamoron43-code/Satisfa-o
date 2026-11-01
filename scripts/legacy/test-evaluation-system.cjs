/**
 * SICSC - AETERNU Angola (Higiene | Segurança | Ambiente)
 * Automated Mathematical Test Suite for Evaluation System
 * Scenarios A through L
 */

const assert = require('assert');

// 1. Definition of core calculation functions mirror
function validateCriteriaConfiguration(criteria) {
  const errors = [];
  const activeCriteria = criteria.filter(c => c.active);

  if (activeCriteria.length === 0) {
    errors.push('A configuração deve conter pelo menos um critério ativo.');
    return { isValid: false, totalWeight: 0, errors };
  }

  let totalWeight = 0;

  activeCriteria.forEach((crit) => {
    if (typeof crit.weightPercentage !== 'number' || isNaN(crit.weightPercentage)) {
      errors.push(`O critério "${crit.categoryName || crit.id}" possui um peso inválido.`);
      return;
    }

    if (crit.weightPercentage < 0) {
      errors.push(`O critério "${crit.categoryName}" não pode ter peso negativo.`);
    }

    if (crit.weightPercentage > 100) {
      errors.push(`O critério "${crit.categoryName}" não pode exceder 100% individualmente.`);
    }

    if (typeof crit.maxScore !== 'number' || isNaN(crit.maxScore) || crit.maxScore <= 0) {
      errors.push(`O critério "${crit.categoryName}" deve ter pontuação máxima estritamente positiva.`);
    }

    totalWeight += crit.weightPercentage;
  });

  const roundedWeight = Math.round(totalWeight * 1000) / 1000;
  if (Math.abs(roundedWeight - 100) > 0.001) {
    errors.push(`A soma dos pesos dos critérios ativos deve ser exatamente 100.0%. Soma calculada: ${roundedWeight}%.`);
  }

  return {
    isValid: errors.length === 0,
    totalWeight: roundedWeight,
    errors
  };
}

function calculateWeightedScore(ratings, criteria, passingThreshold = 70) {
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
  const errors = [];
  const breakdown = [];
  let accumulatedScore = 0;
  const formulaParts = [];

  for (const crit of activeCriteria) {
    const rawScore = ratings[crit.id];

    if (rawScore === undefined || rawScore === null || isNaN(rawScore)) {
      errors.push(`Falta atribuir a pontuação para o critério: "${crit.categoryName}".`);
      continue;
    }

    const min = crit.minScore ?? 0;
    if (rawScore < min) {
      errors.push(`A pontuação para "${crit.categoryName}" (${rawScore}) está abaixo do mínimo (${min}).`);
      continue;
    }

    if (rawScore > crit.maxScore) {
      errors.push(`A pontuação para "${crit.categoryName}" (${rawScore}) excede o máximo (${crit.maxScore}).`);
      continue;
    }

    if (crit.maxScore <= 0) {
      errors.push(`Divisão por zero no critério "${crit.categoryName}".`);
      continue;
    }

    const normalizedRatio = rawScore / crit.maxScore;
    const normalizedPercentage = Math.round(normalizedRatio * 10000) / 100;
    const weightedContribution = Math.round(normalizedRatio * crit.weightPercentage * 1000) / 1000;

    accumulatedScore += weightedContribution;
    formulaParts.push(`(${rawScore}/${crit.maxScore} × ${crit.weightPercentage}% = ${weightedContribution.toFixed(2)} pts)`);

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

  const finalScore = Math.round(accumulatedScore * 100) / 100;
  const isPositive = finalScore >= passingThreshold;
  const finalClassification = isPositive ? 'POSITIVE' : 'NEGATIVE';
  const descriptiveFormula = `Pontuação Final = [${formulaParts.join(' + ')}] = ${finalScore.toFixed(2)}% (Limiar: ${passingThreshold}% -> ${finalClassification})`;

  return {
    success: true,
    finalScore,
    finalClassification,
    passingThreshold,
    formula: descriptiveFormula,
    breakdown
  };
}

function createHistoricalSnapshot(evaluationId, calculation, finalizedBy) {
  if (!calculation.success) {
    throw new Error('Não é possível criar snapshot histórico de cálculo inválido.');
  }

  return {
    versionId: `snap-${evaluationId}-${Date.now()}`,
    finalizedAt: new Date().toISOString(),
    finalizedBy: finalizedBy || 'Responsável RH',
    finalScore: calculation.finalScore,
    passingThreshold: calculation.passingThreshold,
    classification: calculation.finalClassification,
    criteriaSnapshot: JSON.parse(JSON.stringify(calculation.breakdown)),
    formula: calculation.formula
  };
}

// Default Criteria from Audit
const BASE_CRITERIA = [
  { id: 'c1', categoryName: 'Qualidade', weightPercentage: 40, maxScore: 5, minScore: 0, active: true },
  { id: 'c2', categoryName: 'Pontualidade', weightPercentage: 20, maxScore: 5, minScore: 0, active: true },
  { id: 'c3', categoryName: 'Segurança', weightPercentage: 25, maxScore: 5, minScore: 0, active: true },
  { id: 'c4', categoryName: 'Atendimento', weightPercentage: 15, maxScore: 5, minScore: 0, active: true }
];

console.log('================================================================');
console.log('SICSC AETERNU Angola — Bateria de Testes Automatizados (A a L)');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 12;

try {
  // Test A: Reference 84% Validation
  console.log('[TEST A] Validação do Caso de Referência (84.00% Esperado)...');
  const ratingsA = { c1: 4.0, c2: 4.5, c3: 5.0, c4: 3.0 }; // 80%, 90%, 100%, 60%
  const resA = calculateWeightedScore(ratingsA, BASE_CRITERIA, 70);
  assert.strictEqual(resA.success, true);
  assert.strictEqual(resA.finalScore, 84.00);
  assert.strictEqual(resA.finalClassification, 'POSITIVE');
  console.log('  -> PASSOU: Pontuação calculada exatamente 84.00% (Classificação POSITIVE).\n');
  passedTests++;

  // Test B: Maximum Score (100.00%)
  console.log('[TEST B] Validação de Pontuação Máxima (100.00%)...');
  const ratingsB = { c1: 5.0, c2: 5.0, c3: 5.0, c4: 5.0 };
  const resB = calculateWeightedScore(ratingsB, BASE_CRITERIA, 70);
  assert.strictEqual(resB.success, true);
  assert.strictEqual(resB.finalScore, 100.00);
  assert.strictEqual(resB.finalClassification, 'POSITIVE');
  console.log('  -> PASSOU: Pontuação máxima exatamente 100.00%.\n');
  passedTests++;

  // Test C: Minimum Score (0.00%)
  console.log('[TEST C] Validação de Pontuação Mínima (0.00%)...');
  const ratingsC = { c1: 0, c2: 0, c3: 0, c4: 0 };
  const resC = calculateWeightedScore(ratingsC, BASE_CRITERIA, 70);
  assert.strictEqual(resC.success, true);
  assert.strictEqual(resC.finalScore, 0.00);
  assert.strictEqual(resC.finalClassification, 'NEGATIVE');
  console.log('  -> PASSOU: Pontuação mínima exatamente 0.00%.\n');
  passedTests++;

  // Test D: Weight Sum Validation Rejection (e.g. 95% or 105%)
  console.log('[TEST D] Validação Estrita da Soma dos Pesos (Rejeição de 95% e 105%)...');
  const criteria95 = [
    { id: 'c1', categoryName: 'Qualidade', weightPercentage: 40, maxScore: 5, active: true },
    { id: 'c2', categoryName: 'Pontualidade', weightPercentage: 20, maxScore: 5, active: true },
    { id: 'c3', categoryName: 'Segurança', weightPercentage: 20, maxScore: 5, active: true },
    { id: 'c4', categoryName: 'Atendimento', weightPercentage: 15, maxScore: 5, active: true }
  ];
  const val95 = validateCriteriaConfiguration(criteria95);
  assert.strictEqual(val95.isValid, false);
  const calc95 = calculateWeightedScore(ratingsA, criteria95, 70);
  assert.strictEqual(calc95.success, false);

  const criteria105 = [
    { id: 'c1', categoryName: 'Qualidade', weightPercentage: 40, maxScore: 5, active: true },
    { id: 'c2', categoryName: 'Pontualidade', weightPercentage: 25, maxScore: 5, active: true },
    { id: 'c3', categoryName: 'Segurança', weightPercentage: 25, maxScore: 5, active: true },
    { id: 'c4', categoryName: 'Atendimento', weightPercentage: 15, maxScore: 5, active: true }
  ];
  const val105 = validateCriteriaConfiguration(criteria105);
  assert.strictEqual(val105.isValid, false);
  console.log('  -> PASSOU: Pesos 95% e 105% rejeitados com sucesso.\n');
  passedTests++;

  // Test E: Division by Zero Prevention (maxScore <= 0)
  console.log('[TEST E] Prevenção de Divisão por Zero...');
  const criteriaZeroMax = [
    { id: 'c1', categoryName: 'Qualidade', weightPercentage: 40, maxScore: 0, active: true },
    { id: 'c2', categoryName: 'Pontualidade', weightPercentage: 20, maxScore: 5, active: true },
    { id: 'c3', categoryName: 'Segurança', weightPercentage: 25, maxScore: 5, active: true },
    { id: 'c4', categoryName: 'Atendimento', weightPercentage: 15, maxScore: 5, active: true }
  ];
  const valZero = validateCriteriaConfiguration(criteriaZeroMax);
  assert.strictEqual(valZero.isValid, false);
  console.log('  -> PASSOU: maxScore = 0 rejeitado antecipadamente.\n');
  passedTests++;

  // Test F: Score Out of Bounds Rejection
  console.log('[TEST F] Rejeição de Notas Fora dos Limites (Ex: 6.0/5.0 ou -1.0)...');
  const ratingsHigh = { c1: 6.0, c2: 4.5, c3: 5.0, c4: 3.0 };
  const resHigh = calculateWeightedScore(ratingsHigh, BASE_CRITERIA, 70);
  assert.strictEqual(resHigh.success, false);

  const ratingsLow = { c1: -1.0, c2: 4.5, c3: 5.0, c4: 3.0 };
  const resLow = calculateWeightedScore(ratingsLow, BASE_CRITERIA, 70);
  assert.strictEqual(resLow.success, false);
  console.log('  -> PASSOU: Notas fora dos limites estritamente rejeitadas.\n');
  passedTests++;

  // Test G: Missing Criterion Score Rejection
  console.log('[TEST G] Rejeição de Avaliação com Critério Omitido...');
  const ratingsMissing = { c1: 4.0, c2: 4.5, c3: 5.0 }; // Falta c4
  const resMissing = calculateWeightedScore(ratingsMissing, BASE_CRITERIA, 70);
  assert.strictEqual(resMissing.success, false);
  console.log('  -> PASSOU: Ausência de nota em critério ativo rejeitada sem fallback silencioso.\n');
  passedTests++;

  // Test H: Threshold Boundary Testing (69.9% vs 70.0% vs 84.0%)
  console.log('[TEST H] Teste dos Limiares de Aprovação (Fronteiras 69.9% vs 70.0% vs 84.0%)...');
  // Criar pontuação de 69.9%:
  // 3.495/5 no c1 (40%) = 27.96, c2 (20%) = 14, c3 (25%) = 17.5, c4 (15%) = 10.44 -> soma = 69.90
  const ratings699 = { c1: (69.9 / 40) * 2, c2: 3.5, c3: 3.5, c4: 3.48 };
  const res699 = calculateWeightedScore({ c1: 3.495, c2: 3.5, c3: 3.5, c4: 3.48 }, BASE_CRITERIA, 70);
  assert.strictEqual(res699.finalScore < 70, true);
  assert.strictEqual(res699.finalClassification, 'NEGATIVE');

  const res70 = calculateWeightedScore({ c1: 3.5, c2: 3.5, c3: 3.5, c4: 3.5 }, BASE_CRITERIA, 70); // 70%
  assert.strictEqual(res70.finalScore, 70.00);
  assert.strictEqual(res70.finalClassification, 'POSITIVE');

  assert.strictEqual(resA.finalScore, 84.00);
  assert.strictEqual(resA.finalClassification, 'POSITIVE');
  console.log('  -> PASSOU: 69.9% classificado como NEGATIVO, 70.0% e 84.0% como POSITIVO.\n');
  passedTests++;

  // Test I: Historical Snapshot Immutability
  console.log('[TEST I] Garantia de Imutabilidade do Snapshot Histórico...');
  const snapshotOriginal = createHistoricalSnapshot('eval-test-001', resA, 'Auditor RH');
  assert.strictEqual(snapshotOriginal.finalScore, 84.00);

  // Modificar os critérios globais para outros pesos completamente diferentes
  const modifiedCriteria = [
    { id: 'c1', categoryName: 'Qualidade Alterada', weightPercentage: 50, maxScore: 5, active: true },
    { id: 'c2', categoryName: 'Pontualidade Alterada', weightPercentage: 10, maxScore: 5, active: true },
    { id: 'c3', categoryName: 'Segurança Alterada', weightPercentage: 30, maxScore: 5, active: true },
    { id: 'c4', categoryName: 'Atendimento Alterado', weightPercentage: 10, maxScore: 5, active: true }
  ];

  // Recalcular com novos critérios daria outro valor:
  const resModified = calculateWeightedScore(ratingsA, modifiedCriteria, 70);
  // (4/5*50) + (4.5/5*10) + (5/5*30) + (3/5*10) = 40 + 9 + 30 + 6 = 85.00
  assert.strictEqual(resModified.finalScore, 85.00);

  // O snapshot original DEVE permanecer estritamente 84.00% e inalterado
  assert.strictEqual(snapshotOriginal.finalScore, 84.00);
  assert.strictEqual(snapshotOriginal.criteriaSnapshot[0].weightPercentage, 40);
  assert.strictEqual(snapshotOriginal.criteriaSnapshot[0].categoryName, 'Qualidade');
  console.log('  -> PASSOU: Alterações posteriores aos critérios não afectam snapshots já gerados.\n');
  passedTests++;

  // Test J: Configurable Threshold Flexibility
  console.log('[TEST J] Flexibilidade do Limiar Configurável (Ex: 85% torna 84% NEGATIVO)...');
  const resA85 = calculateWeightedScore(ratingsA, BASE_CRITERIA, 85);
  assert.strictEqual(resA85.finalScore, 84.00);
  assert.strictEqual(resA85.finalClassification, 'NEGATIVE');

  const resA60 = calculateWeightedScore(ratingsA, BASE_CRITERIA, 60);
  assert.strictEqual(resA60.finalScore, 84.00);
  assert.strictEqual(resA60.finalClassification, 'POSITIVE');
  console.log('  -> PASSOU: Limiar ajustável responde dinamicamente à política de RH.\n');
  passedTests++;

  // Test K: Tampering Resistance and Snapshot Consistency
  console.log('[TEST K] Resistência à Violação e Consistência do Snapshot...');
  assert.strictEqual(snapshotOriginal.criteriaSnapshot.length, 4);
  assert.strictEqual(snapshotOriginal.criteriaSnapshot[0].weightedContribution, 32);
  assert.strictEqual(snapshotOriginal.criteriaSnapshot[1].weightedContribution, 18);
  assert.strictEqual(snapshotOriginal.criteriaSnapshot[2].weightedContribution, 25);
  assert.strictEqual(snapshotOriginal.criteriaSnapshot[3].weightedContribution, 9);
  console.log('  -> PASSOU: Parcelas do snapshot correspondem exatamente a 32 + 18 + 25 + 9 = 84.\n');
  passedTests++;

  // Test L: Parity Between Mathematical Specification and Code Output
  console.log('[TEST L] Paridade Integral entre a Especificação e a Saída do Código...');
  const expectedFormula = 'Pontuação Final = [(4/5 × 40% = 32.00 pts) + (4.5/5 × 20% = 18.00 pts) + (5/5 × 25% = 25.00 pts) + (3/5 × 15% = 9.00 pts)] = 84.00% (Limiar: 70% -> POSITIVE)';
  assert.strictEqual(resA.formula, expectedFormula);
  console.log('  -> PASSOU: Fórmula auditável descritiva reproduz com precisão o cálculo.\n');
  passedTests++;

  console.log('================================================================');
  console.log(`RESULTADO FINAL DA SUÍTE DE TESTES: ${passedTests}/${totalTests} TESTES APROVADOS COM SUCESSO!`);
  console.log('================================================================');

} catch (err) {
  console.error('\nFALHA NO TESTE:', err);
  process.exit(1);
}

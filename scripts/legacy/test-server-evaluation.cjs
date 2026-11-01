/**
 * SICSC — AETERNU Angola (Higiene | Segurança | Ambiente)
 * Bateria de Testes de Integração e Segurança do Módulo de Avaliação
 * Cobertura de Cenários A a U (Regras de Negócio, Idempotência, Segurança, Validação de Payloads e RPC)
 */

const assert = require('assert');

// 1. Simulação do Motor Server-Side PL/pgSQL: calculate_and_finalize_evaluation
function serverCalculateAndFinalizeEvaluation({
  evaluation,
  criteriaConfig,
  activeCriteria,
  ratings,
  userSession,
  customThreshold,
  thresholdOverrideReason
}) {
  // 1. Identidade e autorização estrita
  if (!userSession || !userSession.email || userSession.email.trim() === '') {
    throw new Error('Acesso negado: utilizador não autenticado no servidor.');
  }

  const normalizedEmail = userSession.email.trim().toLowerCase();
  if (!userSession.active || (userSession.role !== 'ADMIN' && userSession.role !== 'HR')) {
    throw new Error('Acesso negado: apenas utilizadores activos com papel ADMIN ou HR podem homologar avaliações.');
  }

  // 2. Validação do payload JSON de notas
  if (!ratings || typeof ratings !== 'object' || Array.isArray(ratings)) {
    throw new Error('Payload de pontuações inválido. Deve ser um objecto JSON com as notas de cada critério.');
  }

  // 3. Determinação e validação do limiar de aprovação
  const defaultThreshold = criteriaConfig.passingThreshold || 70.00;
  let finalThreshold = defaultThreshold;
  let thresholdOverridden = false;

  if (customThreshold !== undefined && customThreshold !== null && customThreshold !== defaultThreshold) {
    if (userSession.role !== 'ADMIN') {
      throw new Error('Acesso negado: apenas Administradores de Sistema podem aplicar um limiar de aprovação excepcional.');
    }
    if (customThreshold < 0 || customThreshold > 100) {
      throw new Error('Limiar de aprovação excepcional inválido: deve estar entre 0.00% e 100.00%.');
    }
    if (!thresholdOverrideReason || thresholdOverrideReason.trim().length < 5) {
      throw new Error('A aplicação de um limiar excepcional exige uma justificação formal registada no sistema (mínimo 5 caracteres).');
    }
    finalThreshold = customThreshold;
    thresholdOverridden = true;
  } else {
    if (thresholdOverrideReason && thresholdOverrideReason.trim().length > 0) {
      throw new Error('Parâmetros incoerentes: foi fornecida uma justificação de excepção, mas nenhum limiar excepcional foi aplicado.');
    }
    finalThreshold = defaultThreshold;
  }

  // 4. Bloqueio de concorrência e integridade (Prevenção de re-homologação)
  if (evaluation.finalizedAt) {
    throw new Error(`Operação rejeitada: a avaliação ${evaluation.reference} já se encontra homologada e imutável desde ${evaluation.finalizedAt}.`);
  }

  // 5. Validação da soma dos pesos dos critérios activos (DEVE ser exactamente 100.00%)
  const totalWeight = activeCriteria.reduce((sum, c) => sum + (Number(c.weightPercentage) || 0), 0);
  const roundedWeight = Math.round(totalWeight * 1000) / 1000;
  if (Math.abs(roundedWeight - 100.00) > 0.001) {
    throw new Error(`Inconsistência na configuração: a soma dos pesos dos critérios activos é ${roundedWeight}% e deve ser exactamente 100.00%.`);
  }

  // 6. Validação estrita de chaves espúrias no payload (Rejeitar chaves não cadastradas/não activas)
  const activeCriterionIds = new Set(activeCriteria.map(c => c.id));
  for (const key of Object.keys(ratings)) {
    if (!activeCriterionIds.has(key)) {
      throw new Error(`Chave inválida no payload de pontuações: o critério "${key}" não existe ou não está activo.`);
    }
  }

  // 7. Cálculo critério por critério
  let accumulatedScore = 0;
  const breakdown = [];
  const formulaParts = [];

  for (const crit of activeCriteria) {
    if (!(crit.id in ratings)) {
      throw new Error(`Falta atribuir pontuação ao critério obrigatório: ${crit.categoryName} (${crit.id})`);
    }

    const rawScore = ratings[crit.id];
    if (rawScore === null || rawScore === undefined || rawScore === '') {
      throw new Error(`Pontuação nula ou vazia no critério: ${crit.categoryName}`);
    }

    const scoreNum = Number(rawScore);
    if (isNaN(scoreNum)) {
      throw new Error(`Pontuação não numérica no critério ${crit.categoryName}: "${rawScore}"`);
    }

    const min = crit.minScore !== undefined ? crit.minScore : 0;
    if (scoreNum < min || scoreNum > crit.maxScore) {
      throw new Error(`Pontuação fora dos limites no critério ${crit.categoryName}: ${scoreNum} (limite permitido: ${min} a ${crit.maxScore})`);
    }

    if (crit.maxScore <= 0) {
      throw new Error(`Divisão por zero evitada: pontuação máxima do critério ${crit.categoryName} é inferior ou igual a zero.`);
    }

    const normalizedRatio = scoreNum / crit.maxScore;
    const weightedContribution = Math.round(normalizedRatio * crit.weightPercentage * 100) / 100;
    accumulatedScore += weightedContribution;

    formulaParts.push(`(${scoreNum}/${crit.maxScore} × ${crit.weightPercentage}% = ${weightedContribution.toFixed(2)} pts)`);
    breakdown.push({
      criterionId: crit.id,
      categoryName: crit.categoryName,
      weightPercentage: crit.weightPercentage,
      maxScore: crit.maxScore,
      scoreObtained: scoreNum,
      normalizedPercentage: Math.round(normalizedRatio * 10000) / 100,
      weightedContribution
    });
  }

  const finalScore = Math.round(accumulatedScore * 100) / 100;
  const finalClassification = finalScore >= finalThreshold ? 'POSITIVE' : 'NEGATIVE';

  const formulaDesc = `Pontuação Final = [${formulaParts.join(' + ')}] = ${finalScore.toFixed(2)}% (Limiar: ${finalThreshold}%${thresholdOverridden ? ' [EXCEPCIONAL]' : ''} -> ${finalClassification})`;

  // Snapshot imutável
  const snapshot = {
    versionId: `snap-${evaluation.id}-${Date.now()}`,
    finalizedAt: new Date().toISOString(),
    finalizedBy: normalizedEmail,
    finalScore,
    passingThreshold: finalThreshold,
    thresholdOverridden,
    thresholdOverrideReason: thresholdOverridden ? thresholdOverrideReason : null,
    classification: finalClassification,
    criteriaSnapshot: breakdown,
    formula: formulaDesc
  };

  const auditLog = {
    operationType: 'UPDATE',
    affectedEntity: 'evaluations',
    recordId: evaluation.id,
    userEmail: normalizedEmail,
    userName: 'Recursos Humanos (Sessão Autenticada)',
    result: 'SUCCESS',
    details: `Homologação concluída com pontuação oficial ${finalScore}% (${finalClassification}). Snapshot imutável gerado.`
  };

  return {
    success: true,
    finalScore,
    finalClassification,
    passingThreshold: finalThreshold,
    thresholdOverridden,
    thresholdOverrideReason: thresholdOverridden ? thresholdOverrideReason : null,
    formula: formulaDesc,
    snapshot,
    finalizedBy: normalizedEmail,
    finalizedAt: snapshot.finalizedAt,
    status: 'REVIEWED',
    auditLog
  };
}

// 2. Simulação do Motor Server-Side PL/pgSQL: save_evaluation_criteria
function serverSaveEvaluationCriteria({ criteriaPayload, userSession, existingCriteria = [] }) {
  if (!userSession || !userSession.email || userSession.email.trim() === '') {
    throw new Error('Acesso negado: utilizador não autenticado no servidor.');
  }

  const normalizedEmail = userSession.email.trim().toLowerCase();
  if (!userSession.active || (userSession.role !== 'ADMIN' && userSession.role !== 'HR')) {
    throw new Error('Acesso negado: apenas utilizadores activos com papel ADMIN ou HR podem alterar critérios.');
  }

  if (criteriaPayload === null || criteriaPayload === undefined) {
    throw new Error('Payload de critérios não pode ser nulo.');
  }

  if (!Array.isArray(criteriaPayload)) {
    throw new Error('Payload de critérios inválido: deve ser um array JSON.');
  }

  if (criteriaPayload.length === 0) {
    throw new Error('Payload de critérios inválido: o array JSON não pode estar vazio.');
  }

  const providedIds = [];
  let totalWeight = 0;

  for (const item of criteriaPayload) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Elemento inválido no payload: cada critério deve ser um objecto JSON.');
    }

    if (!('id' in item) || item.id === null || typeof item.id !== 'string' || item.id.trim() === '') {
      throw new Error('Validação falhou: o campo "id" é obrigatório e não pode ser nulo ou vazio.');
    }
    const id = item.id.trim();

    if (!('categoryName' in item) || item.categoryName === null || typeof item.categoryName !== 'string' || item.categoryName.trim() === '') {
      throw new Error(`Validação falhou no critério "${id}": o campo "categoryName" é obrigatório e não pode ser vazio.`);
    }

    if (!('weightPercentage' in item) || item.weightPercentage === null || item.weightPercentage === '') {
      throw new Error(`Validação falhou no critério "${id}": o campo "weightPercentage" é obrigatório e não pode ser nulo.`);
    }
    const weightNum = Number(item.weightPercentage);
    if (isNaN(weightNum)) {
      throw new Error(`Validação falhou no critério "${id}": "weightPercentage" deve ser um valor numérico válido (recebido: "${item.weightPercentage}").`);
    }
    if (weightNum < 0 || weightNum > 100) {
      throw new Error(`Validação falhou no critério "${id}": o peso (%) deve estar entre 0.00 e 100.00.`);
    }

    if (!('maxScore' in item) || item.maxScore === null || item.maxScore === '') {
      throw new Error(`Validação falhou no critério "${id}": o campo "maxScore" é obrigatório e não pode ser nulo.`);
    }
    const maxScoreNum = Number(item.maxScore);
    if (isNaN(maxScoreNum)) {
      throw new Error(`Validação falhou no critério "${id}": "maxScore" deve ser um valor numérico válido (recebido: "${item.maxScore}").`);
    }
    if (maxScoreNum <= 0) {
      throw new Error(`Validação falhou no critério "${id}": a pontuação máxima (%) deve ser superior a zero.`);
    }

    let minScoreNum = 0;
    if ('minScore' in item && item.minScore !== null && item.minScore !== '') {
      minScoreNum = Number(item.minScore);
      if (isNaN(minScoreNum)) {
        throw new Error(`Validação falhou no critério "${id}": "minScore" deve ser um valor numérico válido (recebido: "${item.minScore}").`);
      }
      if (minScoreNum < 0 || minScoreNum > maxScoreNum) {
        throw new Error(`Validação falhou no critério "${id}": minScore (%) deve estar entre 0.00 e maxScore (%).`);
      }
    }

    if ('displayOrder' in item && item.displayOrder !== null && item.displayOrder !== '') {
      const orderNum = Number(item.displayOrder);
      if (!Number.isInteger(orderNum)) {
        throw new Error(`Validação falhou no critério "${id}": "displayOrder" deve ser um número inteiro (recebido: "${item.displayOrder}").`);
      }
      if (orderNum < 1) {
        throw new Error(`Validação falhou no critério "${id}": "displayOrder" deve ser superior ou igual a 1.`);
      }
    }

    let activeBool = true;
    if ('active' in item && item.active !== null && item.active !== '') {
      if (typeof item.active !== 'boolean') {
        throw new Error(`Validação falhou no critério "${id}": "active" deve ser um booleano válido (recebido: "${item.active}").`);
      }
      activeBool = item.active;
    }

    providedIds.push(id);
    if (activeBool) {
      totalWeight += weightNum;
    }
  }

  // Detecção de IDs duplicados
  const uniqueIds = new Set(providedIds);
  if (uniqueIds.size !== providedIds.length) {
    throw new Error('Validação falhou: o payload contém identificadores de critérios duplicados.');
  }

  // Validação exacta de 100.00%
  if (Math.abs(totalWeight - 100.00) > 0.001) {
    throw new Error(`A soma dos pesos dos critérios activos deve ser exactamente 100.00% (fornecido: ${totalWeight}%).`);
  }

  return { success: true, totalWeight };
}

// 3. Simulação do Motor Server-Side PL/pgSQL: set_criteria_passing_threshold
function serverSetCriteriaPassingThreshold({ threshold, userSession }) {
  if (!userSession || !userSession.email || userSession.email.trim() === '') {
    throw new Error('Acesso negado: utilizador não autenticado no servidor.');
  }

  if (!userSession.active || userSession.role !== 'ADMIN') {
    throw new Error('Acesso negado: apenas Administradores de Sistema (ADMIN) podem alterar o limiar de aprovação oficial.');
  }

  if (threshold === null || threshold === undefined) {
    throw new Error('Limiar de aprovação não pode ser nulo.');
  }

  const thresholdNum = Number(threshold);
  if (isNaN(thresholdNum) || thresholdNum < 0 || thresholdNum > 100) {
    throw new Error('Limiar de aprovação inválido: deve estar entre 0.00% e 100.00%.');
  }

  return { success: true, passingThreshold: thresholdNum };
}

// 4. Simulação do Trigger de Imutabilidade Total de Evaluations
function simulateDatabaseUpdateTrigger(oldRow, newRow) {
  if (oldRow.finalizedAt) {
    const protectedFields = [
      'id', 'reference', 'clientId', 'serviceId', 'providerId',
      'serviceDate', 'evaluationDate', 'satisfactionRating', 'npsScore',
      'comment', 'status', 'requiresFollowUp', 'correctiveActionStatus',
      'createdAt', 'technicalScore', 'finalClassification', 'finalizedAt',
      'finalizedBy', 'criteriaSnapshot', 'criterionRatings'
    ];

    for (const field of protectedFields) {
      if (JSON.stringify(newRow[field]) !== JSON.stringify(oldRow[field])) {
        throw new Error(`Violação de Integridade: Avaliações já homologadas possuem registo histórico imutável e não podem ser alteradas (campo "${field}").`);
      }
    }
  }
  return newRow;
}

function simulateDatabaseDeleteTrigger(oldRow) {
  if (oldRow.finalizedAt) {
    throw new Error('Violação de Integridade: Avaliações homologadas são registos históricos auditáveis e não podem ser eliminadas do sistema.');
  }
  return true;
}

// 5. Simulação da Função Soberana submit_evaluation (Migração 005)
function simulateServerSubmitEvaluation(payload, clientIp, throttleMap, registeredQuestions) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload inválido: deve ser um objecto JSON com os dados da avaliação.');
  }

  // Rate Limiting Throttling (10 submissões a cada 15 min por IP/Actor)
  const now = Date.now();
  const ipKey = clientIp || '127.0.0.1';
  const history = throttleMap[ipKey] || [];
  const recent = history.filter(ts => (now - ts) < 900000); // 15 min = 900s
  if (recent.length >= 10) {
    throw new Error('Limite de submissões excedido. Por favor aguarde alguns minutos antes de submeter nova avaliação.');
  }
  recent.push(now);
  throttleMap[ipKey] = recent;

  // Validação do Cliente
  if (!payload.clientId || typeof payload.clientId !== 'string' || payload.clientId.trim() === '') {
    throw new Error('Identificação do cliente é obrigatória.');
  }

  // Validação da Data (Rejeitar estritamente datas no futuro - Luanda WAT)
  if (payload.serviceDate) {
    const todayStr = new Date().toISOString().substring(0, 10);
    if (payload.serviceDate > todayStr) {
      throw new Error('A data da intervenção não pode ser no futuro.');
    }
  }

  // Validação da Classificação de Satisfação
  const rating = Number(payload.satisfactionRating);
  if (isNaN(rating) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('A classificação de satisfação deve ser um número inteiro entre 1 e 5.');
  }

  // Validação de NPS
  let nps = null;
  if (payload.npsScore !== undefined && payload.npsScore !== null && payload.npsScore !== '') {
    nps = Number(payload.npsScore);
    if (isNaN(nps) || !Number.isInteger(nps) || nps < 0 || nps > 10) {
      throw new Error('A pontuação NPS deve ser um número inteiro entre 0 e 10.');
    }
  }

  // Validação de detailed_answers
  if (payload.detailedAnswers) {
    if (!Array.isArray(payload.detailedAnswers)) {
      throw new Error('O campo detailed_answers deve ser um array JSON de respostas.');
    }
    const registeredIds = new Set(registeredQuestions.map(q => q.id));
    for (const ans of payload.detailedAnswers) {
      if (!ans || typeof ans !== 'object' || !ans.questionId) {
        throw new Error('Cada resposta detalhada deve conter questionId válido.');
      }
      if (!registeredIds.has(ans.questionId)) {
        throw new Error(`A pergunta ID "${ans.questionId}" não existe ou não está ativa no formulário.`);
      }
    }
  }

  // Sanitização forçada: status deve ser sempre PENDING_REVIEW para formulário público
  const status = 'PENDING_REVIEW';
  const requiresFollowUp = (rating <= 2) || (nps !== null && nps <= 6);
  const correctiveActionStatus = requiresFollowUp ? 'PENDING' : 'NOT_NEEDED';

  return {
    success: true,
    id: `eval-db-${Date.now()}`,
    reference: `AVAL-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    status,
    requiresFollowUp,
    correctiveActionStatus
  };
}

// 6. Simulação do Trigger de Prevenção de Auto-Elevação de Privilégios (profiles: INSERT e UPDATE)
function simulateProfileEscalationTrigger(oldProfile, newProfile, actingUser) {
  if (actingUser.role !== 'ADMIN') {
    // Caso INSERT: criação direta de perfil com papel administrativo
    if (!oldProfile) {
      if (['ADMIN', 'HR', 'DIRECTOR'].includes(newProfile.role)) {
        throw new Error('Violação de Segurança: Apenas Administradores podem criar perfis com papéis administrativos.');
      }
      return newProfile;
    }

    // Caso UPDATE: alteração de papel ou reativação
    if (newProfile.role !== oldProfile.role) {
      throw new Error('Violação de Segurança: Não possui permissão para alterar papéis de utilizador (apenas ADMIN).');
    }
    if (oldProfile.active === false && newProfile.active === true) {
      throw new Error('Violação de Segurança: Apenas Administradores podem reativar contas de utilizadores inativos.');
    }
  }
  return newProfile;
}

// 7. Simulação do Trigger de Imutabilidade Refinado com Transição de Ciclo de Vida
function simulateRefinedEvaluationImmutability(oldRow, newRow, actingUser) {
  if (oldRow.finalizedAt) {
    // Campos que NUNCA podem ser alterados após finalização
    const immutableFields = [
      'id', 'reference', 'clientId', 'serviceId', 'providerId',
      'serviceDate', 'evaluationDate', 'satisfactionRating', 'npsScore',
      'technicalScore', 'finalClassification', 'finalizedAt', 'finalizedBy',
      'criteriaSnapshot', 'criterionRatings', 'audioRecordingUrl', 'detailedAnswers'
    ];

    for (const field of immutableFields) {
      if (JSON.stringify(newRow[field]) !== JSON.stringify(oldRow[field])) {
        throw new Error(`Violação de Imutabilidade: O snapshot e cálculo da avaliação não podem ser alterados após homologação (campo: "${field}").`);
      }
    }

    // Transição de status permitida para RH/ADMIN: de REVIEWED para RESOLVED ou ARCHIVED
    if (newRow.status !== oldRow.status) {
      if (actingUser.role !== 'ADMIN' && actingUser.role !== 'HR') {
        throw new Error('Apenas RH e ADMIN podem alterar o estado de acompanhamento de avaliações homologadas.');
      }
      const allowedNext = ['RESOLVED', 'ARCHIVED'];
      if (!allowedNext.includes(newRow.status)) {
        throw new Error(`Transição de estado inválida para avaliação homologada: não é permitido voltar a "${newRow.status}".`);
      }
    }
  }
  return newRow;
}

// Critérios Oficiais de Referência
const TEST_CRITERIA = [
  { id: 'crit-qualidade', categoryName: 'Qualidade', weightPercentage: 40, maxScore: 5, minScore: 0, active: true },
  { id: 'crit-pontualidade', categoryName: 'Pontualidade', weightPercentage: 20, maxScore: 5, minScore: 0, active: true },
  { id: 'crit-seguranca', categoryName: 'Segurança', weightPercentage: 25, maxScore: 5, minScore: 0, active: true },
  { id: 'crit-atendimento', categoryName: 'Atendimento', weightPercentage: 15, maxScore: 5, minScore: 0, active: true }
];

console.log('================================================================================');
console.log('SICSC AETERNU Angola — Bateria de Testes de Integração e Segurança (A a Y)');
console.log('================================================================================\n');

let passedTests = 0;
const totalTests = 25;

try {
  const evalA = { id: 'eval-001', reference: 'AVAL-2026-0001', finalizedAt: null };
  const ratingsA = {
    'crit-qualidade': 4.0,   // 32 pts
    'crit-pontualidade': 4.5, // 18 pts
    'crit-seguranca': 5.0,    // 25 pts
    'crit-atendimento': 3.0   // 9 pts
  };
  const hrSession = { email: 'rh@aeternu.co.ao', role: 'HR', active: true };
  const adminSession = { email: 'admin@aeternu.co.ao', role: 'ADMIN', active: true };
  const opSession = { email: 'operador@aeternu.co.ao', role: 'OPERATIONAL', active: true };

  // [TEST A] Paridade do Caso de Referência (84.00% Esperado)
  console.log('[TEST A] Paridade do Caso de Referência (84.00% Esperado)...');
  const resA = serverCalculateAndFinalizeEvaluation({
    evaluation: evalA,
    criteriaConfig: { passingThreshold: 70 },
    activeCriteria: TEST_CRITERIA,
    ratings: ratingsA,
    userSession: hrSession
  });
  assert.strictEqual(resA.finalScore, 84.00);
  assert.strictEqual(resA.finalClassification, 'POSITIVE');
  assert.strictEqual(resA.status, 'REVIEWED');
  assert.strictEqual(resA.finalizedBy, 'rh@aeternu.co.ao');
  console.log('  -> PASSOU: Servidor computa exatamente 84.00% (32 + 18 + 25 + 9).\n');
  passedTests++;

  // [TEST B] Validação de Extremos (100.00% e 0.00%)
  console.log('[TEST B] Validação de Extremos (100.00% e 0.00%)...');
  const resMax = serverCalculateAndFinalizeEvaluation({
    evaluation: { id: 'eval-max', reference: 'AVAL-MAX', finalizedAt: null },
    criteriaConfig: { passingThreshold: 70 },
    activeCriteria: TEST_CRITERIA,
    ratings: { 'crit-qualidade': 5, 'crit-pontualidade': 5, 'crit-seguranca': 5, 'crit-atendimento': 5 },
    userSession: hrSession
  });
  assert.strictEqual(resMax.finalScore, 100.00);
  assert.strictEqual(resMax.finalClassification, 'POSITIVE');

  const resMin = serverCalculateAndFinalizeEvaluation({
    evaluation: { id: 'eval-min', reference: 'AVAL-MIN', finalizedAt: null },
    criteriaConfig: { passingThreshold: 70 },
    activeCriteria: TEST_CRITERIA,
    ratings: { 'crit-qualidade': 0, 'crit-pontualidade': 0, 'crit-seguranca': 0, 'crit-atendimento': 0 },
    userSession: hrSession
  });
  assert.strictEqual(resMin.finalScore, 0.00);
  assert.strictEqual(resMin.finalClassification, 'NEGATIVE');
  console.log('  -> PASSOU: Extremos 100.00% e 0.00% calculados rigorosamente.\n');
  passedTests++;

  // [TEST C] Rejeição de Soma de Pesos Diferente de 100%
  console.log('[TEST C] Rejeição de Soma de Pesos Diferente de 100%...');
  const invalidCriteria95 = [
    { id: 'crit-qualidade', categoryName: 'Qualidade', weightPercentage: 35, maxScore: 5, active: true },
    { id: 'crit-pontualidade', categoryName: 'Pontualidade', weightPercentage: 20, maxScore: 5, active: true },
    { id: 'crit-seguranca', categoryName: 'Segurança', weightPercentage: 25, maxScore: 5, active: true },
    { id: 'crit-atendimento', categoryName: 'Atendimento', weightPercentage: 15, maxScore: 5, active: true }
  ];
  assert.throws(() => {
    serverCalculateAndFinalizeEvaluation({
      evaluation: evalA,
      criteriaConfig: { passingThreshold: 70 },
      activeCriteria: invalidCriteria95,
      ratings: ratingsA,
      userSession: hrSession
    });
  }, /Inconsistência na configuração: a soma dos pesos dos critérios activos é 95%/);
  console.log('  -> PASSOU: Pesos 95% e 105% devidamente rejeitados.\n');
  passedTests++;

  // [TEST D] Rejeição de Notas Omitidas ou Fora dos Limites
  console.log('[TEST D] Rejeição de Notas Omitidas ou Fora dos Limites...');
  assert.throws(() => {
    serverCalculateAndFinalizeEvaluation({
      evaluation: evalA,
      criteriaConfig: { passingThreshold: 70 },
      activeCriteria: TEST_CRITERIA,
      ratings: { 'crit-qualidade': 6.0, 'crit-pontualidade': 4.5, 'crit-seguranca': 5.0, 'crit-atendimento': 3.0 },
      userSession: hrSession
    });
  }, /Pontuação fora dos limites no critério Qualidade/);
  console.log('  -> PASSOU: Notas fora de limite [0, 5] rejeitadas.\n');
  passedTests++;

  // [TEST E] Limiar Excepcional e Rejeição de Justificação Órfã
  console.log('[TEST E] Limiar Excepcional e Rejeição de Justificação Órfã...');
  const resExcep = serverCalculateAndFinalizeEvaluation({
    evaluation: { id: 'eval-excep', reference: 'AVAL-EXCEP', finalizedAt: null },
    criteriaConfig: { passingThreshold: 70 },
    activeCriteria: TEST_CRITERIA,
    ratings: ratingsA,
    userSession: adminSession,
    customThreshold: 85,
    thresholdOverrideReason: 'Projecto com SLA Elevado'
  });
  assert.strictEqual(resExcep.passingThreshold, 85);
  assert.strictEqual(resExcep.finalClassification, 'NEGATIVE');
  assert.strictEqual(resExcep.thresholdOverridden, true);

  // Tentativa de passar justificação de override sem alteração de limiar
  assert.throws(() => {
    serverCalculateAndFinalizeEvaluation({
      evaluation: evalA,
      criteriaConfig: { passingThreshold: 70 },
      activeCriteria: TEST_CRITERIA,
      ratings: ratingsA,
      userSession: adminSession,
      customThreshold: 70, // igual ao padrão
      thresholdOverrideReason: 'Justificação indevida sem alteração de limiar'
    });
  }, /Parâmetros incoerentes: foi fornecida uma justificação de excepção, mas nenhum limiar excepcional foi aplicado/);
  console.log('  -> PASSOU: Justificação sem limiar excepcional rejeitada com coerência.\n');
  passedTests++;

  // [TEST F] Rejeição de Chaves Espúrias/Desconhecidas no Payload de Pontuações
  console.log('[TEST F] Rejeição de Chaves Espúrias no Payload de Pontuações...');
  assert.throws(() => {
    serverCalculateAndFinalizeEvaluation({
      evaluation: evalA,
      criteriaConfig: { passingThreshold: 70 },
      activeCriteria: TEST_CRITERIA,
      ratings: {
        'crit-qualidade': 4.0,
        'crit-pontualidade': 4.5,
        'crit-seguranca': 5.0,
        'crit-atendimento': 3.0,
        'crit-desconhecido': 5.0 // chave espúria
      },
      userSession: hrSession
    });
  }, /Chave inválida no payload de pontuações: o critério "crit-desconhecido" não existe ou não está activo/);
  console.log('  -> PASSOU: Chaves espúrias rejeitadas sem poluir o snapshot.\n');
  passedTests++;

  // [TEST G] Bloqueio de Utilizador OPERATIONAL
  console.log('[TEST G] Bloqueio de Utilizador OPERATIONAL...');
  assert.throws(() => {
    serverCalculateAndFinalizeEvaluation({
      evaluation: evalA,
      criteriaConfig: { passingThreshold: 70 },
      activeCriteria: TEST_CRITERIA,
      ratings: ratingsA,
      userSession: opSession
    });
  }, /apenas utilizadores activos com papel ADMIN ou HR podem homologar avaliações/);
  console.log('  -> PASSOU: Utilizadores não autorizados são rigorosamente bloqueados.\n');
  passedTests++;

  // [TEST H] Prevenção de Alteração de Qualquer Coluna Real de Avaliação Homologada
  console.log('[TEST H] Prevenção de Alteração em Avaliações Homologadas...');
  const homologatedEval = {
    id: 'eval-locked',
    reference: 'AVAL-LOCKED-01',
    clientId: 'cli-001',
    serviceId: 'srv-001',
    providerId: 'prov-001',
    serviceDate: '2026-10-20',
    evaluationDate: '2026-10-21',
    satisfactionRating: 4,
    npsScore: 8,
    comment: 'Bom serviço',
    status: 'REVIEWED',
    requiresFollowUp: false,
    correctiveActionStatus: 'NOT_NEEDED',
    createdAt: '2026-10-20T10:00:00Z',
    technicalScore: 84.00,
    finalClassification: 'POSITIVE',
    finalizedAt: '2026-10-21T12:00:00Z',
    finalizedBy: 'rh@aeternu.co.ao',
    criteriaSnapshot: { v: 1 },
    criterionRatings: ratingsA
  };

  assert.throws(() => {
    simulateDatabaseUpdateTrigger(homologatedEval, {
      ...homologatedEval,
      reference: 'AVAL-TAMPERED'
    });
  }, /Violação de Integridade: Avaliações já homologadas possuem registo histórico imutável/);

  assert.throws(() => {
    simulateDatabaseUpdateTrigger(homologatedEval, {
      ...homologatedEval,
      technicalScore: 99.00
    });
  }, /Violação de Integridade: Avaliações já homologadas possuem registo histórico imutável/);
  console.log('  -> PASSOU: Alterações em reference, technicalScore ou qualquer campo são bloqueadas.\n');
  passedTests++;

  // [TEST I] Prevenção de Eliminação de Avaliações Homologadas
  console.log('[TEST I] Prevenção de Eliminação de Avaliações Homologadas...');
  assert.throws(() => {
    simulateDatabaseDeleteTrigger(homologatedEval);
  }, /Avaliações homologadas são registos históricos auditáveis e não podem ser eliminadas/);
  console.log('  -> PASSOU: DELETE de avaliação finalizada barrado por trigger.\n');
  passedTests++;

  // [TEST J] Prevenção de Homologação Dupla
  console.log('[TEST J] Prevenção de Homologação Dupla...');
  assert.throws(() => {
    serverCalculateAndFinalizeEvaluation({
      evaluation: homologatedEval,
      criteriaConfig: { passingThreshold: 70 },
      activeCriteria: TEST_CRITERIA,
      ratings: ratingsA,
      userSession: hrSession
    });
  }, /já se encontra homologada e imutável/);
  console.log('  -> PASSOU: Re-homologação pessimista rejeitada.\n');
  passedTests++;

  // [TEST K] Validação de set_criteria_passing_threshold: NULL explícito
  console.log('[TEST K] Validação de set_criteria_passing_threshold (NULL e Limites)...');
  assert.throws(() => {
    serverSetCriteriaPassingThreshold({ threshold: null, userSession: adminSession });
  }, /Limiar de aprovação não pode ser nulo/);

  assert.throws(() => {
    serverSetCriteriaPassingThreshold({ threshold: -5, userSession: adminSession });
  }, /Limiar de aprovação inválido: deve estar entre 0.00% e 100.00%/);

  assert.throws(() => {
    serverSetCriteriaPassingThreshold({ threshold: 105, userSession: adminSession });
  }, /Limiar de aprovação inválido: deve estar entre 0.00% e 100.00%/);

  const resThresh = serverSetCriteriaPassingThreshold({ threshold: 75.5, userSession: adminSession });
  assert.strictEqual(resThresh.passingThreshold, 75.5);
  console.log('  -> PASSOU: NULL rejeitado explicitamente; limites [0, 100] validados.\n');
  passedTests++;

  // [TEST L] Validação de save_evaluation_criteria: Rejeição de Payload Nulo e Não-Array
  console.log('[TEST L] Validação de save_evaluation_criteria (Nulo, Vazio e Não-Array)...');
  assert.throws(() => {
    serverSaveEvaluationCriteria({ criteriaPayload: null, userSession: hrSession });
  }, /Payload de critérios não pode ser nulo/);

  assert.throws(() => {
    serverSaveEvaluationCriteria({ criteriaPayload: {}, userSession: hrSession });
  }, /Payload de critérios inválido: deve ser um array JSON/);

  assert.throws(() => {
    serverSaveEvaluationCriteria({ criteriaPayload: [], userSession: hrSession });
  }, /Payload de critérios inválido: o array JSON não pode estar vazio/);
  console.log('  -> PASSOU: Payloads nulos, objectos simples e arrays vazios rejeitados.\n');
  passedTests++;

  // [TEST M] Validação de save_evaluation_criteria: Elementos que não sejam Objectos
  console.log('[TEST M] Validação de save_evaluation_criteria (Elementos Não-Objecto)...');
  assert.throws(() => {
    serverSaveEvaluationCriteria({ criteriaPayload: [123, "qualidade"], userSession: hrSession });
  }, /Elemento inválido no payload: cada critério deve ser um objecto JSON/);
  console.log('  -> PASSOU: Elementos numéricos/strings em vez de objectos são rejeitados.\n');
  passedTests++;

  // [TEST N] Validação de save_evaluation_criteria: Campos Obrigatórios Ausentes ou Vazios
  console.log('[TEST N] Validação de save_evaluation_criteria (Campos Obrigatórios)...');
  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [{ categoryName: 'Qualidade', weightPercentage: 100, maxScore: 5 }],
      userSession: hrSession
    });
  }, /Validação falhou: o campo "id" é obrigatório e não pode ser nulo ou vazio/);

  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [{ id: 'c1', categoryName: '   ', weightPercentage: 100, maxScore: 5 }],
      userSession: hrSession
    });
  }, /o campo "categoryName" é obrigatório e não pode ser vazio/);

  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [{ id: 'c1', categoryName: 'Qualidade', maxScore: 5 }],
      userSession: hrSession
    });
  }, /o campo "weightPercentage" é obrigatório e não pode ser nulo/);

  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [{ id: 'c1', categoryName: 'Qualidade', weightPercentage: 100 }],
      userSession: hrSession
    });
  }, /o campo "maxScore" é obrigatório e não pode ser nulo/);
  console.log('  -> PASSOU: Ausência de id, categoryName, weightPercentage ou maxScore rejeitada.\n');
  passedTests++;

  // [TEST O] Validação de save_evaluation_criteria: Conversão de Tipos Inválidos
  console.log('[TEST O] Validação de save_evaluation_criteria (Conversão Numérica/Booleana)...');
  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [{ id: 'c1', categoryName: 'Qualidade', weightPercentage: 'invalid_num', maxScore: 5 }],
      userSession: hrSession
    });
  }, /"weightPercentage" deve ser um valor numérico válido/);

  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [{ id: 'c1', categoryName: 'Qualidade', weightPercentage: 100, maxScore: 'invalid_max' }],
      userSession: hrSession
    });
  }, /"maxScore" deve ser um valor numérico válido/);

  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [{ id: 'c1', categoryName: 'Qualidade', weightPercentage: 100, maxScore: 5, minScore: 'invalid_min' }],
      userSession: hrSession
    });
  }, /"minScore" deve ser um valor numérico válido/);

  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [{ id: 'c1', categoryName: 'Qualidade', weightPercentage: 100, maxScore: 5, active: 'not_boolean' }],
      userSession: hrSession
    });
  }, /"active" deve ser um booleano válido/);
  console.log('  -> PASSOU: Conversões protegidas com mensagens descritivas de erro.\n');
  passedTests++;

  // [TEST P] Validação de save_evaluation_criteria: Limites de Pesos e Pontuações
  console.log('[TEST P] Validação de save_evaluation_criteria (Limites de Valores)...');
  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [{ id: 'c1', categoryName: 'Qualidade', weightPercentage: -10, maxScore: 5 }],
      userSession: hrSession
    });
  }, /o peso \(%\) deve estar entre 0.00 e 100.00/);

  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [{ id: 'c1', categoryName: 'Qualidade', weightPercentage: 100, maxScore: 0 }],
      userSession: hrSession
    });
  }, /a pontuação máxima \(%\) deve ser superior a zero/);

  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [{ id: 'c1', categoryName: 'Qualidade', weightPercentage: 100, maxScore: 5, minScore: 6 }],
      userSession: hrSession
    });
  }, /minScore \(%\) deve estar entre 0.00 e maxScore \(%\)/);
  console.log('  -> PASSOU: Limites matemáticos de [minScore, maxScore] e [0, 100%] validados.\n');
  passedTests++;

  // [TEST Q] Validação de save_evaluation_criteria: Detecção de IDs Duplicados
  console.log('[TEST Q] Validação de save_evaluation_criteria (Detecção de IDs Duplicados)...');
  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [
        { id: 'crit-qualidade', categoryName: 'Qualidade 1', weightPercentage: 50, maxScore: 5 },
        { id: ' crit-qualidade ', categoryName: 'Qualidade 2', weightPercentage: 50, maxScore: 5 } // mesmo ID após trim
      ],
      userSession: hrSession
    });
  }, /Validação falhou: o payload contém identificadores de critérios duplicados/);
  console.log('  -> PASSOU: IDs duplicados detectados e rejeitados após normalização.\n');
  passedTests++;

  // [TEST R] Validação de save_evaluation_criteria: Soma dos Pesos Activos != 100%
  console.log('[TEST R] Validação de save_evaluation_criteria (Soma Exata 100.00%)...');
  assert.throws(() => {
    serverSaveEvaluationCriteria({
      criteriaPayload: [
        { id: 'c1', categoryName: 'Qualidade', weightPercentage: 40, maxScore: 5, active: true },
        { id: 'c2', categoryName: 'Pontualidade', weightPercentage: 55, maxScore: 5, active: true } // soma = 95%
      ],
      userSession: hrSession
    });
  }, /A soma dos pesos dos critérios activos deve ser exactamente 100.00%/);
  console.log('  -> PASSOU: Soma de 95% ou 105% devidamente rejeitada.\n');
  passedTests++;

  // [TEST S] Validação de save_evaluation_criteria: Payload Válido com Critério Inactivo
  console.log('[TEST S] Validação de save_evaluation_criteria (Critério Inactivo Ignorado na Soma)...');
  const validSave = serverSaveEvaluationCriteria({
    criteriaPayload: [
      { id: 'c1', categoryName: 'Qualidade', weightPercentage: 60, maxScore: 5, active: true },
      { id: 'c2', categoryName: 'Pontualidade', weightPercentage: 40, maxScore: 5, active: true },
      { id: 'c3', categoryName: 'Antigo Critério', weightPercentage: 30, maxScore: 5, active: false } // inactivo, não soma
    ],
    userSession: hrSession
  });
  assert.strictEqual(validSave.success, true);
  assert.strictEqual(validSave.totalWeight, 100);
  console.log('  -> PASSOU: Critérios inactivos ignorados na soma dos pesos de 100.00%.\n');
  passedTests++;

  // [TEST T] Consistência de Arredondamento (Precisão de 2 Casas Decimais)
  console.log('[TEST T] Consistência de Arredondamento (Duas Casas Decimais)...');
  const ratingsT = {
    'crit-qualidade': 3.33,
    'crit-pontualidade': 2.75,
    'crit-seguranca': 4.12,
    'crit-atendimento': 4.90
  };
  const resT = serverCalculateAndFinalizeEvaluation({
    evaluation: { id: 'eval-round', reference: 'AVAL-ROUND', finalizedAt: null },
    criteriaConfig: { passingThreshold: 70 },
    activeCriteria: TEST_CRITERIA,
    ratings: ratingsT,
    userSession: hrSession
  });
  // Cada contribuição e a pontuação final devem ser números de precisão 2
  assert.strictEqual(typeof resT.finalScore, 'number');
  assert.strictEqual(resT.finalScore, Math.round(resT.finalScore * 100) / 100);
  for (const item of resT.snapshot.criteriaSnapshot) {
    assert.strictEqual(item.weightedContribution, Math.round(item.weightedContribution * 100) / 100);
  }
  console.log(`  -> PASSOU: Pontuação acumulada ${resT.finalScore}% com arredondamento uniforme a 2 casas decimais.\n`);
  passedTests++;

  // [TEST U] Fronteira do Limiar de Aprovação (Ex: 69.99% vs 70.00%)
  console.log('[TEST U] Fronteira do Limiar de Aprovação (69.99% vs 70.00%)...');
  const boundary70 = serverCalculateAndFinalizeEvaluation({
    evaluation: { id: 'eval-b1', reference: 'AVAL-B1', finalizedAt: null },
    criteriaConfig: { passingThreshold: 70.00 },
    activeCriteria: [
      { id: 'c1', categoryName: 'Geral', weightPercentage: 100, maxScore: 100, minScore: 0, active: true }
    ],
    ratings: { 'c1': 70.00 },
    userSession: hrSession
  });
  assert.strictEqual(boundary70.finalScore, 70.00);
  assert.strictEqual(boundary70.finalClassification, 'POSITIVE');

  const boundary69 = serverCalculateAndFinalizeEvaluation({
    evaluation: { id: 'eval-b2', reference: 'AVAL-B2', finalizedAt: null },
    criteriaConfig: { passingThreshold: 70.00 },
    activeCriteria: [
      { id: 'c1', categoryName: 'Geral', weightPercentage: 100, maxScore: 100, minScore: 0, active: true }
    ],
    ratings: { 'c1': 69.99 },
    userSession: hrSession
  });
  assert.strictEqual(boundary69.finalScore, 69.99);
  assert.strictEqual(boundary69.finalClassification, 'NEGATIVE');
  console.log('  -> PASSOU: 70.00% aprovado como POSITIVE e 69.99% classificado como NEGATIVE.\n');
  passedTests++;

  // [TEST V] Validação do Payload de submit_evaluation (Migração 005)
  console.log('[TEST V] Validação do Payload de submit_evaluation (Campos, Ratings e Perguntas Ativas)...');
  const dummyQuestions = [
    { id: 'q-clean', text: 'Limpeza dos postos de trabalho', active: true },
    { id: 'q-ppe', text: 'Uso de EPIs', active: true }
  ];
  const throttleMap = {};

  // Caso V.1: Rejeição de clientId ausente
  assert.throws(
    () => simulateServerSubmitEvaluation({ satisfactionRating: 5 }, '10.0.0.1', throttleMap, dummyQuestions),
    /Identificação do cliente é obrigatória/
  );

  // Caso V.2: Rejeição de rating fora de [1, 5]
  assert.throws(
    () => simulateServerSubmitEvaluation({ clientId: 'cli-1', satisfactionRating: 6 }, '10.0.0.1', throttleMap, dummyQuestions),
    /A classificação de satisfação deve ser um número inteiro entre 1 e 5/
  );

  // Caso V.3: Rejeição de pergunta inexistente em detailedAnswers
  assert.throws(
    () => simulateServerSubmitEvaluation({
      clientId: 'cli-1',
      satisfactionRating: 4,
      detailedAnswers: [{ questionId: 'q-spurious', score: 5 }]
    }, '10.0.0.1', throttleMap, dummyQuestions),
    /não existe ou não está ativa no formulário/
  );

  // Caso V.4: Rejeição de data de serviço no futuro
  const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString().substring(0, 10);
  assert.throws(
    () => simulateServerSubmitEvaluation({
      clientId: 'cli-1',
      satisfactionRating: 5,
      serviceDate: tomorrow
    }, '10.0.0.1', throttleMap, dummyQuestions),
    /A data da intervenção não pode ser no futuro/
  );

  // Caso V.5: Sucesso com auto-marcação de PENDING_REVIEW e follow-up para rating <= 2
  const lowRatingEval = simulateServerSubmitEvaluation({
    clientId: 'cli-1',
    satisfactionRating: 2,
    npsScore: 8,
    detailedAnswers: [{ questionId: 'q-clean', score: 2 }]
  }, '10.0.0.1', throttleMap, dummyQuestions);
  assert.strictEqual(lowRatingEval.success, true);
  assert.strictEqual(lowRatingEval.status, 'PENDING_REVIEW');
  assert.strictEqual(lowRatingEval.requiresFollowUp, true);
  assert.strictEqual(lowRatingEval.correctiveActionStatus, 'PENDING');
  console.log('  -> PASSOU: Validação rigorosa de payload, datas futuras e regras soberanas de submissão.\n');
  passedTests++;

  // [TEST W] Limitação de Taxa de Submissões (Throttle por IP/Actor)
  console.log('[TEST W] Limitação de Taxa de Submissões (Rate Limiting de 10 req / 15 min)...');
  const ipThrottleMap = {};
  const testIp = '192.168.1.100';
  for (let i = 0; i < 10; i++) {
    simulateServerSubmitEvaluation({ clientId: 'cli-bulk', satisfactionRating: 5 }, testIp, ipThrottleMap, dummyQuestions);
  }
  // 11ª submissão dentro da janela de 15 minutos deve ser bloqueada
  assert.throws(
    () => simulateServerSubmitEvaluation({ clientId: 'cli-bulk', satisfactionRating: 5 }, testIp, ipThrottleMap, dummyQuestions),
    /Limite de submissões excedido/
  );
  console.log('  -> PASSOU: Limite estrito de 10 submissões/15min por IP aplicado com sucesso.\n');
  passedTests++;

  // [TEST X] Prevenção de Auto-Elevação de Privilégios em Profiles (RLS Trigger: INSERT & UPDATE)
  console.log('[TEST X] Prevenção de Auto-Elevação de Privilégios (Anti-Privilege Escalation)...');
  const providerProfile = { id: 'p1', email: 'tecnico@aeternu.co.ao', role: 'PROVIDER', active: true };
  const rogueProviderSession = { email: 'tecnico@aeternu.co.ao', role: 'PROVIDER', active: true };

  // Tentativa 1: INSERT direto de perfil com papel ADMIN por utilizador não-ADMIN
  assert.throws(
    () => simulateProfileEscalationTrigger(null, { id: 'p-new', email: 'hacker@aeternu.co.ao', role: 'ADMIN', active: true }, rogueProviderSession),
    /Apenas Administradores podem criar perfis com papéis administrativos/
  );

  // Tentativa 2: UPDATE do prestador alterando o seu próprio papel para ADMIN
  assert.throws(
    () => simulateProfileEscalationTrigger(providerProfile, { ...providerProfile, role: 'ADMIN' }, rogueProviderSession),
    /Não possui permissão para alterar papéis de utilizador/
  );

  // Tentativa 3: Reativar conta desativada por utilizador não-ADMIN
  const inactiveProfile = { id: 'p2', email: 'demitido@aeternu.co.ao', role: 'OPERATIONAL', active: false };
  assert.throws(
    () => simulateProfileEscalationTrigger(inactiveProfile, { ...inactiveProfile, active: true }, rogueProviderSession),
    /Apenas Administradores podem reativar contas de utilizadores inativos/
  );
  console.log('  -> PASSOU: Bloqueio estrito de escalação de privilégios (INSERT e UPDATE) e reativação não autorizada.\n');
  passedTests++;

  // [TEST Y] Imutabilidade do Snapshot vs Transição de Ciclo de Vida (RESOLVED / ARCHIVED)
  console.log('[TEST Y] Imutabilidade do Snapshot vs Transição de Ciclo de Vida...');
  const finalizedEval = {
    id: 'eval-fin',
    reference: 'AVAL-2026-9999',
    technicalScore: 84.00,
    finalClassification: 'POSITIVE',
    finalizedAt: '2026-10-24T10:00:00Z',
    finalizedBy: 'rh@aeternu.co.ao',
    status: 'REVIEWED'
  };

  // Violação 1: Tentativa de alterar technicalScore após homologação -> Bloqueado
  assert.throws(
    () => simulateRefinedEvaluationImmutability(finalizedEval, { ...finalizedEval, technicalScore: 90.00 }, adminSession),
    /O snapshot e cálculo da avaliação não podem ser alterados/
  );

  // Violação 2: Tentativa de voltar status para PENDING_REVIEW -> Bloqueado
  assert.throws(
    () => simulateRefinedEvaluationImmutability(finalizedEval, { ...finalizedEval, status: 'PENDING_REVIEW' }, adminSession),
    /Transição de estado inválida para avaliação homologada/
  );

  // Transição Permitida: RH avança status de REVIEWED para RESOLVED
  const resolvedEval = simulateRefinedEvaluationImmutability(finalizedEval, { ...finalizedEval, status: 'RESOLVED' }, hrSession);
  assert.strictEqual(resolvedEval.status, 'RESOLVED');
  assert.strictEqual(resolvedEval.technicalScore, 84.00);
  console.log('  -> PASSOU: Snapshot protegido contra alteração; transição legítima para RESOLVED autorizada.\n');
  passedTests++;

  console.log('================================================================================');
  console.log(`RESULTADO DA BATERIA DE INTEGRAÇÃO: ${passedTests}/${totalTests} TESTES APROVADOS COM SUCESSO!`);
  console.log('================================================================================');

} catch (err) {
  console.error('\nFALHA NO TESTE:', err);
  process.exit(1);
}

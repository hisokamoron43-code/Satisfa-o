// Testes da lógica pura de balanceamento e pontuação.
// Executar: npm run test:logic   (Node 22.6+)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkWeights, redistribute, buildPlan, buildMatrix, questionShares, sumActive, normalizeKey,
} from '../src/services/weightBalancer.ts';
import {
  questionConformity, categoryConformity, suggestRatings, validateQuestionConfig,
} from '../src/services/questionScoring.ts';

const W = (id, weight, extra = {}) => ({ id, key: id.toUpperCase(), name: id, weight, active: true, ...extra });
const base = () => [W('qual', 40), W('pont', 20), W('seg', 25), W('aten', 15)];
const sumUnits = (items) => items.filter(i => i.active).reduce((s, i) => s + Math.round(i.weight * 100), 0);

test('soma 100 é equilibrada; 99,99 não', () => {
  assert.equal(checkWeights(base()).isBalanced, true);
  const off = base(); off[0].weight = 39.99;
  const c = checkWeights(off);
  assert.equal(c.isBalanced, false);
  assert.equal(c.delta, 0.01);
});

test('sem categorias ativas nunca é equilibrado', () => {
  assert.equal(checkWeights([W('a', 100, { active: false })]).isBalanced, false);
});

test('redistribuição proporcional soma exatamente 100,00', () => {
  const items = base(); items[0].weight = 50; // total 110
  const r = redistribute(items, ['qual']);
  assert.equal(r.ok, true);
  assert.equal(sumUnits(r.items), 10000);
  assert.equal(r.items.find(i => i.id === 'qual').weight, 50);
  // restantes 50 repartidos na proporção 20:25:15 (=60)
  assert.deepEqual(r.items.filter(i => i.id !== 'qual').map(i => i.weight), [16.67, 20.83, 12.5]);
});

test('maior resto: 3 categorias iguais somam 100 exato', () => {
  const r = redistribute([W('a', 0), W('b', 0), W('c', 0)]);
  assert.equal(r.ok, true);
  assert.equal(sumUnits(r.items), 10000);
  assert.deepEqual(r.items.map(i => i.weight).sort(), [33.33, 33.33, 33.34]);
});

test('desativar uma categoria redistribui o seu peso pelas restantes', () => {
  const items = base(); items[3].active = false; // total ativo 85
  const r = redistribute(items);
  assert.equal(r.ok, true);
  assert.equal(sumUnits(r.items), 10000);
  assert.equal(r.items[3].weight, 15); // a inativa não é tocada
});

test('categoria bloqueada mantém o peso', () => {
  const items = base(); items[1].locked = true; items[2].weight = 40; // total 115
  const r = redistribute(items);
  assert.equal(r.items[1].weight, 20);
  assert.equal(sumUnits(r.items), 10000);
});

test('impossível: fixados somam mais de 100 -> pede ajuste manual', () => {
  const r = redistribute([W('a', 70, { locked: true }), W('b', 50, { locked: true }), W('c', 10)]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /mais do que 100/);
});

test('impossível: tudo fixado e soma diferente de 100', () => {
  const r = redistribute([W('a', 30, { locked: true }), W('b', 30, { locked: true })]);
  assert.equal(r.ok, false);
});

test('plano: equilibrado não propõe nada; desequilibrado propõe matriz que soma 100', () => {
  const saved = base();
  assert.equal(buildPlan(saved, base()).requiresAction, false);
  assert.equal(buildPlan(saved, base()).suggestion, null);

  const draft = base(); draft[0].weight = 50;
  const p = buildPlan(saved, draft, 'qual');
  assert.equal(p.requiresAction, true);
  assert.ok(p.suggestion);
  assert.equal(sumUnits(p.suggestion), 10000);
  assert.equal(Math.round(p.rows.reduce((s, r) => s + r.after, 0) * 100), 10000);
  assert.equal(p.rows.find(r => r.id === 'qual').status, 'CHANGED');
});

test('plano: adicionar categoria gera aviso estrutural e sugestão', () => {
  const saved = base();
  const draft = [...base(), W('amb', 0)];
  draft[4].weight = 10; // total 110
  const p = buildPlan(saved, draft, 'amb');
  assert.ok(p.alerts.some(a => a.kind === 'STRUCTURE_CHANGED'));
  assert.equal(p.rows.find(r => r.id === 'amb').status, 'ADDED');
  assert.equal(sumUnits(p.suggestion), 10000);
});

test('plano: categoria com peso e sem questões ativas gera aviso', () => {
  const qs = [{ id: 'q1', category: 'QUAL', active: true }];
  const p = buildPlan(base(), base(), undefined, qs);
  assert.ok(p.alerts.some(a => a.kind === 'NO_QUESTIONS' && /pont/.test(a.message)));
});

test('valor por questão: peso ÷ nº de questões ativas, filtrado por serviço', () => {
  const qs = [
    { id: '1', category: 'QUAL', active: true },
    { id: '2', category: 'QUAL', active: true, serviceId: 's1' },
    { id: '3', category: 'QUAL', active: true, serviceId: 's2' },
    { id: '4', category: 'QUAL', active: false },
  ];
  const all = questionShares(base(), qs).find(s => s.key === 'QUAL');
  assert.equal(all.questionCount, 3);
  const s1 = questionShares(base(), qs, 's1').find(s => s.key === 'QUAL');
  assert.equal(s1.questionCount, 2);
  assert.equal(s1.perQuestion, 20);
});

test('normalizeKey', () => {
  assert.equal(normalizeKey('Segurança'), 'SEGURANCA');
  assert.equal(normalizeKey(' Pontualidade '), 'PONTUALIDADE');
});

// ---------------- pontuação por tipo ----------------
test('estrelas e escalas', () => {
  assert.equal(questionConformity({ id: 'a', category: 'X', type: 'RATING_5' }, { rating: 4 }), 0.8);
  assert.equal(questionConformity({ id: 'a', category: 'X', type: 'RATING_10' }, { rating: 7 }), 0.7);
  assert.equal(questionConformity({ id: 'a', category: 'X', type: 'NPS_10' }, { rating: 0 }), 0);
  assert.equal(questionConformity({ id: 'a', category: 'X', type: 'RATING_5' }, { rating: 9 }), null);
  assert.equal(questionConformity({ id: 'a', category: 'X', type: 'RATING_5' }, undefined), null);
});

test('escolha única e múltipla com valores de conformidade', () => {
  const single = { id: 's', category: 'X', type: 'SINGLE_CHOICE', options: ['Sim', 'Parcial', 'Não'], optionScores: { Sim: 1, Parcial: 0.5, Não: 0 } };
  assert.equal(questionConformity(single, { choice: 'Parcial' }), 0.5);
  assert.equal(questionConformity(single, { choice: 'Outra' }), null);
  const multi = { id: 'm', category: 'X', type: 'MULTI_CHOICE', options: ['EPI', 'Sinalização', 'Limpeza'], optionScores: { EPI: 1, Sinalização: 1, Limpeza: 1 } };
  assert.ok(Math.abs(questionConformity(multi, { choices: ['EPI', 'Limpeza'] }) - 2 / 3) < 1e-9);
  assert.equal(questionConformity(multi, { choices: [] }), 0);
});

test('Sim/Não/N.A.: N.A. fica fora; impacto configurável', () => {
  const q = { id: 'y', category: 'X', type: 'YES_NO_NA', noScore: 0.2 };
  assert.equal(questionConformity(q, { yesNo: 'YES' }), 1);
  assert.equal(questionConformity(q, { yesNo: 'NO' }), 0.2);
  assert.equal(questionConformity(q, { yesNo: 'NA' }), null);
});

test('texto aberto, áudio e questões sem impacto não pontuam', () => {
  assert.equal(questionConformity({ id: 't', category: 'X', type: 'TEXT_ONLY' }, { textAnswer: 'ok' }), null);
  assert.equal(questionConformity({ id: 'au', category: 'X', type: 'AUDIO_AND_TEXT' }, { audioUrl: 'submissions/a.webm' }), null);
  assert.equal(questionConformity({ id: 'r', category: 'X', type: 'RATING_5', affectsScore: false }, { rating: 5 }), null);
});

test('nota sugerida por critério a partir das respostas', () => {
  const criteria = [
    { id: 'c1', categoryName: 'Qualidade', maxScore: 5, minScore: 0, active: true },
    { id: 'c2', categoryName: 'Segurança', maxScore: 5, minScore: 0, active: true },
    { id: 'c3', categoryName: 'Atendimento', maxScore: 5, minScore: 0, active: true },
  ];
  const qs = [
    { id: 'q1', category: 'QUALIDADE', type: 'RATING_5', active: true },
    { id: 'q2', category: 'QUALIDADE', type: 'RATING_5', active: true },
    { id: 'q3', category: 'SEGURANCA', type: 'YES_NO_NA', active: true },
    { id: 'q4', category: 'ATENDIMENTO', type: 'TEXT_ONLY', active: true },
  ];
  const ans = { q1: { rating: 5 }, q2: { rating: 3 }, q3: { yesNo: 'YES' }, q4: { textAnswer: 'bom' } };
  const r = suggestRatings(criteria, qs, ans);
  assert.equal(r.c1, 4);   // média (1 + 0.6)/2 = 0.8 -> 4,0
  assert.equal(r.c2, 5);
  assert.equal(r.c3, undefined); // só texto: sem sugestão numérica
});

test('serviços: questões de outro serviço não contam', () => {
  const qs = [
    { id: 'q1', category: 'QUALIDADE', type: 'RATING_5', active: true, serviceId: 's1' },
    { id: 'q2', category: 'QUALIDADE', type: 'RATING_5', active: true, serviceId: 's2' },
  ];
  const c = categoryConformity(qs, { q1: { rating: 5 }, q2: { rating: 1 } }, 's1');
  assert.equal(c.QUALIDADE.ratio, 1);
  assert.equal(c.QUALIDADE.total, 1);
});

test('validação de configuração', () => {
  assert.ok(validateQuestionConfig({ id: 'a', category: 'X', type: 'SINGLE_CHOICE', options: ['A'] }).length > 0);
  assert.ok(validateQuestionConfig({ id: 'a', category: 'X', type: 'SINGLE_CHOICE', options: ['A', 'B'] }).length > 0); // sem valores
  assert.equal(validateQuestionConfig({ id: 'a', category: 'X', type: 'SINGLE_CHOICE', options: ['A', 'B'], optionScores: { A: 1, B: 0 } }).length, 0);
  assert.ok(validateQuestionConfig({ id: 'a', category: 'X', type: 'SINGLE_CHOICE', options: ['A', 'a'], optionScores: { A: 1 } }).length > 0);
});

// ---------- Pontuação 80/20 (regras 1004) ----------
import { calculateFinalScore } from '../src/services/finalScore.ts';

const CRIT = [
  { id: 'qual', categoryName: 'Qualidade', weightPercentage: 40, maxScore: 5, minScore: 0, active: true },
  { id: 'pont', categoryName: 'Pontualidade', weightPercentage: 20, maxScore: 5, minScore: 0, active: true },
  { id: 'seg', categoryName: 'Segurança', weightPercentage: 25, maxScore: 5, minScore: 0, active: true },
  { id: 'aten', categoryName: 'Atendimento', weightPercentage: 15, maxScore: 5, minScore: 0, active: true },
];
const ALL = { qual: 0.8, pont: 0.8, seg: 1, aten: 0.3 }; // automático = 80 × 77,5 / 100 = 62

test('80/20: sem áudio gravado, 10 pontos automáticos; com comentário decidido com 0 → 72', () => {
  const r = calculateFinalScore({ criteria: CRIT, conformity: ALL, hasAudio: false, hasWritten: false, argumentScore: 0, passingThreshold: 70 });
  assert.equal(r.success, true);
  assert.equal(r.automaticPoints, 62);
  assert.equal(r.audioPoints, 10);
  assert.equal(r.finalScore, 72);
});

test('80/20: sem comentário, o analisador atribui os 10 pontos → 82', () => {
  const r = calculateFinalScore({ criteria: CRIT, conformity: ALL, hasAudio: false, hasWritten: false, argumentScore: 5, passingThreshold: 70 });
  assert.equal(r.argumentPoints, 10);
  assert.equal(r.finalScore, 82);
});

test('80/20: sem comentário não há nota parcial', () => {
  const r = calculateFinalScore({ criteria: CRIT, conformity: ALL, hasAudio: false, hasWritten: false, argumentScore: 3, passingThreshold: 70 });
  assert.equal(r.success, false);
  assert.match(r.errors[0], /tudo ou nada/);
});

test('80/20: sem comentário exige a decisão do analisador', () => {
  const r = calculateFinalScore({ criteria: CRIT, conformity: ALL, hasAudio: false, hasWritten: false, passingThreshold: 70 });
  assert.equal(r.success, false);
  assert.match(r.errors[0], /não escreveu comentário/);
});

test('80/20: áudio 4/5 e argumentos 3,5/5 somam 8 e 7 → 77', () => {
  const r = calculateFinalScore({ criteria: CRIT, conformity: ALL, hasAudio: true, audioScore: 4, hasWritten: true, argumentScore: 3.5, passingThreshold: 70 });
  assert.equal(r.audioPoints, 8);
  assert.equal(r.argumentPoints, 7);
  assert.equal(r.finalScore, 77);
  assert.equal(r.finalClassification, 'POSITIVE');
});

test('80/20: áudio gravado sem nota do analisador é recusado', () => {
  const r = calculateFinalScore({ criteria: CRIT, conformity: ALL, hasAudio: true, hasWritten: true, argumentScore: 5, passingThreshold: 70 });
  assert.equal(r.success, false);
  assert.match(r.errors[0], /Falta classificar o áudio/);
});

test('80/20: máximo absoluto é 100', () => {
  const r = calculateFinalScore({ criteria: CRIT, conformity: { qual: 1, pont: 1, seg: 1, aten: 1 }, hasAudio: true, audioScore: 5, hasWritten: true, argumentScore: 5, passingThreshold: 70 });
  assert.equal(r.finalScore, 100);
});

test('80/20: critério sem respostas fica de fora e os pesos reescalam-se', () => {
  const r = calculateFinalScore({ criteria: CRIT, conformity: { qual: 1 }, hasAudio: false, hasWritten: false, argumentScore: 0, passingThreshold: 70 });
  assert.equal(r.automaticPoints, 80);
  assert.equal(r.applicableWeight, 40);
});

test('80/20: pesos errados e notas fora de 0–5 são recusados', () => {
  assert.equal(calculateFinalScore({ criteria: CRIT, conformity: ALL, hasAudio: true, audioScore: 6, hasWritten: true, argumentScore: 1, passingThreshold: 70 }).success, false);
  const bad = CRIT.map((c) => (c.id === 'qual' ? { ...c, weightPercentage: 30 } : c));
  const r = calculateFinalScore({ criteria: bad, conformity: ALL, hasAudio: false, hasWritten: false, argumentScore: 0, passingThreshold: 70 });
  assert.equal(r.success, false);
  assert.match(r.errors[0], /soma atual: 90/);
});

test('80/20: sem nenhuma resposta pontuável não há cálculo', () => {
  const r = calculateFinalScore({ criteria: CRIT, conformity: {}, hasAudio: false, hasWritten: false, argumentScore: 0, passingThreshold: 70 });
  assert.equal(r.success, false);
});

// ---------- Importação de clientes em lote ----------
import { parseCsv, analyzeClientImport, parseImportDate, clientCsvTemplate, CLIENT_IMPORT_BATCH_SIZE } from '../src/services/clientImport.ts';

test('importação: CSV com ponto e vírgula, aspas e quebra de linha dentro das aspas', () => {
  const m = parseCsv('Nome da empresa;Notas\n"Empresa, Lda";"linha 1\nlinha 2"\n');
  assert.deepEqual(m, [['Nome da empresa', 'Notas'], ['Empresa, Lda', 'linha 1\nlinha 2']]);
});

test('importação: só o nome é obrigatório; o resto é opcional', () => {
  const a = analyzeClientImport([['Nome da empresa', 'NIF', 'Pessoa de contacto'], ['Só Nome Lda', '', '']], []);
  assert.equal(a.rows[0].valid, true);
  assert.equal(a.rows[0].data.companyName, 'Só Nome Lda');
  assert.equal(a.rows[0].data.nif, undefined);
  assert.match(a.rows[0].data.internalCode, /^CLI-/);
});

test('importação: nome em falta é recusado e sem coluna de nome o ficheiro não é aceite', () => {
  const a = analyzeClientImport([['Nome da empresa'], ['']], []);
  assert.equal(a.rows[0].valid, false);
  assert.match(a.rows[0].errors[0], /obrigatório/);
  assert.match(analyzeClientImport([['NIF'], ['5417123456']], []).fatal, /Nome da empresa/);
});

test('importação: NIF inválido, e-mail inválido e datas (formato e ordem) são assinalados', () => {
  const a = analyzeClientImport([
    ['Nome da empresa', 'NIF', 'E-mail', 'Início do contrato', 'Fim do contrato'],
    ['A Lda', '12', 'xx', '2026-01-01', '2026-12-31'],
    ['B Lda', '', '', '31/12/2026', '01/01/2026'],
    ['C Lda', '', '', '2026-02-30', ''],
  ], []);
  assert.equal(a.rows[0].valid, false);
  assert.equal(a.rows[0].errors.length, 2);
  assert.match(a.rows[1].errors[0], /anterior/);
  assert.match(a.rows[2].errors[0], /inválida/);
});

test('importação: duplicados contra a base de dados e dentro do próprio ficheiro', () => {
  const a = analyzeClientImport([
    ['Nome da empresa', 'NIF'],
    ['Cliente Antigo', ''],
    ['Novo Cliente', '5417000001'],
    ['novo  cliente', ''],
    ['Outro', '5417000001'],
  ], [{ companyName: 'cliente antigo', nif: undefined, internalCode: 'X' }]);
  assert.equal(a.rows[0].valid, false);
  assert.equal(a.rows[1].valid, true);
  assert.equal(a.rows[2].valid, false);
  assert.equal(a.rows[3].valid, false);
});

test('importação: datas aceites e rejeitadas', () => {
  assert.equal(parseImportDate('5/3/2026'), '2026-03-05');
  assert.equal(parseImportDate('2026-03-05'), '2026-03-05');
  assert.equal(parseImportDate('31/02/2026'), null);
});

test('importação: modelo CSV e tamanho do lote', () => {
  const back = analyzeClientImport(parseCsv(clientCsvTemplate()), []);
  assert.equal(back.fatal, undefined);
  assert.equal(back.rows[0].valid, true);
  assert.equal(back.rows[0].data.contractedServices.length, 2);
  assert.equal(CLIENT_IMPORT_BATCH_SIZE, 40);
});

// ---------- Indicadores da empresa ----------
import { companyKpis, presetRange, previousRange, toTime } from '../src/services/companyKpis.ts';

const NOW = new Date('2026-11-12T12:00:00');
const ev = (o) => ({ id: o.id, reference: o.id, clientName: 'Cliente A', providerName: 'Tec A', teamName: 'Equipa 1', satisfactionRating: 5, npsScore: 10, evaluationDate: '2026-11-10', serviceDate: '2026-11-09', status: 'REVIEWED', requiresFollowUp: false, correctiveActionStatus: 'NOT_NEEDED', ...o });

test('indicadores: CSAT, NPS, variação face ao período anterior e homologação', () => {
  const data = {
    evaluations: [
      ev({ id: 'a', satisfactionRating: 5, npsScore: 10, finalizedAt: '2026-11-11', finalClassification: 'POSITIVE' }),
      ev({ id: 'b', satisfactionRating: 2, npsScore: 3, finalizedAt: '2026-11-15', finalClassification: 'NEGATIVE' }),
      ev({ id: 'c', satisfactionRating: 4, npsScore: 9, evaluationDate: '2026-10-20', finalizedAt: '2026-10-21' }),
    ],
    clients: [], teams: [], providers: [], activities: [], hrCases: [], goals: [],
  };
  // Período explícito: 1 a 12 de novembro. A avaliação de 20 de outubro fica no período anterior.
  const range = { from: new Date('2026-11-01T00:00:00'), to: new Date('2026-11-12T23:59:59') };
  const k = companyKpis(data, range, NOW);
  assert.equal(k.evaluations.total, 2);
  assert.equal(k.evaluations.csat, 50);            // avaliações 5 e 2
  assert.equal(k.evaluations.previousTotal, 1);
  assert.equal(k.evaluations.previousCsat, 100);   // avaliação 4 do período anterior
  assert.equal(k.evaluations.homologated, 2);
  assert.equal(k.evaluations.avgHomologationDays, 3);     // 1 dia e 5 dias
  assert.equal(k.evaluations.onTimeHomologationPct, 50);  // só uma dentro de 3 dias
  assert.equal(k.evaluations.positiveRate, 50);
});

test('indicadores: contratos expirados e a expirar em 30/60/90 dias', () => {
  const day = (n) => new Date(NOW.getTime() + n * 86400000).toISOString().slice(0, 10);
  const c = (id, end, status = 'ACTIVE') => ({ id, companyName: id, internalCode: id, contactPerson: '', email: '', phone: '', contractedServices: [], status, createdAt: '2026-01-01', contractEnd: end });
  const k = companyKpis({ evaluations: [], teams: [], providers: [], activities: [], hrCases: [], goals: [], clients: [
    c('exp', day(-3)), c('d20', day(20)), c('d45', day(45)), c('d80', day(80)), c('longo', day(400)), c('inativo', day(-3), 'INACTIVE'), c('sem'),
  ] }, presetRange('30D', NOW), NOW);
  assert.equal(k.clients.expired, 1);
  assert.equal(k.clients.expiringIn30, 1);
  assert.equal(k.clients.expiringIn60, 1);
  assert.equal(k.clients.expiringIn90, 1);
  assert.equal(k.clients.withoutContract, 1);
  assert.equal(k.clients.inactive, 1);
  assert.ok(k.alerts.some(a => a.level === 'critical' && /expirado/.test(a.text)));
});

test('indicadores: alerta de CSAT em queda e de avaliações por homologar há mais de 7 dias', () => {
  const data = {
    evaluations: [
      ev({ id: '1', satisfactionRating: 2, evaluationDate: '2026-11-10' }),
      ev({ id: '2', satisfactionRating: 2, evaluationDate: '2026-11-09' }),
      ev({ id: '3', satisfactionRating: 2, evaluationDate: '2026-11-08' }),
      ev({ id: '4', satisfactionRating: 5, evaluationDate: '2026-10-20' }),
      ev({ id: '5', satisfactionRating: 5, evaluationDate: '2026-10-21' }),
      ev({ id: '6', satisfactionRating: 5, evaluationDate: '2026-10-22' }),
      ev({ id: '7', evaluationDate: '2026-11-01' }),
    ],
    clients: [], teams: [], providers: [], activities: [], hrCases: [], goals: [],
  };
  const k = companyKpis(data, { from: new Date('2026-11-01T00:00:00'), to: new Date('2026-11-12T23:59:59') }, NOW);
  assert.ok(k.alerts.some(a => a.level === 'critical' && /CSAT desceu/.test(a.text)));
  assert.ok(k.alerts.some(a => /por homologar há mais de 7 dias/.test(a.text)));
});

test('indicadores: equipas e funcionários agregam as avaliações do período', () => {
  const data = {
    evaluations: [
      ev({ id: '1', teamName: 'Equipa Alfa', providerName: 'Tec X', satisfactionRating: 5 }),
      ev({ id: '2', teamName: 'Equipa Alfa', providerName: 'Tec X', satisfactionRating: 4 }),
      ev({ id: '3', teamName: 'Equipa Beta', providerName: 'Tec Y', satisfactionRating: 1 }),
    ],
    clients: [], providers: [], activities: [], hrCases: [], goals: [],
    teams: [{ id: 't1', name: 'Equipa Alfa', code: 'A', department: 'Operações', status: 'ACTIVE', membersCount: 0, createdAt: '2026-01-01' }],
  };
  const k = companyKpis(data, presetRange('30D', NOW), NOW);
  const alfa = k.teams.find(t => t.name === 'Equipa Alfa');
  assert.equal(alfa.evaluations, 2);
  assert.equal(alfa.csat, 100);
  assert.equal(k.providers.ranking[0].name, 'Tec X');
  assert.equal(k.trend.length, 12);
});

test('indicadores: intervalos de período são consistentes', () => {
  const r = presetRange('30D', NOW);
  const p = previousRange(r);
  assert.ok(p.to.getTime() < r.from.getTime());
  assert.equal(toTime('2026-11-12'), new Date('2026-11-12T00:00:00').getTime());
});

test('indicadores: sem período anterior com dados não há alerta de subida falsa', () => {
  const data = {
    evaluations: [ev({ id: '1', satisfactionRating: 5, evaluationDate: '2026-11-10' }), ev({ id: '2', satisfactionRating: 5, evaluationDate: '2026-11-09' }), ev({ id: '3', satisfactionRating: 4, evaluationDate: '2026-11-08' })],
    clients: [], teams: [], providers: [], activities: [], hrCases: [], goals: [],
  };
  const k = companyKpis(data, { from: new Date('2026-11-01T00:00:00'), to: new Date('2026-11-12T23:59:59') }, NOW);
  assert.ok(!k.alerts.some(a => /CSAT subiu/.test(a.text)));
});

// ---------- Limite de tempo nos pedidos de autenticação ----------
import { withTimeout } from '../src/services/withTimeout.ts';

test('pedidos: devolvem o resultado quando respondem a tempo', async () => {
  const v = await withTimeout(Promise.resolve(42), 1000, 'testar');
  assert.equal(v, 42);
});

test('pedidos: sem resposta, falham com mensagem clara em vez de ficarem pendentes', async () => {
  const never = new Promise(() => {});
  await assert.rejects(withTimeout(never, 20, 'iniciar sessão'), /Tempo esgotado ao iniciar sessão/);
});

// ───────── Correspondência de empresas pelo nome escrito pelo cliente ─────────
import { procurarEmpresa, normalizarEmpresa } from '../src/services/clientMatching.ts';
import { prestadorRecebeNota, avaliacoesDoPrestador, destinatariosDaNota } from '../src/services/grupoAvaliacao.ts';
import { traduzirErro } from '../src/services/mensagensErro.ts';

const EMPRESAS = [
  { id: '1', companyName: 'Sonangol E.P.', internalCode: 'CLI-A1', status: 'ACTIVE' },
  { id: '2', companyName: 'Unitel S.A.', internalCode: 'CLI-B2', status: 'ACTIVE' },
  { id: '3', companyName: 'Banco de Fomento Angola', internalCode: 'CLI-C3', status: 'ACTIVE' },
  { id: '4', companyName: 'Banco BAI', internalCode: 'CLI-D4', status: 'ACTIVE' },
  { id: '5', companyName: 'Mota-Engil Angola, Lda', internalCode: 'CLI-E5', status: 'ACTIVE' },
  { id: '6', companyName: 'Empresa Antiga SA', internalCode: 'CLI-F6', status: 'INACTIVE' },
];

test('empresa: ignora maiúsculas, acentos e formas jurídicas', () => {
  assert.equal(normalizarEmpresa('  SONÂNGOL, E.P. '), 'sonangol ep');
  const r = procurarEmpresa('SONANGOL EP', EMPRESAS);
  assert.equal(r.status, 'EXACT');
  assert.equal(r.best.client.id, '1');
});

test('empresa: abreviação e erro de escrita associam automaticamente', () => {
  assert.equal(procurarEmpresa('sonangol', EMPRESAS).best.client.id, '1');
  assert.equal(procurarEmpresa('sonangol', EMPRESAS).status, 'AUTO');
  assert.equal(procurarEmpresa('unitell', EMPRESAS).best.client.id, '2');
  assert.equal(procurarEmpresa('Banco Fomento', EMPRESAS).best.client.id, '3');
  assert.equal(procurarEmpresa('mota engil', EMPRESAS).best.client.id, '5');
});

test('empresa: nome ambíguo só sugere, nunca associa sozinho', () => {
  const r = procurarEmpresa('Banco', EMPRESAS);
  assert.equal(r.status, 'SUGGEST');
  assert.ok(r.candidates.length >= 2);
});

test('empresa: sem parecença, empresas inativas e código interno', () => {
  assert.equal(procurarEmpresa('Empresa XPTO', EMPRESAS).status, 'NONE');
  assert.equal(procurarEmpresa('empresa antiga', EMPRESAS).status, 'NONE'); // inativa
  assert.equal(procurarEmpresa('CLI-C3', EMPRESAS).best.client.id, '3');
  assert.equal(procurarEmpresa('', EMPRESAS).status, 'NONE');
});

// ───────── Nota para o grupo ─────────
const EQUIPAS = [{ id: 't1', supervisorProviderId: 'sup' }, { id: 't2', supervisorProviderId: undefined }];
const PREST = [
  { id: 'a', name: 'Ana', teamId: 't1', status: 'ACTIVE' },
  { id: 'b', name: 'Bruno', teamId: 't1', status: 'ACTIVE' },
  { id: 'sup', name: 'Chefe', teamId: undefined, status: 'ACTIVE' },
  { id: 'c', name: 'Carla', teamId: 't2', status: 'ACTIVE' },
  { id: 'd', name: 'Duarte', teamId: 't1', status: 'INACTIVE' },
];

test('nota do grupo: membros da equipa e supervisor recebem, outras equipas não', () => {
  const ev = { providerId: 'a', teamId: 't1' };
  const ids = destinatariosDaNota(ev, PREST, EQUIPAS).map(p => p.id).sort();
  assert.deepEqual(ids, ['a', 'b', 'sup']); // Carla (outra equipa) e Duarte (inativo) ficam de fora
  assert.equal(prestadorRecebeNota(ev, PREST[3], EQUIPAS), false);
});

test('nota do grupo: sem equipa só conta para o prestador atribuído', () => {
  const ev = { providerId: 'c', teamId: undefined };
  assert.deepEqual(destinatariosDaNota(ev, PREST, EQUIPAS).map(p => p.id), ['c']);
  assert.equal(avaliacoesDoPrestador([ev, { providerId: 'x', teamId: 't1' }], PREST[0], EQUIPAS).length, 1);
});

// ───────── Mensagens de erro em português ─────────
test('erros: códigos e textos técnicos passam a português claro', () => {
  assert.match(traduzirErro({ code: '23505', message: 'duplicate key', details: 'Key (company_name)=(ACME) already exists.' }), /nome da empresa/);
  assert.match(traduzirErro({ code: '23503', message: 'update or delete on table "clients" violates foreign key', details: 'Key (id)=(1) is still referenced from table "evaluations".' }), /ainda está associado/);
  assert.match(traduzirErro({ code: '23502', message: 'null value in column "email" violates not-null constraint' }), /e-mail/);
  assert.match(traduzirErro({ message: 'Invalid login credentials' }), /Credenciais inválidas/);
  assert.match(traduzirErro(new TypeError('Failed to fetch')), /Sem ligação ao servidor/);
  assert.match(traduzirErro({ message: 'new row violates row-level security policy for table "clients"' }), /permissão/);
});

test('erros: mensagens já em português mantêm-se e o padrão é usado sem informação', () => {
  assert.equal(traduzirErro({ message: 'Avaliação não encontrada.' }), 'Avaliação não encontrada.');
  assert.equal(traduzirErro(null, 'Falha ao guardar.'), 'Falha ao guardar.');
});

// ───────── Importação de clientes a partir de PDF ─────────
import { extrairClientesDeItens } from '../src/services/pdfClientesExtracao.ts';

// Fragmento de texto na posição (x, y) da página `p` (letra de 8 pt; y maior = mais acima)
const it = (str, x, y, p = 1) => ({ str, x, y, w: str.length * 4, h: 8, pagina: p });
const cabecalho = (y, p) => [it('Código', 30, y, p), it('Empresa', 90, y, p), it('NIF', 230, y, p), it('E-mail', 300, y, p), it('Estado', 420, y, p)];

test('pdf: tabela em duas páginas, cabeçalho repetido, texto quebrado e rodapé', () => {
  const itens = [
    it('Lista de clientes', 30, 800), ...cabecalho(760, 1),
    it('CLI-1', 30, 740), it('Alfa Lda', 90, 740), it('5417000111', 230, 740), it('alfa@alfa.ao', 300, 740), it('Ativo', 420, 740),
    // nome que quebra em duas linhas (espaçamento menor do que entre clientes)
    it('CLI-2', 30, 715), it('Beta Serviços e Comércio', 90, 715), it('Geral Limitada', 90, 706), it('—', 230, 715), it('—', 300, 715), it('Inativo', 420, 715),
    it('Página 1 de 2', 250, 20),
    ...cabecalho(760, 2),
    it('CLI-3', 30, 740, 2), it('Gama SA', 90, 740, 2), it('abc', 230, 740, 2), it('gama@gama', 300, 740, 2), it('Ativo', 420, 740, 2),
    it('Página 2 de 2', 250, 20, 2),
  ];
  const r = extrairClientesDeItens(itens, 2);
  assert.equal(r.modo, 'TABELA');
  assert.equal(r.matriz.length, 4); // cabeçalho + 3 clientes
  assert.equal(r.matriz[2][1], 'Beta Serviços e Comércio Geral Limitada');
  assert.equal(r.matriz[2][2], ''); // «—» passa a vazio
  assert.deepEqual(r.rotulos, ['Cabeçalho', 'Pág. 1 · linha 1', 'Pág. 1 · linha 2', 'Pág. 2 · linha 1']);

  const a = analyzeClientImport(r.matriz, []);
  assert.equal(a.rows[0].valid, true);
  assert.equal(a.rows[1].valid, true);   // só o nome é obrigatório
  assert.equal(a.rows[2].valid, false);  // NIF «abc» e e-mail inválidos, com o motivo
  assert.match(a.rows[2].errors.join(' '), /NIF/);
});

test('pdf: fichas «Campo: valor» e mensagens quando não há clientes', () => {
  const ficha = (n, y0) => [it(`Empresa: ${n}`, 30, y0), it('NIF: 5417000111', 30, y0 - 12), it('E-mail: x@y.ao', 30, y0 - 24)];
  const r = extrairClientesDeItens([...ficha('Alfa', 700), ...ficha('Beta', 600)], 1);
  assert.equal(r.modo, 'FICHAS');
  assert.equal(r.matriz.length, 3);
  assert.equal(r.matriz[2][0], 'Beta');

  assert.match(extrairClientesDeItens([], 1).fatal, /digitalizad/);
  assert.match(extrairClientesDeItens([it('Relatório de vendas', 30, 700)], 1).fatal, /Não encontrei clientes/);
});

// ───────── Notas da empresa: total, média geral e por serviço ─────────
import { resumirNotas, resumoPorServico, servicosDaAvaliacao } from '../src/services/clienteNotas.ts';

const SERVICOS = [{ id: 's1', name: 'Limpeza' }, { id: 's2', name: 'Segurança' }];
const avalia = (o) => ({ id: Math.random().toString(), satisfactionRating: 4, serviceName: '', ...o });

test('notas da empresa: total, média geral e positivas/negativas', () => {
  const r = resumirNotas([
    avalia({ technicalScore: 90, finalClassification: 'POSITIVE', finalizedAt: 'x', satisfactionRating: 5 }),
    avalia({ technicalScore: 70, finalClassification: 'NEGATIVE', finalizedAt: 'x', satisfactionRating: 3 }),
    avalia({}), // ainda não homologada: conta no total, não entra na média
  ]);
  assert.equal(r.total, 3);
  assert.equal(r.homologadas, 2);
  assert.equal(r.mediaNota, 80);
  assert.equal(r.positivas, 1);
  assert.equal(r.negativas, 1);
  assert.equal(r.mediaSatisfacao, 4);
  assert.equal(resumirNotas([]).mediaNota, null);
});

test('notas da empresa: separação por tipo de serviço', () => {
  const lista = [
    avalia({ serviceId: 's1', serviceName: 'Limpeza', technicalScore: 90, finalizedAt: 'x', finalClassification: 'POSITIVE' }),
    avalia({ serviceId: 's1', serviceName: 'Limpeza', technicalScore: 70, finalizedAt: 'x', finalClassification: 'NEGATIVE' }),
    avalia({ serviceId: 's2', serviceName: 'Segurança', technicalScore: 60, finalizedAt: 'x', finalClassification: 'NEGATIVE' }),
    avalia({ serviceName: 'Jardinagem', technicalScore: 100, finalizedAt: 'x', finalClassification: 'POSITIVE' }), // serviço fora da lista
  ];
  const { servicos, temAvaliacoesComVariosServicos } = resumoPorServico(lista, SERVICOS);
  assert.equal(temAvaliacoesComVariosServicos, false);
  assert.deepEqual(servicos.map(s => [s.nome, s.total, s.mediaNota]), [['Limpeza', 2, 80], ['Jardinagem', 1, 100], ['Segurança', 1, 60]]);
});

test('notas da empresa: avaliação com vários serviços conta em cada um', () => {
  const e = avalia({ serviceId: 's1', serviceName: 'Limpeza', serviceTypesProvided: ['Limpeza', 'segurança'], technicalScore: 85, finalizedAt: 'x' });
  assert.deepEqual(servicosDaAvaliacao(e, SERVICOS).map(s => s.chave).sort(), ['s1', 's2']);
  const r = resumoPorServico([e], SERVICOS);
  assert.equal(r.temAvaliacoesComVariosServicos, true);
  assert.equal(r.servicos.every(s => s.total === 1 && s.mediaNota === 85), true);
  assert.equal(servicosDaAvaliacao(avalia({}), SERVICOS)[0].nome, 'Serviço não indicado');
});

// ───────── Privacidade do nome da empresa face aos avaliados ─────────
import { nomeEmpresaParaAvaliados, ocultarEmpresaNoTexto } from '../src/services/privacidadeEmpresa.ts';

test('privacidade: o nome só aparece se o avaliador o permitiu', () => {
  assert.equal(nomeEmpresaParaAvaliados('Sonangol E.P.', true), 'Sonangol E.P.');
  assert.equal(nomeEmpresaParaAvaliados('Sonangol E.P.', false), 'Empresa não revelada');
  assert.equal(nomeEmpresaParaAvaliados('Sonangol E.P.', undefined), 'Empresa não revelada');
});

test('privacidade: o nome da empresa é retirado dos textos partilhados', () => {
  assert.equal(
    ocultarEmpresaNoTexto('Na SONANGOL E.P. o serviço foi bom. Obrigado, sonângol!', 'Sonangol E.P.'),
    'Na [empresa] o serviço foi bom. Obrigado, [empresa]!');
  assert.equal(ocultarEmpresaNoTexto('Sem nada a esconder.', 'Unitel S.A.'), 'Sem nada a esconder.');
  assert.equal(ocultarEmpresaNoTexto('Texto', ''), 'Texto');
});

// ───────── Barra de acesso rápido do telemóvel ─────────
import { pagesAvailable, resolveShortcuts, moveItem, MAX_SHORTCUTS } from '../src/lib/bottomNavPrefs.ts';

const CATALOGO = ['dashboard', 'clients', 'evaluations', 'hr', 'messages', 'my_team', 'settings'];

test('barra móvel: só oferece páginas permitidas (administrador vê todas)', () => {
  assert.deepEqual(pagesAvailable(CATALOGO, ['messages', 'my_team'], false), ['messages', 'my_team']);
  assert.deepEqual(pagesAvailable(CATALOGO, [], true), CATALOGO);
  assert.deepEqual(pagesAvailable(CATALOGO, [], false), []);
});

test('barra móvel: padrão, escolha guardada e permissões retiradas', () => {
  const disp = pagesAvailable(CATALOGO, ['dashboard', 'evaluations', 'messages', 'my_team', 'clients'], false);
  assert.deepEqual(resolveShortcuts(disp, null), ['dashboard', 'evaluations', 'my_team']);   // 3 por defeito
  assert.deepEqual(resolveShortcuts(disp, ['messages', 'clients']), ['messages', 'clients']);
  // «hr» deixou de ser permitido, repetidos e desconhecidos saem, máximo respeitado
  assert.deepEqual(resolveShortcuts(disp, ['hr', 'messages', 'messages', 'x', 'clients', 'dashboard', 'evaluations', 'my_team']).length, MAX_SHORTCUTS);
  assert.deepEqual(resolveShortcuts(disp, ['hr', 'messages', 'messages']), ['messages']);
  assert.deepEqual(resolveShortcuts(disp, []), []);
});

test('barra móvel: reordenar atalhos', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 1, -1), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c']);
});

// ---------------------------------------------------------------------------------------------
// Participação na nota: histórico da equipa + escala do calendário (migração 1015)
// ---------------------------------------------------------------------------------------------
import {
  pertencia, membrosNaData, atividadeDaAvaliacao, participantesDaAvaliacao, repartirPesos,
} from '../src/services/grupoAvaliacao.ts';

const T = 'team-1';
const prov = (id, teamId = T) => ({ id, name: id, teamId, status: 'ACTIVE' });
const equipa = [{ id: T, supervisorProviderId: undefined }];
const hist = (providerId, joinedAt, leftAt = null, teamId = T) => ({ providerId, teamId, joinedAt, leftAt });
const evTeam = (extra = {}) => ({ id: 'e1', teamId: T, serviceDate: '2026-10-10', providerId: undefined, ...extra });
const acts = (assigned, extra = {}) => [{ id: 'a1', teamId: T, activityDate: '2026-10-10', assignedProviderIds: assigned, status: 'COMPLETED', ...extra }];

test('repartirPesos soma sempre exatamente 100,00', () => {
  for (const n of [1, 2, 3, 4, 6, 7, 9, 11]) {
    const soma = repartirPesos(n).reduce((s, x) => s + Math.round(x * 100), 0);
    assert.equal(soma, 10000, `n=${n}`);
  }
  assert.deepEqual(repartirPesos(3), [33.34, 33.33, 33.33]);
  assert.deepEqual(repartirPesos(0), []);
});

test('pertencia: entrada e saída inclusivas, antes da entrada não conta', () => {
  const h = [hist('m', '2026-10-05', '2026-10-20')];
  assert.equal(pertencia(h, 'm', T, '2026-10-04'), false);
  assert.equal(pertencia(h, 'm', T, '2026-10-05'), true);
  assert.equal(pertencia(h, 'm', T, '2026-10-20'), true);
  assert.equal(pertencia(h, 'm', T, '2026-10-21'), false);
  assert.equal(pertencia(h, 'm', 'outra', '2026-10-10'), false);
});

test('membro adicionado depois do serviço não recebe a nota (entrou depois)', () => {
  const providers = [prov('a'), prov('b'), prov('novo')];
  const historico = [hist('a', '2026-01-01'), hist('b', '2026-01-01'), hist('novo', '2026-10-15')];
  const p = participantesDaAvaliacao(evTeam(), providers, equipa, { historico, atividades: [] });
  const novo = p.find(x => x.providerId === 'novo');
  assert.equal(novo.conta, false);
  assert.equal(novo.motivo, 'ENTROU_DEPOIS');
  assert.equal(novo.peso, 0);
  assert.deepEqual(p.filter(x => x.conta).map(x => x.providerId), ['a', 'b']);
  assert.deepEqual(p.filter(x => x.conta).map(x => x.peso), [50, 50]);
});

test('4 membros, só 2 escalados: os outros 2 ficam de fora e os pesos repartem-se pelos 2 presentes', () => {
  const providers = [prov('a'), prov('b'), prov('c'), prov('d')];
  const historico = providers.map(p => hist(p.id, '2026-01-01'));
  const ctx = { historico, atividades: acts(['a', 'c']) };
  const p = participantesDaAvaliacao(evTeam(), providers, equipa, ctx);
  assert.deepEqual(p.filter(x => x.conta).map(x => [x.providerId, x.motivo, x.peso]), [['a', 'ESCALADO', 50], ['c', 'ESCALADO', 50]]);
  assert.deepEqual(p.filter(x => !x.conta).map(x => [x.providerId, x.motivo]), [['b', 'NAO_ESCALADO'], ['d', 'NAO_ESCALADO']]);
});

test('3 escalados de 4: pesos somam 100 (33,34 / 33,33 / 33,33)', () => {
  const providers = [prov('a'), prov('b'), prov('c'), prov('d')];
  const historico = providers.map(p => hist(p.id, '2026-01-01'));
  const p = participantesDaAvaliacao(evTeam(), providers, equipa, { historico, atividades: acts(['a', 'b', 'd']) });
  const pesos = p.filter(x => x.conta).map(x => Math.round(x.peso * 100));
  assert.equal(pesos.reduce((s, x) => s + x, 0), 10000);
  assert.deepEqual(pesos.slice().sort(), [3333, 3333, 3334]);
});

test('sem escala no calendário conta toda a equipa que lá estava na data', () => {
  const providers = [prov('a'), prov('b'), prov('novo')];
  const historico = [hist('a', '2026-01-01'), hist('b', '2026-01-01'), hist('novo', '2026-11-01')];
  const p = participantesDaAvaliacao(evTeam(), providers, equipa, { historico, atividades: [] });
  assert.deepEqual(p.filter(x => x.conta).map(x => [x.providerId, x.motivo]), [['a', 'SEM_ESCALA'], ['b', 'SEM_ESCALA']]);
});

test('quem saiu da equipa mantém as notas de quando lá estava e não recebe as seguintes', () => {
  const providers = [prov('a'), prov('saiu', undefined)];
  const historico = [hist('a', '2026-01-01'), hist('saiu', '2026-01-01', '2026-10-12')];
  const antes = participantesDaAvaliacao(evTeam({ serviceDate: '2026-10-10' }), providers, equipa, { historico, atividades: [] });
  assert.equal(antes.find(x => x.providerId === 'saiu').conta, true);
  const depois = participantesDaAvaliacao(evTeam({ serviceDate: '2026-10-13' }), providers, equipa, { historico, atividades: [] });
  assert.equal(depois.find(x => x.providerId === 'saiu').conta, false);
});

test('prestador atribuído conta sempre; supervisor segue a escala', () => {
  const providers = [prov('a'), prov('b'), prov('sup', undefined), prov('extra', undefined)];
  const historico = [hist('a', '2026-01-01'), hist('b', '2026-01-01')];
  const teams = [{ id: T, supervisorProviderId: 'sup' }];
  // escala só com 'a': supervisor não foi, fica de fora
  let p = participantesDaAvaliacao(evTeam({ providerId: 'extra' }), providers, teams, { historico, atividades: acts(['a']) });
  assert.deepEqual(Object.fromEntries(p.map(x => [x.providerId, x.motivo])), { a: 'ESCALADO', b: 'NAO_ESCALADO', sup: 'NAO_ESCALADO', extra: 'ATRIBUIDO' });
  assert.equal(p.filter(x => x.conta).reduce((s, x) => s + Math.round(x.peso * 100), 0), 10000);
  // escala com o supervisor: conta
  p = participantesDaAvaliacao(evTeam(), providers, teams, { historico, atividades: acts(['a', 'sup']) });
  assert.deepEqual(p.filter(x => x.conta).map(x => x.providerId).sort(), ['a', 'sup']);
  assert.equal(p.find(x => x.providerId === 'sup').motivo, 'SUPERVISOR');
  // sem escala: supervisor conta
  p = participantesDaAvaliacao(evTeam(), providers, teams, { historico, atividades: [] });
  assert.equal(p.find(x => x.providerId === 'sup').conta, true);
});

test('atividadeDaAvaliacao: ligada, única do dia, desempate por cliente e nunca adivinha', () => {
  const lista = [
    { id: 'x1', teamId: T, activityDate: '2026-10-10', clientId: 'c1', serviceId: 's1', assignedProviderIds: ['a'], status: 'SCHEDULED' },
    { id: 'x2', teamId: T, activityDate: '2026-10-10', clientId: 'c2', serviceId: 's1', assignedProviderIds: ['b'], status: 'SCHEDULED' },
    { id: 'x3', teamId: T, activityDate: '2026-10-10', clientId: 'c2', serviceId: 's1', assignedProviderIds: ['c'], status: 'CANCELLED' },
  ];
  assert.equal(atividadeDaAvaliacao({ ...evTeam(), activityId: 'x1' }, lista).id, 'x1');
  assert.equal(atividadeDaAvaliacao({ ...evTeam(), clientId: 'c2' }, lista).id, 'x2'); // cancelada é ignorada
  assert.equal(atividadeDaAvaliacao(evTeam(), lista), undefined);                       // duas possíveis: não adivinha
  assert.equal(atividadeDaAvaliacao({ ...evTeam(), serviceDate: '2026-10-11' }, lista), undefined);
});

test('prestadorRecebeNota / avaliacoesDoPrestador / destinatariosDaNota respeitam o contexto', () => {
  const providers = [prov('a'), prov('b'), prov('novo')];
  const historico = [hist('a', '2026-01-01'), hist('b', '2026-01-01'), hist('novo', '2026-10-15')];
  const ctx = { historico, atividades: acts(['a']) };
  const ev = evTeam();
  assert.equal(prestadorRecebeNota(ev, providers[0], equipa, ctx), true);
  assert.equal(prestadorRecebeNota(ev, providers[1], equipa, ctx), false); // não escalado
  assert.equal(prestadorRecebeNota(ev, providers[2], equipa, ctx), false); // entrou depois
  assert.equal(prestadorRecebeNota(ev, providers[1], equipa), true);       // sem contexto: regra antiga
  assert.deepEqual(avaliacoesDoPrestador([ev], providers[1], equipa, ctx), []);
  assert.deepEqual(destinatariosDaNota(ev, providers, equipa, ctx).map(x => x.id), ['a']);
});

test('modo de demonstração (sem histórico): vale a equipa atual', () => {
  const providers = [prov('a'), prov('b')];
  const p = participantesDaAvaliacao(evTeam(), providers, equipa, { historico: [], atividades: [] });
  assert.deepEqual(p.filter(x => x.conta).map(x => x.providerId), ['a', 'b']);
  assert.deepEqual(membrosNaData(providers, [], T, '2026-10-10'), ['a', 'b']);
});

test('membrosNaData devolve só quem já estava na equipa nessa data', () => {
  const providers = [prov('a'), prov('novo')];
  const historico = [hist('a', '2026-01-01'), hist('novo', '2026-10-15')];
  assert.deepEqual(membrosNaData(providers, historico, T, '2026-10-10'), ['a']);
  assert.deepEqual(membrosNaData(providers, historico, T, '2026-10-15'), ['a', 'novo']);
});

// ---------------------------------------------------------------------------------------------
// Rankings do relatório: serviços (top 3), equipas (top 5) e funcionários (top 5)
// ---------------------------------------------------------------------------------------------
import { calcularRankings, separarTop } from '../src/services/rankings.ts';
import { buildReportText } from '../src/services/reportBuilder.ts';

const RT = 'eq1';
const evR = (id, extra) => ({
  id, reference: id, clientName: 'C', serviceId: 's1', serviceName: 'S1', providerName: '', serviceDate: '2026-10-10',
  evaluationDate: '2026-10-10T10:00:00Z', satisfactionRating: 4, comment: '', teamId: RT,
  finalizedAt: '2026-10-11T10:00:00Z', technicalScore: 80, finalClassification: 'POSITIVE', ...extra,
});
const svcs = ['s1', 's2', 's3', 's4', 's5'].map(id => ({ id, name: id.toUpperCase() }));

test('serviços: top 3 melhores e top 3 piores, sem repetir, ordenados por média', () => {
  const evals = [
    evR('a1', { serviceId: 's1', technicalScore: 95 }), evR('a2', { serviceId: 's2', technicalScore: 90 }),
    evR('a3', { serviceId: 's3', technicalScore: 80 }), evR('a4', { serviceId: 's4', technicalScore: 60, finalClassification: 'NEGATIVE' }),
    evR('a5', { serviceId: 's5', technicalScore: 40, finalClassification: 'NEGATIVE' }),
  ];
  const r = calcularRankings({ evals, services: svcs, teams: [], providers: [] });
  assert.deepEqual(r.servicos.melhores.map(x => x.id), ['s1', 's2', 's3']);
  assert.deepEqual(r.servicos.piores.map(x => x.id), ['s5', 's4']); // só sobram 2: não repete os melhores
  assert.equal(r.servicos.total, 5);
  assert.equal(r.servicos.piores[0].abaixoDoMinimo, true);
});

test('só avaliações homologadas com nota entram nos rankings', () => {
  const evals = [evR('b1', { technicalScore: 90 }), evR('b2', { finalizedAt: undefined, technicalScore: 10 }), evR('b3', { technicalScore: undefined })];
  const r = calcularRankings({ evals, services: svcs, teams: [], providers: [] });
  assert.equal(r.avaliacoesConsideradas, 1);
  assert.equal(r.servicos.melhores[0].media, 90);
});

test('média por serviço, empate decidido por mais avaliações e depois por nome', () => {
  const lista = [
    { id: 'x', nome: 'Beta', media: 80, avaliacoes: 2, positivas: 2, negativas: 0, abaixoDoMinimo: false, poucosDados: true },
    { id: 'y', nome: 'Alfa', media: 80, avaliacoes: 5, positivas: 5, negativas: 0, abaixoDoMinimo: false, poucosDados: false },
    { id: 'z', nome: 'Alfa2', media: 80, avaliacoes: 2, positivas: 2, negativas: 0, abaixoDoMinimo: false, poucosDados: true },
  ];
  const t = separarTop(lista, 3); // 3 itens: 2 melhores (y, depois z por nome) e 1 pior
  assert.deepEqual(t.melhores.map(i => i.id), ['y', 'z']);
  assert.deepEqual(t.piores.map(i => i.id), ['x']);
});

test('funcionários: top 5, só contam notas em que participaram (escala e entrada na equipa)', () => {
  const ps = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'].map(id => ({ id, name: id, teamId: RT, status: 'ACTIVE' }));
  const historico = ps.map(p => ({ providerId: p.id, teamId: RT, joinedAt: '2026-01-01', leftAt: null }));
  historico.find(h => h.providerId === 'p7').joinedAt = '2026-12-01'; // entrou depois: nunca conta
  const evals = [evR('c1', { technicalScore: 90, activityId: 'a1' }), evR('c2', { technicalScore: 50, finalClassification: 'NEGATIVE', activityId: 'a2' })];
  const atividades = [
    { id: 'a1', teamId: RT, activityDate: '2026-10-10', assignedProviderIds: ['p1', 'p2', 'p3', 'p4'], status: 'COMPLETED' },
    { id: 'a2', teamId: RT, activityDate: '2026-10-10', assignedProviderIds: ['p4', 'p5', 'p6'], status: 'COMPLETED' },
  ];
  const r = calcularRankings({ evals, services: svcs, teams: [{ id: RT, name: 'Eq 1' }], providers: ps, ctx: { historico, atividades } });
  const media = id => r.funcionarios.melhores.concat(r.funcionarios.piores).find(i => i.id === id)?.media;
  assert.equal(media('p1'), 90);
  assert.equal(media('p4'), 70); // média de 90 e 50
  assert.equal(media('p5'), 50);
  assert.equal(media('p7'), undefined); // entrou depois, sem notas
  assert.equal(r.funcionarios.total, 6);
  assert.deepEqual(r.funcionarios.melhores.map(i => i.id), ['p1', 'p2', 'p3']);
  assert.deepEqual(r.funcionarios.piores.map(i => i.id), ['p5', 'p6', 'p4']);
  assert.equal(r.equipas.melhores[0].nome, 'Eq 1');
  assert.equal(r.equipas.melhores[0].media, 70);
});

test('relatório em texto inclui os rankings e o apoio a quem está abaixo do mínimo', () => {
  const ps = ['p1', 'p2'].map(id => ({ id, name: id.toUpperCase(), teamId: RT, status: 'ACTIVE', services: [], internalCode: id }));
  const evals = [evR('d1', { technicalScore: 95, providerId: 'p1' }), evR('d2', { technicalScore: 40, finalClassification: 'NEGATIVE', providerId: 'p2', serviceId: 's2' })];
  const txt = buildReportText(
    { scope: 'GLOBAL', sections: ['RANKINGS'], generatedBy: 'Teste', now: new Date('2026-11-16T10:00:00') },
    { evaluations: evals, clients: [], goals: [], services: svcs, providers: ps, activities: [], hrCases: [], teams: [{ id: RT, name: 'Eq 1' }], teamHistory: [], passingThreshold: 70 },
  );
  assert.match(txt, /\[RANKINGS\]/);
  assert.match(txt, /Serviços mais bem avaliados \(top 3\)/);
  assert.match(txt, /Equipas com pior classificação \(top 5\)/);
  assert.match(txt, /Funcionários com avaliação mais negativa \(top 5\)/);
  assert.match(txt, /Para acompanhamento e formação: P2/);
});

test('com 2 serviços, o fraco não aparece entre os melhores (divide ao meio)', () => {
  const evals = [evR('f1', { serviceId: 's1', technicalScore: 95 }), evR('f2', { serviceId: 's2', technicalScore: 40, finalClassification: 'NEGATIVE' })];
  const r = calcularRankings({ evals, services: svcs, teams: [], providers: [] });
  assert.deepEqual(r.servicos.melhores.map(i => i.id), ['s1']);
  assert.deepEqual(r.servicos.piores.map(i => i.id), ['s2']);
  const so1 = calcularRankings({ evals: [evals[0]], services: svcs, teams: [], providers: [] });
  assert.equal(so1.servicos.melhores.length, 1);
  assert.equal(so1.servicos.piores.length, 0);
});

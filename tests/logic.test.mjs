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

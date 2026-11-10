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

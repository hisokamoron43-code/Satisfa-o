/**
 * SICSC — Balanceamento automático de pesos (RH ↔ categorias ↔ questões).
 *
 * Lógica pura, sem dependências de React ou Supabase, para poder ser testada isoladamente.
 *
 * Regras:
 *  1. A soma dos pesos das categorias ATIVAS tem de ser exatamente 100,00 %.
 *  2. Todos os cálculos são feitos em centésimas de ponto percentual (inteiros), para evitar
 *     erros de vírgula flutuante. 100 % = 10 000 unidades. O resultado tem no máximo 2 casas
 *     decimais, igual à coluna `weight_percentage numeric(5,2)` da base de dados.
 *  3. A redistribuição é proporcional aos pesos atuais, com o método do maior resto, para que a
 *     soma final seja exatamente 100,00 %. As categorias "fixadas" (bloqueadas ou alteradas
 *     pelo utilizador) nunca são movidas.
 *  4. Se não for possível equilibrar automaticamente (por exemplo, os pesos fixados já passam de
 *     100 %), o resultado indica que é necessário ajuste manual, e nunca devolve valores inválidos.
 */

export interface WeightItem {
  id: string;
  /** Código da categoria do formulário, usado para ligar às questões. */
  key: string;
  name: string;
  /** Peso em percentagem (0 a 100). */
  weight: number;
  active: boolean;
  /** Peso fixo: não é alterado pela redistribuição automática. */
  locked?: boolean;
}

export interface WeightCheck {
  total: number;
  /** Quanto falta (positivo) ou sobra (negativo) para 100 %. */
  delta: number;
  isBalanced: boolean;
  activeCount: number;
  errors: string[];
}

export interface RedistributeResult {
  ok: boolean;
  items: WeightItem[];
  /** Presente quando ok = false: motivo pelo qual é preciso ajuste manual. */
  reason?: string;
}

export type RowStatus = 'UNCHANGED' | 'CHANGED' | 'ADDED' | 'REMOVED' | 'ACTIVATED' | 'DEACTIVATED';

export interface MatrixRow {
  id: string;
  name: string;
  /** Peso efetivo antes (0 se não estava ativa). */
  before: number;
  /** Peso efetivo depois (0 se ficar inativa ou removida). */
  after: number;
  delta: number;
  status: RowStatus;
}

export type AlertKind = 'UNBALANCED' | 'WEIGHT_CHANGED' | 'STRUCTURE_CHANGED' | 'MANUAL_REQUIRED' | 'NO_QUESTIONS';

export interface BalanceAlert {
  kind: AlertKind;
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface BalancePlan {
  check: WeightCheck;
  /** Proposta de pesos equilibrados; null se o rascunho já está equilibrado ou não há solução automática. */
  suggestion: WeightItem[] | null;
  /** Matriz de distribuição: situação gravada → situação resultante (sugestão, ou rascunho se já equilibrado). */
  rows: MatrixRow[];
  alerts: BalanceAlert[];
  /** Verdadeiro enquanto o rascunho não puder ser gravado tal como está. */
  requiresAction: boolean;
}

const TOTAL_UNITS = 10_000;
const toUnits = (pct: number): number => Math.round((Number(pct) || 0) * 100);
const fromUnits = (u: number): number => u / 100;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Normaliza um nome ou código de categoria para comparação (QUALIDADE, SEGURANCA, …). */
export function normalizeKey(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().trim().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Soma dos pesos das categorias ativas, em %. */
export function sumActive(items: WeightItem[]): number {
  return fromUnits(items.filter((i) => i.active).reduce((s, i) => s + toUnits(i.weight), 0));
}

/** Valida o rascunho: soma 100 %, pesos entre 0 e 100, pelo menos uma categoria ativa. */
export function checkWeights(items: WeightItem[]): WeightCheck {
  const active = items.filter((i) => i.active);
  const errors: string[] = [];
  if (active.length === 0) errors.push('Tem de existir pelo menos uma categoria ativa.');
  for (const i of active) {
    if (!Number.isFinite(i.weight) || i.weight < 0 || i.weight > 100) {
      errors.push(`O peso de "${i.name}" tem de estar entre 0 e 100.`);
    }
  }
  const totalUnits = active.reduce((s, i) => s + toUnits(i.weight), 0);
  const deltaUnits = TOTAL_UNITS - totalUnits;
  // Exatamente 100,00 %: sem tolerância, para que o servidor (que aceita 0,01) nunca discorde.
  const isBalanced = active.length > 0 && errors.length === 0 && deltaUnits === 0;
  if (active.length > 0 && deltaUnits !== 0) {
    errors.push(`A soma dos pesos ativos é ${fromUnits(totalUnits).toFixed(2)} %; tem de ser exatamente 100,00 %.`);
  }
  return {
    total: fromUnits(totalUnits),
    delta: fromUnits(deltaUnits),
    isBalanced,
    activeCount: active.length,
    errors,
  };
}

/**
 * Redistribui os pesos das categorias ativas para somarem exatamente 100,00 %.
 * `pinnedIds` são categorias que o utilizador acabou de editar (ou fixou): mantêm o valor.
 */
export function redistribute(items: WeightItem[], pinnedIds: string[] = []): RedistributeResult {
  const active = items.filter((i) => i.active);
  if (active.length === 0) {
    return { ok: false, items, reason: 'Não há categorias ativas para distribuir o peso.' };
  }

  const isPinned = (i: WeightItem) => Boolean(i.locked) || pinnedIds.includes(i.id);
  const pinned = active.filter(isPinned);
  const flexible = active.filter((i) => !isPinned(i));

  const pinnedUnits = pinned.reduce((s, i) => s + toUnits(i.weight), 0);
  const remaining = TOTAL_UNITS - pinnedUnits;

  if (remaining < 0) {
    return {
      ok: false,
      items,
      reason: `Os pesos fixados somam ${fromUnits(pinnedUnits).toFixed(2)} %, mais do que 100 %. Reduza algum deles.`,
    };
  }
  if (flexible.length === 0) {
    return remaining === 0
      ? { ok: true, items }
      : {
          ok: false,
          items,
          reason: `Todas as categorias ativas estão fixadas e somam ${fromUnits(pinnedUnits).toFixed(2)} %. Liberte uma categoria ou ajuste manualmente.`,
        };
  }

  // Base de repartição: pesos atuais; se todos forem 0, partilha igual.
  const baseWeights = flexible.map((i) => Math.max(0, toUnits(i.weight)));
  const baseSum = baseWeights.reduce((a, b) => a + b, 0);
  const bases = baseSum > 0 ? baseWeights : flexible.map(() => 1);
  const basesSum = bases.reduce((a, b) => a + b, 0);

  // Maior resto: parte inteira + distribuição das unidades que sobram.
  const raw = bases.map((b) => (remaining * b) / basesSum);
  const alloc = raw.map((r) => Math.floor(r));
  let leftover = remaining - alloc.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, idx) => ({ idx, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.idx - b.idx);
  for (let k = 0; leftover > 0; k = (k + 1) % order.length) {
    alloc[order[k].idx] += 1;
    leftover -= 1;
  }

  const newWeight = new Map<string, number>();
  flexible.forEach((i, idx) => newWeight.set(i.id, fromUnits(alloc[idx])));

  return {
    ok: true,
    items: items.map((i) => (newWeight.has(i.id) ? { ...i, weight: newWeight.get(i.id)! } : i)),
  };
}

/** Peso efetivo de uma categoria numa lista (0 se inativa ou inexistente). */
function effective(items: WeightItem[], id: string): number {
  const f = items.find((i) => i.id === id);
  return f && f.active ? round2(f.weight) : 0;
}

/** Compara duas situações e devolve a matriz de distribuição. */
export function buildMatrix(before: WeightItem[], after: WeightItem[]): MatrixRow[] {
  const ids: string[] = [];
  for (const i of [...before, ...after]) if (!ids.includes(i.id)) ids.push(i.id);

  return ids.map((id) => {
    const b = before.find((i) => i.id === id);
    const a = after.find((i) => i.id === id);
    const bw = effective(before, id);
    const aw = effective(after, id);
    let status: RowStatus = 'UNCHANGED';
    if (!b && a) status = 'ADDED';
    else if (b && !a) status = 'REMOVED';
    else if (b && a && !b.active && a.active) status = 'ACTIVATED';
    else if (b && a && b.active && !a.active) status = 'DEACTIVATED';
    else if (bw !== aw) status = 'CHANGED';
    return {
      id,
      name: (a ?? b)!.name,
      before: bw,
      after: aw,
      delta: round2(aw - bw),
      status,
    };
  });
}

export interface QuestionLite {
  id: string;
  /** Código da categoria. */
  category: string;
  active: boolean;
  /** Serviço específico; ausente = vale para todos os serviços. */
  serviceId?: string | null;
}

/** Número de questões ativas por categoria, opcionalmente filtradas por serviço. */
export function countActiveQuestions(questions: QuestionLite[], serviceId?: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of questions) {
    if (!q.active) continue;
    if (serviceId && q.serviceId && q.serviceId !== serviceId) continue;
    const k = normalizeKey(q.category);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export interface QuestionShare {
  key: string;
  name: string;
  weight: number;
  questionCount: number;
  /** Fatia do peso total que cada questão ativa vale (peso ÷ nº de questões); null se não houver questões. */
  perQuestion: number | null;
}

/** Quanto vale cada questão na nota final, dada a matriz de pesos e as questões ativas. */
export function questionShares(items: WeightItem[], questions: QuestionLite[], serviceId?: string | null): QuestionShare[] {
  const counts = countActiveQuestions(questions, serviceId);
  return items
    .filter((i) => i.active)
    .map((i) => {
      const n = counts[normalizeKey(i.key)] ?? 0;
      return {
        key: i.key,
        name: i.name,
        weight: round2(i.weight),
        questionCount: n,
        perQuestion: n > 0 ? round2(i.weight / n) : null,
      };
    });
}

/**
 * Plano de balanceamento: o que mudou, se está equilibrado, qual a proposta e que avisos mostrar.
 * @param saved   situação gravada (base de comparação)
 * @param draft   rascunho em edição
 * @param changedId  categoria que o utilizador acabou de editar (fica fixa na proposta)
 * @param questions  questões atuais, para avisar de categorias com peso e sem questões
 */
export function buildPlan(
  saved: WeightItem[],
  draft: WeightItem[],
  changedId?: string,
  questions: QuestionLite[] = [],
  serviceId?: string | null,
): BalancePlan {
  const check = checkWeights(draft);
  const alerts: BalanceAlert[] = [];

  // Alterações estruturais (adicionar, remover, ativar, desativar)
  const structural = buildMatrix(saved, draft).filter((r) => ['ADDED', 'REMOVED', 'ACTIVATED', 'DEACTIVATED'].includes(r.status));
  if (structural.length > 0) {
    const label: Record<string, string> = { ADDED: 'adicionada', REMOVED: 'removida', ACTIVATED: 'ativada', DEACTIVATED: 'desativada' };
    alerts.push({
      kind: 'STRUCTURE_CHANGED',
      severity: 'warning',
      message: structural.map((r) => `"${r.name}" ${label[r.status]}`).join('; ') + '. A distribuição das notas muda.',
    });
  } else if (buildMatrix(saved, draft).some((r) => r.status === 'CHANGED')) {
    alerts.push({ kind: 'WEIGHT_CHANGED', severity: 'info', message: 'Pesos alterados face ao que está gravado.' });
  }

  // Categorias com peso mas sem questões ativas (nada alimenta essa parte da nota)
  if (questions.length > 0) {
    for (const s of questionShares(draft, questions, serviceId)) {
      if (s.weight > 0 && s.questionCount === 0) {
        alerts.push({
          kind: 'NO_QUESTIONS',
          severity: 'warning',
          message: `"${s.name}" vale ${s.weight.toFixed(2)} % mas não tem questões ativas${serviceId ? ' neste serviço' : ''}. A nota sugerida não a cobre.`,
        });
      }
    }
  }

  let suggestion: WeightItem[] | null = null;
  let after = draft;

  if (!check.isBalanced) {
    alerts.unshift({
      kind: 'UNBALANCED',
      severity: 'error',
      message:
        check.activeCount === 0
          ? 'Não há categorias ativas.'
          : `A soma é ${check.total.toFixed(2)} % (${check.delta > 0 ? 'faltam' : 'sobram'} ${Math.abs(check.delta).toFixed(2)} %). Não pode gravar até somar 100 %.`,
    });

    let r = redistribute(draft, changedId ? [changedId] : []);
    if (!r.ok && changedId) r = redistribute(draft, []);
    if (r.ok) {
      suggestion = r.items;
      after = r.items;
    } else {
      alerts.push({ kind: 'MANUAL_REQUIRED', severity: 'error', message: r.reason ?? 'É necessário ajuste manual.' });
    }
  }

  return {
    check,
    suggestion,
    rows: buildMatrix(saved, after),
    alerts,
    requiresAction: !check.isBalanced,
  };
}

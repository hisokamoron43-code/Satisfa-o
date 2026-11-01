import type { ClientGoal, Evaluation, GoalMetric } from '../types';

/** Avaliações de um cliente (por id, ou por nome quando o id não existe). */
export function evaluationsForClient(evals: Evaluation[], clientId: string, clientName?: string): Evaluation[] {
  return evals.filter(e => e.clientId === clientId || (!!clientName && e.clientName === clientName));
}

/** Percentagem de satisfeitos (classificação >= 4), 0 a 100. */
export function csatPercent(evals: Evaluation[]): number {
  if (evals.length === 0) return 0;
  return (evals.filter(e => e.satisfactionRating >= 4).length / evals.length) * 100;
}

/** NPS = % promotores (9-10) - % detratores (0-6), apenas sobre respostas com NPS. */
export function npsValue(evals: Evaluation[]): number {
  const scores = evals.map(e => e.npsScore).filter((n): n is number => typeof n === 'number');
  if (scores.length === 0) return 0;
  const promoters = scores.filter(n => n >= 9).length;
  const detractors = scores.filter(n => n <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

export function metricValue(metric: GoalMetric, evals: Evaluation[]): number {
  if (metric === 'CSAT') return Math.round(csatPercent(evals) * 10) / 10;
  if (metric === 'NPS') return npsValue(evals);
  return evals.length;
}

export interface GoalProgress {
  current: number;
  target: number;
  percent: number;       // para barra de progresso (0-100)
  met: boolean;
  overdue: boolean;
  daysLeft: number;      // negativo quando vencida
  state: 'CONCLUIDA' | 'NAO_CUMPRIDA' | 'ATINGIDA' | 'VENCIDA' | 'EM_CURSO';
  label: string;
}

const STATE_LABEL: Record<GoalProgress['state'], string> = {
  CONCLUIDA: 'Concluída', NAO_CUMPRIDA: 'Não cumprida', ATINGIDA: 'Atingida', VENCIDA: 'Vencida', EM_CURSO: 'Em curso',
};

/**
 * Progresso de uma meta: só conta avaliações feitas a partir da criação da meta,
 * para mostrar a evolução real do cliente desde que a meta foi definida.
 */
export function goalProgress(goal: ClientGoal, clientEvals: Evaluation[], today = new Date()): GoalProgress {
  const since = new Date(goal.createdAt).getTime();
  const relevant = clientEvals.filter(e => new Date(e.evaluationDate).getTime() >= since);
  const current = metricValue(goal.metric, relevant);
  const target = goal.targetValue;
  const met = current >= target;
  const due = new Date(`${goal.dueDate}T23:59:59`);
  const daysLeft = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  const overdue = daysLeft < 0;
  const percent = target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0;

  let state: GoalProgress['state'];
  if (goal.status === 'CONCLUIDA') state = 'CONCLUIDA';
  else if (goal.status === 'NAO_CUMPRIDA') state = 'NAO_CUMPRIDA';
  else if (met) state = 'ATINGIDA';
  else if (overdue) state = 'VENCIDA';
  else state = 'EM_CURSO';

  return { current, target, percent, met, overdue, daysLeft, state, label: STATE_LABEL[state] };
}

/**
 * SICSC — Indicadores da empresa inteira (visão geral e KPIs de desenvolvimento).
 * Função pura: recebe os dados do contexto e a data de referência, sem React nem Supabase.
 */
import type { Activity, Client, ClientGoal, Evaluation, HRCase, Provider, Team } from '../types';
import { csatPercent, goalProgress, npsValue } from './goalProgress.ts';

export interface CompanyData {
  evaluations: Evaluation[];
  clients: Client[];
  teams: Team[];
  providers: Provider[];
  activities: Activity[];
  hrCases: HRCase[];
  goals: ClientGoal[];
}

export type PeriodPreset = '30D' | '90D' | '12M';
export interface PeriodRange { from: Date; to: Date }

const DAY = 86400000;
const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Converte 'AAAA-MM-DD' (meia-noite local) ou data/hora ISO em milissegundos. */
export function toTime(s: string): number {
  return new Date(s.length === 10 ? `${s}T00:00:00` : s).getTime();
}

export function presetRange(preset: PeriodPreset, now: Date): PeriodRange {
  const days = preset === '30D' ? 30 : preset === '90D' ? 90 : 365;
  const to = new Date(now);
  const from = new Date(now.getTime() - (days - 1) * DAY);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/** Período imediatamente anterior, com a mesma duração (para comparar). */
export function previousRange(r: PeriodRange): PeriodRange {
  const len = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - len - DAY), to: new Date(r.from.getTime() - DAY) };
}

const within = (iso: string | undefined, r: PeriodRange) => {
  if (!iso) return false;
  const t = toTime(iso);
  return t >= r.from.getTime() && t <= r.to.getTime();
};

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface Alert { level: 'critical' | 'warning' | 'info'; text: string }

export interface CompanyKpis {
  period: { from: string; to: string };
  evaluations: {
    total: number; previousTotal: number;
    csat: number; previousCsat: number;
    nps: number; previousNps: number;
    positiveRate: number;
    homologated: number; pendingHomologation: number; pendingOver7Days: number;
    avgHomologationDays: number | null; onTimeHomologationPct: number | null;
    openFollowUps: number; closedFollowUps: number;
  };
  clients: {
    total: number; active: number; inactive: number; activeRatePct: number;
    newInPeriod: number; expired: number; expiringIn30: number; expiringIn60: number; expiringIn90: number; withoutContract: number;
  };
  teams: Array<{ name: string; evaluations: number; csat: number; nps: number; activities: number }>;
  providers: { active: number; ranking: Array<{ name: string; evaluations: number; csat: number }> };
  activities: { total: number; scheduled: number; completed: number; cancelled: number; conflicts: number; completionRatePct: number | null };
  hr: { open: number; inAnalysis: number; resolved: number; avgResolutionDays: number | null; byType: Record<HRCase['occurrenceType'], number> };
  goals: { total: number; met: number; overdue: number; inProgress: number };
  trend: Array<{ month: string; evaluations: number; csat: number; nps: number; activities: number; newClients: number }>;
  alerts: Alert[];
}

export function companyKpis(data: CompanyData, range: PeriodRange, now: Date = new Date()): CompanyKpis {
  const prev = previousRange(range);
  const evalsNow = data.evaluations.filter(e => within(e.evaluationDate, range));
  const evalsPrev = data.evaluations.filter(e => within(e.evaluationDate, prev));

  // --- Avaliações e KPIs de desenvolvimento
  const homologated = evalsNow.filter(e => !!e.finalizedAt);
  const positives = homologated.filter(e => e.finalClassification === 'POSITIVE').length;
  const leadTimes = homologated.map(e => (toTime(e.finalizedAt!) - toTime(e.evaluationDate)) / DAY);
  const pending = data.evaluations.filter(e => !e.finalizedAt && within(e.evaluationDate, range));
  const pendingOver7 = data.evaluations.filter(e => !e.finalizedAt && (now.getTime() - toTime(e.evaluationDate)) / DAY > 7).length;
  const followUps = evalsNow.filter(e => e.requiresFollowUp);
  const openFollow = followUps.filter(e => e.correctiveActionStatus === 'PENDING' || e.correctiveActionStatus === 'IN_PROGRESS').length;

  const evaluationsBlock = {
    total: evalsNow.length, previousTotal: evalsPrev.length,
    csat: round1(csatPercent(evalsNow)), previousCsat: round1(csatPercent(evalsPrev)),
    nps: npsValue(evalsNow), previousNps: npsValue(evalsPrev),
    positiveRate: homologated.length ? round1((positives / homologated.length) * 100) : 0,
    homologated: homologated.length, pendingHomologation: pending.length, pendingOver7Days: pendingOver7,
    avgHomologationDays: (() => { const d = avg(leadTimes); return d === null ? null : round1(d); })(),
    onTimeHomologationPct: leadTimes.length ? round1((leadTimes.filter(d => d <= 3).length / leadTimes.length) * 100) : null,
    openFollowUps: openFollow, closedFollowUps: followUps.length - openFollow,
  };

  // --- Clientes e contratos
  const active = data.clients.filter(c => c.status === 'ACTIVE');
  const daysToEnd = (c: Client) => (c.contractEnd ? Math.ceil((toTime(c.contractEnd) - now.getTime()) / DAY) : null);
  const clientsBlock = {
    total: data.clients.length,
    active: active.length,
    inactive: data.clients.length - active.length,
    activeRatePct: data.clients.length ? round1((active.length / data.clients.length) * 100) : 0,
    newInPeriod: data.clients.filter(c => within(c.createdAt, range)).length,
    expired: active.filter(c => (daysToEnd(c) ?? 1) < 0).length,
    expiringIn30: active.filter(c => { const d = daysToEnd(c); return d !== null && d >= 0 && d <= 30; }).length,
    expiringIn60: active.filter(c => { const d = daysToEnd(c); return d !== null && d > 30 && d <= 60; }).length,
    expiringIn90: active.filter(c => { const d = daysToEnd(c); return d !== null && d > 60 && d <= 90; }).length,
    withoutContract: active.filter(c => !c.contractEnd).length,
  };

  // --- Equipas
  const teamNames = new Set<string>(data.teams.filter(t => t.status === 'ACTIVE').map(t => t.name));
  const groupNames = new Set<string>([...teamNames, ...evalsNow.map(e => e.teamName || 'Sem equipa'), ...data.activities.filter(a => within(a.activityDate, range)).map(a => a.teamName || 'Sem equipa')]);
  const teamRows = [...groupNames].map(name => {
    const es = evalsNow.filter(e => (e.teamName || 'Sem equipa') === name);
    const acts = data.activities.filter(a => (a.teamName || 'Sem equipa') === name && within(a.activityDate, range));
    return { name, evaluations: es.length, csat: round1(csatPercent(es)), nps: npsValue(es), activities: acts.length };
  }).sort((a, b) => b.evaluations - a.evaluations || a.name.localeCompare(b.name));

  // --- Funcionários (ranking pelas avaliações do período)
  const byProvider = new Map<string, Evaluation[]>();
  evalsNow.forEach(e => { const k = e.providerName || 'Sem funcionário'; byProvider.set(k, [...(byProvider.get(k) ?? []), e]); });
  const ranking = [...byProvider.entries()]
    .map(([name, es]) => ({ name, evaluations: es.length, csat: round1(csatPercent(es)) }))
    .sort((a, b) => b.csat - a.csat || b.evaluations - a.evaluations);

  // --- Atividades (calendário)
  const acts = data.activities.filter(a => within(a.activityDate, range));
  const completed = acts.filter(a => a.status === 'COMPLETED').length;
  const cancelled = acts.filter(a => a.status === 'CANCELLED').length;
  const finished = completed + cancelled;
  const activitiesBlock = {
    total: acts.length,
    scheduled: acts.filter(a => a.status === 'SCHEDULED').length,
    completed, cancelled,
    conflicts: acts.filter(a => a.status === 'CONFLICT').length,
    completionRatePct: finished ? round1((completed / finished) * 100) : null,
  };

  // --- Ocorrências de RH
  const cases = data.hrCases.filter(h => within(h.createdAt, range));
  const resolvedCases = cases.filter(h => h.status === 'RESOLVIDO' && h.resolutionDate);
  const byType: Record<HRCase['occurrenceType'], number> = { QUALIDADE_SERVICO: 0, COMPORTAMENTO: 0, ATRASO: 0, SEGURANCA: 0, ELOGIO: 0 };
  cases.forEach(h => { byType[h.occurrenceType] = (byType[h.occurrenceType] ?? 0) + 1; });
  const hrBlock = {
    open: cases.filter(h => h.status === 'ABERTO').length,
    inAnalysis: cases.filter(h => h.status === 'EM_ANALISE').length,
    resolved: resolvedCases.length,
    avgResolutionDays: (() => {
      const days = avg(resolvedCases.map(h => (toTime(h.resolutionDate!) - toTime(h.createdAt)) / DAY));
      return days === null ? null : round1(days);
    })(),
    byType,
  };
  const openHrOver15 = data.hrCases.filter(h => h.status !== 'RESOLVIDO' && (now.getTime() - toTime(h.createdAt)) / DAY > 15).length;

  // --- Metas dos clientes
  const states = data.goals.map(g => ({ g, p: goalProgress(g, evaluationsForCompanyClient(data.evaluations, g.clientId, data.clients), now) }));
  const goalsBlock = {
    total: data.goals.length,
    met: states.filter(x => x.p.state === 'CONCLUIDA' || x.p.state === 'ATINGIDA').length,
    overdue: states.filter(x => x.p.state === 'VENCIDA').length,
    inProgress: states.filter(x => x.p.state === 'EM_CURSO').length,
  };

  // --- Tendência mensal (últimos 12 meses até à data de referência)
  const trend: CompanyKpis['trend'] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const inMonth = (iso?: string) => !!iso && new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).getFullYear() === y && new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).getMonth() === m;
    const es = data.evaluations.filter(e => inMonth(e.evaluationDate));
    trend.push({
      month: `${MONTHS_PT[m]} ${String(y).slice(-2)}`,
      evaluations: es.length,
      csat: round1(csatPercent(es)),
      nps: npsValue(es),
      activities: data.activities.filter(a => inMonth(a.activityDate)).length,
      newClients: data.clients.filter(c => inMonth(c.createdAt)).length,
    });
  }

  // --- Alertas acionáveis
  const alerts: Alert[] = [];
  if (clientsBlock.expired > 0) alerts.push({ level: 'critical', text: `${clientsBlock.expired} cliente(s) com contrato expirado ainda ativo(s).` });
  if (clientsBlock.expiringIn30 > 0) alerts.push({ level: 'warning', text: `${clientsBlock.expiringIn30} contrato(s) expiram nos próximos 30 dias.` });
  if (evaluationsBlock.pendingOver7Days > 0) alerts.push({ level: 'warning', text: `${evaluationsBlock.pendingOver7Days} avaliação(ões) por homologar há mais de 7 dias.` });
  if (evaluationsBlock.openFollowUps > 0) alerts.push({ level: 'warning', text: `${evaluationsBlock.openFollowUps} ação(ões) corretiva(s) em aberto.` });
  if (evalsPrev.length >= 3 && evalsNow.length >= 3 && evaluationsBlock.csat <= evaluationsBlock.previousCsat - 5) {
    alerts.push({ level: 'critical', text: `CSAT desceu ${round1(evaluationsBlock.previousCsat - evaluationsBlock.csat)} pontos face ao período anterior.` });
  } else if (evalsPrev.length >= 3 && evalsNow.length >= 3 && evaluationsBlock.csat >= evaluationsBlock.previousCsat + 5) {
    alerts.push({ level: 'info', text: `CSAT subiu ${round1(evaluationsBlock.csat - evaluationsBlock.previousCsat)} pontos face ao período anterior.` });
  }
  teamRows.filter(t => t.evaluations >= 3 && t.csat < 60).forEach(t => alerts.push({ level: 'warning', text: `Equipa "${t.name}" com CSAT de ${t.csat}% em ${t.evaluations} avaliações.` }));
  if (activitiesBlock.conflicts > 0) alerts.push({ level: 'warning', text: `${activitiesBlock.conflicts} conflito(s) de horário no calendário.` });
  if (hrBlock.open > 0 && openHrOver15 > 0) alerts.push({ level: 'warning', text: `${openHrOver15} ocorrência(s) de RH sem resolução há mais de 15 dias.` });
  if (goalsBlock.overdue > 0) alerts.push({ level: 'warning', text: `${goalsBlock.overdue} meta(s) de cliente vencida(s).` });

  return {
    period: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) },
    evaluations: evaluationsBlock,
    clients: clientsBlock,
    teams: teamRows,
    providers: { active: data.providers.filter(p => p.status === 'ACTIVE').length, ranking },
    activities: activitiesBlock,
    hr: hrBlock,
    goals: goalsBlock,
    trend,
    alerts,
  };
}

// As metas referem-se a clientes por id; as avaliações podem ter só o nome da empresa.
function evaluationsForCompanyClient(evals: Evaluation[], clientId: string, clients: Client[]): Evaluation[] {
  const name = clients.find(c => c.id === clientId)?.companyName;
  return evals.filter(e => e.clientId === clientId || (!!name && e.clientName === name));
}

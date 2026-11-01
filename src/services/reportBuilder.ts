import type { Activity, Client, ClientGoal, Evaluation, HRCase, Provider, ServiceItem } from '../types';
import { csatPercent, evaluationsForClient, goalProgress, npsValue } from './goalProgress';

export type ReportScope = 'GLOBAL' | 'SERVICE' | 'EMPLOYEE' | 'CLIENT';
export type ReportSection = 'AVALIACOES' | 'CLIENTES_METAS' | 'ATIVIDADES' | 'RH' | 'EQUIPA' | 'HOMOLOGACAO';

export const SECTION_LABELS: Record<ReportSection, string> = {
  AVALIACOES: 'Avaliações (CSAT e NPS)',
  CLIENTES_METAS: 'Clientes e metas com prazo',
  ATIVIDADES: 'Atividades e calendário',
  RH: 'Recursos Humanos (ocorrências)',
  EQUIPA: 'Equipa e serviços por funcionário',
  HOMOLOGACAO: 'Homologação e classificação final',
};

export interface ReportOptions {
  scope: ReportScope;
  serviceId?: string;
  providerId?: string;
  clientId?: string;
  from?: string;   // 'YYYY-MM-DD'
  to?: string;     // 'YYYY-MM-DD'
  sections: ReportSection[];
  generatedBy: string;
  now?: Date;
}

export interface ReportData {
  evaluations: Evaluation[];
  clients: Client[];
  goals: ClientGoal[];
  services: ServiceItem[];
  providers: Provider[];
  activities: Activity[];
  hrCases: HRCase[];
}

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const fmtDateTime = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const inPeriod = (iso: string, from?: string, to?: string) => {
  const d = iso.slice(0, 10);
  return (!from || d >= from) && (!to || d <= to);
};
const pct = (n: number) => `${n.toFixed(1)}%`;

/** Filtra os dados pelo âmbito e pelo período. */
export function scopeData(data: ReportData, o: ReportOptions) {
  let evals = data.evaluations.filter(e => inPeriod(e.evaluationDate, o.from, o.to));
  let clients = data.clients;
  let activities = data.activities.filter(a => inPeriod(a.activityDate, o.from, o.to));
  let providers = data.providers;

  if (o.scope === 'SERVICE' && o.serviceId) {
    const svc = data.services.find(s => s.id === o.serviceId);
    evals = evals.filter(e => e.serviceId === o.serviceId);
    activities = activities.filter(a => a.serviceId === o.serviceId);
    providers = providers.filter(p => !!svc && p.services.includes(svc.name));
  }
  if (o.scope === 'EMPLOYEE' && o.providerId) {
    evals = evals.filter(e => e.providerId === o.providerId);
    activities = activities.filter(a => a.assignedProviderIds.includes(o.providerId!));
    providers = providers.filter(p => p.id === o.providerId);
  }
  if (o.scope === 'CLIENT' && o.clientId) {
    const c = data.clients.find(x => x.id === o.clientId);
    clients = data.clients.filter(x => x.id === o.clientId);
    evals = c ? evaluationsForClient(evals, c.id, c.companyName) : [];
    activities = activities.filter(a => a.clientId === o.clientId);
  }
  if (o.scope === 'SERVICE' || o.scope === 'EMPLOYEE' || o.scope === 'CLIENT') {
    const clientIds = new Set(evals.map(e => e.clientId).filter(Boolean) as string[]);
    if (o.scope !== 'CLIENT') clients = data.clients.filter(c => clientIds.has(c.id));
  }
  const evalIds = new Set(evals.map(e => e.id));
  const hrCases = o.scope === 'GLOBAL' ? data.hrCases : data.hrCases.filter(h => evalIds.has(h.evaluationId));
  const clientIds = new Set(clients.map(c => c.id));
  const goals = data.goals.filter(g => clientIds.has(g.clientId));
  return { evals, clients, activities, providers, hrCases, goals };
}

function scopeTitle(o: ReportOptions, data: ReportData): string {
  if (o.scope === 'SERVICE') return `Serviço: ${data.services.find(s => s.id === o.serviceId)?.name ?? '—'}`;
  if (o.scope === 'EMPLOYEE') return `Funcionário: ${data.providers.find(p => p.id === o.providerId)?.name ?? '—'}`;
  if (o.scope === 'CLIENT') return `Cliente: ${data.clients.find(c => c.id === o.clientId)?.companyName ?? '—'}`;
  return 'Global (todos os serviços e clientes)';
}

/** Gera o relatório em texto simples, por secções escolhidas. */
export function buildReportText(o: ReportOptions, data: ReportData): string {
  const now = o.now ?? new Date();
  const s = scopeData(data, o);
  const today = now;
  const out: string[] = [];
  const line = (t = '') => out.push(t);

  line('RELATÓRIO SICSC — AETERNU LDA');
  line(`Âmbito: ${scopeTitle(o, data)}`);
  line(`Período: ${o.from || o.to ? `${fmtDate(o.from)} a ${fmtDate(o.to)}` : 'Todo o histórico'}`);
  line(`Gerado por: ${o.generatedBy} em ${fmtDateTime(now)}`);
  line('────────────────────────────────────────');

  const sections = o.sections;

  if (sections.includes('AVALIACOES')) {
    line('[AVALIAÇÕES]');
    const n = s.evals.length;
    line(`Total de avaliações: ${n}`);
    line(`CSAT (satisfeitos, classificação ≥ 4): ${pct(csatPercent(s.evals))}`);
    line(`NPS: ${npsValue(s.evals)}`);
    line(`Requerem acompanhamento: ${s.evals.filter(e => (e as any).requiresFollowUp).length}`);
    if (o.scope === 'GLOBAL') {
      for (const svc of data.services) {
        const list = s.evals.filter(e => e.serviceId === svc.id);
        if (list.length) line(`  · ${svc.name}: ${list.length} avaliação(ões), CSAT ${pct(csatPercent(list))}`);
      }
    }
    line();
  }

  if (sections.includes('CLIENTES_METAS')) {
    line('[CLIENTES E METAS]');
    const active = s.clients.filter(c => c.status === 'ACTIVE').length;
    const expired = s.clients.filter(c => c.contractEnd && c.contractEnd < today.toISOString().slice(0, 10)).length;
    line(`Clientes no âmbito: ${s.clients.length} (ativos: ${active}; contratos expirados: ${expired})`);
    for (const c of s.clients) {
      const cevals = evaluationsForClient(s.evals, c.id, c.companyName);
      line(`- ${c.companyName}${c.nif ? ` (NIF ${c.nif})` : ''} — CSAT ${pct(csatPercent(cevals))}, ${cevals.length} avaliação(ões)`);
      if (c.contractEnd) line(`    Contrato até: ${fmtDate(c.contractEnd)}`);
      for (const g of s.goals.filter(x => x.clientId === c.id)) {
        const gp = goalProgress(g, evaluationsForClient(data.evaluations, c.id, c.companyName), today);
        line(`    · Meta "${g.title}": ${g.metric} ${gp.current} de ${g.targetValue} — prazo ${fmtDate(g.dueDate)} — ${gp.label}`);
      }
    }
    line();
  }

  if (sections.includes('ATIVIDADES')) {
    line('[ATIVIDADES]');
    const by = (st: string) => s.activities.filter(a => a.status === st).length;
    line(`Total: ${s.activities.length} | Agendadas: ${by('SCHEDULED')} | Concluídas: ${by('COMPLETED')} | Canceladas: ${by('CANCELLED')}`);
    const upcoming = [...s.activities].sort((a, b) => a.activityDate.localeCompare(b.activityDate)).slice(0, 15);
    for (const a of upcoming) {
      line(`- ${fmtDate(a.activityDate)} ${a.startTime}–${a.endTime}: ${a.title} (${a.location || 'local n/d'}${a.teamName ? `, ${a.teamName}` : ''})`);
    }
    line();
  }

  if (sections.includes('RH')) {
    line('[RECURSOS HUMANOS]');
    const st = (x: string) => s.hrCases.filter(h => h.status === x).length;
    line(`Ocorrências: ${s.hrCases.length} | Abertas: ${st('ABERTO')} | Em análise: ${st('EM_ANALISE')} | Resolvidas: ${st('RESOLVIDO')}`);
    const types = Array.from(new Set(s.hrCases.map(h => h.occurrenceType)));
    for (const t of types) line(`  · ${t}: ${s.hrCases.filter(h => h.occurrenceType === t).length}`);
    line();
  }

  if (sections.includes('EQUIPA')) {
    line('[EQUIPA E SERVIÇOS]');
    if (s.providers.length === 0) line('Sem funcionários no âmbito.');
    for (const p of s.providers) {
      const pe = s.evals.filter(e => e.providerId === p.id);
      const pa = s.activities.filter(a => a.assignedProviderIds.includes(p.id));
      line(`- ${p.name}${p.department ? ` (${p.department})` : ''}`);
      line(`    Serviços: ${p.services.length ? p.services.join(', ') : 'não atribuídos'}`);
      line(`    Avaliações: ${pe.length} | CSAT ${pct(csatPercent(pe))} | Atividades: ${pa.length}`);
    }
    line();
  }

  if (sections.includes('HOMOLOGACAO')) {
    line('[HOMOLOGAÇÃO]');
    const fin = s.evals.filter(e => e.finalizedAt);
    const pos = fin.filter(e => e.finalClassification === 'POSITIVE').length;
    const neg = fin.filter(e => e.finalClassification === 'NEGATIVE').length;
    const scores = fin.map(e => e.technicalScore ?? 0);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    line(`Homologadas: ${fin.length} | Positivas: ${pos} | Negativas: ${neg} | Pontuação média: ${avg.toFixed(1)}`);
    line();
  }

  return out.join('\n');
}

/** Divide o texto em partes que cabem numa mensagem interna (máx. 4000 caracteres). */
export function splitForMessages(text: string, max = 3800): string[] {
  const parts: string[] = [];
  let cur = '';
  for (const raw of text.split('\n')) {
    const l = raw.length > max ? raw.slice(0, max) : raw;
    if ((cur + '\n' + l).length > max && cur) { parts.push(cur); cur = l; }
    else cur = cur ? cur + '\n' + l : l;
  }
  if (cur) parts.push(cur);
  return parts.map((p, i) => (parts.length > 1 ? `[Relatório SICSC — parte ${i + 1}/${parts.length}]\n${p}` : p));
}

import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer,
} from 'recharts';
import { companyKpis, presetRange, type CompanyData, type CompanyKpis, type PeriodPreset, type PeriodRange } from '../../services/companyKpis';

type Mode = PeriodPreset | 'CUSTOM';
const PRESETS: Array<[PeriodPreset, string]> = [['30D', '30 dias'], ['90D', '90 dias'], ['12M', '12 meses']];

const delta = (now: number, before: number, suffix = '') => {
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return { text: 'Sem variação vs. anterior', tone: 'text-slate-500' };
  return { text: `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${suffix} vs. anterior`, tone: d > 0 ? 'text-emerald-700' : 'text-rose-700' };
};

const Card: React.FC<{ label: string; value: string; sub?: string; subTone?: string }> = ({ label, value, sub, subTone }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
    <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{value}</p>
    {sub && <p className={`text-[11px] font-bold mt-1 ${subTone ?? 'text-slate-500'}`}>{sub}</p>}
  </div>
);

const Panel: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
    <h3 className="text-sm font-black text-slate-900">{title}</h3>
    {hint && <p className="text-[11px] text-slate-500 mb-3">{hint}</p>}
    {children}
  </section>
);

export const CompanyOverview: React.FC<{ data: CompanyData; onExportPdf: (kpis: CompanyKpis) => void }> = ({ data, onExportPdf }) => {
  const [mode, setMode] = useState<Mode>('30D');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const now = useMemo(() => new Date(), []);

  const range: PeriodRange = useMemo(() => {
    if (mode === 'CUSTOM' && customFrom && customTo) {
      return { from: new Date(`${customFrom}T00:00:00`), to: new Date(`${customTo}T23:59:59`) };
    }
    return presetRange(mode === 'CUSTOM' ? '30D' : mode, now);
  }, [mode, customFrom, customTo, now]);

  const k = useMemo(() => companyKpis(data, range, now), [data, range, now]);
  const ev = k.evaluations;
  const csatD = delta(ev.csat, ev.previousCsat, '%');
  const npsD = delta(ev.nps, ev.previousNps);
  const totalD = delta(ev.total, ev.previousTotal);
  const hasData = ev.total > 0 || k.clients.total > 0;

  return (
    <div className="space-y-6">
      {/* Período */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(([p, label]) => (
            <button key={p} onClick={() => setMode(p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${mode === p ? 'bg-brand-dark text-white border-brand-dark' : 'border-slate-300 text-slate-700'}`}>{label}</button>
          ))}
          <button onClick={() => setMode('CUSTOM')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${mode === 'CUSTOM' ? 'bg-brand-dark text-white border-brand-dark' : 'border-slate-300 text-slate-700'}`}>Personalizado</button>
          {mode === 'CUSTOM' && (
            <div className="flex items-center gap-2 text-xs">
              <input type="date" value={customFrom} max={customTo || undefined} onChange={e => setCustomFrom(e.target.value)} className="px-2 py-1 border border-slate-300 rounded-lg" />
              <span className="text-slate-500">a</span>
              <input type="date" value={customTo} min={customFrom || undefined} onChange={e => setCustomTo(e.target.value)} className="px-2 py-1 border border-slate-300 rounded-lg" />
            </div>
          )}
        </div>
        <button onClick={() => onExportPdf(k)} className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer">
          Relatório da empresa (PDF)
        </button>
      </div>

      {!hasData && (
        <p className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 font-bold">
          Ainda não há dados suficientes no período escolhido. Os indicadores aparecem assim que existirem avaliações e clientes.
        </p>
      )}

      {/* Alertas acionáveis */}
      {k.alerts.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 mb-2">O que precisa de atenção</h3>
          <ul className="space-y-1.5">
            {k.alerts.map((a, i) => (
              <li key={i} className={`text-xs font-bold px-3 py-2 rounded-lg border ${
                a.level === 'critical' ? 'bg-rose-50 border-rose-300 text-rose-900' :
                a.level === 'warning' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-emerald-50 border-emerald-300 text-emerald-900'}`}>
                {a.level === 'critical' ? '● ' : a.level === 'warning' ? '▲ ' : '✓ '}{a.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Indicadores principais */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Card label="CSAT" value={`${ev.csat}%`} sub={csatD.text} subTone={csatD.tone} />
        <Card label="NPS" value={`${ev.nps}`} sub={npsD.text} subTone={npsD.tone} />
        <Card label="Avaliações no período" value={`${ev.total}`} sub={totalD.text} subTone={totalD.tone} />
        <Card label="Taxa de positivas" value={`${ev.positiveRate}%`} sub={`${ev.homologated} homologadas`} />
        <Card label="Clientes ativos" value={`${k.clients.active}`} sub={`${k.clients.activeRatePct}% do total · ${k.clients.newInPeriod} novos no período`} />
        <Card label="Contratos a expirar (30 dias)" value={`${k.clients.expiringIn30}`} sub={k.clients.expired ? `${k.clients.expired} já expirado(s)` : 'Nenhum expirado'} subTone={k.clients.expired ? 'text-rose-700' : 'text-slate-500'} />
        <Card label="Ações corretivas abertas" value={`${ev.openFollowUps}`} sub={`${ev.closedFollowUps} concluídas`} />
        <Card label="Atividades concluídas" value={k.activities.completionRatePct === null ? '—' : `${k.activities.completionRatePct}%`} sub={`${k.activities.total} no período · ${k.activities.conflicts} conflito(s)`} />
      </div>

      {/* Tendência */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Satisfação ao longo do tempo" hint="CSAT e NPS, últimos 12 meses">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={k.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[-100, 100]} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="csat" name="CSAT %" stroke="#0f766e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="nps" name="NPS" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Volume de avaliações e atividades" hint="Por mês, últimos 12 meses">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={k.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="evaluations" name="Avaliações" fill="#0f766e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="activities" name="Atividades" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="newClients" name="Novos clientes" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Equipas e funcionários */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title="CSAT por equipa" hint="Equipas com avaliações no período">
          {k.teams.length === 0 ? <p className="text-xs text-slate-500">Sem equipas com avaliações no período.</p> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={k.teams.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="csat" name="CSAT %" fill="#0f766e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title="Funcionários" hint="Ranking pelo CSAT do período">
          {k.providers.ranking.length === 0 ? <p className="text-xs text-slate-500">Sem avaliações no período.</p> : (
            <table className="w-full text-xs">
              <thead className="text-slate-500"><tr><th className="text-left py-1">Funcionário</th><th className="text-right">Aval.</th><th className="text-right">CSAT</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {k.providers.ranking.slice(0, 8).map(p => (
                  <tr key={p.name}><td className="py-1.5 font-bold text-slate-900">{p.name}</td><td className="text-right tabular-nums">{p.evaluations}</td><td className="text-right tabular-nums font-black">{p.csat}%</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Ocorrências de RH" hint="Por tipo, no período">
          <ul className="space-y-2 text-xs">
            {(Object.entries(k.hr.byType) as Array<[string, number]>).map(([type, n]) => (
              <li key={type} className="flex items-center justify-between">
                <span className="font-bold text-slate-700">{type.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="font-black tabular-nums">{n}</span>
              </li>
            ))}
            <li className="pt-2 border-t border-slate-200 flex justify-between text-slate-600">
              <span>Abertas / em análise</span><span className="font-black">{k.hr.open} / {k.hr.inAnalysis}</span>
            </li>
          </ul>
        </Panel>
      </div>

      {/* KPIs de desenvolvimento */}
      <Panel title="KPIs de desenvolvimento" hint="Eficiência dos processos e evolução da operação">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card label="Tempo médio de homologação" value={ev.avgHomologationDays === null ? '—' : `${ev.avgHomologationDays} dias`} sub={ev.onTimeHomologationPct === null ? 'Sem homologações' : `${ev.onTimeHomologationPct}% em até 3 dias`} />
          <Card label="Por homologar há mais de 7 dias" value={`${ev.pendingOver7Days}`} sub={`${ev.pendingHomologation} por homologar no período`} subTone={ev.pendingOver7Days ? 'text-amber-700' : 'text-slate-500'} />
          <Card label="Tempo médio de resolução (RH)" value={k.hr.avgResolutionDays === null ? '—' : `${k.hr.avgResolutionDays} dias`} sub={`${k.hr.resolved} resolvidas no período`} />
          <Card label="Metas de clientes cumpridas" value={k.goals.total ? `${k.goals.met}/${k.goals.total}` : '—'} sub={`${k.goals.overdue} vencida(s) · ${k.goals.inProgress} em curso`} subTone={k.goals.overdue ? 'text-rose-700' : 'text-slate-500'} />
        </div>
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><span className="font-bold text-slate-600">Contratos sem data de fim</span><p className="font-black text-slate-900 text-base">{k.clients.withoutContract}</p></div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><span className="font-bold text-slate-600">Expiram em 31–60 dias</span><p className="font-black text-slate-900 text-base">{k.clients.expiringIn60}</p></div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><span className="font-bold text-slate-600">Expiram em 61–90 dias</span><p className="font-black text-slate-900 text-base">{k.clients.expiringIn90}</p></div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><span className="font-bold text-slate-600">Funcionários ativos</span><p className="font-black text-slate-900 text-base">{k.providers.active}</p></div>
        </div>
      </Panel>
    </div>
  );
};

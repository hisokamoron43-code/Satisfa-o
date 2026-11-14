import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { KpiDetailModal, KpiType } from '../components/analytics/KpiDetailModal';
import {
  ReportOptions, ReportScope, ReportSection, SECTION_LABELS, buildReportText, splitForMessages,
} from '../services/reportBuilder';
import { csatPercent, npsValue } from '../services/goalProgress';
import { exportClientsPdf, exportCompanyPdf, exportEvaluationsPdf, exportReportPdf } from '../services/pdfExport';
import { CompanyOverview } from '../components/analytics/CompanyOverview';
import {
  MessageRecipient, fetchClientGoals, fetchMessageRecipients, createConversationInDb, sendMessageInDb,
} from '../services/supabaseService';
import { ClientGoal } from '../types';

const ALL_SECTIONS: ReportSection[] = ['AVALIACOES', 'CLIENTES_METAS', 'ATIVIDADES', 'RH', 'EQUIPA', 'HOMOLOGACAO'];
const SCOPE_LABEL: Record<ReportScope, string> = {
  GLOBAL: 'Global', SERVICE: 'Por serviço', EMPLOYEE: 'Por funcionário', CLIENT: 'Por cliente',
};

export const ReportsPage: React.FC = () => {
  const { evaluations, services, clients, providers, activities, hrCases, teams, currentUser } = useApp();
  const [view, setView] = useState<'OVERVIEW' | 'REPORTS'>('OVERVIEW');
  const [selectedKpi, setSelectedKpi] = useState<KpiType | null>(null);
  const [goals, setGoals] = useState<ClientGoal[]>([]);
  const companyData = useMemo(() => ({ evaluations, clients, teams, providers, activities, hrCases, goals }), [evaluations, clients, teams, providers, activities, hrCases, goals]);
  const [scope, setScope] = useState<ReportScope>('GLOBAL');
  const [serviceId, setServiceId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [clientId, setClientId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sections, setSections] = useState<ReportSection[]>(ALL_SECTIONS);
  const [shareOpen, setShareOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { fetchClientGoals().then(setGoals); }, []);

  const scopeReady = (scope === 'SERVICE' && !!serviceId) || (scope === 'EMPLOYEE' && !!providerId)
    || (scope === 'CLIENT' && !!clientId) || scope === 'GLOBAL';

  const text = useMemo(() => {
    if (!scopeReady) return '';
    const o: ReportOptions = {
      scope, serviceId: serviceId || undefined, providerId: providerId || undefined, clientId: clientId || undefined,
      from: from || undefined, to: to || undefined, sections, generatedBy: currentUser?.name || 'Sistema',
    };
    return buildReportText(o, { evaluations, clients, goals, services, providers, activities, hrCases, teams });
  }, [scope, serviceId, providerId, clientId, from, to, sections, scopeReady, evaluations, clients, goals, services, providers, activities, hrCases, currentUser]);

  const toggleSection = (s: ReportSection) =>
    setSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setNotice('Relatório copiado.'); }
    catch { setNotice('Não foi possível copiar. Use o botão Descarregar.'); }
  };

  const download = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-sicsc-${scope.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async () => {
    if (!scopeReady) { setNotice('Escolha o serviço, funcionário ou cliente antes de exportar.'); return; }
    await exportReportPdf({ evaluations, clients, goals, services, providers, activities, hrCases }, {
      scope, serviceId: serviceId || undefined, providerId: providerId || undefined, clientId: clientId || undefined,
      from: from || undefined, to: to || undefined, sections, generatedBy: currentUser?.name || 'Sistema',
    });
  };

  const exportCsv = () => {
    if (evaluations.length === 0) { setNotice('Não existem avaliações para exportar.'); return; }
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = 'Referencia,Cliente,Servico,Prestador,Classificacao_CSAT,Score_NPS,Data,Pontuacao_Tecnica,Classificacao_Final\n';
    const rows = evaluations.map(e => [e.reference, e.clientName, e.serviceName, e.providerName, e.satisfactionRating,
      e.npsScore ?? '', e.evaluationDate, (e as any).technicalScore ?? '', (e as any).finalClassification ?? ''].map(esc).join(',')).join('\n');
    const blob = new Blob([head + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'avaliacoes-sicsc.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {([['OVERVIEW', 'Visão geral da empresa'], ['REPORTS', 'Relatórios e exportações']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer ${view === v ? 'bg-brand-dark text-white border-brand-dark' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'OVERVIEW' && (
        <CompanyOverview data={companyData} onExportPdf={(k) => exportCompanyPdf(k, currentUser?.name || 'Sistema')} />
      )}

      {view === 'REPORTS' && (<>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Relatórios</h2>
          <p className="text-xs text-slate-500">Relatórios por serviço, funcionário ou cliente, para acompanhar e partilhar por mensagem.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportPdf} disabled={!scopeReady || sections.length === 0} className="px-3 py-2 bg-brand-dark hover:bg-brand-deep text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40">Relatório (PDF)</button>
          <button onClick={() => exportEvaluationsPdf(evaluations, currentUser?.name || 'Sistema')} disabled={evaluations.length === 0} className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40">Avaliações (PDF)</button>
          <button onClick={() => exportClientsPdf(clients, currentUser?.name || 'Sistema')} disabled={clients.length === 0} className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-40">Clientes (PDF)</button>
          <button onClick={exportCsv} className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer">Avaliações (CSV)</button>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ['CSAT', `${csatPercent(evaluations).toFixed(1)}%`, 'csat'],
          ['NPS', `${npsValue(evaluations)}`, 'nps'],
          ['Avaliações', `${evaluations.length}`, 'total'],
          ['Clientes ativos', `${clients.filter(c => c.status === 'ACTIVE').length}`, 'response_rate'],
        ] as [string, string, KpiType][]).map(([label, value, kpi]) => (
          <button key={label} onClick={() => setSelectedKpi(kpi)} className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-brand cursor-pointer">
            <p className="text-[11px] font-bold text-slate-500 uppercase">{label}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{value}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Configuração */}
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-[11px] font-bold text-slate-700 uppercase mb-2">Âmbito</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SCOPE_LABEL) as ReportScope[]).map(s => (
                <button key={s} onClick={() => setScope(s)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer ${scope === s ? 'bg-brand-dark text-white border-brand-dark' : 'border-slate-300 text-slate-700'}`}>
                  {SCOPE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {scope === 'SERVICE' && (
            <label className="block text-[11px] font-bold text-slate-700 uppercase">Serviço
              <select value={serviceId} onChange={e => setServiceId(e.target.value)} className="inp mt-1">
                <option value="">Selecione…</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          {scope === 'EMPLOYEE' && (
            <label className="block text-[11px] font-bold text-slate-700 uppercase">Funcionário (prestador)
              <select value={providerId} onChange={e => setProviderId(e.target.value)} className="inp mt-1">
                <option value="">Selecione…</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          {scope === 'CLIENT' && (
            <label className="block text-[11px] font-bold text-slate-700 uppercase">Cliente
              <select value={clientId} onChange={e => setClientId(e.target.value)} className="inp mt-1">
                <option value="">Selecione…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </select>
            </label>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[11px] font-bold text-slate-700 uppercase">De<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="inp mt-1" /></label>
            <label className="text-[11px] font-bold text-slate-700 uppercase">Até<input type="date" value={to} onChange={e => setTo(e.target.value)} className="inp mt-1" /></label>
          </div>

          <div>
            <p className="text-[11px] font-bold text-slate-700 uppercase mb-2">Áreas incluídas</p>
            <div className="space-y-1.5">
              {ALL_SECTIONS.map(s => (
                <label key={s} className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                  <input type="checkbox" className="accent-brand-dark" checked={sections.includes(s)} onChange={() => toggleSection(s)} />
                  {SECTION_LABELS[s]}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Pré-visualização e ações */}
        <div className="xl:col-span-3 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShareOpen(true)} disabled={!text}
              className="px-4 py-2 bg-brand-dark disabled:opacity-50 hover:bg-brand-deep text-white rounded-xl text-xs font-bold cursor-pointer">
              Partilhar por mensagem
            </button>
            <button onClick={copy} disabled={!text} className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50">Copiar</button>
            <button onClick={download} disabled={!text} className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50">Descarregar (.txt)</button>
          </div>
          {notice && <p className="text-xs text-slate-700">{notice}</p>}
          {!scopeReady ? (
            <p className="text-sm text-slate-500 py-10 text-center">Selecione o serviço, funcionário ou cliente para gerar o relatório.</p>
          ) : (
            <pre className="text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl p-4 whitespace-pre-wrap max-h-[60vh] overflow-y-auto font-mono">{text}</pre>
          )}
        </div>
      </div>

      <KpiDetailModal kpiType={selectedKpi} isOpen={!!selectedKpi} onClose={() => setSelectedKpi(null)}
        evaluations={evaluations} services={services} clients={clients} />

      {shareOpen && text && (
        <ShareModal text={text} onClose={() => setShareOpen(false)} onDone={(n) => { setShareOpen(false); setNotice(`Relatório enviado em ${n} mensagem(ns).`); }} />
      )}
      </>)}
    </div>
  );
};

const ShareModal: React.FC<{ text: string; onClose: () => void; onDone: (parts: number) => void }> = ({ text, onClose, onDone }) => {
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  useEffect(() => { fetchMessageRecipients().then(setRecipients); }, []);

  const shown = recipients.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
  const send = async () => {
    setError(null);
    if (picked.length === 0) { setError('Selecione pelo menos um destinatário.'); return; }
    if (picked.length > 1 && groupName.trim().length < 2) { setError('Para mais de um destinatário, indique o nome do grupo.'); return; }
    setSending(true);
    const conv = await createConversationInDb(picked.length > 1 ? 'GROUP' : 'DIRECT', groupName.trim(), picked);
    if (!conv.success || !conv.id) { setSending(false); setError(conv.error || 'Não foi possível criar a conversa.'); return; }
    const parts = splitForMessages(text);
    for (const p of parts) {
      const r = await sendMessageInDb(conv.id, p);
      if (!r.success) { setSending(false); setError(r.error || 'Falha ao enviar o relatório.'); return; }
    }
    setSending(false);
    onDone(parts.length);
  };

  return (
    <div className="modal-overlay fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <span className="text-sm font-black text-slate-900">Partilhar relatório por mensagem</span>
          <button onClick={onClose} className="text-slate-400 cursor-pointer text-lg">×</button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[11px] text-slate-500">O relatório é enviado nas mensagens internas, em partes se for longo. Só os destinatários escolhidos o leem.</p>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar pessoa…" className="inp" />
          <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
            {shown.map(r => (
              <label key={r.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" className="accent-brand-dark" checked={picked.includes(r.id)}
                  onChange={() => setPicked(p => p.includes(r.id) ? p.filter(x => x !== r.id) : [...p, r.id])} />
                <span className="text-sm text-slate-900">{r.name}</span>
                <span className="text-[10px] text-slate-500 ml-auto">{r.department}</span>
              </label>
            ))}
          </div>
          {picked.length > 1 && (
            <input value={groupName} onChange={e => setGroupName(e.target.value)} maxLength={80} placeholder="Nome do grupo" className="inp" />
          )}
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
          <button onClick={send} disabled={sending} className="w-full py-2.5 bg-brand-dark disabled:opacity-60 text-white rounded-xl text-sm font-bold cursor-pointer">
            {sending ? 'A enviar…' : 'Enviar relatório'}
          </button>
        </div>
      </div>
    </div>
  );
};

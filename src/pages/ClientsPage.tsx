import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Client, ClientGoal, GoalMetric } from '../types';
import { evaluationsForClient, goalProgress, csatPercent, npsValue } from '../services/goalProgress';
import { fetchClientGoals, saveClientGoalInDb, setClientGoalStatusInDb, deleteClientGoalInDb } from '../services/supabaseService';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;
const NIF_RE = /^[0-9]{9,14}$/;
const todayIso = () => new Date().toISOString().slice(0, 10);
const fmt = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

const METRIC_LABEL: Record<GoalMetric, string> = { CSAT: 'CSAT (%)', NPS: 'NPS', EVALUATION_COUNT: 'Nº de avaliações' };
const STATE_STYLE: Record<string, string> = {
  ATINGIDA: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  CONCLUIDA: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  VENCIDA: 'bg-rose-100 text-rose-800 border-rose-300',
  NAO_CUMPRIDA: 'bg-slate-200 text-slate-700 border-slate-300',
  EM_CURSO: 'bg-amber-100 text-amber-800 border-amber-300',
};

interface ClientForm {
  companyName: string; nif: string; contactPerson: string; email: string; phone: string;
  address: string; city: string; sector: string; contractStart: string; contractEnd: string;
  services: string[]; notes: string; status: 'ACTIVE' | 'INACTIVE';
}
const emptyForm = (): ClientForm => ({
  companyName: '', nif: '', contactPerson: '', email: '', phone: '', address: '', city: 'Luanda',
  sector: '', contractStart: '', contractEnd: '', services: [], notes: '', status: 'ACTIVE',
});

function validateClient(f: ClientForm): string | null {
  if (f.companyName.trim().length < 2 || f.companyName.trim().length > 200) return 'O nome da empresa deve ter entre 2 e 200 caracteres.';
  if (f.nif && !NIF_RE.test(f.nif.trim())) return 'O NIF deve ter entre 9 e 14 dígitos.';
  if (f.contactPerson.trim().length < 2 || f.contactPerson.trim().length > 100) return 'Indique a pessoa de contacto (2 a 100 caracteres).';
  if (f.email && !EMAIL_RE.test(f.email.trim())) return 'O e-mail de contacto não é válido.';
  if (f.phone && !PHONE_RE.test(f.phone.trim())) return 'O telefone não é válido (use dígitos, espaços, + e parênteses).';
  if (f.contractStart && f.contractEnd && f.contractEnd < f.contractStart) return 'A data de fim do contrato é anterior ao início.';
  if (f.notes.length > 2000) return 'As notas não podem ter mais de 2000 caracteres.';
  return null;
}

export const ClientsPage: React.FC = () => {
  const { clients, services, evaluations, addClient, updateClient, toggleClientStatus, currentUser } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [goals, setGoals] = useState<ClientGoal[]>([]);
  const [clientModal, setClientModal] = useState<{ mode: 'create' | 'edit'; id?: string } | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [goalModal, setGoalModal] = useState<{ id?: string } | null>(null);
  const [goalForm, setGoalForm] = useState({ title: '', metric: 'CSAT' as GoalMetric, targetValue: '80', dueDate: todayIso(), description: '' });
  const [goalError, setGoalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadGoals = async () => setGoals(await fetchClientGoals());
  useEffect(() => { loadGoals(); }, []);

  const activeServices = services.filter(s => s.status === 'ACTIVE');
  const selected = clients.find(c => c.id === selectedId) ?? null;

  const rows = useMemo(() => clients
    .filter(c => statusFilter === 'ALL' || c.status === statusFilter)
    .filter(c => !search.trim() || [c.companyName, c.nif, c.contactPerson, c.sector].some(v => (v || '').toLowerCase().includes(search.toLowerCase())))
    .map(c => {
      const ev = evaluationsForClient(evaluations, c.id, c.companyName);
      const cg = goals.filter(g => g.clientId === c.id);
      const met = cg.filter(g => goalProgress(g, ev).met).length;
      const expired = !!c.contractEnd && c.contractEnd < todayIso();
      return { c, ev, cg, met, expired };
    }), [clients, evaluations, goals, search, statusFilter]);

  const openCreate = () => { setForm(emptyForm()); setFormError(null); setClientModal({ mode: 'create' }); };
  const openEdit = (c: Client) => {
    setForm({
      companyName: c.companyName, nif: c.nif || '', contactPerson: c.contactPerson, email: c.email || '', phone: c.phone || '',
      address: c.address || '', city: c.city || 'Luanda', sector: c.sector || '', contractStart: c.contractStart || '',
      contractEnd: c.contractEnd || '', services: c.contractedServices || [], notes: c.notes || '', status: c.status,
    });
    setFormError(null);
    setClientModal({ mode: 'edit', id: c.id });
  };

  const saveClient = async () => {
    const err = validateClient(form);
    if (err) { setFormError(err); return; }
    const payload = {
      companyName: form.companyName.trim(), nif: form.nif.trim() || undefined, contactPerson: form.contactPerson.trim(),
      email: form.email.trim(), phone: form.phone.trim(), address: form.address.trim() || undefined,
      city: form.city.trim() || 'Luanda', sector: form.sector.trim() || undefined,
      contractStart: form.contractStart || undefined, contractEnd: form.contractEnd || undefined,
      notes: form.notes.trim() || undefined, contractedServices: form.services,
    };
    setSaving(true);
    let res;
    if (clientModal?.mode === 'edit' && clientModal.id) {
      res = await updateClient(clientModal.id, { ...payload, status: form.status });
    } else {
      const internalCode = `CLI-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      res = await addClient({ ...payload, internalCode, status: 'ACTIVE' } as any);
      if (res.success && res.data) setSelectedId(res.data.id);
    }
    setSaving(false);
    if (!res.success) { setFormError(res.error || 'Não foi possível guardar o cliente.'); return; }
    setClientModal(null);
    setNotice('Cliente guardado com sucesso.');
  };

  const openGoal = (g?: ClientGoal) => {
    setGoalError(null);
    setGoalForm(g
      ? { title: g.title, metric: g.metric, targetValue: String(g.targetValue), dueDate: g.dueDate, description: g.description || '' }
      : { title: '', metric: 'CSAT', targetValue: '80', dueDate: todayIso(), description: '' });
    setGoalModal({ id: g?.id });
  };

  const saveGoal = async () => {
    if (!selected) return;
    const target = Number(goalForm.targetValue);
    if (goalForm.title.trim().length < 2) { setGoalError('O título da meta deve ter pelo menos 2 caracteres.'); return; }
    if (!Number.isFinite(target) || target <= 0) { setGoalError('O valor alvo deve ser um número maior que zero.'); return; }
    if ((goalForm.metric === 'CSAT' || goalForm.metric === 'NPS') && target > 100) { setGoalError('Para CSAT e NPS o valor alvo não pode passar de 100.'); return; }
    if (!goalForm.dueDate) { setGoalError('Indique o prazo da meta.'); return; }
    setSaving(true);
    const res = await saveClientGoalInDb({
      id: goalModal?.id, clientId: selected.id, title: goalForm.title, description: goalForm.description,
      metric: goalForm.metric, targetValue: target, dueDate: goalForm.dueDate,
    }, currentUser?.email || currentUser?.name || 'sistema');
    setSaving(false);
    if (!res.success) { setGoalError(res.error || 'Não foi possível guardar a meta.'); return; }
    setGoalModal(null);
    await loadGoals();
  };

  const changeGoalStatus = async (id: string, status: ClientGoal['status']) => {
    const res = await setClientGoalStatusInDb(id, status);
    if (!res.success) setNotice(res.error || 'Não foi possível atualizar a meta.');
    await loadGoals();
  };

  const removeGoal = async (id: string) => {
    if (!window.confirm('Eliminar esta meta? Esta ação não pode ser desfeita.')) return;
    const res = await deleteClientGoalInDb(id);
    if (!res.success) setNotice(res.error || 'Não foi possível eliminar a meta.');
    await loadGoals();
  };

  const selEvals = selected ? evaluationsForClient(evaluations, selected.id, selected.companyName) : [];
  const selGoals = selected ? goals.filter(g => g.clientId === selected.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate)) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Clientes</h2>
          <p className="text-xs text-slate-500">Cadastro completo, contratos, serviços e metas com prazo por cliente.</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 bg-brand-dark hover:bg-brand-deep text-white rounded-xl text-sm font-bold cursor-pointer">
          Novo cliente
        </button>
      </div>

      {notice && (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-2 text-xs">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="font-bold cursor-pointer">×</button>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar por empresa, NIF, contacto ou sector…"
          className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white">
          <option value="ALL">Todos os estados</option>
          <option value="ACTIVE">Ativos</option>
          <option value="INACTIVE">Inativos</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Lista */}
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {rows.length === 0 && <p className="p-6 text-sm text-slate-500 text-center">Nenhum cliente encontrado.</p>}
          {rows.map(({ c, ev, cg, met, expired }) => (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-4 py-3 hover:bg-slate-50 cursor-pointer ${selectedId === c.id ? 'bg-emerald-50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900 truncate">{c.companyName}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-200 text-slate-700 border-slate-300'}`}>
                  {c.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {c.sector || 'Sem sector'} · {c.nif ? `NIF ${c.nif}` : 'NIF por preencher'}
                {expired && <span className="text-rose-600 font-bold"> · contrato expirado</span>}
              </p>
              <p className="text-[11px] text-slate-600 mt-1">
                {ev.length} avaliações · CSAT {csatPercent(ev).toFixed(0)}% · metas atingidas {met}/{cg.length}
              </p>
            </button>
          ))}
        </div>

        {/* Detalhe */}
        <div className="xl:col-span-3">
          {!selected ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-sm text-slate-500">
              Selecione um cliente para ver o cadastro, o desempenho e as metas.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{selected.companyName}</h3>
                    <p className="text-xs text-slate-500">Código {selected.internalCode}{selected.nif ? ` · NIF ${selected.nif}` : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(selected)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold cursor-pointer">Editar</button>
                    <button onClick={async () => { const r = await toggleClientStatus(selected.id); if (!r.success) setNotice(r.error || 'Erro'); }}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold cursor-pointer">
                      {selected.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}
                    </button>
                  </div>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <div><dt className="text-slate-500">Contacto</dt><dd className="font-semibold text-slate-900">{selected.contactPerson || '—'}</dd></div>
                  <div><dt className="text-slate-500">E-mail</dt><dd className="font-semibold text-slate-900">{selected.email || '—'}</dd></div>
                  <div><dt className="text-slate-500">Telefone</dt><dd className="font-semibold text-slate-900">{selected.phone || '—'}</dd></div>
                  <div><dt className="text-slate-500">Morada</dt><dd className="font-semibold text-slate-900">{[selected.address, selected.city].filter(Boolean).join(', ') || '—'}</dd></div>
                  <div><dt className="text-slate-500">Sector</dt><dd className="font-semibold text-slate-900">{selected.sector || '—'}</dd></div>
                  <div><dt className="text-slate-500">Contrato</dt><dd className="font-semibold text-slate-900">{fmt(selected.contractStart)} → {fmt(selected.contractEnd)}</dd></div>
                </dl>
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Serviços contratados</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(selected.contractedServices || []).length === 0 && <span className="text-xs text-slate-500">Nenhum serviço associado.</span>}
                    {(selected.contractedServices || []).map(s => <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-800">{s}</span>)}
                  </div>
                </div>
                {selected.notes && <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-3 whitespace-pre-wrap">{selected.notes}</p>}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 grid grid-cols-3 gap-3 text-center">
                <div><p className="text-2xl font-black text-slate-900">{selEvals.length}</p><p className="text-[11px] text-slate-500">Avaliações</p></div>
                <div><p className="text-2xl font-black text-slate-900">{csatPercent(selEvals).toFixed(1)}%</p><p className="text-[11px] text-slate-500">CSAT</p></div>
                <div><p className="text-2xl font-black text-slate-900">{npsValue(selEvals)}</p><p className="text-[11px] text-slate-500">NPS</p></div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">Metas e progresso</h4>
                    <p className="text-[11px] text-slate-500">O progresso conta apenas avaliações feitas desde a criação de cada meta.</p>
                  </div>
                  <button onClick={() => openGoal()} className="px-3 py-1.5 bg-brand-dark hover:bg-brand-deep text-white rounded-lg text-xs font-bold cursor-pointer">Nova meta</button>
                </div>
                {selGoals.length === 0 && <p className="text-xs text-slate-500">Ainda não há metas para este cliente.</p>}
                {selGoals.map(g => {
                  const gp = goalProgress(g, evaluationsForClient(evaluations, selected.id, selected.companyName));
                  return (
                    <div key={g.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{g.title}</p>
                          <p className="text-[11px] text-slate-500">{METRIC_LABEL[g.metric]} · alvo {g.targetValue} · prazo {fmt(g.dueDate)}
                            {gp.state !== 'CONCLUIDA' && gp.state !== 'NAO_CUMPRIDA' && <> · {gp.daysLeft >= 0 ? `faltam ${gp.daysLeft} dia(s)` : `${-gp.daysLeft} dia(s) de atraso`}</>}
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATE_STYLE[gp.state]}`}>{gp.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-brand rounded-full" style={{ width: `${gp.percent}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-800 w-28 text-right">{gp.current} / {g.targetValue}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {g.status !== 'CONCLUIDA' && <button onClick={() => changeGoalStatus(g.id, 'CONCLUIDA')} className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer">Marcar concluída</button>}
                        {g.status !== 'NAO_CUMPRIDA' && <button onClick={() => changeGoalStatus(g.id, 'NAO_CUMPRIDA')} className="text-[11px] font-bold text-slate-600 hover:underline cursor-pointer">Não cumprida</button>}
                        {(g.status === 'CONCLUIDA' || g.status === 'NAO_CUMPRIDA') && <button onClick={() => changeGoalStatus(g.id, 'PENDENTE')} className="text-[11px] font-bold text-slate-600 hover:underline cursor-pointer">Reabrir</button>}
                        <button onClick={() => openGoal(g)} className="text-[11px] font-bold text-slate-700 hover:underline cursor-pointer">Editar</button>
                        <button onClick={() => removeGoal(g.id)} className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer">Eliminar</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {clientModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <span className="text-sm font-black text-slate-900">{clientModal.mode === 'create' ? 'Novo cliente' : 'Editar cliente'}</span>
              <button onClick={() => setClientModal(null)} className="text-slate-400 cursor-pointer text-lg">×</button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nome da empresa *" wide><input value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} maxLength={200} className="inp" /></Field>
              <Field label="NIF (9 a 14 dígitos)"><input value={form.nif} onChange={e => setForm({ ...form, nif: e.target.value })} maxLength={14} className="inp" /></Field>
              <Field label="Sector"><input value={form.sector} onChange={e => setForm({ ...form, sector: e.target.value })} maxLength={80} className="inp" /></Field>
              <Field label="Pessoa de contacto *"><input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} maxLength={100} className="inp" /></Field>
              <Field label="E-mail"><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} maxLength={254} className="inp" /></Field>
              <Field label="Telefone"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} maxLength={20} className="inp" /></Field>
              <Field label="Cidade"><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} maxLength={80} className="inp" /></Field>
              <Field label="Morada" wide><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} maxLength={200} className="inp" /></Field>
              <Field label="Início do contrato"><input type="date" value={form.contractStart} onChange={e => setForm({ ...form, contractStart: e.target.value })} className="inp" /></Field>
              <Field label="Fim do contrato"><input type="date" value={form.contractEnd} onChange={e => setForm({ ...form, contractEnd: e.target.value })} className="inp" /></Field>
              <div className="sm:col-span-2 space-y-1">
                <p className="text-[11px] font-bold text-slate-700 uppercase">Serviços contratados</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl max-h-40 overflow-y-auto">
                  {activeServices.length === 0 && <p className="text-xs text-slate-500">Não há serviços ativos. Crie-os na página de Serviços.</p>}
                  {activeServices.map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" className="accent-brand-dark" checked={form.services.includes(s.name)}
                        onChange={() => setForm({ ...form, services: form.services.includes(s.name) ? form.services.filter(x => x !== s.name) : [...form.services, s.name] })} />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>
              <Field label="Notas" wide><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} maxLength={2000} className="inp" /></Field>
              {clientModal.mode === 'edit' && (
                <Field label="Estado"><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })} className="inp">
                  <option value="ACTIVE">Ativo</option><option value="INACTIVE">Inativo</option></select></Field>
              )}
              {formError && <p className="sm:col-span-2 text-xs text-rose-600 font-medium">{formError}</p>}
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button onClick={() => setClientModal(null)} className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer">Cancelar</button>
                <button onClick={saveClient} disabled={saving} className="px-4 py-2 bg-brand-dark disabled:opacity-60 text-white rounded-xl text-xs font-bold cursor-pointer">
                  {saving ? 'A guardar…' : 'Guardar cliente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {goalModal && selected && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <span className="text-sm font-black text-slate-900">{goalModal.id ? 'Editar meta' : 'Nova meta'} · {selected.companyName}</span>
              <button onClick={() => setGoalModal(null)} className="text-slate-400 cursor-pointer text-lg">×</button>
            </div>
            <div className="p-5 space-y-3">
              <Field label="Título da meta *"><input value={goalForm.title} onChange={e => setGoalForm({ ...goalForm, title: e.target.value })} maxLength={150} className="inp" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Métrica"><select value={goalForm.metric} onChange={e => setGoalForm({ ...goalForm, metric: e.target.value as GoalMetric })} className="inp">
                  <option value="CSAT">CSAT (%)</option><option value="NPS">NPS</option><option value="EVALUATION_COUNT">Nº de avaliações</option></select></Field>
                <Field label="Valor alvo *"><input type="number" min="0" step="0.1" value={goalForm.targetValue} onChange={e => setGoalForm({ ...goalForm, targetValue: e.target.value })} className="inp" /></Field>
              </div>
              <Field label="Prazo para cumprir *"><input type="date" value={goalForm.dueDate} onChange={e => setGoalForm({ ...goalForm, dueDate: e.target.value })} className="inp" /></Field>
              <Field label="Descrição"><textarea rows={2} maxLength={500} value={goalForm.description} onChange={e => setGoalForm({ ...goalForm, description: e.target.value })} className="inp" /></Field>
              {goalError && <p className="text-xs text-rose-600 font-medium">{goalError}</p>}
              <button onClick={saveGoal} disabled={saving} className="w-full py-2.5 bg-brand-dark disabled:opacity-60 text-white rounded-xl text-sm font-bold cursor-pointer">
                {saving ? 'A guardar…' : 'Guardar meta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; wide?: boolean; children: React.ReactNode }> = ({ label, wide, children }) => (
  <label className={`space-y-1 ${wide ? 'sm:col-span-2' : ''}`}>
    <span className="block text-[11px] font-bold text-slate-700 uppercase">{label}</span>
    {children}
  </label>
);

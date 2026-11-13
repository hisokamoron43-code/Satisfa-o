import React, { useMemo, useState } from 'react';
import { Plus, Trash2, UserCheck, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SearchableSelect } from '../components/ui/SearchableSelect';

const DEFAULT_DEPARTMENTS = [
  'Operações',
  'Higiene & Limpeza Industrial',
  'Segurança Ambiental & Desinfestação',
  'Higiene, Segurança & Trabalho (HST)',
  'Manutenção Geral',
];

export const TeamsPage: React.FC = () => {
  const { teams, providers, addTeam, deleteTeam, currentUser } = useApp();
  const canManage = currentUser?.role === 'ADMIN' || currentUser?.role === 'HR';

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [department, setDepartment] = useState('Operações');
  const [supervisorId, setSupervisorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const departments = useMemo(
    () => [...new Set([...DEFAULT_DEPARTMENTS, ...teams.map(t => t.department).filter(Boolean)])].sort((a, b) => a.localeCompare(b)),
    [teams],
  );
  // Supervisores são sempre funcionários (prestadores) cadastrados e ativos
  const supervisorOptions = useMemo(
    () => providers.filter(p => p.status === 'ACTIVE').map(p => ({ value: p.id, label: p.name, hint: p.internalCode })),
    [providers],
  );
  const supervisorName = (id?: string) => providers.find(p => p.id === id)?.name;

  const reset = () => { setName(''); setCode(''); setDepartment('Operações'); setSupervisorId(''); setError(null); };

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) { setError('O nome da equipa deve ter pelo menos 2 caracteres.'); return; }
    setBusy(true);
    const res = await addTeam({
      name: name.trim(),
      code: code.trim(),
      department: department.trim() || 'Operações',
      supervisorProviderId: supervisorId || undefined,
      status: 'ACTIVE',
      membersCount: 0,
    });
    setBusy(false);
    if (!res.success) { setError(res.error || 'Não foi possível criar a equipa.'); return; }
    reset();
    setShowForm(false);
  };

  const remove = async (id: string, teamName: string) => {
    if (!window.confirm(`Apagar a equipa "${teamName}"? Os funcionários, avaliações e atividades ligados a ela ficam sem equipa; o histórico mantém-se.`)) return;
    const r = await deleteTeam(id);
    if (!r.success) window.alert(r.error || 'Não foi possível apagar a equipa.');
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold text-brand-dark uppercase tracking-wider">Operações</span>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Equipas</h1>
          <p className="text-xs text-slate-500 mt-1">Crie equipas e escolha o supervisor entre os funcionários cadastrados.</p>
        </div>
        {canManage && !showForm && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-dark hover:bg-brand-deep text-white rounded-xl text-sm font-bold">
            <Plus className="w-4 h-4" /> Nova equipa
          </button>
        )}
      </header>

      {showForm && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 md:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-900">Criar nova equipa</h2>
            <button onClick={() => { reset(); setShowForm(false); }} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Fechar"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700">Nome da equipa *</span>
              <input value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="Ex.: Equipa Delta — Desinfestação"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700">Código (opcional)</span>
              <input value={code} onChange={e => setCode(e.target.value)} maxLength={30} placeholder="Ex.: EQ-DELTA"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </label>
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700">Departamento</span>
              <SearchableSelect options={departments.map(d => ({ value: d, label: d }))} value={department} onChange={setDepartment}
                allowCreate createLabel="Criar departamento" ariaLabel="Departamento" />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700">Supervisor (funcionário cadastrado)</span>
              <SearchableSelect options={supervisorOptions} value={supervisorId} onChange={setSupervisorId}
                placeholder={supervisorOptions.length ? 'Sem supervisor' : 'Cadastre primeiro um funcionário'} ariaLabel="Supervisor" />
            </div>
          </div>
          {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button onClick={() => { reset(); setShowForm(false); }} className="px-4 py-2.5 border border-slate-300 rounded-xl text-sm font-bold">Cancelar</button>
            <button onClick={submit} disabled={busy} className="px-4 py-2.5 bg-brand-dark text-white rounded-xl text-sm font-bold disabled:opacity-50">
              {busy ? 'A criar…' : 'Criar equipa'}
            </button>
          </div>
        </section>
      )}

      {teams.length === 0 ? (
        <p className="p-6 bg-white border border-dashed border-slate-300 rounded-2xl text-sm text-slate-500 text-center">Ainda não há equipas criadas.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teams.map(team => {
            const members = providers.filter(p => p.teamId === team.id);
            const sup = supervisorName(team.supervisorProviderId);
            return (
              <article key={team.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-slate-900 truncate">{team.name}</h3>
                    <p className="text-[11px] text-slate-500 truncate">{team.department}{team.code ? ` · ${team.code}` : ''}</p>
                  </div>
                  {canManage && (
                    <button onClick={() => remove(team.id, team.name)} className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 shrink-0" aria-label={`Apagar ${team.name}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <UserCheck className="w-3.5 h-3.5 text-brand-dark shrink-0" />
                  {sup
                    ? <span className="text-slate-800">Supervisor: <strong>{sup}</strong></span>
                    : <span className="text-slate-500">Sem supervisor atribuído</span>}
                </div>
                <div className="text-xs text-slate-600">
                  <span className="font-bold">{members.length}</span> funcionário(s) nesta equipa
                  {members.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {members.map(m => (
                        <li key={m.id} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px]">{m.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-auto">{team.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}</p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

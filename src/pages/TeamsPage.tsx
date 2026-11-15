import { fetchSupervisorCandidates, SupervisorCandidate } from '../services/supabaseService';
import React, { useMemo, useState, useEffect } from 'react';
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
  const { teams, providers, addTeam, deleteTeam, updateProvider, currentUser } = useApp();
  const canManage = currentUser?.role === 'ADMIN' || currentUser?.role === 'HR';

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [department, setDepartment] = useState('Operações');
  const [supervisorId, setSupervisorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Membros escolhidos ao criar a equipa e feedback da gestão de membros nas equipas existentes
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [manageBusy, setManageBusy] = useState<string | null>(null);
  const [manageMsg, setManageMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const activeProviders = useMemo(
    () => providers.filter(p => p.status === 'ACTIVE').sort((a, b) => a.name.localeCompare(b.name)),
    [providers],
  );
  const teamName = (id?: string) => teams.find(t => t.id === id)?.name;

  const departments = useMemo(
    () => [...new Set([...DEFAULT_DEPARTMENTS, ...teams.map(t => t.department).filter(Boolean)])].sort((a, b) => a.localeCompare(b)),
    [teams],
  );
  // O supervisor pode ser um membro cadastrado (funcionário) ou um prestador, ambos ativos.
  const [candidatos, setCandidatos] = useState<SupervisorCandidate[] | null>(null);
  useEffect(() => {
    let ativo = true;
    fetchSupervisorCandidates().then(r => { if (ativo) setCandidatos(r); });
    return () => { ativo = false; };
  }, []);

  const supervisorOptions = useMemo(() => {
    // Se a função da base de dados ainda não existe (migração 1012 por executar), usa só os prestadores.
    const base: SupervisorCandidate[] = candidatos && candidatos.length > 0
      ? candidatos
      : providers.filter(p => p.status === 'ACTIVE').map(p => ({ kind: 'PROVIDER' as const, id: p.id, name: p.name, code: p.internalCode }));
    return base.map(c => ({
      value: `${c.kind}:${c.id}`,
      label: c.name,
      hint: `${c.kind === 'PROVIDER' ? 'Prestador' : 'Membro'}${c.code ? ` · ${c.code}` : ''}`,
    }));
  }, [candidatos, providers]);

  const nomeSupervisor = (t: { supervisorProviderId?: string; supervisorEmployeeId?: string; supervisorEmployeeName?: string }) => {
    if (t.supervisorProviderId) {
      const p = providers.find(x => x.id === t.supervisorProviderId)?.name;
      return p ? `${p} (prestador)` : undefined;
    }
    if (t.supervisorEmployeeId) return t.supervisorEmployeeName ? `${t.supervisorEmployeeName} (membro)` : 'Membro cadastrado';
    return undefined;
  };

  const reset = () => { setName(''); setCode(''); setDepartment('Operações'); setSupervisorId(''); setError(null); setMemberIds([]); setMemberSearch(''); };

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) { setError('O nome da equipa deve ter pelo menos 2 caracteres.'); return; }
    setBusy(true);
    const res = await addTeam({
      name: name.trim(),
      code: code.trim(),
      department: department.trim() || 'Operações',
      supervisorProviderId: supervisorId.startsWith('PROVIDER:') ? supervisorId.slice('PROVIDER:'.length) : undefined,
      supervisorEmployeeId: supervisorId.startsWith('EMPLOYEE:') ? supervisorId.slice('EMPLOYEE:'.length) : undefined,
      supervisorEmployeeName: supervisorId.startsWith('EMPLOYEE:')
        ? supervisorOptions.find(o => o.value === supervisorId)?.label
        : undefined,
      status: 'ACTIVE',
      membersCount: 0,
    });
    if (!res.success || !res.data) { setBusy(false); setError(res.error || 'Não foi possível criar a equipa.'); return; }

    // Associa os membros escolhidos (um prestador pertence a uma só equipa: quem estava noutra é movido)
    const falhas: string[] = [];
    for (const id of memberIds) {
      const r = await updateProvider(id, { teamId: res.data.id });
      if (!r.success) falhas.push(`${providers.find(p => p.id === id)?.name ?? id}: ${r.error || 'erro desconhecido'}`);
    }
    setBusy(false);
    if (falhas.length > 0) {
      setManageMsg({ ok: false, text: `A equipa «${res.data.name}» foi criada, mas ${falhas.length} membro(s) não foram associados — ${falhas.join('; ')}. Adicione-os na equipa.` });
    } else if (memberIds.length > 0) {
      setManageMsg({ ok: true, text: `Equipa «${res.data.name}» criada com ${memberIds.length} membro(s).` });
    }
    reset();
    setShowForm(false);
  };

  const toggleMember = (id: string) => setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  /** Adiciona, remove ou move um prestador: teamId vazio = sem equipa. */
  const moveMember = async (providerId: string, targetTeamId: string, mensagemOk: string) => {
    setManageBusy(providerId);
    setManageMsg(null);
    const r = await updateProvider(providerId, { teamId: targetTeamId });
    setManageBusy(null);
    setManageMsg(r.success ? { ok: true, text: mensagemOk } : { ok: false, text: r.error || 'Não foi possível atualizar a equipa do membro.' });
  };

  const addMember = (providerId: string, team: { id: string; name: string }) => {
    const p = providers.find(x => x.id === providerId);
    if (!p) return;
    const atual = teamName(p.teamId);
    if (p.teamId && p.teamId !== team.id && !window.confirm(`${p.name} já pertence à equipa «${atual ?? 'outra equipa'}». Mover para «${team.name}»?`)) return;
    moveMember(providerId, team.id, `${p.name} adicionado(a) à equipa «${team.name}».`);
  };

  const removeMember = (providerId: string, team: { id: string; name: string }) => {
    const p = providers.find(x => x.id === providerId);
    if (!p || !window.confirm(`Retirar ${p.name} da equipa «${team.name}»? O histórico de avaliações mantém-se.`)) return;
    moveMember(providerId, '', `${p.name} retirado(a) da equipa «${team.name}».`);
  };

  const transferMember = (providerId: string, toTeamId: string) => {
    const p = providers.find(x => x.id === providerId);
    const destino = teams.find(t => t.id === toTeamId);
    if (!p || !destino) return;
    moveMember(providerId, toTeamId, `${p.name} movido(a) para a equipa «${destino.name}».`);
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
          <p className="text-xs text-slate-500 mt-1">Crie equipas e escolha o supervisor entre os membros cadastrados ou os prestadores. A nota de cada avaliação aplica-se a toda a equipa, incluindo o supervisor.</p>
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
              <span className="text-xs font-bold text-slate-700">Supervisor (membro ou prestador)</span>
              <SearchableSelect options={supervisorOptions} value={supervisorId} onChange={setSupervisorId}
                placeholder={supervisorOptions.length ? 'Sem supervisor' : 'Cadastre primeiro um membro ou prestador'} ariaLabel="Supervisor" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">Membros da equipa ({memberIds.length} selecionado{memberIds.length === 1 ? '' : 's'})</span>
              <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Pesquisar prestador…"
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            {activeProviders.length === 0 ? (
              <p className="text-xs text-slate-500">Ainda não há prestadores ativos. Cadastre-os na página Prestadores.</p>
            ) : (
              <ul className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {activeProviders
                  .filter(p => p.name.toLowerCase().includes(memberSearch.trim().toLowerCase()))
                  .map(p => {
                    const noutra = p.teamId ? teamName(p.teamId) : undefined;
                    return (
                      <li key={p.id}>
                        <label className="flex items-center gap-3 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50">
                          <input type="checkbox" checked={memberIds.includes(p.id)} onChange={() => toggleMember(p.id)} />
                          <span className="font-semibold text-slate-800">{p.name}</span>
                          {p.specialty && <span className="text-slate-500">{p.specialty}</span>}
                          {noutra && <span className="ml-auto text-amber-700">Já está em «{noutra}», será movido</span>}
                        </label>
                      </li>
                    );
                  })}
              </ul>
            )}
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

      {manageMsg && (
        <p className={`p-3 rounded-xl text-xs border ${manageMsg.ok ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
          {manageMsg.text}
        </p>
      )}

      {teams.length === 0 ? (
        <p className="p-6 bg-white border border-dashed border-slate-300 rounded-2xl text-sm text-slate-500 text-center">Ainda não há equipas criadas.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {teams.map(team => {
            const members = providers.filter(p => p.teamId === team.id);
            const sup = nomeSupervisor(team);
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
                <div className="text-xs text-slate-600 space-y-2">
                  <p><span className="font-bold">{members.length}</span> funcionário(s) nesta equipa</p>
                  {members.length > 0 && (
                    <ul className="space-y-1.5">
                      {members.map(m => (
                        <li key={m.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                          <span className="text-[11px] font-semibold text-slate-800 mr-auto">{m.name}</span>
                          {canManage && (
                            <>
                              {teams.length > 1 && (
                                <select
                                  aria-label={`Mover ${m.name} para outra equipa`}
                                  disabled={manageBusy === m.id}
                                  value=""
                                  onChange={e => { if (e.target.value) transferMember(m.id, e.target.value); }}
                                  className="text-[11px] border border-slate-300 rounded-md px-1.5 py-1 bg-white max-w-[9rem]"
                                >
                                  <option value="">Mover para…</option>
                                  {teams.filter(t => t.id !== team.id && t.status === 'ACTIVE').map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                              )}
                              <button
                                onClick={() => removeMember(m.id, team)}
                                disabled={manageBusy === m.id}
                                className="p-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 disabled:opacity-50"
                                aria-label={`Retirar ${m.name} da equipa`}
                                title="Retirar da equipa"
                              ><X className="w-3 h-3" /></button>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canManage && (
                    <select
                      aria-label={`Adicionar membro à equipa ${team.name}`}
                      value=""
                      onChange={e => { if (e.target.value) addMember(e.target.value, team); }}
                      className="w-full text-[11px] border border-dashed border-slate-300 rounded-lg px-2 py-1.5 bg-white"
                    >
                      <option value="">+ Adicionar membro…</option>
                      {activeProviders.filter(p => p.teamId !== team.id).map(p => (
                        <option key={p.id} value={p.id}>{p.name}{p.teamId ? ` (em ${teamName(p.teamId) ?? 'outra equipa'})` : ''}</option>
                      ))}
                    </select>
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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Star, RefreshCw, UserCheck, ThumbsUp, ThumbsDown, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { fetchMyTeamOverview, isSupabaseConfigured, type MyTeamOverview } from '../services/supabaseService';
import { avaliacoesDoPrestador } from '../services/grupoAvaliacao';
import type { Evaluation } from '../types';
import { nomeEmpresaParaAvaliados } from '../services/privacidadeEmpresa';

type Aba = 'notas' | 'equipa';

const fmtData = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-PT');
};

/**
 * Área do prestador/membro da equipa: as notas das avaliações homologadas do seu grupo e os colegas de equipa.
 * A nota conta para todos os membros da equipa (e para o supervisor), não só para quem foi atribuído à avaliação.
 */
export const MyTeamPage: React.FC = () => {
  const { currentUser, providers, teams, evaluations } = useApp();
  const [aba, setAba] = useState<Aba>('notas');
  const [dados, setDados] = useState<MyTeamOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    setErro(null);
    const r = await fetchMyTeamOverview();
    setLoading(false);
    if (r.success && r.data) setDados(r.data); else setErro(r.error || 'Não foi possível carregar a sua equipa.');
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Modo de demonstração (sem Supabase): calcula a partir dos dados locais
  const demo: MyTeamOverview | null = useMemo(() => {
    if (isSupabaseConfigured) return null;
    const eu = providers.find(p =>
      (currentUser?.providerId && p.id === currentUser.providerId) ||
      (currentUser?.email && p.professionalEmail?.toLowerCase() === currentUser.email.toLowerCase()) ||
      p.name?.toLowerCase() === currentUser?.name?.toLowerCase());
    if (!eu) return { linked: false, members: [], evaluations: [] };
    const equipa = teams.find(t => t.id === eu.teamId);
    const membros = providers.filter(p => p.status === 'ACTIVE' && (p.teamId === eu.teamId && eu.teamId));
    const sup = equipa?.supervisorProviderId ? providers.find(p => p.id === equipa.supervisorProviderId) : undefined;
    const lista = [...membros, ...(sup && !membros.some(m => m.id === sup.id) ? [sup] : [])];
    return {
      linked: true,
      provider: { id: eu.id, name: eu.name, specialty: eu.specialty },
      team: equipa ? { id: equipa.id, name: equipa.name, code: equipa.code, department: equipa.department, supervisorName: sup?.name ?? equipa.supervisorEmployeeName ?? equipa.supervisorName } : null,
      members: lista.map(m => ({ id: m.id, name: m.name, specialty: m.specialty, isSupervisor: m.id === equipa?.supervisorProviderId })),
      evaluations: avaliacoesDoPrestador((evaluations as Evaluation[]).filter(e => e.finalizedAt), eu, teams).map(e => ({
        id: e.id, reference: e.reference, serviceDate: e.serviceDate, clientName: e.clientVisibleToTeam ? e.clientName : null, clientVisible: e.clientVisibleToTeam === true, serviceName: e.serviceName,
        teamName: e.teamName, providerName: e.providerName, technicalScore: e.technicalScore ?? null,
        finalClassification: (e.finalClassification as any) ?? null, finalizedAt: e.finalizedAt ?? null,
      })),
    };
  }, [providers, teams, evaluations, currentUser]);

  const info = isSupabaseConfigured ? dados : demo;
  const notas = (info?.evaluations ?? []).filter(e => typeof e.technicalScore === 'number');
  const media = notas.length ? notas.reduce((s, e) => s + Number(e.technicalScore), 0) / notas.length : null;
  const positivas = (info?.evaluations ?? []).filter(e => e.finalClassification === 'POSITIVE').length;
  const negativas = (info?.evaluations ?? []).filter(e => e.finalClassification === 'NEGATIVE').length;

  const abaBtn = (id: Aba, label: string, Icon: React.ElementType) => (
    <button
      onClick={() => setAba(id)}
      className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition cursor-pointer ${aba === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold text-brand-dark uppercase tracking-wider">Operações</span>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">A Minha Equipa</h1>
          <p className="text-xs text-slate-500 mt-1">
            {info?.team ? <>Equipa <strong>{info.team.name}</strong>{info.team.supervisorName ? <> · Supervisor: <strong>{info.team.supervisorName}</strong></> : null}</> : 'As notas das avaliações homologadas do seu grupo.'}
          </p>
        </div>
        {isSupabaseConfigured && (
          <button onClick={carregar} disabled={loading} className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        )}
      </header>

      {erro && <p className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs">{erro}</p>}

      {info && !info.linked && (
        <p className="p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-sm">
          A sua conta ainda não está ligada a um prestador. Peça ao RH ou ao Administrador para a associar.
        </p>
      )}

      {info?.linked && (
        <>
          <div className="flex flex-wrap gap-2">
            {abaBtn('notas', 'Notas', Star)}
            {abaBtn('equipa', 'Equipa', Users)}
          </div>

          {aba === 'notas' && (
            <section className="space-y-4">
              <p className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                A nota de cada avaliação conta para <strong>toda a equipa</strong> (membros e supervisor), não só para quem foi atribuído ao serviço. Só aparecem avaliações já homologadas.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white border border-slate-200 rounded-2xl p-4"><p className="text-[11px] font-bold text-slate-500 uppercase">Nota média</p><p className="text-2xl font-black text-slate-900">{media === null ? '—' : `${media.toFixed(1)}%`}</p></div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4"><p className="text-[11px] font-bold text-slate-500 uppercase">Avaliações</p><p className="text-2xl font-black text-slate-900">{info.evaluations.length}</p></div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4"><p className="text-[11px] font-bold text-emerald-700 uppercase">Positivas</p><p className="text-2xl font-black text-emerald-700">{positivas}</p></div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4"><p className="text-[11px] font-bold text-rose-700 uppercase">Negativas</p><p className="text-2xl font-black text-rose-700">{negativas}</p></div>
              </div>

              {info.evaluations.length === 0 ? (
                <p className="p-6 bg-white border border-dashed border-slate-300 rounded-2xl text-sm text-slate-500 text-center">
                  {loading ? 'A carregar…' : 'Ainda não há avaliações homologadas para o seu grupo.'}
                </p>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-3 text-left">Referência</th>
                        <th className="p-3 text-left">Data do serviço</th>
                        <th className="p-3 text-left">Empresa</th>
                        <th className="p-3 text-left">Serviço</th>
                        <th className="p-3 text-left">Atribuído a</th>
                        <th className="p-3 text-right">Nota</th>
                        <th className="p-3 text-left">Resultado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {info.evaluations.map(e => (
                        <tr key={e.id}>
                          <td className="p-3 font-mono">{e.reference}</td>
                          <td className="p-3 whitespace-nowrap">{fmtData(e.serviceDate)}</td>
                          <td className="p-3">{nomeEmpresaParaAvaliados(e.clientName, e.clientVisible)}</td>
                          <td className="p-3">{e.serviceName || '—'}</td>
                          <td className="p-3">{e.providerName || '—'}</td>
                          <td className="p-3 text-right font-bold">{typeof e.technicalScore === 'number' ? `${Number(e.technicalScore).toFixed(1)}%` : '—'}</td>
                          <td className="p-3">
                            {e.finalClassification === 'POSITIVE'
                              ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold"><ThumbsUp className="w-3 h-3" /> Positiva</span>
                              : e.finalClassification === 'NEGATIVE'
                                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold"><ThumbsDown className="w-3 h-3" /> Negativa</span>
                                : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {aba === 'equipa' && (
            <section className="space-y-3">
              {!info.team ? (
                <p className="p-6 bg-white border border-dashed border-slate-300 rounded-2xl text-sm text-slate-500 text-center">Ainda não pertence a nenhuma equipa. Peça ao RH para o(a) adicionar.</p>
              ) : (
                <>
                  <p className="text-xs text-slate-600">{info.team.department}{info.team.code ? ` · ${info.team.code}` : ''} · <strong>{info.members.length}</strong> membro(s)</p>
                  <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {info.members.map(m => (
                      <li key={m.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">{m.isSupervisor ? <UserCheck className="w-4 h-4 text-brand-dark" /> : <Users className="w-4 h-4 text-slate-500" />}</div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{m.name}{m.id === info.provider?.id ? ' (você)' : ''}</p>
                          <p className="text-[11px] text-slate-500 truncate">{m.isSupervisor ? 'Supervisor' : (m.specialty || 'Membro da equipa')}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
};

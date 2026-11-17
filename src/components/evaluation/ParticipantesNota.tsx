import React, { useEffect, useMemo, useState } from 'react';
import { Users, Link2 } from 'lucide-react';
import type { Activity, Evaluation, Provider, Team, TeamMembership } from '../../types';
import {
  fetchEvaluationParticipants, setEvaluationActivityInDb, isSupabaseConfigured, type ParticipanteAvaliacaoDb,
} from '../../services/supabaseService';
import {
  atividadeDaAvaliacao, participantesDaAvaliacao, MOTIVO_PARTICIPACAO, type MotivoParticipacao,
} from '../../services/grupoAvaliacao';

interface Props {
  ev: Evaluation;
  providers: Provider[];
  teams: Team[];
  activities: Activity[];
  teamHistory: TeamMembership[];
  /** Pode ligar a avaliação a outra atividade (só antes de homologar). */
  canLink?: boolean;
  /** Chamado depois de ligar a uma atividade, para recarregar os dados. */
  onLinked?: () => void | Promise<void>;
}

const fmt = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
const pesoTxt = (n: number) => `${n.toFixed(2).replace('.', ',')}%`;

/**
 * Mostra quem recebe a nota de uma avaliação: quem foi ao serviço conta, quem ficou de fora ou entrou
 * na equipa depois não conta. Usa o cálculo do servidor quando disponível (é o que fica gravado ao
 * homologar) e, se não, o mesmo cálculo no navegador.
 */
export const ParticipantesNota: React.FC<Props> = ({ ev, providers, teams, activities, teamHistory, canLink, onLinked }) => {
  const [servidor, setServidor] = useState<ParticipanteAvaliacaoDb[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ativo = true;
    if (isSupabaseConfigured) fetchEvaluationParticipants(ev.id).then(r => { if (ativo) setServidor(r); });
    return () => { ativo = false; };
  }, [ev.id, ev.activityId, ev.teamId, ev.providerId, ev.finalizedAt]);

  const local = useMemo(
    () => participantesDaAvaliacao(ev, providers, teams, { historico: teamHistory, atividades: activities }),
    [ev, providers, teams, teamHistory, activities],
  );
  const linhas = useMemo(() => {
    const nome = (id: string) => providers.find(p => p.id === id)?.name ?? 'Prestador';
    if (servidor && servidor.length > 0) {
      return servidor.map(s => ({ id: s.providerId, nome: s.name || nome(s.providerId), conta: s.counts, motivo: s.reason as MotivoParticipacao, peso: s.weightPercentage }));
    }
    return local.map(l => ({ id: l.providerId, nome: nome(l.providerId), conta: l.conta, motivo: l.motivo, peso: l.peso }));
  }, [servidor, local, providers]);

  const atividadeId = atividadeDaAvaliacao(ev, activities)?.id;
  const atividade: Activity | undefined = activities.find(a => a.id === atividadeId);
  const candidatas = useMemo(
    () => activities.filter(a => a.teamId && a.teamId === ev.teamId && a.status !== 'CANCELLED')
      .sort((a, b) => b.activityDate.localeCompare(a.activityDate)),
    [activities, ev.teamId],
  );

  const ligar = async (activityId: string) => {
    setBusy(true); setErro(null);
    const r = await setEvaluationActivityInDb(ev.id, activityId || null);
    setBusy(false);
    if (!r.success) { setErro(r.error || 'Não foi possível ligar à atividade.'); return; }
    await onLinked?.();
  };

  if (!ev.teamId && linhas.length === 0) {
    return <p className="text-[11px] text-slate-500">Sem equipa nem prestador atribuídos: ninguém recebe esta nota ainda.</p>;
  }

  const contam = linhas.filter(l => l.conta);
  const fora = linhas.filter(l => !l.conta);
  const semEscala = !!ev.teamId && !atividade?.assignedProviderIds?.length;

  return (
    <div className="space-y-2 text-[11px]">
      <div className="flex items-center gap-1.5 font-bold text-slate-800">
        <Users className="w-3.5 h-3.5 text-brand-dark" /> Quem recebe esta nota ({contam.length})
      </div>

      <p className="text-slate-500">
        {atividade
          ? <>Serviço do calendário: <strong className="text-slate-700">{atividade.title}</strong> · {fmt(atividade.activityDate)}.</>
          : 'Nenhuma atividade do calendário ligada a esta avaliação.'}
        {semEscala && ' Sem escala definida: contam todos os membros que estavam na equipa na data do serviço.'}
      </p>

      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
        {contam.map(l => (
          <li key={l.id} className="flex items-center gap-2 px-3 py-1.5">
            <span className="font-semibold text-slate-800 mr-auto">{l.nome}</span>
            <span className="text-slate-500">{MOTIVO_PARTICIPACAO[l.motivo]}</span>
            <span className="font-black text-emerald-700 tabular-nums">{pesoTxt(l.peso)}</span>
          </li>
        ))}
        {fora.map(l => (
          <li key={l.id} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50">
            <span className="font-semibold text-slate-500 mr-auto">{l.nome}</span>
            <span className="text-amber-700">{MOTIVO_PARTICIPACAO[l.motivo]}</span>
            <span className="text-slate-400">sem nota</span>
          </li>
        ))}
        {linhas.length === 0 && <li className="px-3 py-2 text-slate-500">Ninguém conta para esta nota.</li>}
      </ul>

      {canLink && ev.teamId && !ev.finalizedAt && isSupabaseConfigured && (
        <label className="flex items-center gap-2 text-slate-600">
          <Link2 className="w-3.5 h-3.5 shrink-0" />
          <span className="shrink-0">Ligar a outra atividade:</span>
          <select
            value={ev.activityId ?? atividade?.id ?? ''}
            disabled={busy}
            onChange={e => ligar(e.target.value)}
            className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2 py-1 bg-white"
          >
            <option value="">Nenhuma (conta quem estava na equipa)</option>
            {candidatas.map(a => (
              <option key={a.id} value={a.id}>{fmt(a.activityDate)} · {a.title}</option>
            ))}
          </select>
        </label>
      )}
      {erro && <p className="text-rose-600 font-medium">{erro}</p>}
    </div>
  );
};

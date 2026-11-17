/**
 * Nota de avaliação para o grupo.
 *
 * A nota (positiva ou negativa) de uma avaliação aplica-se ao grupo da equipa que prestou o serviço,
 * mas só a quem PARTICIPOU nesse serviço:
 *  • o funcionário/prestador atribuído à avaliação (conta sempre);
 *  • o supervisor da equipa (segue a escala como os restantes: sem escala conta; com escala só se for escalado);
 *  • os membros que já estavam na equipa na data do serviço (histórico de entrada/saída);
 *  • havendo escala no calendário de operações, só os membros escalados para essa atividade.
 *
 * Estas regras espelham a função SQL `sicsc_compute_participants` (migração 1015). Na base de dados
 * os participantes ficam congelados ao homologar; aqui calculam-se para pré-visualização e para os
 * ecrãs quando ainda não há retrato gravado.
 */
import type { Activity, Evaluation, Provider, Team, TeamMembership } from '../types';

/** Dados que o contexto da aplicação dá a estas funções. Sem ele vale a regra antiga (equipa inteira). */
export interface ContextoParticipacao {
  /** Histórico de entradas e saídas dos membros nas equipas. */
  historico: TeamMembership[];
  /** Atividades do calendário de operações (com a escala de cada uma). */
  atividades: Pick<Activity, 'id' | 'teamId' | 'activityDate' | 'clientId' | 'serviceId' | 'assignedProviderIds' | 'status'>[];
}

export type MotivoParticipacao =
  | 'ESCALADO'       // estava na escala da atividade
  | 'SEM_ESCALA'     // a atividade não tem escala definida: conta quem era membro nessa data
  | 'ATRIBUIDO'      // escolhido no formulário ou atribuído por RH
  | 'SUPERVISOR'     // supervisor da equipa
  | 'NAO_ESCALADO'   // membro da equipa mas não foi a este serviço
  | 'ENTROU_DEPOIS'; // ainda não pertencia à equipa na data do serviço

export interface Participante {
  providerId: string;
  conta: boolean;
  motivo: MotivoParticipacao;
  /** Percentagem da nota que cabe ao participante; a soma de quem conta é exatamente 100,00. */
  peso: number;
}

type EvParticipacao = Pick<Evaluation, 'providerId' | 'teamId' | 'serviceDate'> &
  Partial<Pick<Evaluation, 'id' | 'clientId' | 'serviceId' | 'activityId'>>;

export const MOTIVO_PARTICIPACAO: Record<MotivoParticipacao, string> = {
  ESCALADO: 'Escalado para o serviço',
  SEM_ESCALA: 'Membro da equipa na data (sem escala)',
  ATRIBUIDO: 'Atribuído à avaliação',
  SUPERVISOR: 'Supervisor da equipa',
  NAO_ESCALADO: 'Não foi a este serviço',
  ENTROU_DEPOIS: 'Entrou na equipa depois do serviço',
};

/** O prestador pertencia à equipa nesta data? (entrada e saída inclusivas) */
export function pertencia(
  historico: TeamMembership[],
  providerId: string,
  teamId: string,
  data: string,
): boolean {
  const dia = data.slice(0, 10);
  return historico.some(h =>
    h.providerId === providerId && h.teamId === teamId &&
    h.joinedAt.slice(0, 10) <= dia && (!h.leftAt || dia <= h.leftAt.slice(0, 10)));
}

/** Membros elegíveis para escalar numa data: quem já estava na equipa nesse dia. */
export function membrosNaData(
  providers: Pick<Provider, 'id' | 'teamId' | 'status'>[],
  historico: TeamMembership[],
  teamId: string,
  data: string,
): string[] {
  const comHistorico = new Set(historico.map(h => h.providerId));
  return providers
    .filter(p => {
      if (pertencia(historico, p.id, teamId, data)) return true;
      // Sem nenhum registo de histórico (ex.: modo de demonstração) vale a equipa atual
      return !comHistorico.has(p.id) && p.status === 'ACTIVE' && p.teamId === teamId;
    })
    .map(p => p.id);
}

/**
 * Atividade do calendário a que a avaliação diz respeito: a ligada à avaliação ou, na falta dela,
 * a única da mesma equipa e data (desempatando por cliente e serviço). Nunca adivinha: se houver
 * dúvida devolve `undefined`.
 */
export function atividadeDaAvaliacao<A extends ContextoParticipacao['atividades'][number]>(
  ev: EvParticipacao,
  atividades: A[],
): A | undefined {
  if (ev.activityId) return atividades.find(a => a.id === ev.activityId);
  if (!ev.teamId || !ev.serviceDate) return undefined;
  const dia = ev.serviceDate.slice(0, 10);
  let lista = atividades.filter(a => a.teamId === ev.teamId && a.activityDate.slice(0, 10) === dia && a.status !== 'CANCELLED');
  if (lista.length > 1 && ev.clientId) lista = lista.filter(a => a.clientId === ev.clientId);
  if (lista.length > 1 && ev.serviceId) lista = lista.filter(a => a.serviceId === ev.serviceId);
  return lista.length === 1 ? lista[0] : undefined;
}

/** Reparte 100,00 em partes iguais; o resto de cêntimos vai para os primeiros. A soma é exata. */
export function repartirPesos(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(10000 / n);
  const resto = 10000 - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < resto ? 1 : 0)) / 100);
}

/** Quem participou na avaliação e quanto pesa cada um. */
export function participantesDaAvaliacao(
  ev: EvParticipacao,
  providers: Pick<Provider, 'id' | 'teamId' | 'status'>[],
  teams: Pick<Team, 'id' | 'supervisorProviderId'>[],
  ctx: ContextoParticipacao,
): Participante[] {
  const equipa = ev.teamId ? teams.find(t => t.id === ev.teamId) : undefined;
  const sup = equipa?.supervisorProviderId;
  const atividade = atividadeDaAvaliacao(ev, ctx.atividades);
  const escala = atividade?.assignedProviderIds?.length ? new Set(atividade.assignedProviderIds) : undefined;

  const candidatos = new Set<string>();
  if (ev.teamId) {
    providers.forEach(p => { if (p.teamId === ev.teamId) candidatos.add(p.id); });
    ctx.historico.forEach(h => { if (h.teamId === ev.teamId) candidatos.add(h.providerId); });
  }
  if (sup) candidatos.add(sup);
  if (ev.providerId) candidatos.add(ev.providerId);

  const base = [...candidatos].sort().map(id => {
    let conta: boolean;
    let motivo: MotivoParticipacao;
    const naData = !!ev.teamId && (
      pertencia(ctx.historico, id, ev.teamId, ev.serviceDate) ||
      // sem qualquer histórico do prestador: vale a equipa atual
      (!ctx.historico.some(h => h.providerId === id) && providers.some(p => p.id === id && p.teamId === ev.teamId && p.status === 'ACTIVE'))
    );
    if (id === ev.providerId) { conta = true; motivo = 'ATRIBUIDO'; }
    else if (id === sup) {
      // O supervisor também depende da escala: com escala só conta se foi escalado
      conta = !escala || escala.has(id);
      motivo = conta ? 'SUPERVISOR' : 'NAO_ESCALADO';
    }
    else if (!naData) { conta = false; motivo = 'ENTROU_DEPOIS'; }
    else if (escala) { conta = escala.has(id); motivo = conta ? 'ESCALADO' : 'NAO_ESCALADO'; }
    else { conta = true; motivo = 'SEM_ESCALA'; }
    return { providerId: id, conta, motivo, peso: 0 };
  });

  // Quem conta primeiro (mesma ordem da base de dados: contam, depois por id)
  base.sort((a, b) => Number(b.conta) - Number(a.conta) || a.providerId.localeCompare(b.providerId));
  const pesos = repartirPesos(base.filter(b => b.conta).length);
  let i = 0;
  return base.map(b => ({ ...b, peso: b.conta ? pesos[i++] : 0 }));
}

/** O prestador pertence ao grupo que recebe a nota desta avaliação? */
export function prestadorRecebeNota(
  ev: EvParticipacao,
  provider: Pick<Provider, 'id' | 'teamId'> & Partial<Pick<Provider, 'status'>>,
  teams: Pick<Team, 'id' | 'supervisorProviderId'>[],
  ctx?: ContextoParticipacao,
): boolean {
  if (ev.providerId && ev.providerId === provider.id) return true;
  if (!ev.teamId) return false;
  const equipa = teams.find(t => t.id === ev.teamId);
  if (!ctx) return (!!equipa && equipa.supervisorProviderId === provider.id) || (!!provider.teamId && provider.teamId === ev.teamId);
  const p = participantesDaAvaliacao(ev, [{ id: provider.id, teamId: provider.teamId, status: provider.status ?? 'ACTIVE' }], teams, ctx)
    .find(x => x.providerId === provider.id);
  return !!p?.conta;
}

/** Avaliações cuja nota conta para este prestador (diretas e da sua equipa, só as que o incluem). */
export function avaliacoesDoPrestador<E extends EvParticipacao>(
  avaliacoes: E[],
  provider: Pick<Provider, 'id' | 'teamId'> & Partial<Pick<Provider, 'status'>>,
  teams: Pick<Team, 'id' | 'supervisorProviderId'>[],
  ctx?: ContextoParticipacao,
): E[] {
  return avaliacoes.filter(ev => prestadorRecebeNota(ev, provider, teams, ctx));
}

/** Prestadores que recebem a nota de uma avaliação (para notificar quem participou). */
export function destinatariosDaNota(
  ev: EvParticipacao,
  providers: Pick<Provider, 'id' | 'name' | 'teamId' | 'status'>[],
  teams: Pick<Team, 'id' | 'supervisorProviderId'>[],
  ctx?: ContextoParticipacao,
): Array<Pick<Provider, 'id' | 'name' | 'teamId' | 'status'>> {
  if (!ctx) return providers.filter(p => p.status === 'ACTIVE' && prestadorRecebeNota(ev, p, teams));
  const conta = new Set(participantesDaAvaliacao(ev, providers, teams, ctx).filter(x => x.conta).map(x => x.providerId));
  return providers.filter(p => p.status === 'ACTIVE' && conta.has(p.id));
}

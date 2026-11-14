/**
 * Nota de avaliação para o grupo.
 *
 * A nota (positiva ou negativa) de uma avaliação não é só do supervisor: aplica-se ao grupo inteiro
 * da equipa que prestou o serviço, ou seja:
 *  • o funcionário/prestador atribuído à avaliação;
 *  • todos os membros (prestadores) associados à equipa da avaliação;
 *  • o supervisor da equipa, seja ele prestador ou membro cadastrado.
 */
import type { Evaluation, Provider, Team } from '../types';

/** O prestador pertence ao grupo que recebe a nota desta avaliação? */
export function prestadorRecebeNota(
  ev: Pick<Evaluation, 'providerId' | 'teamId'>,
  provider: Pick<Provider, 'id' | 'teamId'>,
  teams: Pick<Team, 'id' | 'supervisorProviderId'>[],
): boolean {
  if (ev.providerId && ev.providerId === provider.id) return true;
  if (!ev.teamId) return false;
  if (provider.teamId && provider.teamId === ev.teamId) return true;
  const equipa = teams.find(t => t.id === ev.teamId);
  return !!equipa && equipa.supervisorProviderId === provider.id;
}

/** Avaliações cuja nota conta para este prestador (diretas e da sua equipa). */
export function avaliacoesDoPrestador<E extends Pick<Evaluation, 'providerId' | 'teamId'>>(
  avaliacoes: E[],
  provider: Pick<Provider, 'id' | 'teamId'>,
  teams: Pick<Team, 'id' | 'supervisorProviderId'>[],
): E[] {
  return avaliacoes.filter(ev => prestadorRecebeNota(ev, provider, teams));
}

/** Prestadores que recebem a nota de uma avaliação (para notificar o grupo inteiro). */
export function destinatariosDaNota(
  ev: Pick<Evaluation, 'providerId' | 'teamId'>,
  providers: Pick<Provider, 'id' | 'name' | 'teamId' | 'status'>[],
  teams: Pick<Team, 'id' | 'supervisorProviderId'>[],
): Array<Pick<Provider, 'id' | 'name' | 'teamId' | 'status'>> {
  return providers.filter(p => p.status === 'ACTIVE' && prestadorRecebeNota(ev, p, teams));
}

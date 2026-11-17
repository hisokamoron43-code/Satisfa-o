/**
 * Rankings do relatório: serviços (top 3), equipas (top 5) e funcionários (top 5), melhores e piores.
 *
 * Base de cálculo: nota técnica oficial das avaliações HOMOLOGADAS (0 a 100).
 *  • Serviços e equipas: média das notas das avaliações do serviço / da equipa.
 *  • Funcionários: média das notas em que o funcionário PARTICIPOU (histórico da equipa + escala do
 *    calendário, ver grupoAvaliacao.ts), por isso quem não foi ao serviço ou entrou depois não conta.
 * Uma mesma entidade nunca aparece nas duas listas; com poucas entidades a lista divide-se ao meio
 * (ver separarTop).
 */
import type { Evaluation, Provider, ServiceItem, Team } from '../types';
import { avaliacoesDoPrestador, type ContextoParticipacao } from './grupoAvaliacao.ts';

export const TOP_SERVICOS = 3;
export const TOP_EQUIPAS = 5;
export const TOP_FUNCIONARIOS = 5;
/** Com menos avaliações do que isto a média é pouco fiável e aparece assinalada. */
export const MIN_AVALIACOES_FIAVEIS = 3;

export interface ItemRanking {
  id: string;
  nome: string;
  /** Média da nota técnica (0 a 100). */
  media: number;
  avaliacoes: number;
  positivas: number;
  negativas: number;
  /** Média abaixo do limiar de aprovação. */
  abaixoDoMinimo: boolean;
  /** Menos de MIN_AVALIACOES_FIAVEIS avaliações. */
  poucosDados: boolean;
}

export interface ListaRanking {
  melhores: ItemRanking[];
  piores: ItemRanking[];
  /** Quantas entidades tinham avaliações homologadas. */
  total: number;
}

export interface Rankings {
  servicos: ListaRanking;
  equipas: ListaRanking;
  funcionarios: ListaRanking;
  limiar: number;
  /** Avaliações homologadas usadas no cálculo. */
  avaliacoesConsideradas: number;
}

export interface EntradaRankings {
  evals: Evaluation[];
  services: Pick<ServiceItem, 'id' | 'name'>[];
  teams: Pick<Team, 'id' | 'name' | 'supervisorProviderId'>[];
  providers: Provider[];
  ctx?: ContextoParticipacao;
  limiar?: number;
}

const arred = (n: number) => Math.round(n * 100) / 100;

function resumir(id: string, nome: string, evals: Evaluation[], limiar: number): ItemRanking | null {
  const notas = evals.map(e => e.technicalScore).filter((n): n is number => typeof n === 'number');
  if (notas.length === 0) return null;
  const media = arred(notas.reduce((s, n) => s + n, 0) / notas.length);
  return {
    id, nome, media,
    avaliacoes: notas.length,
    positivas: evals.filter(e => e.finalClassification === 'POSITIVE').length,
    negativas: evals.filter(e => e.finalClassification === 'NEGATIVE').length,
    abaixoDoMinimo: media < limiar,
    poucosDados: notas.length < MIN_AVALIACOES_FIAVEIS,
  };
}

/** Melhores: maior média primeiro. Em empate, mais avaliações e depois ordem alfabética. */
const porMelhor = (a: ItemRanking, b: ItemRanking) =>
  b.media - a.media || b.avaliacoes - a.avaliacoes || a.nome.localeCompare(b.nome);
/** Piores: menor média primeiro. Em empate, mais avaliações (mais fiável) e depois ordem alfabética. */
const porPior = (a: ItemRanking, b: ItemRanking) =>
  a.media - b.media || b.avaliacoes - a.avaliacoes || a.nome.localeCompare(b.nome);

/**
 * Divide em «melhores» e «piores» sem nunca pôr o mesmo item nas duas listas e sem pôr um item fraco
 * entre os melhores só por haver poucos: com poucos itens, a lista dos melhores fica com a metade
 * de cima (arredondada para cima) e os piores com o resto. Ex.: 2 itens → 1 melhor e 1 pior;
 * 5 itens e top 3 → 3 melhores e 2 piores; 20 itens e top 3 → 3 e 3.
 */
export function separarTop(itens: ItemRanking[], n: number): ListaRanking {
  const nMelhores = Math.min(n, Math.ceil(itens.length / 2));
  const melhores = [...itens].sort(porMelhor).slice(0, nMelhores);
  const usados = new Set(melhores.map(i => i.id));
  const piores = [...itens].filter(i => !usados.has(i.id)).sort(porPior).slice(0, n);
  return { melhores, piores, total: itens.length };
}

function agrupar(evals: Evaluation[], chave: (e: Evaluation) => { id: string; nome: string } | null) {
  const mapa = new Map<string, { nome: string; evals: Evaluation[] }>();
  for (const e of evals) {
    const k = chave(e);
    if (!k) continue;
    const atual = mapa.get(k.id) ?? { nome: k.nome, evals: [] };
    atual.evals.push(e);
    mapa.set(k.id, atual);
  }
  return mapa;
}

export function calcularRankings(entrada: EntradaRankings): Rankings {
  const limiar = entrada.limiar ?? 70;
  const homologadas = entrada.evals.filter(e => !!e.finalizedAt && typeof e.technicalScore === 'number');

  const servicos = [...agrupar(homologadas, e => {
    const id = e.serviceId || (e.serviceName ? `nome:${e.serviceName}` : '');
    if (!id) return null;
    return { id, nome: entrada.services.find(s => s.id === e.serviceId)?.name || e.serviceName || 'Serviço' };
  })].map(([id, g]) => resumir(id, g.nome, g.evals, limiar)).filter((x): x is ItemRanking => !!x);

  const equipas = [...agrupar(homologadas, e => {
    if (!e.teamId) return null;
    return { id: e.teamId, nome: entrada.teams.find(t => t.id === e.teamId)?.name || e.teamName || 'Equipa' };
  })].map(([id, g]) => resumir(id, g.nome, g.evals, limiar)).filter((x): x is ItemRanking => !!x);

  const funcionarios = entrada.providers
    .map(p => resumir(p.id, p.name, avaliacoesDoPrestador(homologadas, p, entrada.teams, entrada.ctx), limiar))
    .filter((x): x is ItemRanking => !!x);

  return {
    servicos: separarTop(servicos, TOP_SERVICOS),
    equipas: separarTop(equipas, TOP_EQUIPAS),
    funcionarios: separarTop(funcionarios, TOP_FUNCIONARIOS),
    limiar,
    avaliacoesConsideradas: homologadas.length,
  };
}

export const fmtMedia = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;

/** Nota de leitura de uma linha: pouca fiabilidade e/ou abaixo do mínimo. */
export function notaDoItem(i: ItemRanking): string {
  const partes: string[] = [];
  if (i.abaixoDoMinimo) partes.push('abaixo do mínimo');
  if (i.poucosDados) partes.push('poucas avaliações');
  return partes.join('; ');
}

/**
 * Notas de uma empresa (cliente): total de avaliações e média geral, também separadas por tipo de serviço.
 *
 * • A nota de cada avaliação é a nota técnica oficial (0 a 100 %), só existe depois de homologada.
 * • A média geral da empresa é a média dessas notas; o total conta todas as avaliações recebidas.
 * • Uma avaliação pode abranger vários serviços (o cliente escolhe-os no formulário). Nesse caso conta em cada
 *   um dos serviços com a sua nota global, porque a nota oficial é uma só por avaliação.
 */
import type { Evaluation, ServiceItem } from '../types';

export interface ResumoNotas {
  /** Todas as avaliações recebidas. */
  total: number;
  /** Já homologadas (têm nota oficial). */
  homologadas: number;
  /** Média das notas oficiais (0 a 100), ou null se ainda não há nenhuma. */
  mediaNota: number | null;
  positivas: number;
  negativas: number;
  /** Média da satisfação dada pelo cliente (1 a 5), ou null. */
  mediaSatisfacao: number | null;
}

export interface ResumoServico extends ResumoNotas {
  chave: string;
  nome: string;
}

const media = (valores: number[]): number | null =>
  valores.length === 0 ? null : valores.reduce((s, v) => s + v, 0) / valores.length;

export function resumirNotas(avaliacoes: Evaluation[]): ResumoNotas {
  const notas = avaliacoes.map(e => e.technicalScore).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  const satisfacao = avaliacoes.map(e => e.satisfactionRating).filter(n => typeof n === 'number' && n >= 1 && n <= 5);
  return {
    total: avaliacoes.length,
    homologadas: avaliacoes.filter(e => !!e.finalizedAt).length,
    mediaNota: media(notas),
    positivas: avaliacoes.filter(e => e.finalClassification === 'POSITIVE').length,
    negativas: avaliacoes.filter(e => e.finalClassification === 'NEGATIVE').length,
    mediaSatisfacao: media(satisfacao),
  };
}

const SEM_SERVICO = { chave: '__sem_servico__', nome: 'Serviço não indicado' };
const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Serviços a que a avaliação diz respeito (todos os escolhidos pelo cliente, ou o serviço da avaliação). */
export function servicosDaAvaliacao(ev: Evaluation, servicos: Pick<ServiceItem, 'id' | 'name'>[]): Array<{ chave: string; nome: string }> {
  const porNome = (nome: string) => servicos.find(s => norm(s.name) === norm(nome));
  const vistos = new Map<string, { chave: string; nome: string }>();
  const juntar = (id: string | undefined, nome: string | undefined) => {
    const real = (id && servicos.find(s => s.id === id)) || (nome ? porNome(nome) : undefined);
    if (real) vistos.set(real.id, { chave: real.id, nome: real.name });
    else if (nome && nome.trim()) vistos.set(`n:${norm(nome)}`, { chave: `n:${norm(nome)}`, nome: nome.trim() });
  };
  (ev.serviceTypesProvided ?? []).forEach(n => juntar(undefined, n));
  if (vistos.size === 0) juntar(ev.serviceId, ev.serviceName);
  return vistos.size > 0 ? [...vistos.values()] : [SEM_SERVICO];
}

/** Totais e médias por tipo de serviço, do maior número de avaliações para o menor. */
export function resumoPorServico(
  avaliacoes: Evaluation[],
  servicos: Pick<ServiceItem, 'id' | 'name'>[],
): { servicos: ResumoServico[]; temAvaliacoesComVariosServicos: boolean } {
  const grupos = new Map<string, { nome: string; evals: Evaluation[] }>();
  let multi = false;
  for (const ev of avaliacoes) {
    const lista = servicosDaAvaliacao(ev, servicos);
    if (lista.length > 1) multi = true;
    for (const s of lista) {
      const g = grupos.get(s.chave) ?? { nome: s.nome, evals: [] };
      g.evals.push(ev);
      grupos.set(s.chave, g);
    }
  }
  const resultado = [...grupos.entries()]
    .map(([chave, g]) => ({ chave, nome: g.nome, ...resumirNotas(g.evals) }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  return { servicos: resultado, temAvaliacoesComVariosServicos: multi };
}

export const formatarNota = (n: number | null): string => (n === null ? '—' : `${n.toFixed(1)}%`);

/**
 * Privacidade do nome da empresa face aos avaliados.
 *
 * Quem envia a avaliação escolhe se a equipa/os prestadores avaliados podem ver o nome da empresa onde o
 * serviço foi prestado. Por defeito o nome fica oculto, o que ajuda a evitar represálias ou preconceito
 * contra certas empresas. A equipa de RH/Auditoria vê sempre o nome real.
 */

const semAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Texto da empresa para os avaliados: o nome real ou um rótulo neutro. */
export function nomeEmpresaParaAvaliados(nome: string | null | undefined, visivel: boolean | undefined): string {
  return visivel && nome ? nome : 'Empresa não revelada';
}

/**
 * Troca o nome da empresa por «[empresa]» num texto livre (ex.: comentário do cliente) antes de o partilhar
 * com os avaliados. Ignora maiúsculas e acentos e também apanha o nome sem formas jurídicas (Lda, S.A., E.P.).
 */
export function ocultarEmpresaNoTexto(texto: string, ...nomes: Array<string | null | undefined>): string {
  if (!texto) return texto;
  const variantes = new Set<string>();
  for (const bruto of nomes) {
    const nome = (bruto || '').trim();
    if (nome.length < 3) continue;
    variantes.add(nome);
    const semForma = nome.replace(/[,\s]+(lda\.?|limitada|s\.?\s?a\.?|e\.?\s?p\.?|sarl|unipessoal)\s*$/i, '').trim();
    if (semForma.length >= 3) variantes.add(semForma);
  }
  if (variantes.size === 0) return texto;

  // índices comparados sem acentos mas aplicados ao texto original (normalização NFD só muda o comprimento ao decompor,
  // por isso trabalhamos sobre uma versão com a mesma extensão: remove-se o acento letra a letra)
  const plano = Array.from(texto).map(c => semAcentos(c)[0] ?? c).join('');
  const ordenadas = [...variantes].sort((a, b) => b.length - a.length);
  let resultado = '';
  let i = 0;
  const alvo = ordenadas.map(v => ({ re: new RegExp(escapar(Array.from(v).map(c => semAcentos(c)[0] ?? c).join('')), 'iy') }));
  const letras = Array.from(texto);
  while (i < letras.length) {
    let casou = 0;
    for (const { re } of alvo) {
      re.lastIndex = i;
      const m = re.exec(plano);
      if (m && m.index === i) { casou = m[0].length; break; }
    }
    if (casou > 0) { resultado += '[empresa]'; i += casou; } else { resultado += letras[i]; i += 1; }
  }
  return resultado;
}

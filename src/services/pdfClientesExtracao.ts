/**
 * SICSC — Extração de clientes a partir de texto de PDF. Lógica pura (sem pdf.js, React ou Supabase).
 *
 * Recebe os fragmentos de texto com posição (x, y, página) e devolve uma matriz «cabeçalho + linhas»,
 * igual à que o CSV produz, para passar pela mesma validação (`analyzeClientImport`).
 *
 * Dois formatos são reconhecidos:
 *  • TABELA – uma linha de cabeçalho com títulos de colunas conhecidos (Empresa, NIF, E-mail…) e as linhas
 *    de clientes por baixo, em várias páginas se for preciso (o cabeçalho repetido em cada página é ignorado,
 *    tal como os rodapés «Página X de Y» e as linhas de totais). Texto que quebra em duas linhas dentro da mesma
 *    célula é reunido.
 *  • FICHAS – blocos «Campo: valor» (um bloco por cliente, a começar em «Empresa: …»).
 */
import { campoDoCabecalho } from './clientImport.ts';

export interface ItemTexto {
  str: string;
  x: number;       // início horizontal
  y: number;       // linha de base (em PDF, mais alto = maior y)
  w: number;       // largura
  h: number;       // altura da letra
  pagina: number;  // 1, 2, 3…
}

export interface ExtracaoPdf {
  modo: 'TABELA' | 'FICHAS' | 'NENHUM';
  matriz: string[][];
  /** Para cada linha da matriz (a 0 é o cabeçalho), onde está no PDF. Ex.: «Pág. 2 · linha 5». */
  rotulos: string[];
  avisos: string[];
  paginas: number;
  fatal?: string;
}

interface Celula { texto: string; x: number; xFim: number }
interface Linha { pagina: number; y: number; h: number; itens: ItemTexto[] }

const VAZIO = /^[—–-]+$/;
const limpar = (t: string) => t.replace(/\s+/g, ' ').trim();
const valor = (t: string) => { const v = limpar(t); return VAZIO.test(v) ? '' : v; };

const RODAPE = /(p[áa]gina\s+\d+\s*(de|\/)\s*\d+)|^\s*(total|gerado)\b/i;

export function agruparEmLinhas(itens: ItemTexto[]): Linha[] {
  const validos = itens.filter(i => i.str.trim() !== '');
  const ordenados = [...validos].sort((a, b) => a.pagina - b.pagina || b.y - a.y || a.x - b.x);
  const linhas: Linha[] = [];
  for (const it of ordenados) {
    const ultima = linhas[linhas.length - 1];
    const tol = Math.max(2, (it.h || 8) * 0.45);
    if (ultima && ultima.pagina === it.pagina && Math.abs(ultima.y - it.y) <= tol) {
      ultima.itens.push(it);
    } else {
      linhas.push({ pagina: it.pagina, y: it.y, h: it.h || 8, itens: [it] });
    }
  }
  linhas.forEach(l => l.itens.sort((a, b) => a.x - b.x));
  return linhas;
}

/** Junta fragmentos vizinhos (palavras da mesma célula) em células separadas por espaços grandes. */
function celulasDaLinha(l: Linha): Celula[] {
  const celulas: Celula[] = [];
  for (const it of l.itens) {
    const atual = celulas[celulas.length - 1];
    const folga = Math.max(l.h * 0.6, 4);
    if (atual && it.x - atual.xFim < folga) {
      atual.texto = limpar(`${atual.texto} ${it.str}`);
      atual.xFim = Math.max(atual.xFim, it.x + it.w);
    } else {
      celulas.push({ texto: limpar(it.str), x: it.x, xFim: it.x + it.w });
    }
  }
  return celulas;
}

interface Cabecalho { colunas: Celula[]; campos: Array<ReturnType<typeof campoDoCabecalho>> }

function lerCabecalho(l: Linha): Cabecalho | null {
  const colunas = celulasDaLinha(l);
  const campos = colunas.map(c => campoDoCabecalho(c.texto));
  const reconhecidos = campos.filter(Boolean).length;
  if (reconhecidos >= 2 && campos.includes('companyName')) return { colunas, campos };
  return null;
}

function mesmoCabecalho(a: Cabecalho, l: Linha): boolean {
  const b = lerCabecalho(l);
  return !!b && b.campos.join('|') === a.campos.join('|');
}

/** Limite esquerdo de cada coluna: ponto médio entre o fim do título anterior e o início do seguinte. */
function limites(cab: Cabecalho): number[] {
  return cab.colunas.map((c, i) => {
    if (i === 0) return -Infinity;
    const ant = cab.colunas[i - 1];
    return (ant.xFim + c.x) / 2;
  });
}

function colunaDoItem(x: number, lim: number[]): number {
  let col = 0;
  for (let i = 0; i < lim.length; i++) if (x >= lim[i] - 0.5) col = i;
  return col;
}

function extrairTabela(linhas: Linha[], avisos: string[]): { matriz: string[][]; rotulos: string[] } | null {
  const idx = linhas.findIndex(l => lerCabecalho(l));
  if (idx < 0) return null;
  const cab = lerCabecalho(linhas[idx])!;
  const lim = limites(cab);

  const matriz: string[][] = [cab.colunas.map(c => c.texto)];
  const rotulos: string[] = ['Cabeçalho'];

  const dados = linhas.slice(idx + 1).filter(l => !mesmoCabecalho(cab, l));
  const corpo = dados.filter(l => {
    const texto = limpar(l.itens.map(i => i.str).join(' '));
    return texto !== '' && !RODAPE.test(texto);
  });
  if (corpo.length === 0) return { matriz, rotulos };

  // espaçamento típico entre linhas de clientes (para distinguir «nova linha» de «texto quebrado»)
  const folgas: number[] = [];
  for (let i = 1; i < corpo.length; i++) {
    if (corpo[i].pagina === corpo[i - 1].pagina) folgas.push(corpo[i - 1].y - corpo[i].y);
  }
  folgas.sort((a, b) => a - b);
  const mediana = folgas.length ? folgas[Math.floor(folgas.length / 2)] : Infinity;

  let atual: string[] | null = null;
  let ordemNaPagina = 0;
  let paginaAtual = -1;
  let anterior: Linha | null = null;

  for (const l of corpo) {
    const celulas: string[] = cab.colunas.map(() => '');
    for (const it of l.itens) {
      const c = colunaDoItem(it.x, lim);
      celulas[c] = limpar(`${celulas[c]} ${it.str}`);
    }
    const continuacao = !!atual && !!anterior && anterior.pagina === l.pagina
      && (anterior.y - l.y) < mediana * 0.8;

    if (continuacao && atual) {
      celulas.forEach((t, c) => { if (t) atual![c] = limpar(`${atual![c]} ${t}`); });
    } else {
      if (l.pagina !== paginaAtual) { paginaAtual = l.pagina; ordemNaPagina = 0; }
      ordemNaPagina++;
      atual = celulas;
      matriz.push(atual);
      rotulos.push(`Pág. ${l.pagina} · linha ${ordemNaPagina}`);
    }
    anterior = l;
  }

  // valores como «—» passam a vazios
  for (let r = 1; r < matriz.length; r++) matriz[r] = matriz[r].map(valor);

  const ignoradas = cab.colunas.filter((_, i) => !cab.campos[i]).map(c => c.texto);
  if (ignoradas.length) avisos.push(`Colunas não reconhecidas (ignoradas): ${ignoradas.join(', ')}.`);
  return { matriz, rotulos };
}

function extrairFichas(linhas: Linha[], avisos: string[]): { matriz: string[][]; rotulos: string[] } | null {
  type Ficha = { campos: Map<string, string>; pagina: number };
  const fichas: Ficha[] = [];
  let atual: Ficha | null = null;
  let ultimaChave: string | null = null;

  for (const l of linhas) {
    const texto = limpar(l.itens.map(i => i.str).join(' '));
    if (!texto || RODAPE.test(texto)) continue;
    const m = /^([^:：]{2,40})\s*[:：]\s*(.*)$/.exec(texto);
    const campo = m ? campoDoCabecalho(m[1]) : undefined;
    if (m && campo) {
      if (campo === 'companyName' && atual && atual.campos.has('companyName')) { fichas.push(atual); atual = null; }
      if (!atual) atual = { campos: new Map(), pagina: l.pagina };
      if (atual.campos.has(m[1].trim())) { fichas.push(atual); atual = { campos: new Map(), pagina: l.pagina }; }
      atual.campos.set(m[1].trim(), valor(m[2]));
      ultimaChave = m[1].trim();
    } else if (atual && ultimaChave) {
      atual.campos.set(ultimaChave, limpar(`${atual.campos.get(ultimaChave) ?? ''} ${texto}`)); // texto quebrado
    }
  }
  if (atual) fichas.push(atual);
  const comNome = fichas.filter(f => [...f.campos.keys()].some(k => campoDoCabecalho(k) === 'companyName'));
  if (comNome.length === 0) return null;

  const titulos: string[] = [];
  comNome.forEach(f => f.campos.forEach((_, k) => { if (!titulos.includes(k)) titulos.push(k); }));
  const matriz = [titulos, ...comNome.map(f => titulos.map(t => f.campos.get(t) ?? ''))];
  const ordem: Record<number, number> = {};
  const rotulos = ['Cabeçalho', ...comNome.map(f => { ordem[f.pagina] = (ordem[f.pagina] ?? 0) + 1; return `Pág. ${f.pagina} · registo ${ordem[f.pagina]}`; })];
  if (fichas.length !== comNome.length) avisos.push(`${fichas.length - comNome.length} bloco(s) sem nome da empresa foram ignorados.`);
  return { matriz, rotulos };
}

export function extrairClientesDeItens(itens: ItemTexto[], paginas: number): ExtracaoPdf {
  const vazio = (fatal: string): ExtracaoPdf => ({ modo: 'NENHUM', matriz: [], rotulos: [], avisos: [], paginas, fatal });

  if (itens.filter(i => i.str.trim() !== '').length === 0) {
    return vazio('Este PDF não tem texto selecionável (parece uma imagem digitalizada). Exporte-o de novo a partir do programa original ou converta-o para CSV; a leitura de imagens (OCR) não é suportada.');
  }

  const linhas = agruparEmLinhas(itens);
  const avisos: string[] = [];

  const tabela = extrairTabela(linhas, avisos);
  if (tabela && tabela.matriz.length > 1) return { modo: 'TABELA', ...tabela, avisos, paginas };

  const fichas = extrairFichas(linhas, avisos);
  if (fichas && fichas.matriz.length > 1) return { modo: 'FICHAS', ...fichas, avisos, paginas };

  if (tabela) return vazio('Encontrei o cabeçalho da tabela de clientes, mas não há linhas de clientes por baixo.');
  return vazio('Não encontrei clientes neste PDF. Procuro uma tabela com colunas como «Empresa», «NIF» ou «E-mail», ou blocos «Empresa: …», «NIF: …». Confirme que o PDF é uma lista de clientes ou use o modelo CSV.');
}

/**
 * Correspondência entre o nome da empresa escrito pelo cliente (texto livre no formulário público)
 * e a lista de empresas da base de dados.
 *
 * Ignora maiúsculas, acentos, pontuação e sufixos legais (Lda, S.A., E.P., Unipessoal…), aceita
 * ordem diferente das palavras, abreviações («Sonangol» → «Sonangol E.P.») e pequenos erros de escrita.
 *
 * Resultado:
 *  • EXACT   – o nome (ou código interno) coincide por completo → associar automaticamente;
 *  • AUTO    – uma única empresa é claramente a melhor (≥ 88 % e distante da segunda) → associar automaticamente;
 *  • SUGGEST – há candidatas razoáveis (≥ 55 %) → mostrar sugestões para confirmar;
 *  • NONE    – nada parecido → escolher manualmente.
 */

export interface MatchableClient {
  id: string;
  companyName: string;
  internalCode?: string;
  status?: string;
}

export type MatchStatus = 'EXACT' | 'AUTO' | 'SUGGEST' | 'NONE';

export interface ClientMatch<T extends MatchableClient = MatchableClient> {
  client: T;
  /** 0 a 100 */
  similarity: number;
}

export interface ClientMatchResult<T extends MatchableClient = MatchableClient> {
  status: MatchStatus;
  best: ClientMatch<T> | null;
  candidates: ClientMatch<T>[];
}

/** Palavras que não distinguem empresas (formas jurídicas e ligações). */
const PALAVRAS_IGNORADAS = new Set([
  'lda', 'limitada', 'sa', 'sarl', 'ep', 'ltd', 'llc', 'inc', 'unipessoal', 'sociedade', 'empresa', 'publica', 'comercial',
  'de', 'da', 'do', 'das', 'dos', 'e', 'the', 'angola', 'ao',
]);

const semAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Texto limpo para comparação (sem acentos, pontuação, formas jurídicas). */
export function normalizarEmpresa(nome: string): string {
  return semAcentos(nome || '')
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/\b([a-z])\.(?=[a-z]\.|\s|$)/g, '$1') // «S.A.» → «sa», «E.P.» → «ep»
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(nome: string): string[] {
  const todos = normalizarEmpresa(nome).split(' ').filter(Boolean);
  const uteis = todos.filter(t => !PALAVRAS_IGNORADAS.has(t));
  // Se tudo foi ignorado (ex.: «Angola Lda»), usa os tokens originais para não ficar vazio.
  return uteis.length > 0 ? uteis : todos;
}

/** Distância de Levenshtein (suficiente para nomes curtos). */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = temp;
    }
  }
  return linha[b.length];
}

/** Semelhança entre duas palavras (0 a 1), tolerando erros de escrita pequenos. */
function semelhancaPalavra(a: string, b: string): number {
  if (a === b) return 1;
  const maior = Math.max(a.length, b.length);
  if (maior <= 3) return 0; // palavras curtas só contam se forem iguais
  // «sonangol» vs «sonangolep» já tratado pelos sufixos; aqui o prefixo conta (abreviações)
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) {
    return Math.min(a.length, b.length) / maior >= 0.6 ? 0.9 : 0.7;
  }
  const d = distancia(a, b);
  const s = 1 - d / maior;
  return s >= 0.75 ? s : 0;
}

function bigramas(s: string): Set<string> {
  const r = new Set<string>();
  const t = s.replace(/ /g, '');
  for (let i = 0; i < t.length - 1; i++) r.add(t.slice(i, i + 2));
  return r;
}

function dice(a: string, b: string): number {
  const A = bigramas(a);
  const B = bigramas(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  return (2 * inter) / (A.size + B.size);
}

/** Semelhança (0 a 100) entre o nome escrito e o nome oficial da empresa. */
export function similaridadeEmpresa(escrito: string, oficial: string): number {
  const nA = normalizarEmpresa(escrito);
  const nB = normalizarEmpresa(oficial);
  if (!nA || !nB) return 0;
  if (nA === nB) return 100;

  const tA = tokens(escrito);
  const tB = tokens(oficial);
  if (tA.length === 0 || tB.length === 0) return 0;

  const chaveA = [...tA].sort().join(' ');
  const chaveB = [...tB].sort().join(' ');
  if (chaveA === chaveB) return 98; // mesmas palavras, sem formas jurídicas / noutra ordem

  // Cada palavra do nome mais curto procura a melhor correspondente no mais longo.
  const [curto, longo] = tA.length <= tB.length ? [tA, tB] : [tB, tA];
  const usadas = new Set<number>();
  let soma = 0;
  curto.forEach(p => {
    let melhor = 0;
    let idx = -1;
    longo.forEach((q, i) => {
      if (usadas.has(i)) return;
      const s = semelhancaPalavra(p, q);
      if (s > melhor) { melhor = s; idx = i; }
    });
    if (idx >= 0) usadas.add(idx);
    soma += melhor;
  });
  const coberturaCurto = soma / curto.length;               // quanto do nome curto está presente
  const coberturaLongo = soma / longo.length;               // quanto do nome longo está presente
  const porPalavras = 0.7 * coberturaCurto + 0.3 * coberturaLongo;

  const porLetras = dice(nA, nB);

  // Se uma só palavra curta e genérica coincide com um nome longo, não é suficiente.
  const penalizacao = curto.length === 1 && longo.length >= 3 ? 0.75 : 1;

  const bruto = Math.max(porPalavras * penalizacao, porLetras * 0.9);
  return Math.max(0, Math.min(99, Math.round(bruto * 100)));
}

/** Procura as empresas mais parecidas com o nome escrito. */
export function procurarEmpresa<T extends MatchableClient>(
  escrito: string,
  empresas: T[],
  opcoes: { limite?: number; apenasAtivas?: boolean } = {},
): ClientMatchResult<T> {
  const { limite = 3, apenasAtivas = true } = opcoes;
  const texto = (escrito || '').trim();
  if (texto.length < 2) return { status: 'NONE', best: null, candidates: [] };

  const base = apenasAtivas ? empresas.filter(c => !c.status || c.status === 'ACTIVE') : empresas;
  const codigoNorm = normalizarEmpresa(texto);

  const pontuadas: ClientMatch<T>[] = base
    .map(client => {
      const porNome = similaridadeEmpresa(texto, client.companyName);
      const porCodigo = client.internalCode && normalizarEmpresa(client.internalCode) === codigoNorm ? 100 : 0;
      return { client, similarity: Math.max(porNome, porCodigo) };
    })
    .filter(m => m.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity || a.client.companyName.localeCompare(b.client.companyName));

  const candidatas = pontuadas.filter(m => m.similarity >= 55).slice(0, limite);
  if (candidatas.length === 0) return { status: 'NONE', best: null, candidates: [] };

  const [primeira, segunda] = candidatas;
  const nomesIguais = candidatas.filter(m => m.similarity === 100).length;

  // Mais de uma empresa com correspondência perfeita (nomes duplicados): não decidir sozinho.
  if (nomesIguais > 1) return { status: 'SUGGEST', best: primeira, candidates: candidatas };
  if (primeira.similarity === 100) return { status: 'EXACT', best: primeira, candidates: candidatas };

  const folga = primeira.similarity - (segunda?.similarity ?? 0);
  if (primeira.similarity >= 88 && folga >= 8) return { status: 'AUTO', best: primeira, candidates: candidatas };

  return { status: 'SUGGEST', best: primeira, candidates: candidatas };
}

/** Rótulo em português para o estado da correspondência. */
export function descreverCorrespondencia(status: MatchStatus): string {
  switch (status) {
    case 'EXACT': return 'Nome igual a uma empresa cadastrada';
    case 'AUTO': return 'Correspondência muito provável';
    case 'SUGGEST': return 'Possíveis correspondências — confirme';
    default: return 'Sem correspondência na base de dados';
  }
}

/**
 * SICSC — Leitura de PDF no navegador (pdf.js). Carregado só quando o utilizador escolhe um PDF,
 * para não pesar no carregamento normal da aplicação.
 */
import { extrairClientesDeItens, type ExtracaoPdf, type ItemTexto } from './pdfClientesExtracao.ts';

export const PDF_MAX_PAGINAS = 300;
export const PDF_MAX_BYTES = 25 * 1024 * 1024;

async function carregarPdfjs(): Promise<any> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  (pdfjs as any).GlobalWorkerOptions.workerSrc = (worker as any).default;
  return pdfjs;
}

/** Erros do pdf.js em português claro. */
function erroDePdf(e: any): Error {
  const nome = String(e?.name ?? '');
  const msg = String(e?.message ?? '');
  if (nome === 'PasswordException') return new Error('O PDF está protegido por palavra-passe. Retire a proteção e tente novamente.');
  if (nome === 'InvalidPDFException' || /invalid pdf|not a pdf/i.test(msg)) return new Error('O ficheiro não é um PDF válido ou está danificado.');
  if (nome === 'MissingPDFException') return new Error('Não foi possível abrir o ficheiro PDF.');
  if (/worker|dynamically imported|Failed to fetch/i.test(msg)) return new Error('Não foi possível carregar o leitor de PDF. Verifique a ligação à internet e tente novamente.');
  return new Error(`Não foi possível ler o PDF${msg ? ` (${msg.slice(0, 120)})` : ''}.`);
}

/** Lê todos os fragmentos de texto do PDF, com posição. `pdfjs` só é passado nos testes. */
export async function lerItensPdf(dados: ArrayBuffer, pdfjs?: any): Promise<{ itens: ItemTexto[]; paginas: number }> {
  if (dados.byteLength > PDF_MAX_BYTES) throw new Error(`O PDF é demasiado grande (máximo ${Math.round(PDF_MAX_BYTES / 1024 / 1024)} MB).`);
  const lib = pdfjs ?? await carregarPdfjs().catch((e) => { throw erroDePdf(e); });
  let pdf: any;
  try {
    pdf = await lib.getDocument({ data: new Uint8Array(dados) }).promise;
  } catch (e) {
    throw erroDePdf(e);
  }
  if (pdf.numPages > PDF_MAX_PAGINAS) throw new Error(`O PDF tem ${pdf.numPages} páginas (máximo ${PDF_MAX_PAGINAS}). Divida-o em partes.`);

  const itens: ItemTexto[] = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const pagina = await pdf.getPage(p);
      const conteudo = await pagina.getTextContent();
      for (const it of conteudo.items as any[]) {
        if (typeof it.str !== 'string') continue;
        itens.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width ?? 0, h: it.height || Math.abs(it.transform[3]) || 8, pagina: p });
      }
    }
  } catch (e) {
    throw erroDePdf(e);
  } finally {
    try { await pdf.destroy?.(); } catch { /* ignorar */ }
  }
  return { itens, paginas: pdf.numPages };
}

/** PDF → matriz de clientes pronta para `analyzeClientImport`. */
export async function extrairClientesDePdf(dados: ArrayBuffer, pdfjs?: any): Promise<ExtracaoPdf> {
  const { itens, paginas } = await lerItensPdf(dados, pdfjs);
  return extrairClientesDeItens(itens, paginas);
}

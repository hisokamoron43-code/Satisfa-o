import React, { useState } from 'react';
import { X, Download, Upload } from 'lucide-react';
import type { Client } from '../../types';
import { traduzirErro } from '../../services/mensagensErro';
import {
  analyzeClientImport, clientCsvTemplate, parseCsv, CLIENT_IMPORT_BATCH_SIZE,
  type ClientInput, type ImportAnalysis,
} from '../../services/clientImport';

interface Props {
  existing: Client[];
  onImport: (rows: ClientInput[], onProgress?: (done: number, total: number) => void) =>
    Promise<{ created: number; failed: Array<{ index: number; error: string }> }>;
  onClose: () => void;
}

const PREVIEW_LIMIT = 300;

export const ClientImportModal: React.FC<Props> = ({ existing, onImport, onClose }) => {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<{ created: number; failed: Array<{ line: number; error: string }> } | null>(null);
  // Importação por PDF: onde está cada linha no PDF, avisos da leitura e estado
  const [rotulos, setRotulos] = useState<string[]>([]);
  const [avisosPdf, setAvisosPdf] = useState<string[]>([]);
  const [infoPdf, setInfoPdf] = useState<string | null>(null);
  const [lendoPdf, setLendoPdf] = useState(false);

  const limparPdf = () => { setRotulos([]); setAvisosPdf([]); setInfoPdf(null); };
  /** «Pág. 2 · linha 5» (PDF) ou o número da linha (CSV). */
  const origem = (line: number) => rotulos[line - 1] ?? String(line);

  const analyze = (source: string) => {
    setSummary(null);
    limparPdf();
    setAnalysis(analyzeClientImport(parseCsv(source), existing));
  };

  const analisarPdf = async (file: File) => {
    setSummary(null);
    limparPdf();
    setAnalysis(null);
    setLendoPdf(true);
    try {
      const { extrairClientesDePdf } = await import('../../services/pdfLeitor');
      const r = await extrairClientesDePdf(await file.arrayBuffer());
      if (r.fatal) {
        setAnalysis({ fatal: r.fatal, rows: [] });
      } else {
        setRotulos(r.rotulos);
        setAvisosPdf(r.avisos);
        setInfoPdf(`${r.modo === 'TABELA' ? 'Tabela' : 'Fichas «Campo: valor»'} detetada(s) em ${r.paginas} página(s): ${r.matriz.length - 1} linha(s) lida(s). Confira os dados abaixo antes de importar.`);
        setAnalysis(analyzeClientImport(r.matriz, existing));
      }
    } catch (e) {
      setAnalysis({ fatal: traduzirErro(e, 'Não foi possível ler o PDF.'), rows: [] });
    } finally {
      setLendoPdf(false);
    }
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      setText('');
      await analisarPdf(file);
      return;
    }
    const content = await file.text();
    setText(content);
    analyze(content);
  };

  const downloadTemplate = () => {
    const blob = new Blob([clientCsvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo-importacao-clientes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validRows = analysis?.rows.filter((r) => r.valid) ?? [];
  const invalidCount = (analysis?.rows.length ?? 0) - validRows.length;
  const batchCount = Math.ceil(validRows.length / CLIENT_IMPORT_BATCH_SIZE);

  const runImport = async () => {
    if (validRows.length === 0 || busy) return;
    setBusy(true);
    setSummary(null);
    const res = await onImport(validRows.map((r) => r.data as ClientInput), (done, total) => setProgress({ done, total }));
    setSummary({
      created: res.created,
      failed: res.failed.map((f) => ({ line: validRows[f.index]?.line ?? f.index + 2, error: f.error })),
    });
    setProgress(null);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div>
            <h3 id="import-title" className="text-lg font-black text-slate-900">Importar clientes em lote</h3>
            <p className="text-xs text-slate-500 mt-1">
              Aceita ficheiros <strong>CSV</strong> e <strong>PDF</strong> (tabela com colunas como «Empresa», «NIF», «E-mail» ou fichas «Campo: valor»). Só o <strong>nome da empresa</strong> é obrigatório. Os restantes campos podem ser completados depois, editando o cliente.
              Os clientes são gravados em blocos de {CLIENT_IMPORT_BATCH_SIZE}, um pedido de cada vez.
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap gap-3 items-center">
            <button onClick={downloadTemplate} className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50">
              <Download className="w-3.5 h-3.5" /> Descarregar modelo (CSV)
            </button>
            <label className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-slate-50">
              <Upload className="w-3.5 h-3.5" /> Escolher ficheiro (CSV ou PDF)
              <input type="file" accept=".csv,text/csv,.pdf,application/pdf" className="hidden" disabled={busy || lendoPdf}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
            </label>
            {fileName && <span className="text-xs text-slate-600">Ficheiro: <strong>{fileName}</strong></span>}
            {lendoPdf && <span className="text-xs font-bold text-slate-700">A ler o PDF…</span>}
          </div>

          {infoPdf && !analysis?.fatal && (
            <p className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900">{infoPdf}</p>
          )}
          {avisosPdf.length > 0 && (
            <ul className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 list-disc pl-6">
              {avisosPdf.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">Ou cole aqui os dados (com a linha de cabeçalho; separador ; ou ,)</label>
            <textarea value={text} onChange={(e) => { setText(e.target.value); }} rows={4} disabled={busy}
              className="w-full text-xs font-mono border border-slate-300 rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-brand" />
            <button onClick={() => analyze(text)} disabled={busy || !text.trim()}
              className="px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold disabled:opacity-40">Analisar dados</button>
          </div>

          {analysis?.fatal && (
            <p className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs font-bold text-red-800">{analysis.fatal}</p>
          )}

          {analysis && !analysis.fatal && (
            <>
              <div className="flex flex-wrap gap-3 text-xs font-bold">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900">Válidos: {validRows.length}</span>
                <span className="px-2.5 py-1 rounded-lg bg-red-50 border border-red-300 text-red-900">Com erros (não serão importados): {invalidCount}</span>
                {batchCount > 0 && <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300">Pedidos ao servidor: {batchCount}</span>}
              </div>

              <div className="overflow-auto border border-slate-200 rounded-xl max-h-[40vh]">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">{rotulos.length > 0 ? 'Origem no PDF' : 'Linha'}</th>
                      <th className="p-2 text-left">Estado</th>
                      <th className="p-2 text-left">Empresa</th>
                      <th className="p-2 text-left">NIF</th>
                      <th className="p-2 text-left">Contacto</th>
                      <th className="p-2 text-left">Contrato</th>
                      <th className="p-2 text-left">Erros</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analysis.rows.slice(0, PREVIEW_LIMIT).map((r) => (
                      <tr key={r.line} className={r.valid ? '' : 'bg-red-50/40'}>
                        <td className="p-2 whitespace-nowrap">{origem(r.line)}</td>
                        <td className="p-2 font-bold">{r.valid ? '✓ Válido' : '✕ Erro'}</td>
                        <td className="p-2">{r.data?.companyName ?? '—'}</td>
                        <td className="p-2">{r.data?.nif ?? '—'}</td>
                        <td className="p-2">{r.data?.contactPerson || '—'}</td>
                        <td className="p-2">{r.data?.contractStart || '—'} → {r.data?.contractEnd || '—'}</td>
                        <td className="p-2 text-red-700">{r.errors.join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {analysis.rows.length > PREVIEW_LIMIT && (
                  <p className="p-2 text-[11px] text-slate-500">A mostrar as primeiras {PREVIEW_LIMIT} linhas de {analysis.rows.length}. Todas as linhas válidas serão importadas.</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button onClick={runImport} disabled={busy || validRows.length === 0}
                  className="px-4 py-2 bg-brand-dark hover:bg-brand-deep text-white rounded-xl text-xs font-bold disabled:opacity-40">
                  {busy ? 'A importar…' : `Importar ${validRows.length} cliente(s)`}
                </button>
                {progress && (
                  <span className="text-xs font-bold text-slate-700">
                    A gravar {progress.done} de {progress.total}…
                  </span>
                )}
              </div>
            </>
          )}

          {summary && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <p className="font-black text-slate-900">Importação concluída: {summary.created} cliente(s) criado(s), {summary.failed.length} com erro.</p>
              {summary.failed.length > 0 && (
                <ul className="list-disc pl-5 text-red-800 space-y-0.5">
                  {summary.failed.map((f) => <li key={f.line}>{rotulos.length > 0 ? origem(f.line) : `Linha ${f.line}`}: {f.error}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold disabled:opacity-40">Fechar</button>
        </div>
      </div>
    </div>
  );
};

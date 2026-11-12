/**
 * SICSC — Exportação para PDF (clientes, avaliações e relatórios).
 * As bibliotecas de PDF são carregadas só quando o utilizador exporta, para não pesar no arranque da aplicação.
 */
import type { Client, ClientGoal, Evaluation, Provider } from '../types';
import { fmtDate, scopeData, SECTION_LABELS, type ReportData, type ReportOptions } from './reportBuilder';
import { csatPercent, npsValue } from './goalProgress';
import type { UserOptions } from 'jspdf-autotable';

const COMPANY = 'AETERNU LDA · SICSC';
const STATUS_CLIENT: Record<Client['status'], string> = { ACTIVE: 'Ativo', INACTIVE: 'Inativo' };
const METRIC_LABEL: Record<ClientGoal['metric'], string> = { CSAT: 'CSAT', NPS: 'NPS', EVALUATION_COUNT: 'Nº de avaliações' };
const GOAL_STATUS: Record<ClientGoal['status'], string> = {
  PENDENTE: 'Pendente', EM_CURSO: 'Em curso', CONCLUIDA: 'Concluída', NAO_CUMPRIDA: 'Não cumprida',
};

async function createDoc() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const table = (opts: UserOptions) => autoTable(doc, {
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.6, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10 },
    ...opts,
  });
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  return { doc, table, lastY };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function heading(doc: any, title: string, subtitle: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 10, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  doc.text(subtitle, 10, 20);
  doc.setTextColor(0, 0, 0);
}

function footer(doc: any) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`${COMPANY} · Página ${i} de ${pages}`, w / 2, h - 5, { align: 'center' });
  }
}

const stamp = (now = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`;
};
const fileDate = (now = new Date()) => now.toISOString().slice(0, 10);

const clientRows = (clients: Client[]) => clients.map((c) => [
  c.internalCode || '—',
  c.companyName,
  c.nif || '—',
  c.contactPerson || '—',
  c.phone || '—',
  c.email || '—',
  c.city || '—',
  c.sector || '—',
  fmtDate(c.contractStart),
  fmtDate(c.contractEnd),
  (c.contractedServices || []).join(', ') || '—',
  STATUS_CLIENT[c.status] ?? c.status,
]);
const CLIENT_HEAD = ['Código', 'Empresa', 'NIF', 'Pessoa de contacto', 'Telefone', 'E-mail', 'Cidade', 'Sector', 'Início do contrato', 'Fim do contrato', 'Serviços contratados', 'Estado'];

const evaluationRows = (evals: Evaluation[]) => evals.map((e) => [
  e.reference,
  fmtDate(e.serviceDate),
  fmtDate(e.evaluationDate),
  e.clientName || '—',
  e.serviceName || '—',
  e.teamName || '—',
  e.providerName || '—',
  `${e.satisfactionRating}/5`,
  e.npsScore ?? '—',
  e.technicalScore !== undefined && e.technicalScore !== null ? `${Number(e.technicalScore).toFixed(2)}%` : '—',
  e.finalClassification === 'POSITIVE' ? 'Positiva' : e.finalClassification === 'NEGATIVE' ? 'Negativa' : '—',
  e.finalizedAt ? 'Homologada' : 'Por homologar',
]);
const EVAL_HEAD = ['Referência', 'Data do serviço', 'Data da avaliação', 'Empresa', 'Serviço', 'Equipa', 'Funcionário', 'CSAT', 'NPS', 'Pontuação final', 'Classificação', 'Estado'];

/** Lista de clientes com os dados de cadastro e contrato. */
export async function buildClientsPdf(clients: Client[], generatedBy: string, now = new Date()) {
  const { doc, table } = await createDoc();
  const ativos = clients.filter((c) => c.status === 'ACTIVE').length;
  heading(doc, 'Clientes', `Total: ${clients.length} · Ativos: ${ativos} · Inativos: ${clients.length - ativos} · Gerado por ${generatedBy} em ${stamp(now)}`);
  table({ startY: 26, head: [CLIENT_HEAD], body: clientRows(clients), showHead: 'everyPage' });
  footer(doc);
  return { doc, filename: `clientes-sicsc-${fileDate(now)}.pdf` };
}

export async function exportClientsPdf(clients: Client[], generatedBy: string, now = new Date()) {
  const { doc, filename } = await buildClientsPdf(clients, generatedBy, now);
  doc.save(filename);
}

/** Avaliações (lista atual, conforme os filtros da página). */
export async function buildEvaluationsPdf(evals: Evaluation[], generatedBy: string, now = new Date()) {
  const { doc, table } = await createDoc();
  const positivas = evals.filter((e) => e.finalClassification === 'POSITIVE').length;
  heading(doc, 'Avaliações', `Total: ${evals.length} · Positivas: ${positivas} · Gerado por ${generatedBy} em ${stamp(now)}`);
  table({ startY: 26, head: [EVAL_HEAD], body: evaluationRows(evals), showHead: 'everyPage' });
  footer(doc);
  return { doc, filename: `avaliacoes-sicsc-${fileDate(now)}.pdf` };
}

export async function exportEvaluationsPdf(evals: Evaluation[], generatedBy: string, now = new Date()) {
  const { doc, filename } = await buildEvaluationsPdf(evals, generatedBy, now);
  doc.save(filename);
}

/** Relatório com o mesmo âmbito, período e secções escolhidos no ecrã de relatórios. */
export async function buildReportPdf(data: ReportData, o: ReportOptions) {
  const now = o.now ?? new Date();
  const scoped = scopeData(data, o);
  const { doc, table, lastY } = await createDoc();
  const sections = o.sections;
  const period = o.from || o.to ? `Período: ${o.from ? fmtDate(o.from) : 'início'} a ${o.to ? fmtDate(o.to) : 'hoje'}` : 'Período: todo o histórico';
  heading(doc, 'Relatório SICSC', `${period} · Gerado por ${o.generatedBy} em ${stamp(now)}`);

  const kpis = `CSAT: ${csatPercent(scoped.evals).toFixed(1)}%   ·   NPS: ${npsValue(scoped.evals)}   ·   Avaliações: ${scoped.evals.length}   ·   Homologadas: ${scoped.evals.filter((e) => e.finalizedAt).length}   ·   Positivas: ${scoped.evals.filter((e) => e.finalClassification === 'POSITIVE').length}   ·   Clientes: ${scoped.clients.length}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(kpis, 10, 28);
  doc.setFont('helvetica', 'normal');

  let y = 34;
  const section = (title: string, empty: string, render: () => void, hasRows: boolean) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, 10, y);
    doc.setFont('helvetica', 'normal');
    if (!hasRows) {
      doc.setFontSize(9);
      doc.text(empty, 10, y + 6);
      y += 14;
      return;
    }
    render();
    y = lastY() + 10;
  };

  if (sections.includes('AVALIACOES') || sections.includes('HOMOLOGACAO')) {
    section(SECTION_LABELS.AVALIACOES, 'Sem avaliações no âmbito escolhido.', () => {
      table({ startY: y + 3, head: [EVAL_HEAD], body: evaluationRows(scoped.evals), showHead: 'everyPage' });
    }, scoped.evals.length > 0);
  }
  if (sections.includes('CLIENTES_METAS')) {
    section(SECTION_LABELS.CLIENTES_METAS, 'Sem clientes no âmbito escolhido.', () => {
      table({ startY: y + 3, head: [CLIENT_HEAD], body: clientRows(scoped.clients), showHead: 'everyPage' });
    }, scoped.clients.length > 0);
    const goals = scoped.goals;
    if (goals.length > 0) {
      const clientName = (id: string) => scoped.clients.find((c) => c.id === id)?.companyName ?? data.clients.find((c) => c.id === id)?.companyName ?? '—';
      section('Metas com prazo', 'Sem metas no âmbito escolhido.', () => {
        table({
          startY: y + 3,
          head: [['Cliente', 'Meta', 'Métrica', 'Valor alvo', 'Prazo', 'Estado']],
          body: goals.map((g) => [clientName(g.clientId), g.title, METRIC_LABEL[g.metric] ?? g.metric, g.targetValue, fmtDate(g.dueDate), GOAL_STATUS[g.status] ?? g.status]),
          showHead: 'everyPage',
        });
      }, true);
    }
  }
  if (sections.includes('ATIVIDADES')) {
    const acts = scoped.activities;
    section(SECTION_LABELS.ATIVIDADES, 'Sem atividades no período escolhido.', () => {
      table({
        startY: y + 3,
        head: [['Data', 'Horário', 'Atividade', 'Cliente', 'Serviço', 'Local', 'Equipa', 'Estado']],
        body: acts.map((a) => [fmtDate(a.activityDate), `${a.startTime}–${a.endTime}`, a.title, a.clientName || '—', a.serviceName || '—', a.location || '—', a.teamName || '—', a.status]),
        showHead: 'everyPage',
      });
    }, acts.length > 0);
  }
  if (sections.includes('EQUIPA')) {
    const provs: Provider[] = scoped.providers;
    section(SECTION_LABELS.EQUIPA, 'Sem funcionários no âmbito escolhido.', () => {
      table({
        startY: y + 3,
        head: [['Funcionário', 'Código', 'Serviços habilitados', 'Estado']],
        body: provs.map((p) => [p.name, p.internalCode || '—', (p.services || []).join(', ') || '—', p.status]),
        showHead: 'everyPage',
      });
    }, provs.length > 0);
  }
  if (sections.includes('RH')) {
    const cases = scoped.hrCases;
    section(SECTION_LABELS.RH, 'Sem ocorrências no âmbito escolhido.', () => {
      table({
        startY: y + 3,
        head: [['Data', 'Tipo', 'Responsável', 'Ação corretiva', 'Estado']],
        body: cases.map((h) => [fmtDate(h.createdAt), h.occurrenceType, h.assignedTo || '—', h.correctiveAction || '—', h.status]),
        showHead: 'everyPage',
      });
    }, cases.length > 0);
  }

  footer(doc);
  return { doc, filename: `relatorio-sicsc-${o.scope.toLowerCase()}-${fileDate(now)}.pdf` };
}

export async function exportReportPdf(data: ReportData, o: ReportOptions) {
  const { doc, filename } = await buildReportPdf(data, o);
  doc.save(filename);
}

/**
 * SICSC — Importação de clientes em lote (CSV). Lógica pura, sem React nem Supabase.
 *
 * Só o nome da empresa é obrigatório. Os restantes campos são opcionais e podem ser completados depois,
 * editando o cliente. Os lotes são enviados ao servidor em blocos de CLIENT_IMPORT_BATCH_SIZE (um pedido de cada vez),
 * por isso o ficheiro pode ter muitos mais clientes do que o tamanho de um lote.
 */
import type { Client } from '../types';

export const CLIENT_IMPORT_BATCH_SIZE = 40;

export type ClientInput = Omit<Client, 'id' | 'createdAt'>;

export const CLIENT_CSV_HEADERS = [
  'Nome da empresa (obrigatório)', 'Código', 'NIF', 'Pessoa de contacto', 'E-mail', 'Telefone', 'Morada', 'Cidade',
  'Sector', 'Início do contrato', 'Fim do contrato', 'Serviços contratados (separar com ;)', 'Estado (Ativo/Inativo)', 'Notas',
];

const TEMPLATE_EXAMPLE = [
  'Empresa Exemplo, Lda', 'CLI-001', '5417123456', 'Ana Silva', 'ana@exemplo.ao', '+244 923 000 000', 'Rua 1, Talatona', 'Luanda',
  'Indústria', '2026-01-01', '2026-12-31', 'Limpeza;Segurança', 'Ativo', 'Preencher os restantes dados depois',
];

/** Ficheiro modelo (com BOM para o Excel abrir acentos corretamente). */
export function clientCsvTemplate(): string {
  const esc = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '\uFEFF' + [CLIENT_CSV_HEADERS, TEMPLATE_EXAMPLE].map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}

/** Lê um CSV com separador ';' ou ',' (detetado pela primeira linha), com aspas e quebras de linha dentro das aspas. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/)[0] ?? '';
  const delim = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delim) {
      row.push(cur); cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const FIELD_BY_HEADER: Record<string, keyof ClientInput> = {
  'nome da empresa': 'companyName', 'nome empresa': 'companyName', 'empresa': 'companyName', 'nome': 'companyName',
  'codigo': 'internalCode', 'codigo interno': 'internalCode',
  'nif': 'nif',
  'pessoa de contacto': 'contactPerson', 'pessoa contacto': 'contactPerson', 'contacto': 'contactPerson',
  'e mail': 'email', 'email': 'email',
  'telefone': 'phone', 'telemovel': 'phone',
  'morada': 'address', 'endereco': 'address',
  'cidade': 'city', 'sector': 'sector',
  'inicio do contrato': 'contractStart', 'data de inicio': 'contractStart', 'inicio contrato': 'contractStart',
  'fim do contrato': 'contractEnd', 'data de fim': 'contractEnd', 'fim contrato': 'contractEnd',
  'servicos contratados': 'contractedServices', 'servicos': 'contractedServices',
  'estado': 'status',
  'notas': 'notes',
};

/** Data em YYYY-MM-DD, DD/MM/YYYY ou DD-MM-YYYY. Devolve YYYY-MM-DD ou null se inválida. */
export function parseImportDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (br) { d = +br[1]; m = +br[2]; y = +br[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()-]{6,20}$/;

export interface ImportRow {
  line: number;          // número da linha no ficheiro (o cabeçalho é a linha 1)
  valid: boolean;
  errors: string[];
  data?: ClientInput;
}

export interface ImportAnalysis {
  fatal?: string;        // ficheiro que não pode ser lido (ex.: sem coluna de nome)
  rows: ImportRow[];
}

export function analyzeClientImport(
  matrix: string[][],
  existing: Pick<Client, 'companyName' | 'nif' | 'internalCode'>[],
  now = new Date(),
): ImportAnalysis {
  if (matrix.length < 2) return { fatal: 'O ficheiro não tem linhas de clientes abaixo do cabeçalho.', rows: [] };

  const headers = matrix[0].map((h) => FIELD_BY_HEADER[norm(h.replace(/\(.*?\)/g, ''))]);
  if (!headers.includes('companyName')) {
    return { fatal: 'O ficheiro precisa da coluna "Nome da empresa" (obrigatório).', rows: [] };
  }
  const col = (field: keyof ClientInput) => headers.indexOf(field);

  const existingNames = new Set(existing.map((c) => norm(c.companyName)));
  const existingNifs = new Set(existing.filter((c) => c.nif).map((c) => c.nif as string));
  const existingCodes = new Set(existing.filter((c) => c.internalCode).map((c) => norm(c.internalCode)));
  const seenNames = new Set<string>();
  const seenNifs = new Set<string>();
  const seenCodes = new Set<string>();
  const stamp = now.getTime().toString(36).toUpperCase().slice(-5);

  const rows: ImportRow[] = matrix.slice(1).map((cells, idx) => {
    const line = idx + 2;
    const get = (field: keyof ClientInput) => {
      const c = col(field);
      return c >= 0 ? (cells[c] ?? '').trim() : '';
    };
    const errors: string[] = [];

    const companyName = get('companyName');
    if (companyName.length < 2 || companyName.length > 200) errors.push('O nome da empresa é obrigatório (2 a 200 caracteres).');

    const nif = get('nif').replace(/\s+/g, '');
    if (nif && !/^\d{9,14}$/.test(nif)) errors.push('O NIF deve ter entre 9 e 14 dígitos.');

    const contactPerson = get('contactPerson');
    if (contactPerson && (contactPerson.length < 2 || contactPerson.length > 100)) errors.push('A pessoa de contacto deve ter entre 2 e 100 caracteres.');

    const email = get('email');
    if (email && !EMAIL_RE.test(email)) errors.push('O e-mail não é válido.');

    const phone = get('phone');
    if (phone && !PHONE_RE.test(phone)) errors.push('O telefone não é válido.');

    const startRaw = get('contractStart');
    const endRaw = get('contractEnd');
    const contractStart = startRaw ? parseImportDate(startRaw) : null;
    const contractEnd = endRaw ? parseImportDate(endRaw) : null;
    if (startRaw && !contractStart) errors.push('A data de início do contrato é inválida (use AAAA-MM-DD ou DD/MM/AAAA).');
    if (endRaw && !contractEnd) errors.push('A data de fim do contrato é inválida (use AAAA-MM-DD ou DD/MM/AAAA).');
    if (contractStart && contractEnd && contractEnd < contractStart) errors.push('A data de fim do contrato é anterior ao início.');

    const statusRaw = norm(get('status'));
    let status: Client['status'] = 'ACTIVE';
    if (statusRaw && ['inativo', 'inactive', 'inativa'].includes(statusRaw)) status = 'INACTIVE';
    else if (statusRaw && !['ativo', 'active', 'ativa'].includes(statusRaw)) errors.push('O estado deve ser Ativo ou Inativo.');

    const notes = get('notes');
    if (notes.length > 2000) errors.push('As notas não podem ter mais de 2000 caracteres.');

    // Duplicados (nome e NIF não se repetem; código, se indicado, também não)
    const nameKey = norm(companyName);
    if (nameKey && (existingNames.has(nameKey) || seenNames.has(nameKey))) errors.push('Já existe um cliente com este nome.');
    if (nif && (existingNifs.has(nif) || seenNifs.has(nif))) errors.push('Já existe um cliente com este NIF.');

    let internalCode = get('internalCode');
    if (internalCode) {
      const codeKey = norm(internalCode);
      if (existingCodes.has(codeKey) || seenCodes.has(codeKey)) errors.push('Já existe um cliente com este código.');
      seenCodes.add(codeKey);
    } else {
      internalCode = `CLI-${stamp}${String(line).padStart(3, '0')}`;
    }

    if (nameKey) seenNames.add(nameKey);
    if (nif) seenNifs.add(nif);

    const services = get('contractedServices').split(/[;,]/).map((s) => s.trim()).filter(Boolean);

    if (errors.length > 0) return { line, valid: false, errors };
    return {
      line,
      valid: true,
      errors,
      data: {
        companyName,
        internalCode,
        nif: nif || undefined,
        contactPerson,
        email,
        phone,
        address: get('address') || undefined,
        city: get('city') || undefined,
        sector: get('sector') || undefined,
        contractStart: contractStart || undefined,
        contractEnd: contractEnd || undefined,
        notes: notes || undefined,
        contractedServices: services,
        status,
      },
    };
  });

  return { rows };
}

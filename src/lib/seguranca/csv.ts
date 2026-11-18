/**
 * Exportações CSV seguras (N-04).
 *
 * Células de texto que começam por =, +, -, @ (depois de espaços ou caracteres de controlo),
 * ou por tabulação/retorno/quebra de linha, são interpretadas como fórmulas pelo Excel e outras
 * folhas de cálculo. As aspas NÃO evitam isto: por isso prefixamos com apóstrofo, que o Excel
 * mostra sem o transformar em fórmula. Os dados na base de dados não são alterados.
 */
export function celulaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return '""';
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  let texto = String(valor);
  // ignora espaços e caracteres de controlo iniciais para decidir se é perigoso
  const semPrefixo = texto.replace(/^[\s\u0000-\u001F\u007F\u200B-\u200F\uFEFF]+/, '');
  if (/^[=+\-@]/.test(semPrefixo) || /^[\t\r\n]/.test(texto)) {
    texto = `'${texto}`;
  }
  return `"${texto.replace(/"/g, '""')}"`;
}

/** Junta valores numa linha CSV, cada célula tratada por celulaCsv. */
export function linhaCsv(valores: unknown[]): string {
  return valores.map(celulaCsv).join(',');
}

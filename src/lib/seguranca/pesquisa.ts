/**
 * Entradas do utilizador usadas em filtros PostgREST e em anexos (N-08, N-09).
 */

/**
 * Mantém apenas letras, algarismos, espaços e . _ @ - no termo de pesquisa.
 * Caracteres com significado no filtro (, ( ) " \\ *) são removidos: impedem que o texto
 * altere a lógica do filtro .or(...). Pesquisas normais por nome, código ou e-mail continuam a funcionar.
 */
export function sanitizarTermoPesquisa(termo: string): string {
  return termo.replace(/[^\p{L}\p{N}\s._@-]/gu, '').replace(/\s+/g, ' ').trim();
}

/** Identificador seguro para inserir num filtro: UUID ou código alfanumérico. Caso contrário devolve um valor que não corresponde a nada. */
export function identificadorSeguro(id: string): string {
  const uuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const codigo = /^[A-Za-z0-9_.-]{1,64}$/;
  return uuid.test(id) || codigo.test(id) ? id : '00000000-0000-0000-0000-000000000000';
}

/** Extensões permitidas em anexos de mensagens (alinhadas com a lista de MIME types do bucket). */
export const EXTENSOES_ANEXO_PERMITIDAS = ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx'] as const;

export function extensaoAnexoPermitida(nomeFicheiro: string): boolean {
  const partes = nomeFicheiro.split('.');
  if (partes.length < 2) return false;
  const extensao = partes[partes.length - 1].toLowerCase();
  return (EXTENSOES_ANEXO_PERMITIDAS as readonly string[]).includes(extensao);
}

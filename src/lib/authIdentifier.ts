/**
 * @file authIdentifier.ts
 * @description Estratégia de Normalização de Identificadores e Geração Determinística de Credenciais de Acesso.
 * Sistema: SICSC — AETERNU LDA (Higiene | Segurança | Ambiente).
 * 
 * Regras e Estratégia de Arquitetura:
 * 1. O colaborador pode usar um identificador de acesso humanizado e amigável (ex.: "Maria Silva" ou "joao.neto").
 * 2. O identificador de acesso é totalmente desacoplado do e-mail de contacto pessoal/profissional do colaborador.
 * 3. A normalização remove espaços laterais, converte acentos/diacríticos para ASCII básico, elimina caracteres
 *    especiais não autorizados e gera um slug determinístico para comparação insensível a maiúsculas/minúsculas.
 * 4. Para interoperabilidade com o motor de autenticação do Supabase Auth (GoTrue), geramos um endereço técnico
 *    interno no domínio fixo e controlado "@sicsc.aeternu.internal", imune a injeções de domínios externos arbitrários.
 * 5. Compatibilidade retroativa: se o utilizador inserir um endereço de e-mail existente (ex: "admin@aeternu.co.ao"),
 *    a função preserva o e-mail em formato minúsculo e limpo.
 */

export const TECHNICAL_AUTH_DOMAIN = 'sicsc.aeternu.internal';
export const MIN_IDENTIFIER_LENGTH = 3;
export const MAX_IDENTIFIER_LENGTH = 50;

export interface IdentifierValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Remove diacríticos e acentuações (ex: "João" -> "Joao", "Luísa" -> "Luisa").
 */
export function removeDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza um identificador humano para forma canónica de comparação e armazenamento.
 * Converte para minúsculas, remove diacríticos e substitui múltiplos espaços ou caracteres especiais por ponto.
 * 
 * Exemplos:
 * - "  Maria   Silva  " -> "maria.silva"
 * - "João P. Neto" -> "joao.p.neto"
 * - "carlos_antonio" -> "carlos.antonio"
 */
export function normalizeIdentifier(rawIdentifier: string): string {
  if (!rawIdentifier || typeof rawIdentifier !== 'string') {
    return '';
  }

  // 1. Limpeza de espaços exteriores e conversão para minúsculas
  let clean = rawIdentifier.trim().toLowerCase();

  // 2. Remoção de diacríticos
  clean = removeDiacritics(clean);

  // 3. Substituir espaços, traços e underscores por ponto delimitador canónico
  clean = clean.replace(/[\s\-_]+/g, '.');

  // 4. Manter apenas caracteres alfanuméricos e pontos
  clean = clean.replace(/[^a-z0-9.]/g, '');

  // 5. Remover pontos duplicados ou nas extremidades
  clean = clean.replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '');

  return clean;
}

/**
 * Valida os requisitos de formato, caracteres permitidos e tamanho de um identificador.
 */
export function validateIdentifier(rawIdentifier: string): IdentifierValidationResult {
  if (!rawIdentifier || typeof rawIdentifier !== 'string' || rawIdentifier.trim().length === 0) {
    return {
      valid: false,
      error: 'O identificador de acesso não pode estar vazio.'
    };
  }

  const trimmed = rawIdentifier.trim();

  // Se for um endereço de e-mail comum (compatibilidade)
  if (trimmed.includes('@')) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return {
        valid: false,
        error: 'Formato de e-mail inválido.'
      };
    }
    return {
      valid: true,
      normalized: trimmed.toLowerCase()
    };
  }

  if (trimmed.length < MIN_IDENTIFIER_LENGTH) {
    return {
      valid: false,
      error: `O identificador deve conter no mínimo ${MIN_IDENTIFIER_LENGTH} caracteres.`
    };
  }

  if (trimmed.length > MAX_IDENTIFIER_LENGTH) {
    return {
      valid: false,
      error: `O identificador não pode exceder ${MAX_IDENTIFIER_LENGTH} caracteres.`
    };
  }

  const normalized = normalizeIdentifier(trimmed);

  if (normalized.length < MIN_IDENTIFIER_LENGTH) {
    return {
      valid: false,
      error: 'O identificador contém caracteres insuficientes após normalização.'
    };
  }

  return {
    valid: true,
    normalized
  };
}

/**
 * Converte um identificador de acesso livre no e-mail técnico determinístico do Supabase Auth.
 * 
 * Estratégia de Proteção contra Colisões:
 * - O identificador normalizado (ex: "maria.silva") é mapeado para "maria.silva@sicsc.aeternu.internal".
 * - O domínio fixo `@sicsc.aeternu.internal` é uma zona técnica privada não roteável na Internet pública,
 *   garantindo que utilizadores não possam injetar servidores externos ou tentar abusos de reset de senha via DNS público.
 * - Caso a entrada já seja um e-mail com '@' (ex.: administradores com contas legadas), devolve o e-mail em minúsculas.
 */
export function identifierToAuthEmail(identifier: string): string {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Identificador inválido para derivação de e-mail técnico.');
  }

  const trimmed = identifier.trim();

  // Contas legadas com e-mail direto
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  const normalized = normalizeIdentifier(trimmed);
  if (!normalized) {
    throw new Error('Identificador resultou em valor vazio após normalização.');
  }

  return `${normalized}@${TECHNICAL_AUTH_DOMAIN}`;
}

/**
 * Converte um e-mail técnico de volta para o identificador amigável de exibição (se aplicável).
 */
export function authEmailToIdentifierDisplay(authEmail: string): string {
  if (!authEmail) return '';
  const lower = authEmail.toLowerCase().trim();
  if (lower.endsWith(`@${TECHNICAL_AUTH_DOMAIN}`)) {
    return lower.replace(`@${TECHNICAL_AUTH_DOMAIN}`, '');
  }
  return authEmail;
}

/** Palavra-passe: 8 a 128 caracteres, com pelo menos uma letra e um número. */
export function isStrongPassword(p: string): boolean {
  return p.length >= 8 && p.length <= 128 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);
}

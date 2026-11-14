/**
 * Tradução central de erros para português claro.
 *
 * Todas as mensagens que vêm do Supabase (PostgreSQL, PostgREST, Auth, Storage), da rede ou do
 * navegador passam por aqui, para que o utilizador perceba o motivo do problema e não veja
 * texto técnico em inglês. Mensagens que já estão em português (por exemplo as geradas pelas
 * funções SQL com RAISE EXCEPTION) são mantidas tal como estão.
 */

type ErroDesconhecido = unknown;

interface ErroLike {
  message?: string;
  code?: string | number;
  details?: string | null;
  hint?: string | null;
  status?: number;
  name?: string;
  error_description?: string;
}

/** Nomes legíveis das colunas mais comuns, para mensagens do tipo "campo obrigatório". */
const NOMES_CAMPOS: Record<string, string> = {
  company_name: 'nome da empresa',
  internal_code: 'código interno',
  contact_person: 'pessoa de contacto',
  email: 'e-mail',
  phone: 'telefone',
  nif: 'NIF',
  name: 'nome',
  full_name: 'nome completo',
  employee_number: 'número de funcionário',
  access_identifier: 'identificador de acesso',
  code: 'código',
  title: 'título',
  service_id: 'serviço',
  client_id: 'cliente',
  provider_id: 'prestador',
  team_id: 'equipa',
  evaluation_id: 'avaliação',
  description: 'descrição',
  status: 'estado',
};

/** Nomes legíveis das tabelas/restrições, para mensagens de duplicados e de ligações. */
const NOMES_TABELAS: Record<string, string> = {
  clients: 'cliente',
  services: 'serviço',
  providers: 'prestador',
  employees: 'funcionário',
  teams: 'equipa',
  evaluations: 'avaliação',
  profiles: 'perfil',
  activities: 'atividade',
  messages: 'mensagem',
  conversations: 'conversa',
  form_versions: 'versão do formulário',
};

function campo(raw?: string | null): string {
  if (!raw) return 'campo';
  const limpo = raw.replace(/["'()]/g, '').trim();
  return NOMES_CAMPOS[limpo] ?? limpo.replace(/_/g, ' ');
}

function tabela(raw?: string | null): string {
  if (!raw) return 'registo';
  const limpo = raw.replace(/^public\./, '').replace(/["']/g, '').trim();
  return NOMES_TABELAS[limpo] ?? limpo.replace(/_/g, ' ');
}

/** Heurística simples: o texto já está em português? Nesse caso não é traduzido. */
function pareceJaEmPortugues(texto: string): boolean {
  return /[ãõçáéíóúâêôà]/i.test(texto)
    || /\b(não|nao|erro ao|falha|inválid|obrigatóri|obrigatori|deve |tem de|selecione|indique|acesso negado|já existe|não foi)\b/i.test(texto);
}

function extrair(erro: ErroDesconhecido): ErroLike {
  if (!erro) return {};
  if (typeof erro === 'string') return { message: erro };
  if (typeof erro === 'object') return erro as ErroLike;
  return { message: String(erro) };
}

/** Traduz por código SQLSTATE do PostgreSQL / código do PostgREST. */
function porCodigo(e: ErroLike): string | null {
  const codigo = String(e.code ?? '');
  const msg = e.message ?? '';
  const detalhe = e.details ?? '';

  switch (codigo) {
    case '23505': { // unique_violation
      const m = detalhe.match(/Key \(([^)]+)\)=\(([^)]*)\)/i);
      if (m) {
        const campos = m[1].split(',').map(c => campo(c)).join(' e ');
        return `Já existe um registo com o mesmo ${campos} («${m[2]}»). Use outro valor ou edite o registo existente.`;
      }
      const t = msg.match(/unique constraint "([^"]+)"/i);
      if (t) {
        const nome = t[1];
        if (/company_name/.test(nome)) return 'Já existe uma empresa com este nome.';
        if (/internal_code/.test(nome)) return 'Já existe um registo com este código interno.';
        if (/employee_number|number_key/.test(nome)) return 'O número de funcionário já existe.';
        if (/access_identifier/.test(nome)) return 'O identificador de acesso já está em uso.';
      }
      return 'Já existe um registo com estes dados. Verifique se não está repetido.';
    }
    case '23503': { // foreign_key_violation
      if (/still referenced|is still referenced/i.test(detalhe) || /update or delete on table/i.test(msg)) {
        const t = msg.match(/on table "([^"]+)"/i);
        return `Não é possível apagar este ${tabela(t?.[1])} porque ainda está associado a outros registos (por exemplo avaliações, equipas ou atividades). Remova primeiro essas associações.`;
      }
      const k = detalhe.match(/Key \(([^)]+)\)=\(([^)]*)\) is not present in table "([^"]+)"/i);
      if (k) return `O ${campo(k[1])} escolhido já não existe (${tabela(k[3])} não encontrado). Atualize a página e escolha outra vez.`;
      return 'Este registo está ligado a outro que não existe ou foi apagado. Atualize a página e tente novamente.';
    }
    case '23502': { // not_null_violation
      const m = msg.match(/column "([^"]+)"/i);
      return `O campo «${campo(m?.[1])}» é obrigatório e não foi preenchido.`;
    }
    case '23514': { // check_violation
      const m = msg.match(/constraint "([^"]+)"/i);
      return `Um dos valores indicados não é permitido${m ? ` (regra «${m[1]}»)` : ''}. Verifique os campos e tente novamente.`;
    }
    case '22P02': // invalid_text_representation
      return /uuid/i.test(msg)
        ? 'Identificador inválido: o registo escolhido não existe na base de dados. Atualize a página e escolha outra vez.'
        : 'Um dos valores tem um formato inválido. Verifique os campos.';
    case '22001':
      return 'Um dos textos é demasiado comprido. Reduza o tamanho e tente novamente.';
    case '22003':
      return 'Um dos números está fora do intervalo permitido.';
    case '22007': case '22008':
      return 'A data indicada não é válida.';
    case '42501':
      return 'Não tem permissão para executar esta ação. Peça a um Administrador ou aos Recursos Humanos.';
    case '42P01':
      return 'A base de dados ainda não tem esta tabela. Execute as migrações SQL em falta no Supabase.';
    case '42703':
      return 'A base de dados está desatualizada (falta uma coluna). Execute as migrações SQL em falta no Supabase.';
    case '42883': case 'PGRST202':
      return 'A base de dados está desatualizada (falta uma função). Execute as migrações SQL em falta no Supabase.';
    case 'PGRST116':
      return 'Registo não encontrado. Pode ter sido apagado por outra pessoa. Atualize a página.';
    case 'PGRST301': case 'PGRST303':
      return 'A sessão expirou. Inicie sessão novamente.';
    case '40001': case '40P01':
      return 'Houve um conflito com outra operação em simultâneo. Tente novamente.';
    case '57014':
      return 'A operação demorou demasiado tempo e foi cancelada. Tente novamente.';
    case '53300':
      return 'O servidor está sobrecarregado neste momento. Tente novamente dentro de instantes.';
    default:
      return null;
  }
}

/** Traduz por conteúdo da mensagem (Auth, Storage, rede, RLS, etc.). */
function porTexto(e: ErroLike): string | null {
  const msg = (e.message ?? e.error_description ?? '').trim();
  if (!msg) return null;
  const m = msg.toLowerCase();

  // Autenticação
  if (m.includes('invalid login credentials')) return 'Credenciais inválidas. Verifique o identificador e a palavra-passe.';
  if (m.includes('email not confirmed')) return 'O e-mail ainda não foi confirmado.';
  if (m.includes('user already registered') || m.includes('already been registered')) return 'Já existe uma conta com este e-mail.';
  if (m.includes('password should be at least')) return 'A palavra-passe é demasiado curta. Use pelo menos 8 caracteres, com letras e números.';
  if (m.includes('new password should be different')) return 'A nova palavra-passe tem de ser diferente da atual.';
  if (m.includes('weak password') || m.includes('password is known to be weak')) return 'A palavra-passe é demasiado fraca. Escolha uma mais difícil de adivinhar.';
  if (m.includes('jwt expired') || m.includes('invalid jwt') || m.includes('token is expired') || m.includes('refresh token')) return 'A sessão expirou. Inicie sessão novamente.';
  if (m.includes('auth session missing') || m.includes('not authenticated')) return 'Não tem sessão iniciada. Entre novamente no sistema.';
  if (m.includes('email rate limit') || m.includes('over_email_send_rate_limit')) return 'Foram enviados demasiados e-mails seguidos. Aguarde alguns minutos e tente de novo.';
  if (m.includes('rate limit') || m.includes('too many requests') || e.status === 429) return 'Foram feitos demasiados pedidos seguidos. Aguarde um pouco e tente novamente.';
  if (m.includes('signups not allowed')) return 'O registo de novas contas está desativado.';
  if (m.includes('user not found')) return 'Utilizador não encontrado.';

  // Permissões (RLS)
  if (m.includes('row-level security') || m.includes('row level security')) return 'Não tem permissão para guardar ou ver estes dados. Peça a um Administrador ou aos Recursos Humanos.';
  if (m.includes('permission denied')) return 'Não tem permissão para executar esta ação.';

  // Storage
  if (m.includes('bucket not found')) return 'A pasta de ficheiros não existe no Supabase Storage. Execute as migrações SQL em falta.';
  if (m.includes('object not found')) return 'O ficheiro não foi encontrado. Pode ter sido apagado.';
  if (m.includes('payload too large') || m.includes('exceeded the maximum allowed size') || m.includes('file size')) return 'O ficheiro é demasiado grande.';
  if (m.includes('mime type') && m.includes('not supported')) return 'Este tipo de ficheiro não é permitido.';
  if (m.includes('the resource already exists') || m.includes('duplicate') && m.includes('storage')) return 'Já existe um ficheiro com esse nome.';

  // Base de dados (mensagens sem código)
  if (m.includes('duplicate key value')) return 'Já existe um registo com estes dados. Verifique se não está repetido.';
  if (m.includes('violates foreign key')) return 'Este registo está ligado a outros dados que não existem ou ainda o utilizam.';
  if (m.includes('violates not-null') || m.includes('null value in column')) {
    const c = msg.match(/column "([^"]+)"/i);
    return `O campo «${campo(c?.[1])}» é obrigatório e não foi preenchido.`;
  }
  if (m.includes('invalid input syntax for type uuid')) return 'Identificador inválido: o registo escolhido não existe na base de dados.';
  if (m.includes('could not find the function') || m.includes('schema cache')) return 'A base de dados está desatualizada. Execute as migrações SQL em falta no Supabase.';
  if (m.includes('does not exist') && m.includes('relation')) return 'A base de dados ainda não tem esta tabela. Execute as migrações SQL em falta no Supabase.';
  if (m.includes('does not exist') && m.includes('column')) return 'A base de dados está desatualizada (falta uma coluna). Execute as migrações SQL em falta no Supabase.';
  if (m.includes('statement timeout') || m.includes('canceling statement')) return 'A operação demorou demasiado tempo e foi cancelada. Tente novamente.';

  // Rede e navegador
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed') || m.includes('load failed') || m.includes('network error')) {
    return 'Sem ligação ao servidor. Verifique a sua internet e tente novamente.';
  }
  if (m.includes('timeout') || m.includes('timed out') || m.includes('aborted')) return 'O servidor demorou demasiado a responder. Tente novamente.';
  if (m.includes('quota') && m.includes('exceeded')) return 'O armazenamento do navegador está cheio. Liberte espaço e tente novamente.';
  if (m.includes('notallowederror') || m.includes('permission denied') && m.includes('microphone')) return 'O navegador não tem permissão para usar o microfone.';
  if (m.includes('unexpected token') || m.includes('json')) return 'O servidor devolveu uma resposta inesperada. Tente novamente ou contacte o suporte.';
  if (e.status === 500 || /internal server error/i.test(msg)) return 'Ocorreu um erro no servidor. Tente novamente dentro de instantes.';
  if (e.status === 503 || m.includes('service unavailable')) return 'O serviço está temporariamente indisponível. Tente novamente dentro de instantes.';

  return null;
}

/**
 * Converte qualquer erro numa mensagem em português.
 * @param erro     erro do Supabase, exceção ou texto
 * @param padrao   mensagem usada quando não há nada mais específico
 */
export function traduzirErro(erro: ErroDesconhecido, padrao = 'Ocorreu um erro inesperado. Tente novamente.'): string {
  const e = extrair(erro);
  const msg = (e.message ?? e.error_description ?? '').trim();

  // Mensagens geradas pelas nossas funções SQL (RAISE EXCEPTION) já vêm em português claro.
  if (msg && pareceJaEmPortugues(msg) && !/^(error|failed|invalid)\b/i.test(msg)) return msg;

  const porCod = porCodigo(e);
  if (porCod) return porCod;

  const porTxt = porTexto(e);
  if (porTxt) return porTxt;

  // Última tentativa: se o texto parece inglês técnico, devolve a mensagem padrão e guarda o original na consola.
  if (msg) {
    // eslint-disable-next-line no-console
    console.warn('[SICSC] Erro sem tradução específica:', msg, e.code ? `(código ${e.code})` : '');
    return `${padrao} (detalhe técnico: ${msg.slice(0, 160)})`;
  }
  return padrao;
}

/** Atalho para quando se quer só o texto técnico acrescentado ao contexto: «Falha ao guardar o cliente: …». */
export function erroComContexto(contexto: string, erro: ErroDesconhecido): string {
  const msg = traduzirErro(erro, '');
  return msg ? `${contexto}: ${msg}` : `${contexto}.`;
}

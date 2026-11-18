/**
 * Login por identificador, nome ou número de funcionário (VUL-06, N-12).
 *
 * Respostas uniformes: conta inexistente, palavra-passe errada e conta não confirmada
 * devolvem exatamente a mesma resposta. Quando a conta não existe, o pedido de autenticação
 * é feito na mesma com um e-mail fictício, para que o tempo de resposta não revele nada.
 * Os limites de tentativas são por identificador e por IP, e a contagem é feita na base de dados.
 */

export interface LoginDeps {
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
  supabaseUrl: string;
  anonKey: string;
  /** Resolve o identificador para o e-mail técnico (RPC resolve_login_email, papel service_role). */
  resolveEmail: (login: string) => Promise<string | null>;
  /** Limite durável por chave (RPC auth_rate_hit, papel service_role). */
  rateHit: (key: string, limit: number, windowSeconds: number) => Promise<boolean>;
}

export interface LoginResult {
  status: number;
  body: Record<string, unknown>;
}

const RESPOSTA_INVALIDA = { error: 'Credenciais inválidas. Verifique os seus dados.' };
const RESPOSTA_LIMITE = { error: 'Demasiadas tentativas. Aguarde alguns minutos e tente novamente.' };
const RESPOSTA_PEDIDO = { error: 'Pedido inválido.' };
const DOMINIO_TECNICO = 'sicsc.aeternu.internal';

export async function sha256Hex(texto: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleLogin(input: unknown, ip: string, deps: LoginDeps): Promise<LoginResult> {
  if (!input || typeof input !== 'object') return { status: 400, body: RESPOSTA_PEDIDO };
  const { login, password } = input as { login?: unknown; password?: unknown };
  if (typeof login !== 'string' || typeof password !== 'string') return { status: 400, body: RESPOSTA_PEDIDO };
  const identificador = login.trim();
  if (identificador.length < 3 || identificador.length > 120) return { status: 400, body: RESPOSTA_PEDIDO };
  if (password.length < 1 || password.length > 200) return { status: 400, body: RESPOSTA_PEDIDO };

  const hash = await sha256Hex(identificador.toLowerCase());
  const dentroDoLimiteConta = await deps.rateHit(`login:id:${hash}`, 20, 900);
  const dentroDoLimiteIp = await deps.rateHit(`login:ip:${ip || 'desconhecido'}`, 200, 900);
  if (!dentroDoLimiteConta || !dentroDoLimiteIp) return { status: 429, body: RESPOSTA_LIMITE };

  const resolvido = await deps.resolveEmail(identificador);
  const email = resolvido ?? `${hash.slice(0, 24)}@${DOMINIO_TECNICO}`;

  const res = await deps.fetchFn(`${deps.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: deps.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (resolvido && res.ok) {
    const sessao = (await res.json()) as Record<string, unknown>;
    return { status: 200, body: sessao };
  }
  return { status: 401, body: RESPOSTA_INVALIDA };
}

/**
 * Submissão pública com verificação opcional (VUL-07). Desativada até existirem chaves Turnstile:
 * sem `turnstileSecret`, só aplica o limite por IP e reencaminha para a RPC submit_evaluation.
 * O campo clientVisibleToTeam é removido (N-07). A RPC continua a validar tudo.
 */

export interface SubmitDeps {
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>;
  supabaseUrl: string;
  anonKey: string;
  rateHit: (key: string, limit: number, windowSeconds: number) => Promise<boolean>;
  turnstileSecret?: string;
}

export interface SubmitResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleSubmit(input: unknown, ip: string, deps: SubmitDeps): Promise<SubmitResult> {
  if (!input || typeof input !== 'object') return { status: 400, body: { error: 'Pedido inválido.' } };
  const payload: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  const tokenTurnstile = typeof payload.turnstileToken === 'string' ? payload.turnstileToken : '';
  delete payload.turnstileToken;
  delete payload.clientVisibleToTeam;

  if (deps.turnstileSecret) {
    const corpo = new URLSearchParams({ secret: deps.turnstileSecret, response: tokenTurnstile, remoteip: ip });
    const v = await deps.fetchFn('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: corpo });
    const dados = (await v.json()) as { success?: boolean };
    if (!dados.success) return { status: 403, body: { error: 'Verificação de segurança falhou. Recarregue a página.' } };
  }

  const dentroDoLimite = await deps.rateHit(`submit:ip:${ip || 'desconhecido'}`, 30, 3600);
  if (!dentroDoLimite) return { status: 429, body: { error: 'Demasiadas submissões. Tente mais tarde.' } };

  const r = await deps.fetchFn(`${deps.supabaseUrl}/rest/v1/rpc/submit_evaluation`, {
    method: 'POST',
    headers: { apikey: deps.anonKey, Authorization: `Bearer ${deps.anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_payload: payload }),
  });
  const texto = await r.text();
  let corpo: Record<string, unknown>;
  try { corpo = JSON.parse(texto) as Record<string, unknown>; } catch { corpo = { error: 'Resposta inválida do servidor.' }; }
  return { status: r.ok ? 200 : 400, body: corpo };
}

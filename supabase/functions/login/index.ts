// Edge Function `login`: ver logic.ts. Publicar com `supabase functions deploy login`.
import { handleLogin, type LoginDeps } from './logic.ts';

const ORIGENS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);

function cabecalhos(origem: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Cache-Control': 'no-store',
  };
  if (origem && ORIGENS.includes(origem)) {
    h['Access-Control-Allow-Origin'] = origem;
    h['Vary'] = 'Origin';
  }
  return h;
}

function ipDoCliente(req: Request): string {
  // O gateway acrescenta o IP real ao FIM de X-Forwarded-For; o primeiro valor pode ser forjado.
  const xff = req.headers.get('x-forwarded-for') ?? '';
  const partes = xff.split(',').map((p) => p.trim()).filter(Boolean);
  return partes.length ? partes[partes.length - 1] : 'desconhecido';
}

Deno.serve(async (req) => {
  const origem = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabecalhos(origem) });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método não permitido.' }), { status: 405, headers: cabecalhos(origem) });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const rpc = (nome: string, corpo: unknown) => fetch(`${url}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });

  const deps: LoginDeps = {
    fetchFn: fetch,
    supabaseUrl: url,
    anonKey: anon,
    resolveEmail: async (login) => {
      const r = await rpc('resolve_login_email', { p_login: login });
      return r.ok ? ((await r.json()) as string | null) : null;
    },
    rateHit: async (key, limit, windowSeconds) => {
      const r = await rpc('auth_rate_hit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
      return r.ok ? ((await r.json()) as boolean) : false;
    },
  };

  let corpo: unknown = null;
  try { corpo = await req.json(); } catch { corpo = null; }
  const resultado = await handleLogin(corpo, ipDoCliente(req), deps);
  return new Response(JSON.stringify(resultado.body), { status: resultado.status, headers: cabecalhos(origem) });
});

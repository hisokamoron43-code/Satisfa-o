// Edge Function `submit-evaluation`: ver logic.ts. Não é usada pelo frontend até existirem chaves Turnstile.
import { handleSubmit, type SubmitDeps } from './logic.ts';

const ORIGENS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);

function cabecalhos(origem: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Cache-Control': 'no-store',
  };
  if (origem && ORIGENS.includes(origem)) { h['Access-Control-Allow-Origin'] = origem; h['Vary'] = 'Origin'; }
  return h;
}

function ipDoCliente(req: Request): string {
  const partes = (req.headers.get('x-forwarded-for') ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return partes.length ? partes[partes.length - 1] : 'desconhecido';
}

Deno.serve(async (req) => {
  const origem = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabecalhos(origem) });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Método não permitido.' }), { status: 405, headers: cabecalhos(origem) });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const deps: SubmitDeps = {
    fetchFn: fetch,
    supabaseUrl: url,
    anonKey: anon,
    turnstileSecret: Deno.env.get('TURNSTILE_SECRET_KEY') || undefined,
    rateHit: async (key, limit, windowSeconds) => {
      const r = await fetch(`${url}/rest/v1/rpc/auth_rate_hit`, {
        method: 'POST',
        headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_key: key, p_limit: limit, p_window_seconds: windowSeconds }),
      });
      return r.ok ? ((await r.json()) as boolean) : false;
    },
  };
  let corpo: unknown = null;
  try { corpo = await req.json(); } catch { corpo = null; }
  const resultado = await handleSubmit(corpo, ipDoCliente(req), deps);
  return new Response(JSON.stringify(resultado.body), { status: resultado.status, headers: cabecalhos(origem) });
});

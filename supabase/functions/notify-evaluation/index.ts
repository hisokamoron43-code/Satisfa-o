/**
 * Supabase Edge Function: notify-evaluation
 *
 * Envia ao gestor um e-mail quando uma nova avaliação é submetida (formulário público).
 *
 * Segurança:
 * - O pedido traz APENAS o identificador da avaliação. O conteúdo do e-mail é lido da base
 *   de dados com a service role; nada do que o cliente envia entra no e-mail.
 * - Idempotente: a avaliação é "reservada" (manager_notified_at) antes do envio, por isso
 *   o mesmo identificador nunca gera dois e-mails.
 * - Só avaliações recentes (últimos 15 minutos) podem ser notificadas.
 * - Todo o texto introduzido por clientes é escapado antes de entrar no HTML.
 *
 * Segredos necessários (supabase secrets set ...):
 *   RESEND_API_KEY   chave da API do Resend (https://resend.com)
 *   MANAGER_EMAIL    e-mail do gestor (vários separados por vírgula)
 *   MAIL_FROM        remetente, ex.: "Sistema de Qualidade Aeternu <no-reply@aeternu.co.ao>"
 *                    (o domínio tem de estar verificado no Resend)
 *   ALLOWED_ORIGINS  domínios autorizados (já usado pela função admin-employees)
 */

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
const MAX_AGE_MINUTES = 15;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const h: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' },
  });
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Remove quebras de linha (evita injeção em cabeçalhos/assunto) e limita o tamanho. */
function oneLine(v: unknown, max = 120): string {
  return String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(req) });
  if (req.method !== 'POST') return json(req, { success: false, error: 'Método não permitido.' }, 405);

  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json(req, { success: false, error: 'Origem não autorizada.' }, 403);
  }

  let evaluationId = '';
  try {
    const body = await req.json();
    evaluationId = typeof body?.evaluation_id === 'string' ? body.evaluation_id.trim() : '';
  } catch {
    return json(req, { success: false, error: 'Pedido inválido.' }, 400);
  }
  if (!UUID_RE.test(evaluationId)) return json(req, { success: false, error: 'Identificador inválido.' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const mailFrom = Deno.env.get('MAIL_FROM');
  const recipients = (Deno.env.get('MANAGER_EMAIL') ?? '').split(',').map((e) => e.trim()).filter((e) => EMAIL_RE.test(e));
  if (!supabaseUrl || !serviceKey || !resendKey || !mailFrom || recipients.length === 0) {
    console.error('notify-evaluation: configuração de e-mail incompleta.');
    return json(req, { success: false, error: 'Notificações não configuradas.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1. Reservar a avaliação (só se recente e ainda não notificada). Atómico: um único UPDATE.
  const since = new Date(Date.now() - MAX_AGE_MINUTES * 60_000).toISOString();
  const { data: claimed, error: claimError } = await admin
    .from('evaluations')
    .update({ manager_notified_at: new Date().toISOString() })
    .eq('id', evaluationId)
    .is('manager_notified_at', null)
    .gte('evaluation_date', since)
    .select('reference, client_name, client_name_input, service_name, satisfaction_rating, nps_score, comment')
    .maybeSingle();

  if (claimError) {
    console.error('notify-evaluation: falha ao reservar avaliação.');
    return json(req, { success: false, error: 'Não foi possível processar o pedido.' }, 500);
  }
  if (!claimed) {
    // Inexistente, antiga ou já notificada: resposta neutra (não revela qual).
    return json(req, { success: true, sent: false });
  }

  // 2. Montar e enviar o e-mail
  const clientName = oneLine(claimed.client_name_input || claimed.client_name || 'Cliente não identificado');
  const reference = oneLine(claimed.reference, 40);
  const service = oneLine(claimed.service_name || '—');
  const rating = claimed.satisfaction_rating != null ? `${claimed.satisfaction_rating}/5` : 'não indicada';
  const nps = claimed.nps_score != null ? `${claimed.nps_score}/10` : 'não indicado';
  const comment = String(claimed.comment ?? '').trim().slice(0, 1000) || '(sem comentário)';

  const text =
    `Foi submetida uma nova avaliação.\n\n` +
    `Referência: ${reference}\nCliente: ${clientName}\nServiço: ${service}\n` +
    `Satisfação: ${rating}\nNPS: ${nps}\nComentário: ${comment}\n`;

  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">` +
    `<h2 style="margin:0 0 12px">Nova avaliação submetida</h2>` +
    `<table cellpadding="6" style="border-collapse:collapse">` +
    `<tr><td><b>Referência</b></td><td>${esc(reference)}</td></tr>` +
    `<tr><td><b>Cliente</b></td><td>${esc(clientName)}</td></tr>` +
    `<tr><td><b>Serviço</b></td><td>${esc(service)}</td></tr>` +
    `<tr><td><b>Satisfação</b></td><td>${esc(rating)}</td></tr>` +
    `<tr><td><b>NPS</b></td><td>${esc(nps)}</td></tr>` +
    `<tr><td valign="top"><b>Comentário</b></td><td style="white-space:pre-wrap">${esc(comment)}</td></tr>` +
    `</table></div>`;

  let sent = false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: mailFrom,
        to: recipients,
        subject: `Nova avaliação submetida: ${reference}`,
        text,
        html,
      }),
    });
    sent = res.ok;
    if (!res.ok) console.error(`notify-evaluation: o fornecedor de e-mail respondeu ${res.status}.`);
  } catch {
    console.error('notify-evaluation: falha de rede ao enviar e-mail.');
  }

  // 3. Se o envio falhou, libertar a reserva para permitir nova tentativa (dentro da janela de 15 min)
  if (!sent) {
    await admin.from('evaluations').update({ manager_notified_at: null }).eq('id', evaluationId);
    return json(req, { success: false, error: 'Não foi possível enviar a notificação.' }, 502);
  }

  return json(req, { success: true, sent: true });
});

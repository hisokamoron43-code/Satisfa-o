/**
 * Supabase Edge Function: admin-employees
 *
 * Operações administrativas sobre colaboradores, contas de acesso e páginas visíveis.
 * Usa SUPABASE_SERVICE_ROLE_KEY apenas no servidor. Todas as ações validam o chamador
 * pelo perfil ativo (auth.uid), nunca por dados enviados no corpo do pedido.
 *
 * Modelo de permissões:
 * - Cada colaborador tem uma lista de páginas (allowed_pages), escolhida por quem o cria.
 * - O papel de dados (profiles.role, usado pelas RLS) é derivado das páginas: é o nível
 *   mais alto exigido por qualquer página atribuída (catálogo app_pages).
 * - Quem concede uma página tem de ter nível igual ou superior ao exigido por essa página.
 */

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

// Origens autorizadas: lista explícita em ALLOWED_ORIGINS (separada por vírgulas). Nunca '*'.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Palavra-passe: 8 a 128 caracteres, com pelo menos uma letra e um número. */
function isStrongPassword(p: unknown): p is string {
  return typeof p === 'string' && p.length >= 8 && p.length <= 128 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);
}

const ROLE_LEVEL: Record<string, number> = { ADMIN: 5, HR: 4, DIRECTOR: 3, OPERATIONAL: 2, PROVIDER: 1 };
const CATEGORIES = ['TECNICO', 'SUPERVISOR', 'ADMINISTRATIVO', 'GESTAO', 'DIRECAO', 'OUTRO'];
const PROFESSIONAL_STATUSES = ['ATIVO', 'FERIAS', 'LICENCA', 'SUSPENSO', 'INATIVO', 'DESLIGADO'];
const DEACTIVATING_STATUSES = ['SUSPENSO', 'INATIVO', 'DESLIGADO'];
const ACCOUNT_STATUSES = ['ATIVA', 'DESATIVADA', 'BLOQUEADA'];
const TECHNICAL_DOMAIN = 'sicsc.aeternu.internal';


/** Mesma normalização de src/lib/authIdentifier.ts (têm de ser idênticas). */
function normalizeIdentifier(raw: string): string {
  let c = raw.trim().toLowerCase();
  c = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  c = c.replace(/[\s\-_]+/g, '.');
  c = c.replace(/[^a-z0-9.]/g, '');
  c = c.replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '');
  return c;
}

function isNonEmptyString(v: unknown, min = 1, max = 500): v is string {
  return typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
}

type Catalog = Map<string, number>; // page key -> nível exigido

async function loadCatalog(admin: any): Promise<Catalog | null> {
  const { data, error } = await admin.from('app_pages').select('key, required_base_role');
  if (error || !data) return null;
  const map: Catalog = new Map();
  for (const row of data) map.set(row.key, ROLE_LEVEL[row.required_base_role] ?? 0);
  return map;
}

/** Valida a lista de páginas e a autoridade do chamador para as conceder. */
function validatePages(
  input: unknown,
  catalog: Catalog,
  callerLevel: number,
): { ok: true; pages: string[] } | { ok: false; error: string; status: number } {
  if (input === undefined || input === null) return { ok: true, pages: [] };
  if (!Array.isArray(input) || input.some((p) => typeof p !== 'string')) {
    return { ok: false, status: 400, error: 'Lista de páginas inválida.' };
  }
  const unique = Array.from(new Set(input as string[]));
  for (const key of unique) {
    if (!catalog.has(key)) {
      return { ok: false, status: 400, error: 'Existe uma página desconhecida na seleção.' };
    }
    const required = catalog.get(key)!;
    if (required > callerLevel) {
      return {
        ok: false,
        status: 403,
        error: 'Não tem autoridade para atribuir uma das páginas selecionadas.',
      };
    }
  }
  return { ok: true, pages: unique };
}

/** Papel de dados derivado: nível mais alto exigido pelas páginas (PROVIDER se não houver páginas). */
function deriveRole(pages: string[], catalog: Catalog): string {
  let max = 0;
  for (const p of pages) max = Math.max(max, catalog.get(p) ?? 0);
  const entry = Object.entries(ROLE_LEVEL).find(([, lvl]) => lvl === (max || 1));
  return entry ? entry[0] : 'PROVIDER';
}

async function countOtherActiveAdmins(admin: any, excludeProfileId: string | null): Promise<number> {
  let q = admin.from('profiles').select('id', { count: 'exact', head: true })
    .eq('role', 'ADMIN').eq('active', true);
  if (excludeProfileId) q = q.neq('id', excludeProfileId);
  const { count } = await q;
  return count || 0;
}

function friendlyInsertError(err: { code?: string; message?: string }): string {
  if (err.code === '23505') {
    if (String(err.message).includes('employee_number')) return 'O número interno de funcionário já existe.';
    if (String(err.message).includes('access_identifier')) return 'O identificador de acesso já está em uso.';
    return 'Registo duplicado.';
  }
  if (err.code === '23514') return 'Um dos valores não cumpre as regras do sistema.';
  return 'Não foi possível gravar o colaborador.';
}

/** Garante que dados profissionais são um objeto e que o salário (opcional) é um valor válido. */
function cleanProfessionalData(pd: unknown): Record<string, unknown> {
  if (!pd || typeof pd !== 'object' || Array.isArray(pd)) return {};
  const out: Record<string, unknown> = { ...(pd as Record<string, unknown>) };
  if ('salary' in out) {
    const n = Number(out.salary);
    if (out.salary === null || out.salary === '' || !Number.isFinite(n) || n < 0 || n > 1_000_000_000) delete out.salary;
    else out.salary = Math.round(n * 100) / 100;
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeadersFor(req);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Configuração do servidor incompleta.' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Autenticação necessária.' }, 401);
  }

  const admin: any = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Identidade do chamador (token validado pelo Supabase Auth)
  const { data: userData, error: userError } = await admin.auth.getUser(authHeader.slice(7));
  if (userError || !userData?.user) return json({ error: 'Sessão inválida ou expirada.' }, 401);
  const callerId: string = userData.user.id;

  // 2. Perfil ativo do chamador (por id, não por e-mail)
  const { data: caller } = await admin.from('profiles')
    .select('id, role, active, name, email')
    .eq('id', callerId)
    .maybeSingle();
  if (!caller || caller.active !== true) return json({ error: 'Conta sem perfil ativo.' }, 403);

  const callerRole: string = caller.role;
  const callerLevel = ROLE_LEVEL[callerRole] ?? 0;
  const callerEmail: string = caller.email;
  const callerName: string = caller.name || callerEmail;

  if (callerLevel < ROLE_LEVEL.HR) {
    return json({ error: 'Acesso negado: apenas Administradores ou Recursos Humanos.' }, 403);
  }

  // 3. Corpo do pedido
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Payload JSON inválido.' }, 400);
  }
  const action: string = body?.action;
  const data: any = body?.data ?? {};

  const catalog = await loadCatalog(admin);
  if (!catalog) return json({ error: 'Catálogo de páginas indisponível.' }, 500);

  const logAudit = async (op: string, entity: string, recordId: string | null, result: string, details: string) => {
    const { error } = await admin.from('audit_logs').insert({
      user_email: callerEmail,
      user_name: callerName,
      operation_type: op,
      affected_entity: entity,
      record_id: recordId,
      result,
      details: details.slice(0, 2000),
    });
    if (error) console.error('Falha ao registar auditoria (detalhes omitidos).');
  };

  const onlyAdmin = () => json({ error: 'Apenas Administradores podem executar esta operação.' }, 403);

  try {
    switch (action) {
      // ----------------------------------------------------------------------
      // CRIAR COLABORADOR (com ou sem conta) e a lista de páginas visíveis
      // ----------------------------------------------------------------------
      case 'create_employee': {
        const { fullName, category, employeeNumber, accessIdentifier, initialPassword,
                createSystemAccount, allowedPages, personalData, contacts, professionalData } = data;

        if (!isNonEmptyString(fullName, 2, 150)) return json({ error: 'Nome completo obrigatório (2 a 150 caracteres).' }, 400);
        if (!CATEGORIES.includes(category)) return json({ error: 'Categoria profissional inválida.' }, 400);

        const pagesResult = validatePages(allowedPages, catalog, callerLevel);
        if (!pagesResult.ok) return json({ error: pagesResult.error }, pagesResult.status);
        const pages = pagesResult.pages;

        const contactEmail = contacts?.email;
        if (contactEmail !== undefined && contactEmail !== '' && (typeof contactEmail !== 'string' || !EMAIL_RE.test(contactEmail.trim()) || contactEmail.length > 254)) {
          return json({ error: 'O e-mail de contacto não é válido.' }, 400);
        }

        let number: string;
        if (isNonEmptyString(employeeNumber, 2, 30) && /^[A-Za-z0-9][A-Za-z0-9.\-]{1,29}$/.test(employeeNumber.trim())) {
          number = employeeNumber.trim();
        } else {
          const { data: nextNum, error: seqErr } = await admin.rpc('next_employee_number');
          if (seqErr || !nextNum) return json({ error: 'Não foi possível gerar o número de funcionário.' }, 500);
          number = nextNum as string;
        }

        const department = (professionalData?.department && String(professionalData.department).trim()) || 'Operações';

        if (createSystemAccount) {
          if (pages.length === 0) return json({ error: 'Selecione pelo menos uma página para a conta de acesso.' }, 400);

          const ident = normalizeIdentifier(String(accessIdentifier ?? ''));
          if (ident.length < 3 || ident.length > 50 || String(accessIdentifier ?? '').includes('@')) {
            return json({ error: 'Identificador de acesso inválido (mínimo 3 caracteres, sem @).' }, 400);
          }
          if (!isStrongPassword(initialPassword)) {
            return json({ error: 'A palavra-passe inicial deve ter pelo menos 8 caracteres, com letras e números.' }, 400);
          }

          const { data: dup } = await admin.from('employees').select('id').eq('access_identifier', ident).maybeSingle();
          if (dup) return json({ error: `O identificador "${ident}" já está atribuído a outro colaborador.` }, 400);

          const role = deriveRole(pages, catalog);
          const techEmail = `${ident}@${TECHNICAL_DOMAIN}`;

          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email: techEmail,
            password: initialPassword,
            email_confirm: true,
            user_metadata: { full_name: fullName.trim() },
          });
          if (createErr || !created?.user) {
            const msg = String(createErr?.message ?? '');
            const friendly = /already|registered|exists/i.test(msg)
              ? 'Já existe uma conta com este identificador.'
              : 'Não foi possível criar as credenciais de acesso.';
            await logAudit('CREATE', 'EmployeeAccount', null, 'DENIED', `Falha ao criar conta para ${fullName.trim()}`);
            return json({ error: friendly }, 400);
          }
          const userId = created.user.id;

          const { error: profErr } = await admin.from('profiles').insert({
            id: userId,
            name: fullName.trim(),
            email: techEmail,
            role,
            department,
            active: true,
            allowed_pages: pages,
            must_change_password: true,
          });
          if (profErr) {
            await admin.auth.admin.deleteUser(userId);
            return json({ error: 'Não foi possível criar o perfil de acesso.' }, 400);
          }

          const { data: emp, error: empErr } = await admin.from('employees').insert({
            employee_number: number,
            full_name: fullName.trim(),
            access_identifier: ident,
            category,
            personal_data: personalData ?? {},
            contacts: contacts ?? {},
            professional_data: cleanProfessionalData(professionalData),
            allowed_pages: pages,
            professional_status: 'ATIVO',
            account_status: 'ATIVA',
            user_id: userId,
            must_change_password: true,
            created_by: callerEmail,
            updated_by: callerEmail,
          }).select().single();

          if (empErr) {
            // Compensação: nada fica sem registo de colaborador
            await admin.from('profiles').delete().eq('id', userId);
            await admin.auth.admin.deleteUser(userId);
            return json({ error: friendlyInsertError(empErr) }, 400);
          }

          await logAudit('CREATE', 'Employee', emp.id, 'SUCCESS',
            `Colaborador ${fullName.trim()} (${number}) criado com conta e ${pages.length} página(s); papel ${role}.`);
          return json({ success: true, employee: emp });
        }

        // Sem conta de acesso
        const { data: emp, error: empErr } = await admin.from('employees').insert({
          employee_number: number,
          full_name: fullName.trim(),
          category,
          personal_data: personalData ?? {},
          contacts: contacts ?? {},
          professional_data: cleanProfessionalData(professionalData),
          allowed_pages: pages,
          professional_status: 'ATIVO',
          account_status: 'SEM_ACESSO',
          created_by: callerEmail,
          updated_by: callerEmail,
        }).select().single();
        if (empErr) return json({ error: friendlyInsertError(empErr) }, 400);

        await logAudit('CREATE', 'Employee', emp.id, 'SUCCESS', `Colaborador ${fullName.trim()} (${number}) criado sem conta.`);
        return json({ success: true, employee: emp });
      }

      // ----------------------------------------------------------------------
      // ATUALIZAR DADOS (whitelist de campos)
      // ----------------------------------------------------------------------
      case 'update_employee': {
        const { employeeId, updates } = data;
        if (!isNonEmptyString(employeeId, 10, 80) || !updates || typeof updates !== 'object') {
          return json({ error: 'Parâmetros incompletos ou inválidos.' }, 400);
        }

        const { data: target } = await admin.from('employees')
          .select('id, full_name, user_id').eq('id', employeeId).maybeSingle();
        if (!target) return json({ error: 'Colaborador não encontrado.' }, 404);

        const clean: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: callerEmail };
        if (isNonEmptyString(updates.fullName, 2, 150)) clean.full_name = updates.fullName.trim();
        if (CATEGORIES.includes(updates.category)) clean.category = updates.category;
        if (updates.personalData && typeof updates.personalData === 'object') clean.personal_data = updates.personalData;
        if (updates.contacts && typeof updates.contacts === 'object') clean.contacts = updates.contacts;
        if (updates.professionalData && typeof updates.professionalData === 'object') clean.professional_data = cleanProfessionalData(updates.professionalData);

        if (PROFESSIONAL_STATUSES.includes(updates.professionalStatus)) {
          if (DEACTIVATING_STATUSES.includes(updates.professionalStatus) && target.user_id) {
            const { data: tProf } = await admin.from('profiles').select('id, role, active').eq('id', target.user_id).maybeSingle();
            if (tProf?.role === 'ADMIN' && tProf.active) {
              if ((await countOtherActiveAdmins(admin, tProf.id)) < 1) {
                return json({ error: 'Não é permitido suspender ou desligar o único Administrador ativo.' }, 400);
              }
            }
            await admin.from('profiles').update({ active: false, updated_at: new Date().toISOString() }).eq('id', target.user_id);
            await admin.auth.admin.updateUserById(target.user_id, { ban_duration: '876600h' });
            clean.account_status = 'DESATIVADA';
          }
          clean.professional_status = updates.professionalStatus;
        }

        const { data: updated, error: updErr } = await admin.from('employees')
          .update(clean).eq('id', employeeId).select().single();
        if (updErr) return json({ error: friendlyInsertError(updErr) }, 400);

        await logAudit('UPDATE', 'Employee', employeeId, 'SUCCESS', `Dados do colaborador ${updated.full_name} atualizados.`);
        return json({ success: true, employee: updated });
      }

      // ----------------------------------------------------------------------
      // ESTADO DA CONTA (apenas ADMIN)
      // ----------------------------------------------------------------------
      case 'set_account_status': {
        if (callerRole !== 'ADMIN') return onlyAdmin();
        const { employeeId, status } = data;
        if (!isNonEmptyString(employeeId, 10, 80) || !ACCOUNT_STATUSES.includes(status)) {
          return json({ error: 'Estado de conta inválido.' }, 400);
        }
        const { data: target } = await admin.from('employees').select('id, full_name, user_id').eq('id', employeeId).maybeSingle();
        if (!target) return json({ error: 'Colaborador não encontrado.' }, 404);

        const { data: tProf } = target.user_id
          ? await admin.from('profiles').select('id, role, active').eq('id', target.user_id).maybeSingle()
          : { data: null };

        if (tProf?.role === 'ADMIN' && status !== 'ATIVA' && tProf.active) {
          if ((await countOtherActiveAdmins(admin, tProf.id)) < 1) {
            return json({ error: 'Não é permitido desativar o último Administrador ativo.' }, 400);
          }
        }

        const { error: updErr } = await admin.from('employees')
          .update({ account_status: status, updated_at: new Date().toISOString(), updated_by: callerEmail })
          .eq('id', employeeId);
        if (updErr) return json({ error: 'Não foi possível atualizar o estado da conta.' }, 400);

        if (tProf) {
          await admin.from('profiles').update({ active: status === 'ATIVA', updated_at: new Date().toISOString() }).eq('id', tProf.id);
          const { error: banErr } = await admin.auth.admin.updateUserById(tProf.id, {
            ban_duration: status === 'ATIVA' ? 'none' : '876600h',
          });
          if (banErr) return json({ error: 'Estado guardado, mas não foi possível aplicar o bloqueio de sessão. Tente novamente.' }, 500);
        }

        await logAudit('UPDATE', 'EmployeeAccountStatus', employeeId, 'SUCCESS', `Estado da conta de ${target.full_name} alterado para ${status}.`);
        return json({ success: true, status });
      }

      // ----------------------------------------------------------------------
      // ALTERAR PÁGINAS VISÍVEIS (apenas ADMIN) — recalcula o papel de dados
      // ----------------------------------------------------------------------
      case 'update_access': {
        const { employeeId, allowedPages } = data;
        if (!isNonEmptyString(employeeId, 10, 80)) return json({ error: 'Identificador de colaborador ausente.' }, 400);

        const pagesResult = validatePages(allowedPages, catalog, callerLevel);
        if (!pagesResult.ok) return json({ error: pagesResult.error }, pagesResult.status);
        const pages = pagesResult.pages;

        const { data: target } = await admin.from('employees').select('id, full_name, user_id').eq('id', employeeId).maybeSingle();
        if (!target) return json({ error: 'Colaborador não encontrado.' }, 404);

        // HR só altera contas de nível inferior ao seu (nunca ADMIN nem outro RH)
        if (target.user_id && callerRole !== 'ADMIN') {
          const { data: tp } = await admin.from('profiles').select('role').eq('id', target.user_id).maybeSingle();
          if (tp && (ROLE_LEVEL[tp.role] ?? 0) >= callerLevel) {
            return json({ error: 'Não tem autoridade para alterar as páginas desta conta.' }, 403);
          }
        }

        const role = deriveRole(pages, catalog);
        const { data: tProf } = target.user_id
          ? await admin.from('profiles').select('id, role, active').eq('id', target.user_id).maybeSingle()
          : { data: null };

        if (tProf && tProf.role === 'ADMIN' && tProf.active && role !== 'ADMIN') {
          if ((await countOtherActiveAdmins(admin, tProf.id)) < 1) {
            return json({ error: 'Não é permitido retirar o papel de Administrador ao único Administrador ativo.' }, 400);
          }
        }

        const { data: updated, error: updErr } = await admin.from('employees')
          .update({ allowed_pages: pages, updated_at: new Date().toISOString(), updated_by: callerEmail })
          .eq('id', employeeId).select().single();
        if (updErr) return json({ error: 'Não foi possível atualizar as páginas.' }, 400);

        if (tProf) {
          const { error: pErr } = await admin.from('profiles')
            .update({ allowed_pages: pages, role, updated_at: new Date().toISOString() }).eq('id', tProf.id);
          if (pErr) return json({ error: 'Páginas guardadas no colaborador, mas o perfil de acesso não foi atualizado.' }, 500);
        }

        await logAudit('GRANT_ACCESS', 'EmployeeAccess', employeeId, 'SUCCESS',
          `Páginas de ${target.full_name} definidas (${pages.length}); papel de dados ${role}.`);
        return json({ success: true, employee: updated, role });
      }

      // ----------------------------------------------------------------------
      // REDEFINIR PALAVRA-PASSE (ADMIN qualquer conta; HR apenas contas de nível inferior)
      // ----------------------------------------------------------------------
      case 'reset_password': {
        const { employeeId, newPassword } = data;
        if (!isNonEmptyString(employeeId, 10, 80)) return json({ error: 'Colaborador inválido.' }, 400);
        if (!isStrongPassword(newPassword)) {
          return json({ error: 'A palavra-passe deve ter pelo menos 8 caracteres, com letras e números.' }, 400);
        }

        const { data: target } = await admin.from('employees').select('id, user_id, full_name').eq('id', employeeId).maybeSingle();
        if (!target?.user_id) return json({ error: 'Este colaborador não possui conta ativa no sistema.' }, 400);

        const { data: tProf } = await admin.from('profiles').select('id, role').eq('id', target.user_id).maybeSingle();
        const targetLevel = ROLE_LEVEL[tProf?.role ?? 'PROVIDER'] ?? 0;
        if (callerRole !== 'ADMIN' && targetLevel >= ROLE_LEVEL.HR) {
          return json({ error: 'Não tem autoridade para redefinir a palavra-passe desta conta.' }, 403);
        }

        const { error: authErr } = await admin.auth.admin.updateUserById(target.user_id, { password: newPassword });
        if (authErr) return json({ error: 'Não foi possível redefinir a palavra-passe.' }, 400);

        await admin.from('profiles').update({ must_change_password: true }).eq('id', target.user_id);
        await admin.from('employees').update({ must_change_password: true, updated_at: new Date().toISOString(), updated_by: callerEmail }).eq('id', employeeId);

        await logAudit('UPDATE', 'PasswordReset', employeeId, 'SUCCESS', `Palavra-passe redefinida para ${target.full_name}.`);
        return json({ success: true });
      }

      // ----------------------------------------------------------------------
      // ALTERAR IDENTIFICADOR (apenas ADMIN)
      // ----------------------------------------------------------------------
      case 'change_identifier': {
        if (callerRole !== 'ADMIN') return onlyAdmin();
        const { employeeId, newIdentifier } = data;
        if (!isNonEmptyString(employeeId, 10, 80)) return json({ error: 'Colaborador inválido.' }, 400);
        const raw = String(newIdentifier ?? '');
        const ident = normalizeIdentifier(raw);
        if (ident.length < 3 || ident.length > 50 || raw.includes('@')) {
          return json({ error: 'Identificador inválido (mínimo 3 caracteres, sem @).' }, 400);
        }

        const { data: dup } = await admin.from('employees').select('id')
          .eq('access_identifier', ident).neq('id', employeeId).maybeSingle();
        if (dup) return json({ error: 'Identificador já está em utilização.' }, 400);

        const { data: target } = await admin.from('employees').select('id, user_id').eq('id', employeeId).maybeSingle();
        if (!target) return json({ error: 'Colaborador não encontrado.' }, 404);

        const techEmail = `${ident}@${TECHNICAL_DOMAIN}`;
        if (target.user_id) {
          const { data: before } = await admin.from('profiles').select('email').eq('id', target.user_id).maybeSingle();
          const { error: aErr } = await admin.auth.admin.updateUserById(target.user_id, { email: techEmail, email_confirm: true });
          if (aErr) return json({ error: 'Não foi possível atualizar as credenciais.' }, 400);
          const { error: pErr } = await admin.from('profiles').update({ email: techEmail }).eq('id', target.user_id);
          if (pErr) {
            // Compensação: repõe o e-mail técnico anterior para não deixar Auth e perfil dessincronizados
            if (before?.email) await admin.auth.admin.updateUserById(target.user_id, { email: before.email, email_confirm: true });
            return json({ error: 'Não foi possível atualizar o perfil de acesso.' }, 500);
          }
        }

        const { error: eErr } = await admin.from('employees')
          .update({ access_identifier: ident, updated_at: new Date().toISOString(), updated_by: callerEmail })
          .eq('id', employeeId);
        if (eErr) return json({ error: 'Não foi possível guardar o identificador.' }, 400);

        await logAudit('UPDATE', 'EmployeeIdentifier', employeeId, 'SUCCESS', `Identificador alterado para "${ident}".`);
        return json({ success: true, normalizedId: ident });
      }

      // ----------------------------------------------------------------------
      // AUDITORIA DE VISUALIZAÇÃO / DOWNLOAD DE DOCUMENTOS
      // ----------------------------------------------------------------------
      case 'audit_document_view': {
        const { documentId, filename, actionType } = data;
        const safeAction = actionType === 'DOWNLOAD' ? 'DOWNLOAD' : 'VIEW';
        const safeName = String(filename ?? 'documento').slice(0, 200);
        await logAudit('EXPORT', 'EmployeeDocument', isNonEmptyString(documentId, 1, 80) ? documentId : null,
          'SUCCESS', `Ação [${safeAction}] no documento "${safeName}".`);
        return json({ success: true });
      }

      default:
        return json({ error: 'Ação desconhecida.' }, 400);
    }
  } catch (err) {
    console.error('Erro interno na Edge Function admin-employees (detalhes omitidos).');
    return json({ error: 'Erro interno ao processar a operação administrativa.' }, 500);
  }
});

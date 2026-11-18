// Testes obrigatórios da auditoria v2 (15 pontos), sobre as migrações aplicadas em sequência (PGlite).
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIG = process.argv[2] || path.resolve(HERE, '../../migrations');
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(HERE, 'stubs.sql'), 'utf8'));
for (const f of fs.readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) {
  await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
}

const resultados = [];
const registar = (id, nome, ok, detalhe = '') => { resultados.push({ id, ok }); console.log(`${ok ? 'PASSA ' : 'FALHA '} [${id}] ${nome}${detalhe ? ' — ' + detalhe : ''}`); };
const erroDe = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

// ---------- dados sintéticos ----------
const U = { ADM: '00000000-0000-0000-0000-00000000000a', HR: '00000000-0000-0000-0000-00000000000b', DIR: '00000000-0000-0000-0000-00000000000d', OPS: '00000000-0000-0000-0000-00000000000e', P1: '00000000-0000-0000-0000-00000000000c', P2: '00000000-0000-0000-0000-0000000000f2' };
const T1 = '11111111-1111-1111-1111-111111111111', T2 = '22222222-2222-2222-2222-222222222222';
const PR1 = '33333333-3333-3333-3333-333333333333', PR2 = '33333333-3333-3333-3333-333333333344';
const C1 = '44444444-4444-4444-4444-444444444444', S1 = '55555555-5555-5555-5555-555555555555';
const EMP1 = '66666666-6666-6666-6666-666666666666', CV1 = '77777777-7777-7777-7777-777777777777', MSG1 = '88888888-8888-8888-8888-888888888888';
const q = (s) => s.replace(/'/g, "''");

await db.exec(`
INSERT INTO auth.users (id,email) VALUES ${Object.entries(U).map(([k, v]) => `('${v}','${k.toLowerCase()}@teste.local')`).join(',')};
INSERT INTO public.teams (id,name,code,status) VALUES ('${T1}','Equipa A','EA','ACTIVE'),('${T2}','Equipa B','EB','ACTIVE');
INSERT INTO public.providers (id,name,status,team_id) VALUES ('${PR1}','Técnico Um','ACTIVE','${T1}'),('${PR2}','Técnico Dois','ACTIVE','${T2}');
INSERT INTO public.profiles (id,name,email,role,active,must_change_password,provider_id) VALUES
 ('${U.ADM}','Admin','adm@teste.local','ADMIN',true,false,NULL),
 ('${U.HR}','RH','hr@teste.local','HR',true,false,NULL),
 ('${U.DIR}','Direcção','dir@teste.local','DIRECTOR',true,false,NULL),
 ('${U.OPS}','Operacional','ops@teste.local','OPERATIONAL',true,false,NULL),
 ('${U.P1}','Prestador T1','p1@teste.local','PROVIDER',true,false,'${PR1}'),
 ('${U.P2}','Prestador T2','p2@teste.local','PROVIDER',true,false,'${PR2}');
INSERT INTO public.clients (id,company_name,internal_code,status,contact_person,email,phone,nif,notes) VALUES ('${C1}','Empresa Teste Lda','CLI-T1','ACTIVE','Contacto','c@teste.local','+244 900 000 000','000000000','Nota interna');
INSERT INTO public.services (id,name,status) VALUES ('${S1}','Limpeza','ACTIVE');
INSERT INTO public.employees (id,employee_number,full_name,access_identifier,category,personal_data,user_id,professional_status,account_status) VALUES ('${EMP1}','AET-001','Funcionário Um','ana.teste','TECNICO','{"nif":"000000000"}','${U.P1}','ATIVO','ATIVA');
INSERT INTO public.employee_documents (employee_id,document_type,original_filename,storage_path) VALUES ('${EMP1}','CONTRATO','contrato.pdf','${EMP1}/c1.pdf');
INSERT INTO public.hr_cases (occurrence_type,internal_notes,status) VALUES ('DISCIPLINAR','Notas confidenciais de RH','ABERTO');
INSERT INTO public.conversations (id,kind,title,created_by) VALUES ('${CV1}','DIRECT','Conversa privada','${U.OPS}');
INSERT INTO public.conversation_members (conversation_id,profile_id) VALUES ('${CV1}','${U.OPS}'),('${CV1}','${U.P1}');
INSERT INTO public.messages (id,conversation_id,sender_id,body) VALUES ('${MSG1}','${CV1}','${U.OPS}','Mensagem privada');
INSERT INTO storage.objects (bucket_id,name) VALUES ('employee-documents','${EMP1}/c1.pdf');
`);

let comentarioN = 0;
const submeter = async (equipa, prestador, extra = {}) => {
  await db.exec(`SET ROLE anon; SELECT set_config('request.jwt.claim.sub','',false);`);
  const r = await db.query(`SELECT public.submit_evaluation('${q(JSON.stringify({ clientName: 'Empresa Teste Lda', serviceId: S1, teamId: equipa, providerId: prestador, satisfactionRating: 2, npsScore: 3, comment: `Teste ${++comentarioN}`, serviceDate: '2026-11-10', detailedAnswers: {}, questionsSnapshot: [], ...extra }))}'::jsonb) AS r`);
  await db.exec('RESET ROLE');
  return r.rows[0].r.id;
};
const EV1 = await submeter(T1, PR1);
const EV2 = await submeter(T2, PR2, { clientVisibleToTeam: true }); // N-07: o campo é ignorado
await db.exec(`INSERT INTO public.evaluation_workers (evaluation_id,provider_id) VALUES ('${EV1}','${PR1}'),('${EV2}','${PR2}');`);

// Executa uma instrução como um perfil, dentro de transação revertida. aal opcional para MFA.
const atores = {
  anon: { role: 'anon', sub: '' }, P1: { role: 'authenticated', sub: U.P1 }, P2: { role: 'authenticated', sub: U.P2 },
  OPS: { role: 'authenticated', sub: U.OPS }, DIR: { role: 'authenticated', sub: U.DIR }, HR: { role: 'authenticated', sub: U.HR },
  ADM: { role: 'authenticated', sub: U.ADM }, service: { role: 'service_role', sub: '' },
};
async function como(ator, sql, { aal, params = [] } = {}) {
  const a = atores[ator];
  await db.exec('BEGIN');
  try {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [a.sub]);
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: a.sub, aal: aal ?? 'aal1' })]);
    await db.exec(`SET ROLE ${a.role};`);
    const r = await db.query(sql, params);
    return { ok: true, rows: r.rows, n: r.rows?.[0]?.n ?? r.affectedRows };
  } catch (e) {
    return { ok: false, err: e.message };
  } finally {
    await db.exec('ROLLBACK');
  }
}
const direto = (sql, params = []) => db.query(sql, params);

// Transação única: escritas e leituras veem-se mutuamente; tudo é revertido no fim.
async function tx(fn) {
  await db.exec('BEGIN');
  try {
    const run = async (ator, sql, aal) => {
      const a = atores[ator];
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [a.sub]);
      await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: a.sub, aal: aal ?? 'aal1' })]);
      await db.exec(`SET ROLE ${a.role};`);
      const r = await db.query(sql);
      await db.exec('RESET ROLE');
      return r.rows;
    };
    return await fn(run);
  } finally {
    await db.exec('ROLLBACK');
  }
}

// ---------- N-01 ----------
let r = await como('P1', `SELECT * FROM public.sicsc_compute_participants('${EV2}'::uuid)`);
registar('N-01a', 'Prestador da equipa A não consulta participantes da equipa B', !r.ok && /permission denied/i.test(r.err), r.ok ? `devolveu ${r.rows.length} linhas` : r.err);
r = await como('P2', `SELECT * FROM public.sicsc_compute_participants('${EV1}'::uuid)`);
registar('N-01b', 'Nenhum prestador chama sicsc_compute_participants diretamente', !r.ok, r.ok ? 'ACEITE' : '');

// ---------- N-06 ----------
r = await como('P2', `SELECT public.sicsc_member_on_date('${PR1}'::uuid,'${T1}'::uuid,CURRENT_DATE) AS n`);
registar('N-06a', 'Prestador não descobre pertença de outro prestador (sicsc_member_on_date)', !r.ok, r.ok ? `devolveu ${r.rows[0].n}` : '');
r = await como('P2', `SELECT public.provider_in_evaluation_group('${PR1}'::uuid,'${PR1}'::uuid,'${T1}'::uuid) AS n`);
registar('N-06b', 'Prestador não consulta grupo de avaliação (provider_in_evaluation_group)', !r.ok, r.ok ? 'ACEITE' : '');

// ---------- N-02 ----------
r = await como('OPS', `DELETE FROM public.clients WHERE id='${C1}'`);
const clienteOps = (await direto(`SELECT count(*)::int AS n FROM public.clients WHERE id='${C1}'`)).rows[0].n;
registar('N-02a', 'Responsável operacional não elimina cliente com avaliações', r.ok && r.n === 0 && clienteOps === 1, r.ok ? `linhas apagadas=${r.n}, cliente existe=${clienteOps}` : r.err);
r = await como('ADM', `DELETE FROM public.clients WHERE id='${C1}'`);
registar('N-02b', 'Mesmo o administrador não apaga cliente com avaliações (RESTRICT)', !r.ok && /foreign key/i.test(r.err), r.ok ? 'APAGADO' : r.err.slice(0, 90));
r = await como('OPS', `UPDATE public.clients SET status='INACTIVE' WHERE id='${C1}' RETURNING id`);
registar('N-02c', 'Desativação de cliente continua disponível ao operacional', r.ok && r.n !== 0 || (r.ok && r.rows.length === 1), r.ok ? '' : r.err);

// ---------- N-02 / histórico ----------
const hist = (await direto(`SELECT client_id, client_name FROM public.evaluations WHERE id='${EV1}'`)).rows[0];
registar('N-02d', 'Histórico mantém a ligação da avaliação ao cliente', hist.client_id === C1 && hist.client_name === 'Empresa Teste Lda', `client_id=${hist.client_id}`);

// ---------- N-03 ----------
r = await como('OPS', `UPDATE public.providers SET evaluation_access_authorized=true WHERE id='${PR2}'`);
registar('N-03a', 'Responsável operacional não altera a autorização de acesso', !r.ok && /RH ou Administrador/i.test(r.err), r.ok ? `linhas=${r.n}` : r.err.slice(0, 80));
await direto(`UPDATE public.evaluations SET finalized_at=now(), status='REVIEWED', technical_score=80, final_classification='POSITIVE' WHERE id='${EV2}'`);
let autorPor = null, autorOk = false;
await tx(async (run) => {
  try {
    const rows = await run('HR', `UPDATE public.providers SET evaluation_access_authorized=true WHERE id='${PR2}' RETURNING access_authorized_by AS por`, 'aal2');
    autorOk = rows.length === 1; autorPor = rows[0]?.por ?? null;
  } catch (e) { autorPor = 'ERRO: ' + e.message.slice(0, 60); }
});
registar('N-03b', 'RH autoriza prestador e fica registado quem autorizou', autorOk && autorPor === 'hr@teste.local', `por=${autorPor}`);
let antesN = null, depoisN = null, erroN3c = null;
await tx(async (run) => {
  try {
    await run('HR', `UPDATE public.providers SET evaluation_access_authorized=true WHERE id='${PR2}'`, 'aal2');
    antesN = (await run('P2', `SELECT jsonb_array_length(COALESCE(public.my_team_overview()->'evaluations','[]'::jsonb)) AS n`))[0].n;
    await run('HR', `UPDATE public.providers SET evaluation_access_authorized=false WHERE id='${PR2}'`, 'aal2');
    depoisN = (await run('P2', `SELECT jsonb_array_length(COALESCE(public.my_team_overview()->'evaluations','[]'::jsonb)) AS n`))[0].n;
  } catch (e) { erroN3c = e.message.slice(0, 80); }
});
registar('N-03c', 'Autorização controla a visão de avaliações do prestador (my_team_overview)', !erroN3c && Number(antesN) > 0 && Number(depoisN) === 0, erroN3c ?? `autorizado=${antesN} | retirado=${depoisN}`);

// ---------- N-07 ----------
const visivel = (await direto(`SELECT client_visible_to_team AS v FROM public.evaluations WHERE id='${EV2}'`)).rows[0].v;
registar('N-07a', 'Formulário público não decide a visibilidade para a equipa', visivel === false, `visível=${visivel}`);
r = await como('P1', `SELECT public.set_evaluation_client_visibility('${EV1}'::uuid, true)`);
registar('N-07b', 'Prestador não altera a visibilidade', !r.ok, r.ok ? 'ACEITE' : '');
let retornoVis = null, visDepois = null, audDepois = null;
await tx(async (run) => {
  try {
    const rows = await run('HR', `SELECT public.set_evaluation_client_visibility('${EV1}'::uuid, true) AS r`, 'aal2');
    retornoVis = rows[0].r;
  } catch (e) { retornoVis = { erro: e.message.slice(0, 60) }; }
  visDepois = (await db.query(`SELECT client_visible_to_team AS v FROM public.evaluations WHERE id='${EV1}'`)).rows[0].v;
  audDepois = (await db.query(`SELECT count(*)::int AS n FROM public.audit_logs WHERE details LIKE 'Visibilidade do nome da empresa%'`)).rows[0].n;
});
registar('N-07c', 'RH define visibilidade, com registo de auditoria', retornoVis?.success === true && visDepois === true && audDepois >= 1, `visível=${visDepois} auditoria=${audDepois} ${retornoVis?.erro ?? ''}`);
await direto(`UPDATE public.evaluations SET client_visible_to_team=false WHERE id='${EV1}'`);

// ---------- N-08 ----------
const bucket = (await direto(`SELECT allowed_mime_types AS m, file_size_limit AS s FROM storage.buckets WHERE id='message-files'`)).rows[0];
const tipos = bucket.m || [];
registar('N-08a', 'Anexos de mensagens: tipos explícitos, sem HTML, scripts ou ZIP', tipos.includes('application/pdf') && !tipos.some((t) => /html|javascript|zip|octet/.test(t)), tipos.join(', '));
registar('N-08b', 'Anexos de mensagens: limite de 10 MB', Number(bucket.s) === 10485760, `limite=${bucket.s}`);

// ---------- VUL-06 ----------
r = await como('anon', `SELECT public.resolve_login_email('ana.teste') AS e`);
const r2 = await como('anon', `SELECT public.resolve_login_email('nao.existe.xyz') AS e`);
registar('VUL-06a', 'Anónimo não resolve identificadores (conta existe)', !r.ok, r.ok ? 'ACEITE' : r.err.slice(0, 60));
registar('VUL-06b', 'Respostas idênticas para conta existente e inexistente (ambas bloqueadas)', !r.ok && !r2.ok && r.err === r2.err, '');
const serv = await como('service', `SELECT public.resolve_login_email('ana.teste') AS e`);
registar('VUL-06c', 'O serviço (Edge Function) continua a resolver a conta', serv.ok && serv.rows[0].e === 'ana.teste@sicsc.aeternu.internal' || (serv.ok && typeof serv.rows[0].e === 'string'), serv.ok ? serv.rows[0].e : serv.err);
const hitA = (await direto(`SELECT public.auth_rate_hit('k-teste-v2', 2, 600) AS a`)).rows[0].a;
const hitB = (await direto(`SELECT public.auth_rate_hit('k-teste-v2', 2, 600) AS a`)).rows[0].a;
const hitC = (await direto(`SELECT public.auth_rate_hit('k-teste-v2', 2, 600) AS a`)).rows[0].a;
registar('VUL-06d', 'Limite de tentativas durável (3.º pedido com limite 2 é recusado)', hitA === true && hitB === true && hitC === false, `${hitA}/${hitB}/${hitC}`);

// ---------- N-10 ----------
const anonPode = async (nome) => (await direto(`SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS ok FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='${nome}' LIMIT 1`)).rows[0]?.ok;
registar('N-10a', 'anon não executa funções de trigger', (await anonPode('trg_evaluations_ligar_atividade')) === false && (await anonPode('guard_provider_authorization')) === false);
registar('N-10b', 'anon não executa a homologação', (await anonPode('calculate_and_finalize_evaluation')) === false);
const anonFuncoes = (await direto(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND has_function_privilege('anon',p.oid,'EXECUTE') ORDER BY 1`)).rows.map((x) => x.proname);
const permitidas = ['audio_upload_quota_ok', 'current_provider_id', 'current_user_email', 'current_user_role', 'get_login_methods', 'is_admin', 'is_hr_or_admin', 'is_staff', 'list_public_team_providers', 'submit_evaluation'];
const fora = anonFuncoes.filter((f) => !permitidas.includes(f));
registar('N-10c', 'Lista de funções executáveis por anon limitada ao necessário', fora.length === 0, fora.length ? `extra: ${fora.join(', ')}` : `${anonFuncoes.length} funções`);

// ---------- N-11 (MFA) ----------
await direto(`INSERT INTO public.login_settings (id, mfa_enforced_from) VALUES (1, now() - interval '1 day') ON CONFLICT (id) DO UPDATE SET mfa_enforced_from = now() - interval '1 day'`);
r = await como('HR', `SELECT count(*)::int AS n FROM public.clients`, { aal: 'aal1' });
registar('N-11a', 'RH sem fator (aal1) não lê dados depois da obrigatoriedade', r.ok && r.n === 0, r.ok ? `linhas=${r.n}` : r.err);
r = await como('HR', `SELECT count(*)::int AS n FROM public.clients`, { aal: 'aal2' });
registar('N-11b', 'RH com aal2 lê dados', r.ok && r.n >= 1, r.ok ? `linhas=${r.n}` : r.err);
r = await como('ADM', `SELECT count(*)::int AS n FROM public.profiles`, { aal: 'aal1' });
registar('N-11c', 'Administrador sem aal2 vê apenas o próprio perfil (não os restantes)', r.ok && r.n === 1, r.ok ? `linhas=${r.n}` : r.err);
r = await como('P1', `SELECT count(*)::int AS n FROM public.employees`, { aal: 'aal1' });
registar('N-11d', 'MFA não afeta prestadores (ficha própria continua acessível)', r.ok && r.n === 1, r.ok ? `linhas=${r.n}` : r.err);
const req = await como('HR', `SELECT public.mfa_requirement() AS j`, { aal: 'aal1' });
registar('N-11e', 'Interface recebe o estado de MFA (exigida, sem aal2)', req.ok && req.rows[0].j.enforced === true && req.rows[0].j.aal === 'aal1' && req.rows[0].j.requiredRole === true, req.ok ? JSON.stringify(req.rows[0].j) : req.err);
await direto(`UPDATE public.login_settings SET mfa_enforced_from = now() + interval '14 days' WHERE id=1`);
r = await como('HR', `SELECT count(*)::int AS n FROM public.clients`, { aal: 'aal1' });
registar('N-11f', 'Antes da data de entrada em vigor, RH sem aal2 continua a trabalhar', r.ok && r.n >= 1, r.ok ? `linhas=${r.n}` : r.err);
await direto(`UPDATE public.login_settings SET mfa_enforced_from = now() - interval '1 day' WHERE id=1`);

// ---------- N-12 / 13: auditoria imutável ----------
await direto(`SELECT public.log_system_audit('UPDATE','Teste','1','SUCCESS','registo original')`).catch(() => {});
const aud0 = (await direto(`SELECT count(*)::int AS n FROM public.audit_logs`)).rows[0].n;
r = await como('ADM', `UPDATE public.audit_logs SET details='alterado'`, { aal: 'aal2' });
const r3 = await como('ADM', `DELETE FROM public.audit_logs`, { aal: 'aal2' });
const aud1 = (await direto(`SELECT count(*)::int AS n FROM public.audit_logs`)).rows[0].n;
registar('13', 'Auditoria imutável: ninguém altera ou apaga registos', !r.ok && !r3.ok && aud1 === aud0, `registos=${aud0}->${aud1}`);

// ---------- 14: avaliações homologadas ----------
await direto(`UPDATE public.evaluations SET finalized_at=now(), status='REVIEWED', technical_score=77, final_classification='POSITIVE' WHERE id='${EV1}'`);
r = await como('HR', `UPDATE public.evaluations SET provider_id='${PR2}' WHERE id='${EV1}' RETURNING id`, { aal: 'aal2' });
const r4 = await como('HR', `UPDATE public.evaluations SET technical_score=100 WHERE id='${EV1}' RETURNING id`, { aal: 'aal2' });
const pa = (await direto(`SELECT provider_id AS p, technical_score AS t FROM public.evaluations WHERE id='${EV1}'`)).rows[0];
registar('14', 'Avaliação homologada: prestador e pontuação imutáveis', !r.ok && !r4.ok && pa.p === PR1 && Number(pa.t) === 77, `prestador=${pa.p===PR1?'ok':'alterado'} nota=${pa.t}`);

// ---------- 16: snapshot ao homologar pelo RH (regressão da revogação) ----------
const EV3 = await submeter(T1, PR1);
r = await como('HR', `UPDATE public.evaluations SET finalized_at=now(), status='REVIEWED' WHERE id='${EV3}'`, { aal: 'aal2' });
registar('16', 'Homologação por RH continua a correr o trigger de participantes', r.ok, r.ok ? '' : r.err);

// ---------- 15: cinco perfis isolados ----------
const lim = async (a, sql, esperado, nome, id) => { const x = await como(a, sql, { aal: 'aal2' }); registar(id, nome, x.ok && esperado(x.rows[0]?.n ?? x.rows.length), x.ok ? `n=${x.rows[0]?.n ?? x.rows.length}` : x.err.slice(0, 70)); };
await lim('OPS', `SELECT count(*)::int AS n FROM public.hr_cases`, (n) => n === 0, 'Operacional não lê dados de RH', '15a');
await lim('OPS', `SELECT count(*)::int AS n FROM public.profiles`, (n) => n === 1, 'Operacional vê só o próprio perfil', '15b');
await lim('DIR', `SELECT count(*)::int AS n FROM public.messages WHERE id='${MSG1}'`, (n) => n === 0, 'Direção não lê conversa de que não é membro', '15c');
await lim('P2', `SELECT count(*)::int AS n FROM public.messages WHERE id='${MSG1}'`, (n) => n === 0, 'Prestador de outra equipa não lê a conversa', '15d');
await lim('ADM', `SELECT count(*)::int AS n FROM public.messages WHERE id='${MSG1}'`, (n) => n === 0, 'Administrador não lê conversas privadas', '15e');
await lim('P1', `SELECT count(*)::int AS n FROM public.employee_documents`, (n) => n === 0, 'Prestador não lê documentos de RH', '15f');
await lim('HR', `SELECT count(*)::int AS n FROM public.profiles`, (n) => n >= 6, 'RH vê todos os perfis', '15g');
await lim('ADM', `SELECT count(*)::int AS n FROM public.audit_logs`, (n) => n >= 1, 'Administrador lê a auditoria', '15h');

const falhas = resultados.filter((x) => !x.ok);
console.log(`\nRESUMO: ${resultados.length - falhas.length}/${resultados.length} passaram${falhas.length ? ' | falhas: ' + falhas.map((f) => f.id).join(', ') : ''}`);
await db.close();
process.exit(falhas.length ? 1 : 0);

import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const HERE = path.dirname(fileURLToPath(import.meta.url));

// As migrações 1000 e 1001 executam-se SEMPRE juntas e por esta ordem (a 1000 recria funções que a 1001 altera).
const migSql = ['1000_producao_consolidada.sql', '1001_formularios_pesos_servicos.sql', '1003_pontuacao_80_20.sql', '1004_regras_audio_argumentos.sql', '1005_equipa_funcionario.sql', '1006_temas_conversas.sql', '1007_temas_historico_membros.sql']
  .map((f) => fs.readFileSync(path.join(HERE, '../migrations', f), 'utf8')).join('\n;\n');

const R = [];
const rec = (id, title, ok, detail) => {
  R.push({ id, title, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${id}] ${title}\n      ${detail}`);
};

const db = new PGlite();

// ---------- Ambiente Supabase simulado ----------
await db.exec(`
  DO $$ BEGIN
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
  GRANT SELECT ON storage.buckets TO anon, authenticated;
`);

// ---------- 1. Execução limpa numa base vazia (sem alterações à migração) ----------
let err1 = null;
try { await db.exec(migSql); } catch (e) { err1 = e.message; }
rec('M1', 'Migração 1000 executa numa base vazia sem erros', !err1, err1 ? `ERRO: ${err1}` : 'OK');

// Simular Supabase: privilégios por defeito do schema public (o Supabase concede a anon/authenticated)
await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
               GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
               GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;`);

// ---------- Seed (equivalente ao que a Edge Function faz) ----------
const A = {
  admin: '00000000-0000-0000-0000-0000000000a1',
  hr: '00000000-0000-0000-0000-0000000000a2',
  op: '00000000-0000-0000-0000-0000000000a3',
  prov: '00000000-0000-0000-0000-0000000000a4',
};
await db.exec(`
  INSERT INTO auth.users (id, email) VALUES
    ('${A.admin}','admin@sicsc.aeternu.internal'),('${A.hr}','hr@sicsc.aeternu.internal'),
    ('${A.op}','op@sicsc.aeternu.internal'),('${A.prov}','prest@sicsc.aeternu.internal');
  INSERT INTO public.profiles (id, name, email, role, active, allowed_pages) VALUES
    ('${A.admin}','Admin','admin@sicsc.aeternu.internal','ADMIN',true,'{}'),
    ('${A.hr}','HR','hr@sicsc.aeternu.internal','HR',true,'{employees,evaluation_analysis}'),
    ('${A.op}','Operacional','op@sicsc.aeternu.internal','OPERATIONAL',true,'{clients}'),
    ('${A.prov}','Prestador','prest@sicsc.aeternu.internal','PROVIDER',true,'{dashboard,evaluations}');
  INSERT INTO public.services (name, code, status) VALUES ('Limpeza','LMP','ACTIVE');
  INSERT INTO public.clients (company_name, internal_code, status) VALUES ('Cliente Antigo','CLI-1','ACTIVE');
  INSERT INTO public.providers (internal_code, name, professional_email, status) VALUES ('P1','Tec Um','tec1@t.ao','ACTIVE');
`);
const svc = (await db.query(`SELECT id FROM public.services LIMIT 1`)).rows[0].id;
const provId = (await db.query(`SELECT id FROM public.providers LIMIT 1`)).rows[0].id;

async function as(role, sub, fn) {
  await db.exec(`RESET ROLE;`);
  const claims = JSON.stringify({ sub, role, email: '' });
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [claims]);
  await db.exec(`SET ROLE ${role};`);
  try { return await fn(); } finally { await db.exec(`RESET ROLE;`); }
}
const tryq = async (fn) => { try { return { ok: true, r: await fn() }; } catch (e) { return { ok: false, err: e.message }; } };

// ---------- 2. Idempotência: segunda execução não pode falhar nem apagar dados ----------
await db.exec(`INSERT INTO public.clients (company_name, internal_code, status) VALUES ('Cliente Sobrevive','CLI-2','ACTIVE');`);
const before = (await db.query(`SELECT count(*)::int n FROM public.clients`)).rows[0].n;
const second = await tryq(() => db.exec(migSql));
const after = (await db.query(`SELECT count(*)::int n FROM public.clients`)).rows[0].n;
rec('M2', 'Segunda execução da migração é idempotente e preserva os dados', second.ok && before === after,
  second.ok ? `OK. Clientes antes=${before}, depois=${after}` : `ERRO: ${second.err}`);

// ---------- 3. Submissão pública ----------
const sub1 = await tryq(() => as('anon', '', async () =>
  (await db.query(`SELECT public.submit_evaluation($1::jsonb) AS r`, [JSON.stringify({
    clientName: 'Cliente Teste', serviceId: svc, satisfactionRating: 4, npsScore: 9, comment: 'ok',
    detailedAnswers: { q1: { rating: 4 } }, questionsSnapshot: [{ id: 'q1' }] })])).rows[0].r));
rec('S0', 'submit_evaluation aceita submissão anónima válida', sub1.ok && sub1.r.success === true,
  sub1.ok ? `Referência ${sub1.r.reference}` : `ERRO: ${sub1.err}`);
const evalId = sub1.ok ? sub1.r.id : null;

const subNoSat = await tryq(() => as('anon', '', async () =>
  db.query(`SELECT public.submit_evaluation($1::jsonb)`, [JSON.stringify({ clientName: 'Sem Satisfacao', serviceId: svc })])));
rec('D1', 'Submissão sem classificação de satisfação é recusada (sem valor inventado)', !subNoSat.ok,
  subNoSat.ok ? 'ACEITE (falha)' : `Recusada: ${subNoSat.err}`);

const subNoNps = await tryq(() => as('anon', '', async () =>
  (await db.query(`SELECT public.submit_evaluation($1::jsonb) AS r`, [JSON.stringify({ clientName: 'Sem NPS', serviceId: svc, satisfactionRating: 5 })])).rows[0].r));
let npsStored = 'n/a';
if (subNoNps.ok) npsStored = (await db.query(`SELECT nps_score FROM public.evaluations WHERE id=$1`, [subNoNps.r.id])).rows[0].nps_score;
rec('D2', 'NPS não respondido fica NULL (não é gravado como 10)', subNoNps.ok && npsStored === null,
  `nps_score gravado = ${npsStored}`);

const badAudio = await tryq(() => as('anon', '', async () =>
  db.query(`SELECT public.submit_evaluation($1::jsonb)`, [JSON.stringify({ clientName: 'Audio Mau', serviceId: svc, satisfactionRating: 3, audioRecordingUrl: 'https://x/y.webm' })])));
rec('S1', 'Áudio com URL pública externa é recusado', !badAudio.ok, badAudio.ok ? 'ACEITE (falha)' : `Recusado: ${badAudio.err}`);

const longAudio = await tryq(() => as('anon', '', async () =>
  db.query(`SELECT public.submit_evaluation($1::jsonb)`, [JSON.stringify({ clientName: 'Audio Longo', serviceId: svc, satisfactionRating: 3, audioRecordingUrl: 'submissions/a.webm', audioDurationSeconds: 60 })])));
rec('S2', 'Áudio com mais de 45 segundos é recusado', !longAudio.ok, longAudio.ok ? 'ACEITE (falha)' : `Recusado: ${longAudio.err}`);

// ---------- 4. Escrita direta e forja de auditoria (anon) ----------
const directIns = await tryq(() => as('anon', '', async () =>
  db.query(`INSERT INTO public.evaluations (client_name, service_name, satisfaction_rating, status, final_classification, finalized_at, technical_score)
            VALUES ('Forjado','X',5,'APPROVED','POSITIVE',now(),99.9)`)));
rec('S3', 'Anónimo NÃO consegue inserir avaliação diretamente (nem já homologada)', !directIns.ok,
  directIns.ok ? 'INSERT ACEITE (falha)' : `Bloqueado: ${directIns.err}`);

const forgeAnon = await tryq(() => as('anon', '', async () =>
  db.query(`SELECT public.log_audit_event('DELETE','evaluations','x','SUCCESS','apagado','admin@x.ao')`)));
rec('S4', 'Anónimo NÃO consegue chamar log_audit_event', !forgeAnon.ok,
  forgeAnon.ok ? 'CHAMADA ACEITE (falha)' : `Bloqueado: ${forgeAnon.err}`);

// ---------- 5. Isolamento de prestador ----------
const provEvals = await as('authenticated', A.prov, async () => (await db.query(`SELECT count(*)::int n FROM public.evaluations`)).rows[0].n);
rec('S5', 'Prestador NÃO vê avaliações (apenas as que lhe forem homologadas/atribuídas)', provEvals === 0,
  `Prestador vê ${provEvals} avaliações`);
const provProfiles = await as('authenticated', A.prov, async () => (await db.query(`SELECT count(*)::int n FROM public.profiles`)).rows[0].n);
rec('S6', 'Prestador vê apenas o seu próprio perfil', provProfiles === 1, `Prestador vê ${provProfiles} perfis`);
const provProviders = await as('authenticated', A.prov, async () => (await db.query(`SELECT count(*)::int n FROM public.providers`)).rows[0].n);
rec('S7', 'Prestador NÃO lista prestadores (contactos)', provProviders === 0, `Prestador vê ${provProviders}`);
const provAuditIns = await tryq(() => as('authenticated', A.prov, async () =>
  db.query(`INSERT INTO public.audit_logs (operation_type,affected_entity,user_email,user_name,result,details)
            VALUES ('DELETE','Client','admin@x','Admin','SUCCESS','forjado')`)));
rec('S8', 'Autenticado NÃO insere diretamente em audit_logs', !provAuditIns.ok,
  provAuditIns.ok ? 'INSERT ACEITE (falha)' : `Bloqueado: ${provAuditIns.err}`);
const provAuditRead = await as('authenticated', A.prov, async () => (await db.query(`SELECT count(*)::int n FROM public.audit_logs`)).rows[0].n);
rec('S9', 'Prestador NÃO lê a auditoria', provAuditRead === 0, `Prestador vê ${provAuditRead} registos`);

// ---------- 6. Operacional ----------
const opClients = await as('authenticated', A.op, async () => (await db.query(`SELECT count(*)::int n FROM public.clients`)).rows[0].n);
rec('P1', 'Operacional (equipa interna) lê clientes', opClients >= 1, `Vê ${opClients} clientes`);
const opEvals = await as('authenticated', A.op, async () => (await db.query(`SELECT count(*)::int n FROM public.evaluations`)).rows[0].n);
rec('P2', 'Operacional lê avaliações internas', opEvals >= 1, `Vê ${opEvals} avaliações`);

// ---------- 7. Homologação 80/20 (80 automáticos + 10 áudio + 10 argumentos) ----------
// Fixtures com configuração congelada (questions_snapshot) e respostas (detailed_answers)
const snap = JSON.stringify([
  { id: 'h-q1', text: 'Qualidade', category: 'QUALIDADE', type: 'RATING_5' },
  { id: 'h-q2', text: 'Pontualidade', category: 'PONTUALIDADE', type: 'RATING_5' },
  { id: 'h-q3', text: 'EPI', category: 'SEGURANCA', type: 'YES_NO_NA', yesScore: 1, noScore: 0 },
  { id: 'h-q4', text: 'Atendimento', category: 'ATENDIMENTO', type: 'RATING_10' },
]);
const ansMedio = JSON.stringify({ 'h-q1': { rating: 4 }, 'h-q2': { rating: 4 }, 'h-q3': { yesNo: 'YES' }, 'h-q4': { rating: 3 } });
const ansMax = JSON.stringify({ 'h-q1': { rating: 5 }, 'h-q2': { rating: 5 }, 'h-q3': { yesNo: 'YES' }, 'h-q4': { rating: 10 } });
const mkEval = async (name, answers, audioUrl = null, comment = null) => (await db.query(
  `INSERT INTO public.evaluations (client_name, service_name, satisfaction_rating, questions_snapshot, detailed_answers, audio_recording_url, comment)
   VALUES ($1, 'Teste', 4, $2::jsonb, $3::jsonb, $4, $5) RETURNING id`,
  [name, snap, answers, audioUrl, comment])).rows[0].id;

// Automático esperado: (0.8×40 + 0.8×20 + 1×25 + 0.3×15) / 100 × 80 = 62
const hId = await mkEval('Homologação Base', ansMedio);
const crit = await tryq(() => as('authenticated', A.hr, async () =>
  (await db.query(`SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL, $2::jsonb) AS r`, [hId, JSON.stringify({ writtenArguments: { score: 0 } })])).rows[0].r));
const k = crit.ok ? Object.keys(crit.r).sort().join(',') : '';
rec('F1', 'Homologação (RH) executa e devolve as chaves que o frontend espera', crit.ok && crit.r.finalScore !== undefined && crit.r.finalClassification && crit.r.snapshot && crit.r.finalizedBy && crit.r.finalizedAt && crit.r.automaticPoints !== undefined,
  crit.ok ? `finalScore=${crit.r.finalScore} classe=${crit.r.finalClassification} chaves=[${k}]` : `ERRO: ${crit.err}`);
rec('F2', 'Sem áudio (10 automáticos) e argumentos decididos com 0: 62 + 10 + 0 = 72.00', crit.ok && Number(crit.r.finalScore) === 72 && Number(crit.r.automaticPoints) === 62 && Number(crit.r.audioPoints) === 10,
  crit.ok ? `obtido ${crit.r.finalScore} (automático ${crit.r.automaticPoints})` : 'n/a');
const st = (await db.query(`SELECT status FROM public.evaluations WHERE id=$1`, [hId])).rows[0];
rec('F3', 'Estado após homologação é REVIEWED (alinhado com o frontend)', st.status === 'REVIEWED', `status=${st.status}`);

const recalc = await tryq(() => as('authenticated', A.hr, async () =>
  db.query(`SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL)`, [hId])));
rec('I1', 'Avaliação homologada NÃO pode ser re-homologada', !recalc.ok && /homologada/.test(recalc.err),
  recalc.ok ? 'ACEITE (falha)' : `Bloqueado: ${recalc.err}`);

const tamper = await tryq(() => as('authenticated', A.hr, async () =>
  db.query(`UPDATE public.evaluations SET technical_score = 100, final_classification='POSITIVE' WHERE id=$1`, [hId])));
const curScore = (await db.query(`SELECT technical_score FROM public.evaluations WHERE id=$1`, [hId])).rows[0].technical_score;
rec('I2', 'Alteração direta da pontuação homologada é bloqueada pelo trigger', !tamper.ok && Number(curScore) === 72,
  tamper.ok ? `UPDATE aceite (falha). Pontuação agora ${curScore}` : `Bloqueado: ${tamper.err}`);

const delFin = await tryq(() => as('authenticated', A.admin, async () =>
  db.query(`DELETE FROM public.evaluations WHERE id=$1`, [hId])));
const stillThere = (await db.query(`SELECT count(*)::int n FROM public.evaluations WHERE id=$1`, [hId])).rows[0].n;
rec('I3', 'Avaliação homologada NÃO pode ser eliminada (a linha permanece)', stillThere === 1,
  `${delFin.ok ? 'DELETE sem erro (RLS sem política de DELETE)' : 'Bloqueado: ' + delFin.err} | linhas existentes = ${stillThere}`);

const provCalc = await tryq(() => as('authenticated', A.prov, async () =>
  db.query(`SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL)`, [evalId])));
rec('A1', 'Prestador NÃO consegue homologar', !provCalc.ok, provCalc.ok ? 'ACEITE (falha)' : `Bloqueado: ${provCalc.err}`);

// Mensagem de erro de pesos (antes: "too many parameters for RAISE")
await db.exec(`UPDATE public.evaluation_criteria SET active=false WHERE id='crit-atendimento'`);
const wId = (await db.query(`INSERT INTO public.evaluations (client_name, service_name, satisfaction_rating) VALUES ('W','W',3) RETURNING id`)).rows[0].id;
const weightErr = await tryq(() => as('authenticated', A.hr, async () =>
  (await db.query(`SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL) AS r`, [wId])).rows));
rec('B1', 'Erro de soma de pesos devolve mensagem legível com a soma atual',
  !weightErr.ok && /soma atual: 85/.test(weightErr.err) && !/too many parameters/.test(weightErr.err),
  weightErr.ok ? 'Sem erro (falha)' : `Mensagem: "${weightErr.err}"`);
await db.exec(`UPDATE public.evaluation_criteria SET active=true WHERE id='crit-atendimento'`);

// Atribuição de prestador
const aId = (await db.query(`INSERT INTO public.evaluations (client_name, service_name, satisfaction_rating) VALUES ('A','A',4) RETURNING id`)).rows[0].id;
const assign = await tryq(() => as('authenticated', A.admin, async () =>
  (await db.query(`SELECT public.assign_evaluation_provider($1::uuid, $2::uuid) AS r`, [aId, provId])).rows[0].r));
rec('F4', 'assign_evaluation_provider funciona (antes: erro de sintaxe)', assign.ok && assign.r.success === true,
  assign.ok ? `OK ${assign.r.providerName}` : `ERRO: ${assign.err}`);

// ---------- 8. Critérios e limiar ----------
const saveBad = await tryq(() => as('authenticated', A.hr, async () =>
  db.query(`SELECT public.save_evaluation_criteria($1::jsonb)`, [JSON.stringify([
    { id: 'c1', categoryName: 'Q', weightPercentage: 50, maxScore: 5, minScore: 0, active: true, order: 1 }])])));
rec('C1', 'save_evaluation_criteria recusa soma diferente de 100 com mensagem clara',
  !saveBad.ok && /soma atual: 150/.test(saveBad.err), saveBad.ok ? 'Aceite (falha)' : `Mensagem: "${saveBad.err}"`);

const thr = await tryq(() => as('authenticated', A.hr, async () =>
  (await db.query(`SELECT public.set_criteria_passing_threshold(80) AS r`)).rows[0].r));
const thrRows = (await db.query(`SELECT count(*)::int n FROM public.criteria_configurations WHERE is_active`)).rows[0].n;
rec('C2', 'set_criteria_passing_threshold grava o limiar sem duplicar a configuração ativa',
  thr.ok && thrRows === 1, thr.ok ? `ativas=${thrRows}` : `ERRO: ${thr.err}`);

// ---------- 9. Sessão e permissões ----------
const accAdmin = await as('authenticated', A.admin, async () => (await db.query(`SELECT public.get_my_access() AS r`)).rows[0].r);
rec('G1', 'get_my_access (ADMIN) devolve todas as páginas e chaves snake_case', Array.isArray(accAdmin.pages) && accAdmin.pages.length >= 15 && accAdmin.base_role === 'ADMIN',
  `pages=${accAdmin.pages.length} base_role=${accAdmin.base_role}`);
const accOp = await as('authenticated', A.op, async () => (await db.query(`SELECT public.get_my_access() AS r`)).rows[0].r);
rec('G2', 'get_my_access (OPERATIONAL com página clients) devolve só as páginas atribuídas', JSON.stringify(accOp.pages) === '["clients"]',
  `pages=${JSON.stringify(accOp.pages)}`);
const hasOk = await as('authenticated', A.op, async () => (await db.query(`SELECT public.has_page('clients') AS a, public.has_page('audit') AS b`)).rows[0]);
rec('G3', 'has_page confirma página atribuída e recusa a não atribuída', hasOk.a === true && hasOk.b === false, JSON.stringify(hasOk));
const anonAccess = await tryq(() => as('anon', '', async () => db.query(`SELECT public.get_my_access()`)));
rec('G4', 'Anónimo NÃO consegue chamar get_my_access', !anonAccess.ok, anonAccess.ok ? 'ACEITE (falha)' : `Bloqueado: ${anonAccess.err}`);

const sysAudit = await as('authenticated', A.hr, async () => {
  await db.query(`SELECT public.log_system_audit('UPDATE','Teste','1','SUCCESS','teste de ator')`);
  return (await db.query(`SELECT user_email FROM public.audit_logs WHERE details='teste de ator'`)).rows[0];
});
rec('L1', 'log_system_audit regista o utilizador autenticado (não aceita e-mail do cliente)',
  sysAudit && sysAudit.user_email === 'hr@sicsc.aeternu.internal', `user_email=${sysAudit && sysAudit.user_email}`);

const nNum = await tryq(() => as('authenticated', A.hr, async () => db.query(`SELECT public.next_employee_number()`)));
rec('E1', 'next_employee_number NÃO é executável por utilizadores autenticados', !nNum.ok, nNum.ok ? 'ACEITE (falha)' : `Bloqueado: ${nNum.err}`);
const num1 = (await db.query(`SELECT public.next_employee_number() AS n`)).rows[0].n;
const num2 = (await db.query(`SELECT public.next_employee_number() AS n`)).rows[0].n;
rec('E2', 'Números de funcionário sequenciais e sem colisão', num1 !== num2, `${num1} / ${num2}`);

await db.query(`INSERT INTO public.employees (employee_number, full_name, category) VALUES ('AET-T1','Teste','TECNICO')`);
const empHr = await as('authenticated', A.hr, async () => (await db.query(`SELECT count(*)::int n FROM public.employees`)).rows[0].n);
rec('E3', 'HR lê funcionários', empHr >= 1, `vê ${empHr}`);
const empProv = await as('authenticated', A.prov, async () => (await db.query(`SELECT count(*)::int n FROM public.employees`)).rows[0].n);
rec('E4', 'Prestador NÃO lê funcionários', empProv === 0, `vê ${empProv}`);

// ---------- 10. Storage privado ----------
const bucket = (await db.query(`SELECT public FROM storage.buckets WHERE id='evaluation-audio'`)).rows[0];
rec('T1', 'Bucket de áudio é privado', bucket && bucket.public === false, `public=${bucket && bucket.public}`);
const upOk = await tryq(() => as('anon', '', async () =>
  db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('evaluation-audio','submissions/a.webm')`)));
rec('T2', 'Anónimo pode enviar áudio para submissions/', upOk.ok, upOk.ok ? 'OK' : `ERRO: ${upOk.err}`);
const upBad = await tryq(() => as('anon', '', async () =>
  db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('evaluation-audio','outro/x.webm')`)));
rec('T3', 'Anónimo NÃO pode enviar fora de submissions/', !upBad.ok, upBad.ok ? 'ACEITE (falha)' : `Bloqueado: ${upBad.err}`);
const anonRead = await as('anon', '', async () => (await db.query(`SELECT count(*)::int n FROM storage.objects`)).rows[0].n).catch(() => 'bloqueado');
rec('T4', 'Anónimo NÃO consegue listar objetos do storage', anonRead === 'bloqueado' || anonRead === 0, `resultado=${anonRead}`);

// ---------- 11. Vistas públicas e acesso direto ----------
const viewAnon = await tryq(() => as('anon', '', async () => db.query(`SELECT count(*) FROM public.v_public_clients`)));
rec('V1', 'Vista pública v_public_clients acessível ao formulário', viewAnon.ok, viewAnon.ok ? 'OK' : `ERRO: ${viewAnon.err}`);
const tblAnon = await tryq(() => as('anon', '', async () => db.query(`SELECT count(*) FROM public.clients`)));
rec('V2', 'Anónimo NÃO lê a tabela clients (apenas a vista)', !tblAnon.ok, tblAnon.ok ? 'LEU (falha)' : `Bloqueado: ${tblAnon.err}`);

// ---------- 12. Ausência de funções obsoletas e parâmetro esperado pelo frontend ----------
const sig = (await db.query(`SELECT pg_get_function_arguments(oid) a FROM pg_proc WHERE proname='calculate_and_finalize_evaluation'`)).rows[0].a;
rec('X1', 'Parâmetro p_threshold_override_reason existe (o frontend o envia)', /p_threshold_override_reason/.test(sig), sig);
const frontFns = ['calculate_and_finalize_evaluation','submit_evaluation','associate_evaluation_client','assign_evaluation_provider',
  'save_evaluation_criteria','set_criteria_passing_threshold','log_system_audit','get_my_access','has_page','touch_last_login'];
const existing = (await db.query(`SELECT DISTINCT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`)).rows.map(r => r.proname);
const missing = frontFns.filter(f => !existing.includes(f));
rec('X2', 'Todas as RPCs chamadas pelo frontend existem', missing.length === 0, missing.length ? `Em falta: ${missing}` : 'OK');

const rls = (await db.query(`SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity`)).rows[0].n;
rec('X3', 'Todas as tabelas de public têm RLS ativo', rls === 0, `tabelas sem RLS: ${rls}`);


// ---------- 13. Troca obrigatória da palavra-passe inicial ----------
await db.exec(`UPDATE public.profiles SET must_change_password = true WHERE id='${A.op}'`);
const clr = await tryq(() => as('authenticated', A.op, async () =>
  (await db.query(`SELECT public.clear_must_change_password() AS r`)).rows[0].r));
const mcp = (await db.query(`SELECT must_change_password FROM public.profiles WHERE id='${A.op}'`)).rows[0].must_change_password;
rec('Q1', 'clear_must_change_password limpa a flag da própria conta', clr.ok && clr.r === true && mcp === false,
  clr.ok ? `retorno=${clr.r}, flag=${mcp}` : `ERRO: ${clr.err}`);
const clrAnon = await tryq(() => as('anon', '', async () => db.query(`SELECT public.clear_must_change_password()`)));
rec('Q2', 'Anónimo NÃO consegue limpar a flag', !clrAnon.ok, clrAnon.ok ? 'ACEITE (falha)' : `Bloqueado: ${clrAnon.err}`);


// ---------- 14. Calendário: payload real do frontend ----------
const act = await tryq(() => as('authenticated', A.hr, async () => (await db.query(
  `INSERT INTO public.activities (title, description, client_id, service_id, location, activity_date, start_time, end_time,
     team_id, team_name, assigned_provider_ids, supervisor_name, status)
   VALUES ('Desinfeção','x',NULL,NULL,'Porto',CURRENT_DATE,'08:00','12:00',NULL,'Equipa Alpha',$1::uuid[],'Eng. X','SCHEDULED') RETURNING id`,
  [[provId]])).rows[0]));
rec('K1', 'Atividade do calendário grava com o payload do frontend', act.ok, act.ok ? 'OK' : `ERRO: ${act.err}`);

// ---------- 15. Mensagens: diretas, grupos, membros ----------
const B = { ops: '00000000-0000-0000-0000-0000000000b1' };
await db.exec(`INSERT INTO auth.users (id,email) VALUES ('${B.ops}','outro@sicsc.aeternu.internal');
  INSERT INTO public.profiles (id,name,email,role,active,allowed_pages) VALUES ('${B.ops}','Outro Colega','outro@sicsc.aeternu.internal','OPERATIONAL',true,'{messages}');`);
const ph = await as('authenticated', A.op, async () => (await db.query(`SELECT count(*)::int n FROM public.list_message_recipients()`)).rows[0].n);
rec('M3', 'Diretório lista destinatários sem o próprio utilizador', ph === 4, `vê ${ph} destinatários (5 perfis menos o próprio)`);
const d1 = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.create_conversation('DIRECT',NULL,$1::uuid[]) AS r`, [[A.hr]])).rows[0].r));
const d2 = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.create_conversation('DIRECT',NULL,$1::uuid[]) AS r`, [[A.hr]])).rows[0].r));
rec('M4', 'Conversa direta reutiliza a existente entre os mesmos dois utilizadores', d1.ok && d2.ok && d1.r === d2.r, `${d1.r} / ${d2.r}`);
const g = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.create_conversation('GROUP','Equipa Alpha',$1::uuid[]) AS r`, [[A.hr, B.ops]])).rows[0].r));
rec('M5', 'Grupo com nome e vários membros é criado', g.ok, g.ok ? `id ${g.r}` : `ERRO: ${g.err}`);
const gBad = await tryq(() => as('authenticated', A.op, async () => db.query(`SELECT public.create_conversation('GROUP','A',$1::uuid[])`, [[A.hr]])));
rec('M6', 'Grupo sem nome válido é recusado', !gBad.ok, gBad.ok ? 'ACEITE (falha)' : `Recusado: ${gBad.err}`);
const selfOnly = await tryq(() => as('authenticated', A.op, async () => db.query(`SELECT public.create_conversation('DIRECT',NULL,$1::uuid[])`, [[A.op]])));
rec('M7', 'Não é possível criar conversa só consigo próprio', !selfOnly.ok, selfOnly.ok ? 'ACEITE (falha)' : `Recusado: ${selfOnly.err}`);
const msg = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.send_message($1::uuid,'Olá equipa') AS r`, [g.r])).rows[0].r));
rec('M8', 'Membro envia mensagem para o grupo', msg.ok, msg.ok ? 'OK' : `ERRO: ${msg.err}`);
const readByMember = await as('authenticated', B.ops, async () => (await db.query(`SELECT count(*)::int n FROM public.messages WHERE conversation_id=$1`, [g.r])).rows[0].n);
rec('M9', 'Outro membro lê a mensagem do grupo', readByMember === 1, `lê ${readByMember}`);
const readOutsider = await as('authenticated', A.prov, async () => (await db.query(`SELECT count(*)::int n FROM public.messages WHERE conversation_id=$1`, [g.r])).rows[0].n);
rec('M10', 'Não-membro NÃO lê mensagens do grupo', readOutsider === 0, `lê ${readOutsider}`);
const sendOutsider = await tryq(() => as('authenticated', A.prov, async () => db.query(`SELECT public.send_message($1::uuid,'intruso')`, [g.r])));
rec('M11', 'Não-membro NÃO envia mensagens para o grupo', !sendOutsider.ok, sendOutsider.ok ? 'ACEITE (falha)' : `Bloqueado: ${sendOutsider.err}`);
const insDirect = await tryq(() => as('authenticated', A.op, async () => db.query(`INSERT INTO public.messages (conversation_id, body) VALUES ($1,'direto')`, [g.r])));
rec('M12', 'Inserção direta em messages é bloqueada (só via send_message)', !insDirect.ok, insDirect.ok ? 'ACEITE (falha)' : `Bloqueado: ${insDirect.err}`);
const addByMember = await tryq(() => as('authenticated', B.ops, async () => (await db.query(`SELECT public.add_group_members($1::uuid,$2::uuid[]) AS r`, [g.r, [A.prov]])).rows[0].r));
rec('M13', 'Membro que não é criador nem ADMIN NÃO acrescenta membros', !addByMember.ok, addByMember.ok ? 'ACEITE (falha)' : `Bloqueado: ${addByMember.err}`);
const addByCreator = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.add_group_members($1::uuid,$2::uuid[]) AS r`, [g.r, [A.prov]])).rows[0].r));
rec('M14', 'Criador do grupo acrescenta membro', addByCreator.ok && addByCreator.r === 1, addByCreator.ok ? `adicionados ${addByCreator.r}` : `ERRO: ${addByCreator.err}`);
const anonConv = await tryq(() => as('anon', '', async () => db.query(`SELECT public.create_conversation('DIRECT',NULL,'{}'::uuid[])`)));
rec('M15', 'Anónimo NÃO cria conversas', !anonConv.ok, anonConv.ok ? 'ACEITE (falha)' : `Bloqueado: ${anonConv.err}`);


// ---------- 16. Login por identificador, nome ou número de funcionário ----------
await db.exec(`UPDATE public.profiles SET name='João Neto Silva' WHERE id='${A.op}';
  INSERT INTO public.employees (employee_number, full_name, access_identifier, category, account_status, user_id)
  VALUES ('AET-010','João Neto Silva','joao.neto','OUTRO','ATIVA','${A.op}');`);
const OPEMAIL='op@sicsc.aeternu.internal';
const resolveAs = (login) => as('anon', '', async () => (await db.query(`SELECT public.resolve_login_email($1) AS e`, [login])).rows[0].e);
rec('L2', 'Login pelo identificador de acesso resolve a conta', (await resolveAs('joao.neto')) === OPEMAIL, 'joao.neto');
rec('L3', 'Login pelo nome completo (com acentos e maiúsculas) resolve a conta', (await resolveAs('JOÃO NETO SILVA')) === OPEMAIL, 'JOÃO NETO SILVA');
rec('L4', 'Login pelo número de funcionário resolve a conta', (await resolveAs('aet-010')) === OPEMAIL, 'aet-010');
rec('L5', 'Login por e-mail válido da conta resolve a conta', (await resolveAs(OPEMAIL)) === OPEMAIL, OPEMAIL);
rec('L6', 'Identificador desconhecido NÃO resolve', (await resolveAs('ninguem.aqui')) === null, 'ninguem.aqui');
rec('L7', 'Texto com e-mail inválido NÃO resolve', (await resolveAs('a@b')) === null, 'a@b');
await db.exec(`UPDATE public.profiles SET active=false WHERE id='${A.op}'`);
rec('L8', 'Conta desativada NÃO resolve', (await resolveAs('joao.neto')) === null, 'joao.neto (inativa)');
await db.exec(`UPDATE public.profiles SET active=true WHERE id='${A.op}'`);
const hrSet = await tryq(() => as('authenticated', A.hr, async () => db.query(`SELECT public.update_login_settings('{"employee_number":false}'::jsonb)`)));
rec('L9', 'HR NÃO altera a configuração de login', !hrSet.ok, hrSet.ok ? 'ACEITE (falha)' : `Bloqueado: ${hrSet.err}`);
await as('authenticated', A.admin, async () => db.query(`SELECT public.update_login_settings('{"employee_number":false}'::jsonb)`));
rec('L10', 'Administrador desativa o login por número de funcionário', (await resolveAs('aet-010')) === null, 'aet-010 deve deixar de resolver');
rec('L11', 'Métodos ativos refletem a configuração (público)', (await db.query(`SELECT public.get_login_methods() AS m`)).rows[0].m.employee_number === false, 'get_login_methods');
const allOff = await tryq(() => as('authenticated', A.admin, async () => db.query(`SELECT public.update_login_settings('{"access_identifier":false,"full_name":false,"employee_number":false,"email":false}'::jsonb)`)));
rec('L12', 'Não é possível desativar todos os métodos de login', !allOff.ok, allOff.ok ? 'ACEITE (falha)' : `Bloqueado: ${allOff.err}`);
await as('authenticated', A.admin, async () => db.query(`SELECT public.update_login_settings('{"employee_number":true}'::jsonb)`));
rec('L13', 'Administrador reativa o login por número de funcionário', (await resolveAs('aet-010')) === OPEMAIL, 'aet-010');
await db.exec(`UPDATE public.employees SET full_name='João Neto Silva', access_identifier='joao.neto' WHERE employee_number='AET-010'`);

// ---------- 17. Limite de submissões públicas por endereço ----------
await db.exec(`SELECT set_config('request.headers', '{"x-forwarded-for":"10.9.8.7"}', false)`);
let blocked = null, okCount = 0;
for (let i = 0; i < 31; i++) {
  const r = await tryq(() => as('anon', '', async () => db.query(`SELECT public.submit_evaluation($1::jsonb)`, [JSON.stringify({ clientName: 'Lote '+i, serviceId: svc, satisfactionRating: 4 })])));
  if (r.ok) okCount++; else { blocked = r.err; break; }
}
rec('R1', 'Até 30 submissões por hora são aceites a partir de um endereço', okCount === 30, `aceites=${okCount}`);
rec('R2', 'A 31.ª submissão do mesmo endereço é bloqueada', !!blocked && /Demasiadas/.test(blocked), blocked || 'não bloqueada');
await db.exec(`SELECT set_config('request.headers', '{}', false)`);

// ---------- 18. Limites de upload nos buckets ----------
const lim = (await db.query(`SELECT file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='evaluation-audio'`)).rows[0];
rec('U1', 'Bucket de áudio limita tamanho e tipo de ficheiro', lim && Number(lim.file_size_limit) === 10485760 && lim.allowed_mime_types.includes('audio/webm') && !lim.allowed_mime_types.includes('application/x-msdownload'), JSON.stringify(lim));


// ---------- 19. Clientes: cadastro obrigatório e metas ----------
const cl = (extra) => as('authenticated', A.op, async () => (await db.query(
  `INSERT INTO public.clients (company_name, internal_code, contact_person, email, phone, nif, address, sector, contract_start, contract_end, status)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ACTIVE') RETURNING id`, extra)).rows[0].id);
const okClient = await tryq(() => cl(['Empresa Válida Lda','CLI-V1','Ana Costa','ana@empresa.ao','+244 923 000 000','5417000123','Rua 1, Maianga','Industria','2026-01-01','2026-12-31']));
rec('C10', 'Cliente com todos os dados obrigatórios é gravado', okClient.ok, okClient.ok ? 'OK' : `ERRO: ${okClient.err}`);
const badNif = await tryq(() => cl(['Empresa NIF Mau','CLI-V2','X','a@b.ao','+244 923 000 001','ABC','R','S','2026-01-01','2026-12-31']));
rec('C11', 'NIF inválido é recusado', !badNif.ok, badNif.ok ? 'ACEITE (falha)' : `Recusado: ${badNif.err}`);
const badMail = await tryq(() => cl(['Empresa Email Mau','CLI-V3','X','email-invalido','+244 923 000 002','5417000124','R','S','2026-01-01','2026-12-31']));
rec('C12', 'E-mail inválido é recusado', !badMail.ok, badMail.ok ? 'ACEITE (falha)' : `Recusado: ${badMail.err}`);
const badDates = await tryq(() => cl(['Empresa Datas Mau','CLI-V4','X','c@d.ao','+244 923 000 003','5417000125','R','S','2026-12-31','2026-01-01']));
rec('C13', 'Contrato com fim anterior ao início é recusado', !badDates.ok, badDates.ok ? 'ACEITE (falha)' : `Recusado: ${badDates.err}`);
const cid = okClient.ok ? okClient.r : null;
const goal = await tryq(() => as('authenticated', A.op, async () => (await db.query(
  `INSERT INTO public.client_goals (client_id, title, metric, target_value, due_date, created_by)
   VALUES ($1,'CSAT acima de 80%','CSAT',80,'2026-12-31','op') RETURNING id`, [cid])).rows[0].id));
rec('G1', 'Equipa interna cria meta com prazo para um cliente', goal.ok, goal.ok ? 'OK' : `ERRO: ${goal.err}`);
const goalBad = await tryq(() => as('authenticated', A.op, async () => db.query(
  `INSERT INTO public.client_goals (client_id, title, metric, target_value, due_date) VALUES ($1,'Meta zero','CSAT',0,'2026-12-31')`, [cid])));
rec('G2', 'Meta com valor alvo zero é recusada', !goalBad.ok, goalBad.ok ? 'ACEITE (falha)' : `Recusada: ${goalBad.err}`);
const goalProv = await tryq(() => as('authenticated', A.prov, async () => db.query(`SELECT count(*) FROM public.client_goals`)));
rec('G3', 'Prestador NÃO lê metas de clientes', goalProv.ok && Number(goalProv.r.rows[0].count) === 0, goalProv.ok ? `vê ${goalProv.r.rows[0].count}` : `Bloqueado: ${goalProv.err}`);
const goalAnon = await tryq(() => as('anon', '', async () => db.query(`SELECT count(*) FROM public.client_goals`)));
rec('G4', 'Anónimo NÃO lê metas', !goalAnon.ok, goalAnon.ok ? 'LEU (falha)' : `Bloqueado: ${goalAnon.err}`);


// ---------- 20. Formulários, pesos e parecer do auditor (migração 1001) ----------
const newCat = await tryq(() => as('authenticated', A.hr, async () => db.query(
  `INSERT INTO public.form_categories (id, code, name) VALUES ('cat-ambiente','AMBIENTE','Ambiente') RETURNING id`)));
rec('T0', 'RH cria categoria de formulário', newCat.ok, newCat.ok ? 'OK' : `ERRO: ${newCat.err}`);

for (const t of ['RATING_10', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'YES_NO_NA']) {
  const r = await tryq(() => as('authenticated', A.hr, async () => db.query(
    `INSERT INTO public.form_questions (id, text, category, type, option_scores, yes_score, no_score, affects_score)
     VALUES ($1,'Pergunta','QUALIDADE',$2,'{"A":1,"B":0}'::jsonb,1,0.2,true)`, ['tq-' + t, t])));
  rec('T1-' + t, `Questão do tipo ${t} é aceite`, r.ok, r.ok ? 'OK' : `ERRO: ${r.err}`);
}
const badType = await tryq(() => as('authenticated', A.hr, async () => db.query(
  `INSERT INTO public.form_questions (id, text, category, type) VALUES ('tq-x','P','QUALIDADE','TIPO_INEXISTENTE')`)));
rec('T1-BAD', 'Tipo de questão desconhecido é recusado', !badType.ok, badType.ok ? 'ACEITE (falha)' : `Recusado: ${badType.err}`);
const badYes = await tryq(() => as('authenticated', A.hr, async () => db.query(
  `INSERT INTO public.form_questions (id, text, category, type, yes_score) VALUES ('tq-y','P','QUALIDADE','YES_NO_NA',1.5)`)));
rec('T1-RNG', 'Valor de conformidade fora de 0..1 é recusado', !badYes.ok, badYes.ok ? 'ACEITE (falha)' : `Recusado: ${badYes.err}`);

const link = await tryq(() => as('authenticated', A.hr, async () => db.query(
  `INSERT INTO public.service_categories (service_id, category_id) VALUES ($1,'cat-ambiente')`, [svc])));
rec('T2', 'RH associa categoria a um serviço', link.ok, link.ok ? 'OK' : `ERRO: ${link.err}`);
const linkProv = await tryq(() => as('authenticated', A.prov, async () => db.query(
  `DELETE FROM public.service_categories`)));
const remaining = (await db.query(`SELECT count(*)::int n FROM public.service_categories`)).rows[0].n;
rec('T3', 'Prestador NÃO altera as associações serviço-categoria', remaining === 1, `restam ${remaining} (esperado 1)`);
const linkAnon = await tryq(() => as('anon', '', async () => (await db.query(`SELECT count(*)::int n FROM public.service_categories`)).rows[0].n));
rec('T4', 'Formulário anónimo consegue ler as associações', linkAnon.ok && linkAnon.r === 1, linkAnon.ok ? `vê ${linkAnon.r}` : `ERRO: ${linkAnon.err}`);

const codes = (await db.query(`SELECT id, category_code FROM public.evaluation_criteria ORDER BY display_order`)).rows;
rec('T5', 'Critérios do RH ficam ligados às categorias (category_code)',
  codes.length === 4 && codes.every((c) => c.category_code), codes.map((c) => c.category_code).join(','));

const saveBadSum = await tryq(() => as('authenticated', A.hr, async () => db.query(
  `SELECT public.save_evaluation_criteria($1::jsonb)`, [JSON.stringify([
    { id: 'crit-qualidade', categoryCode: 'qualidade', categoryName: 'Qualidade', weightPercentage: 50, maxScore: 5, minScore: 0, active: true, order: 1 }])])));
rec('T6', 'Gravar critérios com soma diferente de 100 % é recusado no servidor', !saveBadSum.ok, saveBadSum.ok ? 'ACEITE (falha)' : `Recusado: ${saveBadSum.err}`);
const stillCode = (await db.query(`SELECT category_code FROM public.evaluation_criteria WHERE id='crit-qualidade'`)).rows[0].category_code;
rec('T6b', 'Recusa não deixa alterações parciais', stillCode === 'QUALIDADE', `category_code=${stillCode}`);

const hA = await mkEval('Auditoria 1', ansMedio, 'submissions/a.webm', 'Texto geral do cliente');
const review = JSON.stringify({ audio: { score: 4, transcript: 'Serviço rápido' }, writtenArguments: { score: 3.5, notes: 'Argumento genérico' } });
const fin2 = await tryq(() => as('authenticated', A.hr, async () => (await db.query(
  `SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL, $2::jsonb) AS r`, [hA, review])).rows[0].r));
// 62 automático + 4×2 (áudio) + 3,5×2 (argumentos) = 77
rec('T7', 'Homologação com áudio e argumentos classificados (esperado 77.00)', fin2.ok && Number(fin2.r.finalScore) === 77, fin2.ok ? `score=${fin2.r.finalScore}` : `ERRO: ${fin2.err}`);
const stored = (await db.query(`SELECT auditor_review, criteria_snapshot FROM public.evaluations WHERE id=$1`, [hA])).rows[0];
rec('T8', 'Parecer e partes (automático/áudio/argumentos) gravados no snapshot imutável',
  stored.auditor_review?.audio?.score === 4 && stored.criteria_snapshot?.auditorReview?.writtenArguments?.score === 3.5
  && Number(stored.criteria_snapshot?.audioPoints) === 8 && Number(stored.criteria_snapshot?.argumentPoints) === 7,
  JSON.stringify(stored.criteria_snapshot?.audioPoints) + '/' + JSON.stringify(stored.criteria_snapshot?.argumentPoints));
const mutate = await tryq(() => db.query(`UPDATE public.evaluations SET auditor_review = '{}'::jsonb WHERE id=$1`, [hA]));
rec('T9', 'Parecer do auditor é imutável após a homologação', !mutate.ok, mutate.ok ? 'ALTERADO (falha)' : `Recusado: ${mutate.err}`);

const hB = await mkEval('Auditoria 2', ansMedio, 'submissions/b.webm', null);
const badScore = await tryq(() => as('authenticated', A.hr, async () => db.query(
  `SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL, $2::jsonb)`, [hB, JSON.stringify({ audio: { score: 7 } })])));
rec('T10', 'Nota qualitativa acima de 5 é recusada', !badScore.ok, badScore.ok ? 'ACEITE (falha)' : `Recusada: ${badScore.err}`);
const stillOpen = (await db.query(`SELECT finalized_at FROM public.evaluations WHERE id=$1`, [hB])).rows[0].finalized_at;
rec('T10b', 'Recusa não homologa a avaliação', stillOpen === null, stillOpen === null ? 'OK' : 'ficou homologada (falha)');

const noAudioScore = await tryq(() => as('authenticated', A.hr, async () => db.query(
  `SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL, '{}'::jsonb)`, [hB])));
rec('T11', 'Áudio gravado sem nota do auditor é recusado', !noAudioScore.ok && /Falta classificar o áudio/.test(noAudioScore.err),
  noAudioScore.ok ? 'ACEITE (falha)' : `Recusado: ${noAudioScore.err}`);

const hC = await mkEval('Auditoria 3', ansMedio, null, 'Texto escrito pelo cliente');
const noArgScore = await tryq(() => as('authenticated', A.hr, async () => db.query(
  `SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL, '{}'::jsonb)`, [hC])));
rec('T11b', 'Argumentos escritos sem nota do auditor são recusados', !noArgScore.ok && /argumentos/.test(noArgScore.err),
  noArgScore.ok ? 'ACEITE (falha)' : `Recusados: ${noArgScore.err}`);

const hMax = await mkEval('Máximo', ansMax, 'submissions/m.webm', 'Texto');
const maxRes = await tryq(() => as('authenticated', A.hr, async () => (await db.query(
  `SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL, $2::jsonb) AS r`,
  [hMax, JSON.stringify({ audio: { score: 5 }, writtenArguments: { score: 5 } })])).rows[0].r));
rec('T11c', 'Respostas máximas e 5/5 nos dois elementos dão 100.00', maxRes.ok && Number(maxRes.r.finalScore) === 100,
  maxRes.ok ? `score=${maxRes.r.finalScore}` : `ERRO: ${maxRes.err}`);
// Sem áudio e sem comentário: 10 do áudio são automáticos; o analisador decide os argumentos
const hN = await mkEval('Sem Nada', ansMedio, null, null);
const noDecision = await tryq(() => as('authenticated', A.hr, async () => db.query(
  `SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL, '{}'::jsonb)`, [hN])));
rec('N1', 'Sem comentário, a decisão do analisador é obrigatória', !noDecision.ok && /não escreveu comentário/.test(noDecision.err),
  noDecision.ok ? 'ACEITE (falha)' : `Recusado: ${noDecision.err}`);
const partial = await tryq(() => as('authenticated', A.hr, async () => db.query(
  `SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL, $2::jsonb)`, [hN, JSON.stringify({ writtenArguments: { score: 3 } })])));
rec('N2', 'Sem comentário, não há nota parcial (só 10 ou 0)', !partial.ok && /tudo ou nada/.test(partial.err),
  partial.ok ? 'ACEITE (falha)' : `Recusado: ${partial.err}`);
const fullDecision = await tryq(() => as('authenticated', A.hr, async () => (await db.query(
  `SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL, $2::jsonb) AS r`, [hN, JSON.stringify({ writtenArguments: { score: 5 } })])).rows[0].r));
rec('N3', 'Sem áudio e com 10 atribuídos pelo analisador: 62 + 10 + 10 = 82.00', fullDecision.ok && Number(fullDecision.r.finalScore) === 82 && Number(fullDecision.r.audioPoints) === 10,
  fullDecision.ok ? `score=${fullDecision.r.finalScore}` : `ERRO: ${fullDecision.err}`);

const prov2 = await tryq(() => as('authenticated', A.prov, async () => db.query(
  `SELECT public.calculate_and_finalize_evaluation($1::uuid, '{}'::jsonb, NULL, NULL, '{}'::jsonb)`, [hC])));
rec('T12', 'Prestador continua sem poder homologar', !prov2.ok, prov2.ok ? 'HOMOLOGOU (falha)' : `Recusado: ${prov2.err}`);
const overloads = (await db.query(`SELECT count(*)::int n FROM pg_proc WHERE proname='calculate_and_finalize_evaluation'`)).rows[0].n;
rec('T13', 'Existe uma única assinatura da função de homologação (sem ambiguidade no PostgREST)', overloads === 1, `assinaturas=${overloads}`);

// ---------- 22. Associação automática de empresa e equipa na submissão (migração 1003) ----------
await db.exec(`INSERT INTO public.teams (name, status) VALUES ('Equipa Luanda', 'ACTIVE'), ('Equipa Inativa', 'INACTIVE')`);
const teamOk = (await db.query(`SELECT id FROM public.teams WHERE name='Equipa Luanda'`)).rows[0].id;
const teamOff = (await db.query(`SELECT id FROM public.teams WHERE name='Equipa Inativa'`)).rows[0].id;
const cliAntigo = (await db.query(`SELECT id FROM public.clients WHERE company_name='Cliente Antigo'`)).rows[0].id;
const submitAs = (payload) => as('anon', '', async () => (await db.query(`SELECT public.submit_evaluation($1::jsonb) AS r`,
  [JSON.stringify({ serviceId: svc, satisfactionRating: 4, ...payload })])).rows[0].r.id);
const rowOf = async (id) => (await db.query(`SELECT client_id, client_name, team_id, team_name FROM public.evaluations WHERE id=$1`, [id])).rows[0];

const idA = await submitAs({ clientName: '  cliente  ANTIGO ', teamId: teamOk });
const rA = await rowOf(idA);
rec('AUTO1', 'Nome da empresa (sem diferenças de maiúsculas/espaços) associa automaticamente o cliente', rA.client_id === cliAntigo && rA.client_name === 'Cliente Antigo', `client_id=${rA.client_id}`);
rec('AUTO2', 'Equipa ativa é associada automaticamente à avaliação', rA.team_id === teamOk && rA.team_name === 'Equipa Luanda', `team=${rA.team_name}`);

const idB = await submitAs({ clientName: 'Empresa Desconhecida Lda', teamId: teamOk });
const rB = await rowOf(idB);
rec('AUTO3', 'Empresa que não existe na base de dados fica sem associação (não inventa cliente)', rB.client_id === null, `client_id=${rB.client_id}`);

const idC = await submitAs({ clientName: 'Cliente Antigo', teamId: teamOff });
const rC = await rowOf(idC);
rec('AUTO4', 'Equipa inativa não é associada', rC.team_id === null && rC.client_id === cliAntigo, `team_id=${rC.team_id}`);

// ---------- 23. Equipa e funcionário na submissão pública (migração 1005) ----------
await db.exec(`INSERT INTO public.providers (internal_code, name, professional_email, status, team_id) VALUES
  ('P2', 'Tec Dois', 'tec2@t.ao', 'ACTIVE', '${teamOk}'),
  ('P3', 'Tec Três', 'tec3@t.ao', 'ACTIVE', '${teamOff}')`);
await db.exec(`UPDATE public.providers SET team_id='${teamOk}' WHERE internal_code='P1'`);
await db.exec(`INSERT INTO public.teams (name, status) VALUES ('Equipa Solo', 'ACTIVE')`);
const teamSolo = (await db.query(`SELECT id FROM public.teams WHERE name='Equipa Solo'`)).rows[0].id;
await db.exec(`UPDATE public.providers SET team_id='${teamSolo}' WHERE internal_code='P3'`);
const pId = async (code) => (await db.query(`SELECT id FROM public.providers WHERE internal_code=$1`, [code])).rows[0].id;
const p1 = await pId('P1'), p2 = await pId('P2'), p3 = await pId('P3');
const pubTeams = (await as('anon', '', async () => (await db.query(`SELECT name FROM public.v_public_teams ORDER BY name`)).rows)).map(r => r.name);
rec('PT1', 'Formulário anónimo lê as equipas ativas (sem a tabela teams)', pubTeams.includes('Equipa Luanda') && !pubTeams.includes('Equipa Inativa'), `equipas=${pubTeams.join(',')}`);
const pubProv = await as('anon', '', async () => (await db.query(`SELECT public.list_public_team_providers($1::uuid) AS r`, [teamOk])).rows[0].r);
rec('PT2', 'Lista pública de prestadores da equipa só traz nomes (sem contactos)',
  pubProv.length === 2 && pubProv.every(x => Object.keys(x).sort().join() === 'id,name'), JSON.stringify(pubProv));
const idP1 = await submitAs({ clientName: 'Cliente Antigo', teamId: teamOk, providerId: p2 });
rec('PT3', 'Funcionário escolhido da equipa fica associado à avaliação', (await rowOf(idP1)) && (await db.query(`SELECT provider_id FROM public.evaluations WHERE id=$1`, [idP1])).rows[0].provider_id === p2, 'OK');
const idPA = await submitAs({ clientName: 'Cliente Antigo', teamId: teamSolo });
const provA = (await db.query(`SELECT provider_id FROM public.evaluations WHERE id=$1`, [idPA])).rows[0].provider_id;
rec('PT4', 'Equipa com um único prestador ativo associa-o automaticamente', provA === p3, `provider=${provA}`);
const idPB = await submitAs({ clientName: 'Cliente Antigo', teamId: teamOk });
const provB = (await db.query(`SELECT provider_id FROM public.evaluations WHERE id=$1`, [idPB])).rows[0].provider_id;
rec('PT5', 'Equipa com vários prestadores e sem escolha deixa o prestador por atribuir', provB === null, `provider=${provB}`);
const mismatch = await tryq(() => submitAs({ clientName: 'Cliente Antigo', teamId: teamOk, providerId: p3 }));
rec('PT6', 'Funcionário de outra equipa é recusado', !mismatch.ok && /não pertence à equipa/.test(mismatch.err), mismatch.ok ? 'ACEITE (falha)' : `Recusado: ${mismatch.err}`);
const anonTeamsTable = await tryq(() => as('anon', '', async () => db.query(`SELECT count(*)::int n FROM public.teams`)));
rec('PT7', 'Anónimo continua sem acesso à tabela teams', !anonTeamsTable.ok, anonTeamsTable.ok ? 'LEU (falha)' : `Recusado: ${anonTeamsTable.err}`);

// ---------- 24. Apagar cliente e importação em lote (clientes) ----------
const delC = (await db.query(`INSERT INTO public.clients (company_name, internal_code, status) VALUES ('Cliente Apagar','DEL-1','ACTIVE') RETURNING id`)).rows[0].id;
const delE = (await db.query(`INSERT INTO public.evaluations (client_id, client_name, client_name_input, service_name, satisfaction_rating) VALUES ($1,'Cliente Apagar','Cliente Apagar','Limpeza',4) RETURNING id`, [delC])).rows[0].id;
await db.query(`DELETE FROM public.clients WHERE id=$1`, [delC]);
const afterE = (await db.query(`SELECT client_id, client_name FROM public.evaluations WHERE id=$1`, [delE])).rows[0];
rec('DEL1', 'Apagar cliente mantém a avaliação no histórico, com o nome da empresa', afterE && afterE.client_id === null && afterE.client_name === 'Cliente Apagar',
  afterE ? `client_id=${afterE.client_id} nome=${afterE.client_name}` : 'avaliação perdida');

const batch40 = Array.from({ length: 40 }, (_, i) => `(${`'Lote ${i}'`}, ${`'LOT-${i}'`}, 'ACTIVE')`).join(',');
const okBatch = await tryq(() => db.exec(`INSERT INTO public.clients (company_name, internal_code, status) VALUES ${batch40}`));
const batchCount = (await db.query(`SELECT count(*)::int n FROM public.clients WHERE internal_code LIKE 'LOT-%'`)).rows[0].n;
rec('DEL2', 'Lote de 40 clientes é gravado num só pedido', okBatch.ok && batchCount === 40, `gravados=${batchCount}`);

const badBatch = await tryq(() => db.exec(`INSERT INTO public.clients (company_name, internal_code, status) VALUES ('Lote Dup X','DUP-1','ACTIVE'), ('Lote 0','DUP-2','ACTIVE')`));
const dupLeft = (await db.query(`SELECT count(*)::int n FROM public.clients WHERE internal_code LIKE 'DUP-%'`)).rows[0].n;
rec('DEL3', 'Lote com um nome duplicado é recusado por inteiro (sem dados parciais)', !badBatch.ok && dupLeft === 0, `recusado=${!badBatch.ok} parciais=${dupLeft}`);

// ---------- 25. Temas de conversa e mensagens marcadas (migração 1006) ----------
const gConv = g.r;
const dConv = d1.r;
const t1 = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.create_conversation_topic($1::uuid,'Auditoria Luanda') AS r`, [gConv])).rows[0].r));
const t2 = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.create_conversation_topic($1::uuid,'  auditoria LUANDA ') AS r`, [gConv])).rows[0].r));
rec('TM1', 'Membro cria tema numa conversa de grupo', t1.ok && !!t1.r, t1.ok ? `tema=${t1.r}` : `ERRO: ${t1.err}`);
rec('TM2', 'Tema com o mesmo nome (sem maiúsculas/espaços) não é duplicado', t2.ok && t2.r === t1.r, t2.ok ? `mesmo id=${t2.r === t1.r}` : `ERRO: ${t2.err}`);
const tOut = await tryq(() => as('authenticated', A.admin, async () => db.query(`SELECT public.create_conversation_topic($1::uuid,'Intruso')`, [gConv])));
rec('TM3', 'Quem não é membro não cria temas na conversa', !tOut.ok, tOut.ok ? 'ACEITE (falha)' : `Recusado: ${tOut.err}`);

const m1 = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.send_message($1::uuid,'Relatório de auditoria pronto', $2::uuid, true) AS r`, [gConv, t1.r])).rows[0].r));
const m1row = m1.ok ? (await db.query(`SELECT topic_id, important FROM public.messages WHERE id=$1`, [m1.r])).rows[0] : null;
rec('TM4', 'Mensagem fica guardada com o tema e marcada como importante', !!m1row && m1row.topic_id === t1.r && m1row.important === true,
  m1row ? `tema=${m1row.topic_id === t1.r} importante=${m1row.important}` : `ERRO: ${m1.err}`);

await tryq(() => as('authenticated', A.op, async () => db.query(`SELECT public.send_message($1::uuid,'Mensagem sem tema', NULL, false)`, [gConv])));
const byTopic = (await db.query(`SELECT count(*)::int n FROM public.messages WHERE conversation_id=$1 AND topic_id=$2`, [gConv, t1.r])).rows[0].n;
const noTopic = (await db.query(`SELECT count(*)::int n FROM public.messages WHERE conversation_id=$1 AND topic_id IS NULL`, [gConv])).rows[0].n;
rec('TM5', 'Filtro por tema separa as mensagens do tema das restantes', byTopic === 1 && noTopic >= 1, `com tema=${byTopic} sem tema=${noTopic}`);

const tOther = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.create_conversation_topic($1::uuid,'Tema direto') AS r`, [dConv])).rows[0].r));
const mCross = await tryq(() => as('authenticated', A.op, async () => db.query(`SELECT public.send_message($1::uuid,'Tema de outra conversa', $2::uuid, false)`, [gConv, tOther.r])));
rec('TM6', 'Não se pode marcar uma mensagem com tema de outra conversa', tOther.ok && !mCross.ok && /não pertence/.test(mCross.err),
  mCross.ok ? 'ACEITE (falha)' : `Recusado: ${mCross.err}`);

const today = new Date().toISOString().slice(0, 10);
const inRange = (await db.query(`SELECT count(*)::int n FROM public.messages WHERE conversation_id=$1 AND created_at >= now() - interval '1 day' AND created_at < now() + interval '1 day'`, [gConv])).rows[0].n;
const outRange = (await db.query(`SELECT count(*)::int n FROM public.messages WHERE conversation_id=$1 AND created_at >= now() + interval '1 day'`, [gConv])).rows[0].n;
rec('TM7', 'Filtro de datas devolve as mensagens do intervalo e exclui as fora dele', inRange >= 2 && outRange === 0, `dentro=${inRange} fora=${outRange} (${today})`);

// ---------- 26. Temas como conversas e histórico por membro (migração 1007) ----------
const tc = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.create_conversation_full('GROUP','Equipa Tema',$1::uuid[],'Auditoria Luanda') AS r`, [[A.hr]])).rows[0].r));
const tcTopic = tc.ok ? (await db.query(`SELECT topic FROM public.conversations WHERE id=$1`, [tc.r])).rows[0].topic : null;
rec('CT1', 'Tema criado com a conversa fica guardado como etiqueta', tc.ok && tcTopic === 'Auditoria Luanda', tc.ok ? `tema=${tcTopic}` : `ERRO: ${tc.err}`);
const setOk = await tryq(() => as('authenticated', A.hr, async () => db.query(`SELECT public.set_conversation_topic($1::uuid,'Relatório')`, [tc.r])));
const setNo = await tryq(() => as('authenticated', A.admin, async () => db.query(`SELECT public.set_conversation_topic($1::uuid,'Intruso')`, [tc.r])));
rec('CT2', 'Membro altera o tema; quem não é membro não consegue', setOk.ok && !setNo.ok, `membro=${setOk.ok} externo=${!setNo.ok}`);

const hg = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.create_conversation_full('GROUP','Histórico Teste',$1::uuid[],NULL) AS r`, [[B.ops]])).rows[0].r));
await tryq(() => as('authenticated', A.op, async () => db.query(`SELECT public.send_message($1::uuid,'MENSAGEM_ANTIGA')`, [hg.r])));
await tryq(() => new Promise(r => setTimeout(r, 1100)));
const addNoHist = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.add_group_members_v2($1::uuid,$2::uuid[],false) AS r`, [hg.r, [A.prov]])).rows[0].r));
await tryq(() => as('authenticated', A.op, async () => db.query(`SELECT public.send_message($1::uuid,'MENSAGEM_NOVA')`, [hg.r])));
const seenNoHist = await tryq(() => as('authenticated', A.prov, async () => (await db.query(`SELECT body FROM public.messages WHERE conversation_id=$1 ORDER BY created_at`, [hg.r])).rows.map(r => r.body)));
rec('HS1', 'Membro sem histórico só vê mensagens enviadas depois de entrar', addNoHist.ok && seenNoHist.ok && seenNoHist.r.join() === 'MENSAGEM_NOVA',
  seenNoHist.ok ? `vê=${seenNoHist.r.join('|')}` : `ERRO: ${seenNoHist.err}`);
const addWithHist = await tryq(() => as('authenticated', A.op, async () => (await db.query(`SELECT public.add_group_members_v2($1::uuid,$2::uuid[],true) AS r`, [hg.r, [A.admin]])).rows[0].r));
const seenWithHist = await tryq(() => as('authenticated', A.admin, async () => (await db.query(`SELECT body FROM public.messages WHERE conversation_id=$1 ORDER BY created_at`, [hg.r])).rows.map(r => r.body)));
rec('HS2', 'Membro com histórico partilhado vê também as mensagens anteriores', addWithHist.ok && seenWithHist.ok && seenWithHist.r.includes('MENSAGEM_ANTIGA') && seenWithHist.r.includes('MENSAGEM_NOVA'),
  seenWithHist.ok ? `vê=${seenWithHist.r.join('|')}` : `ERRO: ${seenWithHist.err}`);
const addByOther = await tryq(() => as('authenticated', B.ops, async () => db.query(`SELECT public.add_group_members_v2($1::uuid,$2::uuid[],true)`, [hg.r, [A.hr]])));
rec('HS3', 'Quem não criou o grupo não acrescenta membros', !addByOther.ok, addByOther.ok ? 'ACEITE (falha)' : `Recusado: ${addByOther.err}`);

// ---------- Resumo ----------
const falhas = R.filter(r => !r.ok);
console.log(`\nRESUMO: ${R.length - falhas.length}/${R.length} OK` + (falhas.length ? ` | Falhas: ${falhas.map(f => f.id).join(', ')}` : ''));
fs.writeFileSync(path.join(HERE, 'resultados.json'), JSON.stringify(R, null, 2));
if (falhas.length) process.exitCode = 1;

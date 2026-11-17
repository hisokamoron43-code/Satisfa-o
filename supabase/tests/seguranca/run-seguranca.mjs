import { PGlite } from '@electric-sql/pglite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] || path.resolve(here, '../../migrations');
const files = fs.readdirSync(dir).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
const db = new PGlite();
await db.exec(fs.readFileSync(path.join(here,'stubs.sql'),'utf8'));
for (const f of files) await db.exec(fs.readFileSync(`${dir}/${f}`,'utf8'));

const results = [];
const check = (name, ok, detail='') => { results.push({name, ok, detail}); console.log(ok ? 'PASSA ' : 'FALHA ', name, detail ? '— '+detail : ''); };
const errOf = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const as = async (uid, role) => {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '${uid||''}', false);`);
  if (role) await db.exec(`SET ROLE ${role};`);
};
const reset = () => db.exec(`RESET ROLE;`);

// ---------- Fixtures (como superutilizador) ----------
const ADMIN='00000000-0000-0000-0000-00000000000a', HR='00000000-0000-0000-0000-00000000000b', PROV='00000000-0000-0000-0000-00000000000c';
const TEAM='11111111-1111-1111-1111-111111111111', TEAM2='22222222-2222-2222-2222-222222222222';
const PROVR='33333333-3333-3333-3333-333333333333';
await db.exec(`
INSERT INTO auth.users (id,email) VALUES ('${ADMIN}','admin@t'),('${HR}','hr@t'),('${PROV}','prov@t');
INSERT INTO public.teams (id,name,code,status) VALUES ('${TEAM}','Equipa A','EA','ACTIVE'),('${TEAM2}','Equipa B','EB','ACTIVE');
INSERT INTO public.providers (id,name,status,team_id) VALUES ('${PROVR}','Técnico Um','ACTIVE','${TEAM}');
INSERT INTO public.profiles (id,name,email,role,active,must_change_password) VALUES
  ('${ADMIN}','Admin','admin@t','ADMIN',true,false),
  ('${HR}','RH','hr@t','HR',true,false),
  ('${PROV}','Prestador','prov@t','PROVIDER',true,false);
INSERT INTO public.clients (id,company_name,internal_code,status) VALUES ('44444444-4444-4444-4444-444444444444','Empresa Teste Lda','CLI-T1','ACTIVE');
INSERT INTO public.services (id,name,status) VALUES ('55555555-5555-5555-5555-555555555555','Limpeza','ACTIVE');
`);
await db.exec(`UPDATE public.profiles SET provider_id='${PROVR}' WHERE id='${PROV}';`);

const payload = (extra={}) => JSON.stringify({ clientName:'Empresa Teste Lda', serviceId:'55555555-5555-5555-5555-555555555555',
  teamId: TEAM, providerId: PROVR, satisfactionRating: 4, npsScore: 8, comment: 'Bom serviço', serviceDate: '2026-11-10',
  detailedAnswers:{}, questionsSnapshot:[], ...extra }).replace(/'/g,"''");

// ---------- VUL-07: submissão anónima ----------
await as('', 'anon');
await db.exec(`SELECT set_config('request.headers', '{"x-forwarded-for":"6.6.6.6, 10.0.0.1"}', false);`);
const sub1 = await db.query(`SELECT public.submit_evaluation('${payload()}'::jsonb) AS r`);
const evalId1 = sub1.rows[0].r.id;
await reset();
const ip = await db.query(`SELECT submitted_ip FROM public.evaluations WHERE id='${evalId1}'`);
check('VUL-07 IP usa o ÚLTIMO valor de X-Forwarded-For', ip.rows[0].submitted_ip === '10.0.0.1', `ip=${ip.rows[0].submitted_ip}`);

await as('', 'anon');
const dup = await errOf(() => db.query(`SELECT public.submit_evaluation('${payload()}'::jsonb)`));
await reset();
check('VUL-07 submissão duplicada recusada', !!dup && /já foi submetida/.test(dup), dup||'não recusada');

await as('', 'anon');
const big = await errOf(() => db.query(`SELECT public.submit_evaluation('${payload({detailedAnswers:{x:'a'.repeat(25000)}})}'::jsonb)`));
await reset();
check('VUL-07 detailedAnswers acima de 20 KB recusado', !!big && /excedem/.test(big), big||'aceite');

await as('', 'anon');
const ok2 = await errOf(() => db.query(`SELECT public.submit_evaluation('${payload({comment:'Outro comentário', satisfactionRating:2})}'::jsonb)`));
await reset();
check('VUL-07 submissão legítima diferente continua a funcionar', ok2===null, ok2||'');

// ---------- VUL-03: vistas públicas ----------
await as('', 'anon');
const vc = await errOf(() => db.query(`SELECT * FROM public.v_public_clients`));
const vp = await errOf(() => db.query(`SELECT * FROM public.v_public_providers`));
const vt = await errOf(() => db.query(`SELECT * FROM public.v_public_teams`));
const vs = await errOf(() => db.query(`SELECT * FROM public.v_public_services`));
const tp = await errOf(() => db.query(`SELECT public.list_public_team_providers('${TEAM}') AS r`));
await reset();
check('VUL-03 anónimo NÃO lê v_public_clients', !!vc && /permission denied/i.test(vc), vc||'lido');
check('VUL-03 anónimo NÃO lê v_public_providers', !!vp && /permission denied/i.test(vp), vp||'lido');
check('VUL-03 anónimo continua a ler equipas (formulário)', vt===null, vt||'');
check('VUL-03 anónimo continua a ler serviços (formulário)', vs===null, vs||'');
check('VUL-03 anónimo continua a listar prestadores da equipa escolhida', tp===null, tp||'');

// ---------- VUL-06: equipa inativa ----------
const before = await db.query(`SELECT public.list_public_team_providers('${TEAM}') AS r`);
await db.exec(`UPDATE public.teams SET status='INACTIVE' WHERE id='${TEAM}';`);
const after = await db.query(`SELECT public.list_public_team_providers('${TEAM}') AS r`);
await db.exec(`UPDATE public.teams SET status='ACTIVE' WHERE id='${TEAM}';`);
check('VUL-06 equipa ativa lista prestadores', before.rows[0].r.length===1, JSON.stringify(before.rows[0].r).slice(0,80));
check('VUL-06 equipa inativa NÃO lista prestadores', after.rows[0].r.length===0, JSON.stringify(after.rows[0].r));

// ---------- VUL-09: palavra-passe temporária bloqueia dados ----------
await db.exec(`UPDATE public.profiles SET must_change_password=true WHERE id='${HR}';`);
await as(HR, 'authenticated');
const hrBlocked = (await db.query(`SELECT count(*)::int AS n FROM public.clients`)).rows[0].n;
await reset();
await db.exec(`UPDATE public.profiles SET must_change_password=false WHERE id='${HR}';`);
await as(HR, 'authenticated');
const hrOk = (await db.query(`SELECT count(*)::int AS n FROM public.clients`)).rows[0].n;
await reset();
check('VUL-09 conta com palavra-passe temporária não lê clientes', hrBlocked===0, `linhas=${hrBlocked}`);
check('VUL-09 após trocar a palavra-passe, HR lê clientes', hrOk>0, `linhas=${hrOk}`);

// ---------- VUL-08: auditoria ----------
await as(PROV, 'authenticated');
const badOp = await errOf(() => db.query(`SELECT public.log_system_audit('DROP_ALL','x','1','SUCCESS','teste')`));
const goodOp = await errOf(() => db.query(`SELECT public.log_system_audit('update','Employee','1','SUCCESS','teste')`));
const longDet = await errOf(() => db.query(`SELECT public.log_system_audit('UPDATE','x','1','SUCCESS','${'z'.repeat(2000)}')`));
await reset();
check('VUL-08 tipo de operação fora da lista branca recusado', !!badOp && /não permitido/.test(badOp), badOp||'aceite');
check('VUL-08 operação válida gravada', goodOp===null, goodOp||'');
const det = await db.query(`SELECT length(details) AS n, user_email FROM public.audit_logs ORDER BY created_at DESC LIMIT 1`);
check('VUL-08 detalhes limitados a 500 caracteres e autor = utilizador autenticado', det.rows[0].n<=500 && det.rows[0].user_email==='prov@t', `len=${det.rows[0].n} autor=${det.rows[0].user_email}`);
await as(PROV, 'authenticated');
const noProfile = await errOf(() => db.query(`SELECT public.log_system_audit('UPDATE','x','1','SUCCESS','x')`));
await reset();
await db.exec(`UPDATE public.profiles SET active=false WHERE id='${PROV}';`);
await as(PROV, 'authenticated');
const inactiveLog = await errOf(() => db.query(`SELECT public.log_system_audit('UPDATE','x','1','SUCCESS','x')`));
await reset();
await db.exec(`UPDATE public.profiles SET active=true WHERE id='${PROV}';`);
check('VUL-08 conta desativada não consegue escrever auditoria', !!inactiveLog, inactiveLog||'aceite');

// ---------- VUL-02: imutabilidade e transições ----------
// Avaliação A (pendente) e B (homologada, simulada pela RPC de homologação como superutilizador)
const evalA = evalId1;
const evalB = (await db.query(`SELECT public.submit_evaluation('${payload({comment:'Para homologar', satisfactionRating:5, npsScore:9})}'::jsonb) AS r`)).rows[0].r.id;
await db.exec(`UPDATE public.evaluations SET finalized_at=now(), finalized_by='teste', status='REVIEWED', technical_score=80, final_classification='POSITIVE' WHERE id='${evalB}';`);

await as(HR, 'authenticated');
const e1 = await errOf(() => db.query(`UPDATE public.evaluations SET provider_id=NULL WHERE id='${evalB}'`));
const e2 = await errOf(() => db.query(`UPDATE public.evaluations SET technical_score=100 WHERE id='${evalB}'`));
const e3 = await errOf(() => db.query(`DELETE FROM public.evaluations WHERE id='${evalB}'`));
const e4 = await errOf(() => db.query(`UPDATE public.evaluations SET status='APPROVED' WHERE id='${evalB}'`));
const e5 = await errOf(() => db.query(`UPDATE public.evaluations SET corrective_action_status='IN_PROGRESS' WHERE id='${evalB}'`));
const e6 = await errOf(() => db.query(`UPDATE public.evaluations SET status='PENDING_REVIEW' WHERE id='${evalB}'`));
const e7 = await errOf(() => db.query(`UPDATE public.evaluations SET status='ARCHIVED' WHERE id='${evalB}'`));
const e8 = await errOf(() => db.query(`UPDATE public.evaluations SET status='REVIEWED' WHERE id='${evalB}'`));
const e9 = await errOf(() => db.query(`UPDATE public.evaluations SET provider_id=NULL WHERE id='${evalA}'`));
await reset();
check('VUL-02 homologada: provider_id NÃO pode mudar', !!e1 && /imutável/.test(e1), e1||'aceite');
check('VUL-02 homologada: technical_score NÃO pode mudar', !!e2 && /imutável/.test(e2), e2||'aceite');
const stillThere = (await db.query(`SELECT count(*)::int n FROM public.evaluations WHERE id='${evalB}'`)).rows[0].n;
const stillThereAsSuper = null;
check('VUL-02 homologada: não pode ser eliminada (RLS sem DELETE; linha mantém-se)', (!!e3 && /não pode ser eliminada/.test(e3)) || stillThere===1, e3||`linhas=${stillThere}`);
check('VUL-02 homologada: estado pode mudar (REVIEWED→APPROVED)', e4===null, e4||'');
check('VUL-02 homologada: ação corretiva pode mudar', e5===null, e5||'');
check('VUL-02 homologada: não pode voltar a PENDING_REVIEW', !!e6 && /pendente/.test(e6), e6||'aceite');
check('VUL-02 homologada: pode ser arquivada', e7===null, e7||'');
check('VUL-02 arquivada: não pode mudar de estado', !!e8 && /arquivada/.test(e8), e8||'aceite');
check('VUL-02 avaliação NÃO homologada: provider_id continua editável pelo RH', e9===null, e9||'');

// ---------- VUL-01: revisão só por RPC ----------
await as(HR, 'authenticated');
const r1 = await errOf(() => db.query(`SELECT public.update_evaluation_review('${evalA}', 2, NULL, NULL, NULL, '')`));
const r2 = await errOf(() => db.query(`SELECT public.update_evaluation_review('${evalA}', 2, NULL, NULL, NULL, 'Cliente reportou atraso no serviço')`));
const r3 = await errOf(() => db.query(`SELECT public.update_evaluation_review('${evalB}', 1, NULL, NULL, NULL, 'Tentativa de alterar homologada')`));
const r4 = await errOf(() => db.query(`SELECT public.update_evaluation_review('${evalB}', NULL, NULL, NULL, 'RESOLVED', '')`));
await reset();
const aRow = (await db.query(`SELECT satisfaction_rating FROM public.evaluations WHERE id='${evalA}'`)).rows[0];
const audit = (await db.query(`SELECT count(*)::int n FROM public.audit_logs WHERE record_id='${evalA}' AND details LIKE '%Justificação: Cliente%'`)).rows[0].n;
check('VUL-01 alteração sem justificação recusada', !!r1 && /justificação/.test(r1), r1||'aceite');
check('VUL-01 alteração com justificação gravada', r2===null && aRow.satisfaction_rating===2, r2||`csat=${aRow.satisfaction_rating}`);
check('VUL-01 registo de auditoria com justificação criado', audit>=1, `registos=${audit}`);
check('VUL-01 alteração de feedback em homologada recusada', !!r3 && /imutável/.test(r3), r3||'aceite');
check('VUL-01 RPC respeita o arquivo: avaliação ARQUIVADA não muda de estado', !!r4 && /arquivada/.test(r4), r4||'aceite');

await as(PROV, 'authenticated');
const r5 = await errOf(() => db.query(`SELECT public.update_evaluation_review('${evalA}', 1, NULL, NULL, NULL, 'tentativa do prestador')`));
await reset();
check('VUL-01 prestador NÃO pode rever avaliações', !!r5 && /Acesso negado/.test(r5), r5||'aceite');

// ---------- VUL-10: quota de áudio ----------
await as('', 'anon');
const up1 = await errOf(() => db.query(`INSERT INTO storage.objects (bucket_id,name) VALUES ('evaluation-audio','submissions/a.webm')`));
const up2 = await errOf(() => db.query(`INSERT INTO storage.objects (bucket_id,name) VALUES ('evaluation-audio','outra/pasta.webm')`));
await reset();
check('VUL-10 upload anónimo válido permitido', up1===null, up1||'');
check('VUL-10 caminho fora de submissions/ recusado', !!up2, up2||'aceite');
await db.exec(`INSERT INTO storage.objects (bucket_id,name) SELECT 'evaluation-audio','submissions/x'||g FROM generate_series(1,2000) g;`);
await as('', 'anon');
const up3 = await errOf(() => db.query(`INSERT INTO storage.objects (bucket_id,name) VALUES ('evaluation-audio','submissions/depois.webm')`));
await reset();
check('VUL-10 acima de 2000 ficheiros/dia recusado', !!up3, up3||'aceite');

const falhas = results.filter(r=>!r.ok);
console.log(`\nRESUMO: ${results.length-falhas.length}/${results.length} testes passaram`);
await db.close();
process.exit(falhas.length?1:0);

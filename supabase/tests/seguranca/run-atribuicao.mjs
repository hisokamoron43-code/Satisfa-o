import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const dir=new URL('../../migrations', import.meta.url).pathname;
const db=new PGlite();
await db.exec(fs.readFileSync(new URL('./stubs.sql', import.meta.url).pathname,'utf8'));
for (const f of fs.readdirSync(dir).filter(f=>/^\d{4}_.*\.sql$/.test(f)).sort()) await db.exec(fs.readFileSync(`${dir}/${f}`,'utf8'));
const U={ADM:'00000000-0000-0000-0000-00000000000a',HR:'00000000-0000-0000-0000-00000000000b',P1:'00000000-0000-0000-0000-00000000000c'};
const T1='11111111-1111-1111-1111-111111111111',T2='22222222-2222-2222-2222-222222222222',PR1='33333333-3333-3333-3333-333333333333',PR2='33333333-3333-3333-3333-333333333344',S1='55555555-5555-5555-5555-555555555555';
await db.exec(`
INSERT INTO auth.users (id,email) VALUES ('${U.ADM}','adm@t'),('${U.HR}','hr@t'),('${U.P1}','p1@t');
INSERT INTO public.teams (id,name,code,status) VALUES ('${T1}','Equipa Delta','EQ-DELTA','ACTIVE'),('${T2}','Equipa Ômega','EQ-OM','ACTIVE');
INSERT INTO public.providers (id,name,status,team_id) VALUES ('${PR1}','Técnico Um','ACTIVE','${T1}'),('${PR2}','Técnico Dois','ACTIVE','${T2}');
INSERT INTO public.profiles (id,name,email,role,active,must_change_password,provider_id) VALUES ('${U.ADM}','Admin','adm@t','ADMIN',true,false,NULL),('${U.HR}','RH','hr@t','HR',true,false,NULL),('${U.P1}','P1','p1@t','PROVIDER',true,false,'${PR1}');
INSERT INTO public.clients (id,company_name,internal_code,status) VALUES ('44444444-4444-4444-4444-444444444444','Empresa Teste Lda','CLI-T1','ACTIVE');
INSERT INTO public.services (id,name,status) VALUES ('${S1}','Limpeza','ACTIVE');`);
const as=async(uid,role,aal='aal1')=>{ await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`,[uid]); await db.query(`SELECT set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:uid,aal})]); await db.exec(`SET ROLE ${role}`); };
const reset=()=>db.exec('RESET ROLE');
const sub=async(staff,extra={})=>{ await db.exec('SET ROLE anon'); const r=await db.query(`SELECT public.submit_evaluation($1::jsonb) AS r`,[JSON.stringify({clientName:'Empresa Teste Lda',serviceId:S1,satisfactionRating:4,comment:'Teste '+Math.random(),serviceDate:'2026-11-10',detailedAnswers:{},questionsSnapshot:[],staffNameInput:staff,...extra})]); await reset(); return r.rows[0].r.id; };
const out=[];
const ok=(n,c,d='')=>out.push(`${c?'PASSA':'FALHA'} ${n}${d?' - '+d:''}`);
// 1) texto exato de funcionário -> sugestão de funcionário e equipa; NÃO associa
const e1=await sub('técnico um');
let r=(await db.query(`SELECT team_id, provider_id, suggested_team_id, suggested_provider_id, staff_name_input, attribution_confirmed FROM public.evaluations WHERE id='${e1}'`)).rows[0];
ok('A1 nome de funcionário (sem acentos/maiúsculas) gera sugestão', r.suggested_provider_id===PR1 && r.suggested_team_id===T1, `sug_prov=${r.suggested_provider_id===PR1}`);
ok('A2 sem confirmação, a avaliação NÃO fica associada', r.team_id===null && r.provider_id===null && r.attribution_confirmed===false);
// 2) nome de equipa -> sugestão só de equipa
const e2=await sub('Equipa Omega');
r=(await db.query(`SELECT suggested_team_id, suggested_provider_id FROM public.evaluations WHERE id='${e2}'`)).rows[0];
ok('A3 nome de equipa (com acento diferente) sugere a equipa', r.suggested_team_id===T2 && r.suggested_provider_id===null);
// 3) ambiguidade -> sem sugestão
await db.exec(`INSERT INTO public.providers (id,name,status,team_id) VALUES (gen_random_uuid(),'Técnico Gémeo','ACTIVE','${T1}'),(gen_random_uuid(),'Técnico Gemeo','ACTIVE','${T1}')`);
const e3=await sub('Tecnico Gemeo');
r=(await db.query(`SELECT suggested_provider_id FROM public.evaluations WHERE id='${e3}'`)).rows[0];
ok('A4 nomes ambíguos não geram sugestão', r.suggested_provider_id===null);
// 4) identificadores enviados pelo cliente são ignorados quando há texto livre
const e4=await sub('Técnico Dois',{teamId:T1,providerId:PR1});
r=(await db.query(`SELECT team_id, provider_id, suggested_provider_id FROM public.evaluations WHERE id='${e4}'`)).rows[0];
ok('A5 cliente não consegue impor equipa/funcionário por ID', r.team_id===null && r.provider_id===null && r.suggested_provider_id===PR2);
// 5) homologação recusada sem confirmação
await as(U.HR,'authenticated','aal1');
let err=null; try { await db.query(`UPDATE public.evaluations SET finalized_at=now(), status='REVIEWED' WHERE id='${e1}'`); } catch(x){ err=x.message; }
await reset();
ok('A6 homologação bloqueada sem associação confirmada', !!err && /Confirme/.test(err), err?err.slice(0,80):'aceite');
// 6) prestador não confirma
await as(U.P1,'authenticated');
let e6=null; try { await db.query(`SELECT public.confirm_evaluation_attribution('${e1}',NULL,'${PR1}')`); } catch(x){ e6=x.message; }
await reset();
ok('A7 prestador não confirma a associação', !!e6, e6?e6.slice(0,60):'aceite');
// 7) RH confirma com funcionário -> equipa derivada
await as(U.HR,'authenticated');
await db.query(`SELECT public.confirm_evaluation_attribution('${e1}',NULL,'${PR1}')`);
await reset();
r=(await db.query(`SELECT team_id, provider_id, attribution_confirmed, team_name FROM public.evaluations WHERE id='${e1}'`)).rows[0];
ok('A8 RH confirma funcionário e equipa é derivada', r.provider_id===PR1 && r.team_id===T1 && r.attribution_confirmed===true && r.team_name==='Equipa Delta', `equipa=${r.team_name}`);
// 8) depois de confirmado, homologação passa o guarda
await as(U.HR,'authenticated');
let err8=null; try { await db.query(`UPDATE public.evaluations SET finalized_at=now(), status='REVIEWED' WHERE id='${e1}'`); } catch(x){ err8=x.message; }
await reset();
ok('A9 homologação permitida após confirmação', err8===null, err8||'');
// 9) avaliações antigas (com equipa e funcionário escolhidos) continuam homologáveis
const legacy=await sub(undefined,{teamId:T2,providerId:PR2});
await as(U.HR,'authenticated');
let errL=null; try { await db.query(`UPDATE public.evaluations SET finalized_at=now(), status='REVIEWED' WHERE id='${legacy}'`); } catch(x){ errL=x.message; }
await reset();
ok('A10 avaliação com equipa/funcionário explícito (fluxo antigo) continua homologável', errL===null, errL||'');
// 10) sem texto e sem equipa -> ainda permitido na submissão (fluxo antigo sem associação)
const noStaff=await sub(undefined);
r=(await db.query(`SELECT staff_name_input FROM public.evaluations WHERE id='${noStaff}'`)).rows[0];
ok('A11 submissão sem texto de funcionário continua a ser aceite', !!noStaff && r.staff_name_input===null);
// 11) RH não consegue confirmar uma avaliação já homologada
await as(U.HR,'authenticated');
let e11=null; try { await db.query(`SELECT public.confirm_evaluation_attribution('${e1}',NULL,'${PR2}')`); } catch(x){ e11=x.message; }
await reset();
ok('A12 associação de avaliação homologada não pode ser alterada', !!e11 && /homologada/.test(e11), e11?e11.slice(0,70):'aceite');
console.log(out.join('\n'));
console.log(`RESUMO: ${out.filter(x=>x.startsWith('PASSA')).length}/${out.length}`);
await db.close();

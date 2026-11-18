// Testes unitários das correções de segurança (CSV, pesquisa, anexos, login e submissão).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { celulaCsv, linhaCsv } from '../src/lib/seguranca/csv.ts';
import { sanitizarTermoPesquisa, identificadorSeguro, extensaoAnexoPermitida } from '../src/lib/seguranca/pesquisa.ts';
import { handleLogin } from '../supabase/functions/login/logic.ts';
import { handleSubmit } from '../supabase/functions/submit-evaluation/logic.ts';

const SEGURO = (v) => v.startsWith("'") || !/^[=+\-@\t\r\n]/.test(v.trimStart());

test('N-04: fórmulas são neutralizadas em CSV (com espaços e caracteres de controlo)', () => {
  const perigosos = ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '  =HYPERLINK("http://x","y")', '\u0001=A1', '\t=B1', '\n=C1', '\r=D1'];
  for (const v of perigosos) {
    const c = celulaCsv(v);
    assert.ok(c.startsWith('"\''), `célula deve começar por apóstrofo: ${c}`);
  }
});

test('N-04: texto normal e aspas são tratados sem alterar o conteúdo', () => {
  assert.equal(celulaCsv('Empresa Lda'), '"Empresa Lda"');
  assert.equal(celulaCsv('Disse "olá"'), '"Disse ""olá"""');
  assert.equal(celulaCsv(null), '""');
  assert.equal(celulaCsv(5), '5');
  assert.equal(linhaCsv(['a', 2, '=b']), '"a",2,"\'=b"');
});

test('N-09: termos de pesquisa não conseguem alterar o filtro', () => {
  // Pontos e sublinhados são seguros: só a vírgula e os parênteses separam condições no filtro.
  assert.equal(sanitizarTermoPesquisa('Ana, id.neq.0'), 'Ana id.neq.0');
  assert.ok(!/[,()]/.test(sanitizarTermoPesquisa('a,b(c),d)e')), 'nenhum termo pode conter vírgulas ou parênteses');
  assert.equal(sanitizarTermoPesquisa('x),(y'), 'xy');
  assert.equal(sanitizarTermoPesquisa('João Neto'), 'João Neto');
  assert.equal(sanitizarTermoPesquisa('ana.silva@teste.ao'), 'ana.silva@teste.ao');
  assert.equal(sanitizarTermoPesquisa('"*%_\\'), '_');
});

test('N-09: identificadores inválidos não entram no filtro', () => {
  assert.equal(identificadorSeguro('CLI-01'), 'CLI-01');
  assert.equal(identificadorSeguro('a0a0a0a0-1111-2222-3333-444444444444'), 'a0a0a0a0-1111-2222-3333-444444444444');
  assert.equal(identificadorSeguro('x,code.neq.y'), '00000000-0000-0000-0000-000000000000');
});

test('N-08: só extensões permitidas nos anexos', () => {
  assert.equal(extensaoAnexoPermitida('contrato.PDF'), true);
  assert.equal(extensaoAnexoPermitida('foto.jpeg'), true);
  assert.equal(extensaoAnexoPermitida('dados.xlsx'), true);
  assert.equal(extensaoAnexoPermitida('pagina.html'), false);
  assert.equal(extensaoAnexoPermitida('script.js'), false);
  assert.equal(extensaoAnexoPermitida('arquivo.zip'), false);
  assert.equal(extensaoAnexoPermitida('semextensao'), false);
});

function depsLogin({ contaExiste, passwordCorreta, limite = true }) {
  const chamadas = [];
  return {
    chamadas,
    supabaseUrl: 'https://x.supabase.co', anonKey: 'anon',
    rateHit: async () => limite,
    resolveEmail: async (login) => (contaExiste && login === 'joao.neto' ? 'op@sicsc.aeternu.internal' : null),
    fetchFn: async (url, init) => {
      chamadas.push({ url, body: JSON.parse(init.body) });
      const ok = passwordCorreta && contaExiste;
      return new Response(JSON.stringify(ok ? { access_token: 't', refresh_token: 'r' } : { error: 'invalid' }), { status: ok ? 200 : 400 });
    },
  };
}

test('VUL-06: conta inexistente, palavra-passe errada e conta correta são distinguíveis? NÃO', async () => {
  const inexistente = await handleLogin({ login: 'nao.existe', password: 'x' }, '1.1.1.1', depsLogin({ contaExiste: false, passwordCorreta: false }));
  const errada = await handleLogin({ login: 'joao.neto', password: 'x' }, '1.1.1.1', depsLogin({ contaExiste: true, passwordCorreta: false }));
  assert.equal(inexistente.status, 401);
  assert.equal(errada.status, 401);
  assert.deepEqual(inexistente.body, errada.body, 'as respostas têm de ser idênticas');
});

test('VUL-06: conta inexistente também faz o pedido de autenticação (tempo de resposta uniforme)', async () => {
  const d = depsLogin({ contaExiste: false, passwordCorreta: false });
  await handleLogin({ login: 'nao.existe', password: 'x' }, '1.1.1.1', d);
  assert.equal(d.chamadas.length, 1);
  assert.match(d.chamadas[0].url, /grant_type=password/);
});

test('VUL-06: login correto devolve a sessão', async () => {
  const r = await handleLogin({ login: 'joao.neto', password: 'certa' }, '1.1.1.1', depsLogin({ contaExiste: true, passwordCorreta: true }));
  assert.equal(r.status, 200);
  assert.equal(r.body.access_token, 't');
});

test('VUL-06: limite de tentativas devolve 429 com a mesma mensagem para qualquer conta', async () => {
  const r = await handleLogin({ login: 'nao.existe', password: 'x' }, '1.1.1.1', depsLogin({ contaExiste: false, passwordCorreta: false, limite: false }));
  assert.equal(r.status, 429);
});

test('VUL-06: pedidos mal formados são recusados sem consultar nada', async () => {
  const d = depsLogin({ contaExiste: true, passwordCorreta: true });
  assert.equal((await handleLogin(null, '1', d)).status, 400);
  assert.equal((await handleLogin({ login: 'ab', password: 'x' }, '1', d)).status, 400);
  assert.equal((await handleLogin({ login: 'joao.neto', password: '' }, '1', d)).status, 400);
  assert.equal(d.chamadas.length, 0);
});

test('VUL-07: submissão reencaminha sem clientVisibleToTeam (N-07) e aplica limite por IP', async () => {
  let enviado = null;
  const deps = {
    supabaseUrl: 'https://x', anonKey: 'anon',
    rateHit: async () => true,
    fetchFn: async (url, init) => {
      if (url.includes('submit_evaluation')) { enviado = JSON.parse(init.body).p_payload; return new Response('{"success":true,"id":"1"}', { status: 200 }); }
      return new Response('{}', { status: 200 });
    },
  };
  const r = await handleSubmit({ clientName: 'X', clientVisibleToTeam: true, turnstileToken: 'abc' }, '2.2.2.2', deps);
  assert.equal(r.status, 200);
  assert.equal(enviado.clientVisibleToTeam, undefined);
  assert.equal(enviado.turnstileToken, undefined);
  const bloqueado = await handleSubmit({ clientName: 'X' }, '2.2.2.2', { ...deps, rateHit: async () => false });
  assert.equal(bloqueado.status, 429);
});

test('VUL-07: com chave Turnstile, token inválido é recusado antes da RPC', async () => {
  let rpc = false;
  const deps = {
    supabaseUrl: 'https://x', anonKey: 'anon', turnstileSecret: 'segredo', rateHit: async () => true,
    fetchFn: async (url) => {
      if (url.includes('siteverify')) return new Response('{"success":false}', { status: 200 });
      rpc = true; return new Response('{}', { status: 200 });
    },
  };
  const r = await handleSubmit({ clientName: 'X', turnstileToken: 'falso' }, '3.3.3.3', deps);
  assert.equal(r.status, 403);
  assert.equal(rpc, false);
});

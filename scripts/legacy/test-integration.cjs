/**
 * Automated End-to-End Test Suite for SICSC — AETERNU
 * Live Supabase Database Integration Tests
 */

const { createClient } = require('@supabase/supabase-js');

const rawUrl = process.env.VITE_SUPABASE_URL || 'https://xvomfgzzqelupkjdlirn.supabase.co';
const SUPABASE_URL = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_0vNwewGK0vMm8l-XmyWVfQ_Q456p-en';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function assert(condition, message) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

async function runIntegrationTests() {
  console.log('===============================================================');
  console.log('SICSC — AETERNU: RELATÓRIO DE TESTES AUTOMATIZADOS SUPABASE');
  console.log(`Endpoint: ${SUPABASE_URL}`);
  console.log(`Data/Hora: ${new Date().toISOString()}`);
  console.log('===============================================================\n');

  const testReport = {
    test1_valid_submission: false,
    test2_empty_fields_rejection: false,
    test3_rls_policies: false,
    test4_duplicate_handling: false,
    created_records: [],
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Submissão Válida e Consulta Pós-Gravação com Integridade de Chaves
    // -------------------------------------------------------------------------
    console.log('[TESTE 1] Iniciando teste de submissão válida completa...');

    // 1.1 Obter ou verificar existência de cliente, serviço e técnico válidos
    const { data: clients, error: clientErr } = await supabase.from('clients').select('id, company_name').limit(1);
    assert(!clientErr && clients && clients.length > 0, 'Deve existir pelo menos um cliente para teste com chave estrangeira');
    const testClient = clients[0];

    const { data: services, error: serviceErr } = await supabase.from('services').select('id, name').limit(1);
    assert(!serviceErr && services && services.length > 0, 'Deve existir pelo menos um serviço para teste com chave estrangeira');
    const testService = services[0];

    const { data: providers, error: provErr } = await supabase.from('providers').select('id, name').limit(1);
    assert(!provErr && providers && providers.length > 0, 'Deve existir pelo menos um prestador para teste com chave estrangeira');
    const testProvider = providers[0];

    // 1.2 Submeter avaliação com integridade de dados e metadados
    const testRef = `AVAL-TEST-${Date.now()}`;
    const commentMetadata = [
      '[Serviços Selecionados]: Higiene e Desinfeção Hospitalar, Controlo de Pragas',
      '[Empresa Avaliadora]: ' + testClient.company_name,
      '[Técnico/Prestador]: ' + testProvider.name,
      '[Registo de Áudio]: Anexo de voz gravado pelo cliente (24s)',
      '',
      'Avaliação técnica de satisfação: equipa muito profissional e rigorosa no cumprimento dos padrões HST.'
    ].join('\n');

    const payload = {
      reference: testRef,
      client_id: testClient.id,
      service_id: testService.id,
      provider_id: testProvider.id,
      service_date: '2026-10-22',
      evaluation_date: '2026-10-22',
      satisfaction_rating: 5,
      nps_score: 10,
      comment: commentMetadata,
      status: 'PENDING_REVIEW',
      requires_follow_up: false,
      corrective_action_status: 'NOT_NEEDED',
    };

    const startTime = Date.now();
    const { data: inserted, error: insertErr } = await supabase
      .from('evaluations')
      .insert(payload)
      .select('id, reference, satisfaction_rating, nps_score, created_at')
      .single();

    const insertLatency = Date.now() - startTime;
    assert(!insertErr, `Erro ao inserir avaliação válida: ${insertErr?.message}`);
    assert(inserted && inserted.id, 'Registo inserido deve retornar ID UUID');
    assert(inserted.reference === testRef, 'Referência retornada deve ser idêntica');

    testReport.created_records.push(inserted.id);
    console.log(`  ✓ Submissão inserida no Supabase com sucesso em ${insertLatency}ms.`);
    console.log(`    UUID: ${inserted.id} | Referência: ${inserted.reference}`);

    // 1.3 Consultar novamente o registo na base de dados com JOIN de chaves estrangeiras
    const queryStartTime = Date.now();
    const { data: queried, error: queryErr } = await supabase
      .from('evaluations')
      .select('*, clients(company_name), services(name), providers(name)')
      .eq('id', inserted.id)
      .single();

    const queryLatency = Date.now() - queryStartTime;
    assert(!queryErr, `Erro ao consultar avaliação inserida: ${queryErr?.message}`);
    assert(queried.satisfaction_rating === 5, 'Rating de satisfação recuperado deve ser 5');
    assert(queried.nps_score === 10, 'NPS score recuperado deve ser 10');
    assert(queried.clients?.company_name === testClient.company_name, 'Join com tabela clients deve recuperar nome correcto da empresa');
    assert(queried.services?.name === testService.name, 'Join com tabela services deve recuperar nome correcto do serviço');
    assert(queried.providers?.name === testProvider.name, 'Join com tabela providers deve recuperar nome do técnico');
    assert(queried.comment.includes('Registo de Áudio'), 'Comentário deve conter metadados de áudio e campos preenchidos');

    console.log(`  ✓ Consulta pós-gravação (com JOIN clients, services, providers) validada em ${queryLatency}ms.`);
    console.log(`    Cliente Associado: "${queried.clients?.company_name}"`);
    console.log(`    Serviço Associado: "${queried.services?.name}"`);
    console.log(`    Prestador Associado: "${queried.providers?.name}"`);
    testReport.test1_valid_submission = true;

    // -------------------------------------------------------------------------
    // TEST 2: Rejeição de Submissões Inválidas (Campos Obrigatórios e Valores Fora de Limite)
    // -------------------------------------------------------------------------
    console.log('\n[TESTE 2] Iniciando teste de rejeição de campos obrigatórios vazios...');

    // 2.1 Sem referência (coluna NOT NULL)
    const { error: missingRefErr } = await supabase.from('evaluations').insert({
      satisfaction_rating: 4,
      nps_score: 8
    });
    assert(missingRefErr && missingRefErr.code === '23502', `Esperado erro 23502 (NOT NULL reference), recebido: ${missingRefErr?.code}`);
    console.log(`  ✓ Submissão sem referência obrigatória rejeitada pelo PostgreSQL: ${missingRefErr.message}`);

    // 2.2 Rating inválido (fora do intervalo 1-5, e.g. 0 ou 7)
    const { error: invalidRatingErr } = await supabase.from('evaluations').insert({
      reference: `INV-RAT-${Date.now()}`,
      satisfaction_rating: 7,
      nps_score: 9
    });
    assert(invalidRatingErr, 'Submissão com rating fora de 1-5 deve ser rejeitada pela restrição/RLS');
    console.log(`  ✓ Submissão com rating inválido (7) rejeitada: Código ${invalidRatingErr.code} - ${invalidRatingErr.message}`);

    // 2.3 NPS score inválido (fora do intervalo 0-10, e.g. 15)
    const { error: invalidNpsErr } = await supabase.from('evaluations').insert({
      reference: `INV-NPS-${Date.now()}`,
      satisfaction_rating: 4,
      nps_score: 15
    });
    assert(invalidNpsErr, 'Submissão com NPS fora de 0-10 deve ser rejeitada');
    console.log(`  ✓ Submissão com NPS inválido (15) rejeitada: Código ${invalidNpsErr.code} - ${invalidNpsErr.message}`);

    testReport.test2_empty_fields_rejection = true;

    // -------------------------------------------------------------------------
    // TEST 3: Verificação Rigorosa das Permissões RLS
    // -------------------------------------------------------------------------
    console.log('\n[TESTE 3] Iniciando validação das políticas RLS no Supabase...');

    // 3.1 Anon key pode INSERIR avaliações com valores conformes (satisfaction 1-5, nps 0-10)
    const anonRef = `AVAL-ANON-${Date.now()}`;
    const { data: anonInsert, error: anonErr } = await supabase.from('evaluations').insert({
      reference: anonRef,
      satisfaction_rating: 4,
      nps_score: 9,
      comment: 'Teste público anónimo de satisfação'
    }).select('id, reference').single();

    assert(!anonErr, `Cliente anónimo deve conseguir inserir avaliação legítima: ${anonErr?.message}`);
    testReport.created_records.push(anonInsert.id);
    console.log(`  ✓ Permissão RLS INSERT para anónimo: Concedida com sucesso (ID: ${anonInsert.id})`);

    // 3.2 Anon key pode CONSULTAR avaliações (SELECT permitido)
    const { data: anonRead, error: readErr } = await supabase
      .from('evaluations')
      .select('id, reference')
      .eq('reference', anonRef)
      .single();
    assert(!readErr && anonRead && anonRead.reference === anonRef, 'Cliente anónimo deve conseguir consultar avaliação');
    console.log(`  ✓ Permissão RLS SELECT para anónimo: Concedida com sucesso.`);

    // 3.3 Anon key NÃO PODE APAGAR avaliações (DELETE bloqueado por ausência de política DELETE)
    const { data: delAttempt } = await supabase
      .from('evaluations')
      .delete()
      .eq('id', anonInsert.id)
      .select();

    assert(!delAttempt || delAttempt.length === 0, 'Tentativa de DELETE por anónimo deve resultar em 0 linhas eliminadas devido a RLS');
    console.log(`  ✓ Proteção RLS contra DELETE não-autorizado: Bloqueado (0 linhas apagadas). Registos são imutáveis.`);

    testReport.test3_rls_policies = true;

    // -------------------------------------------------------------------------
    // TEST 4: Tentativa de Duplicação de Identificador / Chave Única
    // -------------------------------------------------------------------------
    console.log('\n[TESTE 4] Iniciando teste de prevenção contra duplicações...');

    // Tentativa de submeter exactamente a mesma referência já existente
    const { error: dupErr } = await supabase.from('evaluations').insert({
      reference: testRef, // Mesma referência criada no Teste 1
      satisfaction_rating: 4,
      nps_score: 8,
      comment: 'Tentativa duplicada'
    });

    assert(dupErr && dupErr.code === '23505', `Esperado código 23505 de violação de chave única, recebido: ${dupErr?.code}`);
    console.log(`  ✓ Duplicação prevenida pelo PostgreSQL (Código: ${dupErr.code} - ${dupErr.message})`);

    testReport.test4_duplicate_handling = true;

    // -------------------------------------------------------------------------
    // RESULTADO FINAL
    // -------------------------------------------------------------------------
    console.log('\n===============================================================');
    console.log('TODOS OS 4 TESTES DE INTEGRAÇÃO PASSARAM COM SUCESSO (100% OK)');
    console.log('===============================================================');
    console.log(`1. Submissão Válida e Consulta Pós-Gravação: PASSOU`);
    console.log(`2. Rejeição de Dados Inválidos/Obrigatórios: PASSOU`);
    console.log(`3. Validação de RLS (Leitura, Escrita, Restrição DELETE): PASSOU`);
    console.log(`4. Prevenção de Duplicações (Chave Única): PASSOU`);
    console.log('===============================================================\n');

  } catch (err) {
    console.error('\n[ERRO DURANTE OS TESTES]', err.message);
    process.exit(1);
  }
}

runIntegrationTests();

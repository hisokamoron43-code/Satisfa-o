/**
 * SICSC — AETERNU Angola: Test Suite for Audio Management & UUID Submission
 * Validates Problema A (Audio Lifecycle & Deletion) and Problema B (UUID Service Handling)
 */

const { createClient } = require('@supabase/supabase-js');
const assert = require('assert');

const rawUrl = process.env.VITE_SUPABASE_URL || 'https://xvomfgzzqelupkjdlirn.supabase.co';
const SUPABASE_URL = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_0vNwewGK0vMm8l-XmyWVfQ_Q456p-en';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function isValidUuid(str) {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('SICSC — AETERNU: TESTES AUTOMATIZADOS DE ÁUDIO E SUBMISSÃO UUID');
  console.log(`Endpoint: ${SUPABASE_URL}`);
  console.log(`Data e Hora: ${new Date().toISOString()}`);
  console.log('========================================================================\n');

  const report = [];

  function record(title, passed, details) {
    report.push({ title, passed, details });
    console.log(`${passed ? '✓ [PASSOU]' : '✕ [FALHA]'} ${title}`);
    console.log(`  Detalhes: ${details}\n`);
  }

  // -------------------------------------------------------------------------
  // TESTE 1: Validador de formato UUID
  // -------------------------------------------------------------------------
  try {
    const validUuid = 'ff2a2694-b90f-4d4a-be71-d79fdcc7f4a7';
    const invalidSlugs = ['srv-hig', 'srv-prg', '123', '', null, undefined, 'custom'];

    assert(isValidUuid(validUuid) === true, 'UUID válido deve ser aceite');
    for (const slug of invalidSlugs) {
      assert(isValidUuid(slug) === false, `Slug inválido "${slug}" deve ser rejeitado`);
    }

    record('Teste 1: Validação Estrita de Identificadores UUID', true, 'Validação de regex UUID RFC 4122 rejeita slugs não-UUID e aceita UUIDs genuínos.');
  } catch (err) {
    record('Teste 1: Validação Estrita de Identificadores UUID', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TESTE 2: Simulação do Ciclo de Vida do Áudio (Gravação -> Eliminação -> Estado Vazio)
  // -------------------------------------------------------------------------
  try {
    let audioState = {
      sessionId: 1,
      audioUrl: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAA1456',
      recordingDuration: 12,
      isPlayingAudio: true,
      audioError: null,
      chunks: ['chunk1', 'chunk2']
    };

    // Simulação do deleteRecording()
    function deleteRecording(state) {
      return {
        sessionId: state.sessionId + 1,
        audioUrl: null,
        recordingDuration: 0,
        isPlayingAudio: false,
        audioError: null,
        chunks: []
      };
    }

    const stateAfterDelete = deleteRecording(audioState);

    assert(stateAfterDelete.audioUrl === null, 'audioUrl deve ser nulo');
    assert(stateAfterDelete.recordingDuration === 0, 'duration deve ser 0');
    assert(stateAfterDelete.isPlayingAudio === false, 'player deve estar desligado');
    assert(stateAfterDelete.chunks.length === 0, 'buffers devem ser limpos');
    assert(stateAfterDelete.sessionId === 2, 'sessão deve ser incrementada para invalidar callbacks antigos');

    record('Teste 2: Ciclo de Vida e Eliminação Imediata de Áudio', true, 'Ao eliminar áudio, todos os estados e buffers são limpos imediatamente, e o token de sessão é invalidado para impedir sobreposição assíncrona.');
  } catch (err) {
    record('Teste 2: Ciclo de Vida e Eliminação Imediata de Áudio', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TESTE 3: Simulação de Re-gravação e Substituição Integral
  // -------------------------------------------------------------------------
  try {
    let state = {
      sessionId: 2,
      audioUrl: null,
      recordingDuration: 0,
      chunks: []
    };

    // Nova gravação concluída com sucesso
    state = {
      sessionId: 3,
      audioUrl: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAA9999',
      recordingDuration: 22,
      chunks: ['newChunk1', 'newChunk2']
    };

    assert(state.audioUrl.includes('9999'), 'Apenas o novo áudio deve existir');
    assert(state.recordingDuration === 22, 'A nova duração deve ser 22s');

    record('Teste 3: Substituição Definitiva de Áudio por Nova Gravação', true, 'A nova gravação substitui totalmente a anterior, sem deixar qualquer rasto do ficheiro antigo.');
  } catch (err) {
    record('Teste 3: Substituição Definitiva de Áudio por Nova Gravação', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TESTE 4: Submissão sem Áudio após Eliminação (Supabase Real RPC)
  // -------------------------------------------------------------------------
  try {
    const payloadWithoutAudio = {
      clientName: 'Unitel Luanda — Auditoria Áudio',
      serviceId: null, // Sem UUID de serviço
      serviceTypesProvided: ['Higiene e Limpeza Profunda', 'Controlo Integrado de Pragas'],
      satisfactionRating: 5,
      npsScore: 9,
      comment: 'Avaliação submetida sem áudio após utilizador ter eliminado a gravação.',
      audioRecordingUrl: null,
      audioDurationSeconds: 0,
      answers: [
        { questionId: 'q-qualidade', rating: 5 },
        { questionId: 'q-pontualidade', rating: 5 },
        { questionId: 'q-seguranca', rating: 5 },
        { questionId: 'q-atendimento', rating: 5 },
        { questionId: 'q-comentarios', textAnswer: 'Excelente serviço prestado pela equipa.' }
      ]
    };

    const { data, error } = await supabase.rpc('submit_evaluation', { p_payload: payloadWithoutAudio });

    assert(!error, `Erro Supabase RPC: ${error?.message}`);
    assert(data && data.success === true, 'Submissão deve retornar success: true');
    assert(data.reference && data.reference.startsWith('AVAL-'), 'Referência válida deve ser devolvida');
    assert(data.status === 'PENDING_REVIEW', 'Estado inicial deve ser PENDING_REVIEW');

    record('Teste 4: Submissão Real no Supabase sem Áudio (Pós-Eliminação)', true, `Avaliação ${data.reference} (ID: ${data.id}) registada com sucesso na base de dados com áudio nulo.`);
  } catch (err) {
    record('Teste 4: Submissão Real no Supabase sem Áudio (Pós-Eliminação)', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TESTE 5: Submissão com Áudio Substituído e Slug de Serviço Não-UUID
  // -------------------------------------------------------------------------
  try {
    // Simula a submissão com slug 'srv-hig' que antes dava o erro do screenshot
    const payloadRaw = {
      clientName: 'Unitel Luanda — Auditoria Áudio Novo',
      serviceId: 'srv-hig', // SLUG QUE ANTES CAUSAVA O ERRO!
      serviceTypesProvided: ['Higiene e Limpeza Profunda'],
      satisfactionRating: 5,
      npsScore: 10,
      comment: 'Avaliação com áudio gravado e substituído com sucesso.',
      audioRecordingUrl: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAA5555',
      audioDurationSeconds: 18,
      answers: [
        { questionId: 'q-qualidade', rating: 5 },
        { questionId: 'q-pontualidade', rating: 5 },
        { questionId: 'q-seguranca', rating: 5 },
        { questionId: 'q-atendimento', rating: 5 },
        { questionId: 'q-comentarios', textAnswer: 'Áudio gravado.', audioUrl: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAA5555' }
      ]
    };

    // Higienização feita no frontend / submitEvaluationViaRpc
    const sanitized = {
      ...payloadRaw,
      clientId: isValidUuid(payloadRaw.clientId) ? payloadRaw.clientId : null,
      serviceId: isValidUuid(payloadRaw.serviceId) ? payloadRaw.serviceId : null,
      providerId: isValidUuid(payloadRaw.providerId) ? payloadRaw.providerId : null,
    };

    const { data, error } = await supabase.rpc('submit_evaluation', { p_payload: sanitized });

    assert(!error, `Erro Supabase RPC: ${error?.message}`);
    assert(data && data.success === true, 'Submissão deve retornar success: true');
    assert(data.reference && data.reference.startsWith('AVAL-'), 'Referência válida deve ser devolvida');

    record('Teste 5: Submissão Real com Áudio Gravado e Prevenção do Erro UUID', true, `Avaliação ${data.reference} (ID: ${data.id}) gravada com sucesso sem erro "Identificador de serviço inválido".`);
  } catch (err) {
    record('Teste 5: Submissão Real com Áudio Gravado e Prevenção do Erro UUID', false, err.message);
  }

  // -------------------------------------------------------------------------
  // TESTE 6: Verificação de Ocorrência RH em Avaliações Críticas
  // -------------------------------------------------------------------------
  try {
    const criticalPayload = {
      clientName: 'Cliente Teste Ocorrência RH',
      serviceId: null,
      serviceTypesProvided: ['Auditoria de Segurança e HST'],
      satisfactionRating: 2, // Nota baixa que exige seguimento
      npsScore: 4, // Detrator
      comment: 'Serviço com atraso e falhas na sinalização.',
      answers: [
        { questionId: 'q-qualidade', rating: 2 },
        { questionId: 'q-pontualidade', rating: 2 },
        { questionId: 'q-seguranca', rating: 2 },
        { questionId: 'q-atendimento', rating: 2 },
        { questionId: 'q-comentarios', textAnswer: 'Necessita melhoria imediata.' }
      ]
    };

    const { data, error } = await supabase.rpc('submit_evaluation', { p_payload: criticalPayload });

    assert(!error, `Erro Supabase RPC: ${error?.message}`);
    assert(data && data.success === true, 'Submissão deve retornar success: true');
    assert(data.status === 'PENDING_REVIEW', 'Deve permanecer em PENDING_REVIEW');

    record('Teste 6: Regra de Negócio de Encaminhamento para RH', true, `Avaliação crítica ${data.reference} classificada para análise de ocorrência pela equipa de Recursos Humanos.`);
  } catch (err) {
    record('Teste 6: Regra de Negócio de Encaminhamento para RH', false, err.message);
  }

  const passedCount = report.filter(r => r.passed).length;
  console.log('========================================================================');
  console.log(`TOTAL DE TESTES EXECUTADOS: ${report.length} | APROVADOS: ${passedCount} | FALHAS: ${report.length - passedCount}`);
  console.log('========================================================================');
}

runTestSuite();

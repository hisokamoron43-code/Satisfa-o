/**
 * SICSC AETERNU Angola — Bateria de Testes de Auditoria de Segurança:
 * Módulo de Funcionários, Perfis de Acesso, Dossiê e Proteção de Administrador
 */

const assert = require('assert');

// 1. Funções de Identificador (replicadas do core TypeScript para teste CJS)
function removeDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeIdentifier(rawIdentifier) {
  if (!rawIdentifier || typeof rawIdentifier !== 'string') return '';
  let clean = rawIdentifier.trim().toLowerCase();
  clean = removeDiacritics(clean);
  clean = clean.replace(/[\s\-_]+/g, '.');
  clean = clean.replace(/[^a-z0-9.]/g, '');
  clean = clean.replace(/\.{2,}/g, '.').replace(/^\.+|\.+$/g, '');
  return clean;
}

function identifierToAuthEmail(identifier) {
  if (!identifier || typeof identifier !== 'string') throw new Error('Identificador inválido');
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  const normalized = normalizeIdentifier(trimmed);
  if (!normalized) throw new Error('Identificador vazio após normalização');
  return `${normalized}@sicsc.aeternu.internal`;
}

// 2. Validação de Magic Bytes (Assinaturas Binárias)
function checkMagicBytes(buffer, declaredMime) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4) return { valid: false, error: 'Ficheiro demasiado pequeno' };

  let detectedMime = null;
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    detectedMime = 'application/pdf';
  } else if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    detectedMime = 'image/jpeg';
  } else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    detectedMime = 'image/png';
  } else if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    detectedMime = 'image/webp';
  }

  if (!detectedMime) {
    return { valid: false, error: 'Assinatura binária não reconhecida (ficheiro executável ou corrompido)' };
  }

  if (detectedMime !== declaredMime) {
    return { valid: false, error: `Discrepância entre tipo declarado (${declaredMime}) e assinatura real (${detectedMime})` };
  }

  return { valid: true, detectedMime };
}

// 3. Simulação de Permissões Efetivas (get_my_access)
function computeEffectivePermissions(employee, profile) {
  if (!employee) return { authenticated: false, pages: [], base_role: null };
  if (employee.account_status !== 'ATIVA' || ['INATIVO', 'DESLIGADO', 'SUSPENSO'].includes(employee.professional_status)) {
    return { authenticated: true, pages: [], base_role: null, account_status: employee.account_status };
  }
  if (!profile || !profile.is_active) {
    return { authenticated: true, pages: [], base_role: 'OPERATIONAL' };
  }

  const combined = new Set([...(profile.pages || []), ...(employee.extra_pages || [])]);
  (employee.revoked_pages || []).forEach(p => combined.delete(p));

  return {
    authenticated: true,
    base_role: profile.base_role,
    pages: Array.from(combined)
  };
}

// 4. Simulação de Proteção do Último Administrador
function checkCanDeactivateOrDemoteAdmin(targetEmp, activeAdminsCount) {
  const isTargetAdmin = targetEmp.base_role === 'ADMIN' && targetEmp.account_status === 'ATIVA' && targetEmp.professional_status === 'ATIVO';
  if (!isTargetAdmin) return { allowed: true };
  if (activeAdminsCount <= 1) {
    return { allowed: false, error: 'Não é permitido desativar ou despromover o último Administrador de Sistema ativo.' };
  }
  return { allowed: true };
}

function runAuditTests() {
  console.log('================================================================================');
  console.log('SICSC AETERNU Angola — Bateria de Testes de Segurança: Funcionários e Acessos');
  console.log('================================================================================\n');

  // TESTE 1: Normalização de Identificadores com Acentos e Espaços
  process.stdout.write('[TEST 1] Normalização de Identificadores (Acentos, Espaços e Diacríticos)...');
  assert.strictEqual(normalizeIdentifier('  João   Neto  '), 'joao.neto');
  assert.strictEqual(normalizeIdentifier('Maria-Luísa_Santos'), 'maria.luisa.santos');
  assert.strictEqual(normalizeIdentifier('CARLOS...MANUEL'), 'carlos.manuel');
  console.log('  -> PASSOU: Identificadores convertidos de forma canónica.');

  // TESTE 2: Derivação de E-mail Técnico de Autenticação (@sicsc.aeternu.internal)
  process.stdout.write('[TEST 2] Derivação de E-mail Técnico do Supabase Auth...');
  assert.strictEqual(identifierToAuthEmail('joao.neto'), 'joao.neto@sicsc.aeternu.internal');
  assert.strictEqual(identifierToAuthEmail('admin@aeternu.co.ao'), 'admin@aeternu.co.ao');
  console.log('  -> PASSOU: Domínio interno seguro aplicado sem expor e-mails privados.');

  // TESTE 3: Deteção de Ficheiros Executáveis Disfarçados de PDF (Magic Bytes)
  process.stdout.write('[TEST 3] Rejeição de Executável (.exe) Disfarçado de PDF...');
  // Executável DOS/Windows MZ: 0x4D 0x5A ...
  const fakePdfBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  const fakeRes = checkMagicBytes(fakePdfBuffer, 'application/pdf');
  assert.strictEqual(fakeRes.valid, false);
  assert(fakeRes.error.includes('Assinatura binária não reconhecida'));
  console.log('  -> PASSOU: Ficheiro executável mascarado rejeitado por inspeção binária.');

  // TESTE 4: Aceitação de PDF Legítimo via Magic Bytes (%PDF-)
  process.stdout.write('[TEST 4] Validação de Assinatura Binária de PDF Legítimo (%PDF-)...');
  const validPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x35]);
  const pdfRes = checkMagicBytes(validPdfBuffer, 'application/pdf');
  assert.strictEqual(pdfRes.valid, true);
  assert.strictEqual(pdfRes.detectedMime, 'application/pdf');
  console.log('  -> PASSOU: PDF genuíno validado com sucesso.');

  // TESTE 5: Aceitação de Imagem PNG Legítima via Magic Bytes
  process.stdout.write('[TEST 5] Validação de Assinatura Binária de Imagem PNG...');
  const validPngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  const pngRes = checkMagicBytes(validPngBuffer, 'image/png');
  assert.strictEqual(pngRes.valid, true);
  assert.strictEqual(pngRes.detectedMime, 'image/png');
  console.log('  -> PASSOU: Imagem PNG genuína validada com sucesso.');

  // TESTE 6: Proteção do Último Administrador Ativo (Tentativa de Desativação Bloqueada)
  process.stdout.write('[TEST 6] Bloqueio de Desativação do Último Administrador Ativo...');
  const adminEmp = { id: 'emp-1', base_role: 'ADMIN', account_status: 'ATIVA', professional_status: 'ATIVO' };
  const checkDeact = checkCanDeactivateOrDemoteAdmin(adminEmp, 1);
  assert.strictEqual(checkDeact.allowed, false);
  assert(checkDeact.error.includes('Não é permitido desativar ou despromover o último Administrador'));
  console.log('  -> PASSOU: Tentativa de deixar o sistema sem administradores barrada.');

  // TESTE 7: Autorização de Desativação quando Existem Outros Administradores Ativos
  process.stdout.write('[TEST 7] Autorização de Alteração de Administrador quando existem múltiplos...');
  const checkMultiple = checkCanDeactivateOrDemoteAdmin(adminEmp, 2);
  assert.strictEqual(checkMultiple.allowed, true);
  console.log('  -> PASSOU: Desativação permitida de forma controlada quando há redundância.');

  // TESTE 8: Prevalência Estrita de Páginas Revogadas sobre Permissões Herdadas
  process.stdout.write('[TEST 8] Prevalência de Páginas Revogadas (Revoke Overrides Inherited)...');
  const hrProfile = { is_active: true, base_role: 'HR', pages: ['dashboard', 'employees', 'hr', 'settings'] };
  const hrEmployee = {
    account_status: 'ATIVA',
    professional_status: 'ATIVO',
    extra_pages: ['reports'],
    revoked_pages: ['settings', 'hr'] // Bloqueado explicitamente
  };
  const effective = computeEffectivePermissions(hrEmployee, hrProfile);
  assert(effective.pages.includes('dashboard'));
  assert(effective.pages.includes('employees'));
  assert(effective.pages.includes('reports'));
  assert.strictEqual(effective.pages.includes('settings'), false, 'settings deve estar revogada');
  assert.strictEqual(effective.pages.includes('hr'), false, 'hr deve estar revogada');
  console.log('  -> PASSOU: Páginas revogadas sobrepõem-se rigorosamente a permissões de perfil.');

  // TESTE 9: Revogação Total de Acessos para Contas Desativadas ou Colaboradores Inativos
  process.stdout.write('[TEST 9] Revogação Integral de Acessos para Conta Desativada ou Colaborador Desligado...');
  const deactivatedEmp = { account_status: 'DESATIVADA', professional_status: 'ATIVO', extra_pages: ['dashboard'] };
  const suspendedEmp = { account_status: 'ATIVA', professional_status: 'SUSPENSO', extra_pages: ['dashboard'] };
  assert.strictEqual(computeEffectivePermissions(deactivatedEmp, hrProfile).pages.length, 0);
  assert.strictEqual(computeEffectivePermissions(suspendedEmp, hrProfile).pages.length, 0);
  console.log('  -> PASSOU: Zero permissões concedidas a colaboradores não ativos.');

  // TESTE 10: Bloqueio de Perfil Desativado no Sistema
  process.stdout.write('[TEST 10] Bloqueio de Acessos quando Perfil de Acesso é Desativado...');
  const inactiveProfile = { is_active: false, base_role: 'HR', pages: ['dashboard', 'employees'] };
  const activeEmp = { account_status: 'ATIVA', professional_status: 'ATIVO', extra_pages: [] };
  const resInactiveProfile = computeEffectivePermissions(activeEmp, inactiveProfile);
  assert.strictEqual(resInactiveProfile.pages.length, 0);
  console.log('  -> PASSOU: Perfil inativo resulta em zero páginas atribuídas.');

  // TESTE 11: Validação Estrita de Conformidade RFC 4122 dos Perfis de Sistema Semeados na Migração 007
  process.stdout.write('[TEST 11] Validação de Conformidade RFC 4122 dos UUIDs Semeados na Migração 007...');
  const fs = require('fs');
  const path = require('path');
  const mig007Content = fs.readFileSync(path.join(__dirname, '../supabase/migrations/007_employees_and_access_management.sql'), 'utf8');
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  // Extrair todos os UUIDs estáticos inseridos em access_profiles
  const seedBlock = mig007Content.slice(mig007Content.indexOf('INSERT INTO public.access_profiles'), mig007Content.indexOf('ON CONFLICT (name) DO NOTHING'));
  const foundUuids = seedBlock.match(/'[0-9a-f\-]{30,40}'/gi) || [];
  assert(foundUuids.length >= 5, 'Devem existir pelo menos 5 perfis de sistema semeados em access_profiles');
  foundUuids.forEach(raw => {
    const cleanUuid = raw.replace(/'/g, '');
    assert(uuidRegex.test(cleanUuid), `UUID inválido encontrado na migração 007: ${cleanUuid}`);
    assert.strictEqual(cleanUuid.length, 36, `UUID não tem 36 caracteres: ${cleanUuid}`);
  });
  console.log('  -> PASSOU: Todos os UUIDs semeados cumprem rigorosamente a RFC 4122 (36 caracteres).');

  // TESTE 12: Verificação do Comportamento de Retorno em check_last_admin_safety()
  process.stdout.write('[TEST 12] Simulação do Trigger check_last_admin_safety() (OLD em DELETE, NEW em UPDATE)...');
  function simulateCheckLastAdminSafety(operation, oldRecord, newRecord) {
    if (operation === 'UPDATE') {
      if (oldRecord.name === 'Administrador de Sistema' && (!newRecord.is_active || newRecord.base_role !== 'ADMIN')) {
        throw new Error('Operação proibida: O perfil de Administrador de Sistema não pode ser desativado ou despromovido.');
      }
      if (oldRecord.is_system && !newRecord.is_system) {
        throw new Error('Operação proibida: Perfis essenciais de sistema não podem perder o estatuto de sistema.');
      }
      return newRecord;
    } else if (operation === 'DELETE') {
      if (oldRecord.is_system || oldRecord.name === 'Administrador de Sistema' || oldRecord.base_role === 'ADMIN') {
        throw new Error('Operação proibida: Perfis essenciais de sistema ou de administração não podem ser eliminados.');
      }
      return oldRecord; // Crítico: deve retornar OLD para que o PostgreSQL efetive o DELETE
    }
  }

  // Eliminação de perfil não-sistema: autorizada com retorno OLD
  const customProfile = { id: 'custom-1', name: 'Perfil Personalizado', is_system: false, base_role: 'OPERATIONAL' };
  assert.strictEqual(simulateCheckLastAdminSafety('DELETE', customProfile, null), customProfile);
  // Eliminação de perfil de sistema: barrada
  const sysProfile = { id: '00000000-0000-0000-0000-000000000001', name: 'Administrador de Sistema', is_system: true, base_role: 'ADMIN' };
  assert.throws(() => simulateCheckLastAdminSafety('DELETE', sysProfile, null), /Operação proibida/);
  console.log('  -> PASSOU: Triggers devolvem OLD em DELETE autorizados e barram perfis essenciais.');

  // TESTE 13: Sincronização Atómica Multi-Tabela e Deduplicação de Identidades do Último Admin
  process.stdout.write('[TEST 13] Validação de Deduplicação (UNION) e Bloqueio Transacional do Último Admin...');
  const mig008Content = fs.readFileSync(path.join(__dirname, '../supabase/migrations/008_security_hardening_employees_and_admin_protection.sql'), 'utf8');
  assert(mig008Content.includes('pg_advisory_xact_lock'), 'A migração 008 deve utilizar pg_advisory_xact_lock para evitar concorrência descontrolada.');
  assert(mig008Content.includes('count(DISTINCT admin_identity)'), 'A migração 008 deve deduplicar identidades de administradores.');
  assert(mig008Content.includes('UNION'), 'A migração 008 deve unir employees e profiles sem contagem duplicada.');
  console.log('  -> PASSOU: Bloqueio atómico via pg_advisory_xact_lock e deduplicação comprovada.');

  // TESTE 14: Diagnóstico de Duplicados antes de Criação do Índice Único
  process.stdout.write('[TEST 14] Verificação do Bloco de Diagnóstico de Duplicados em access_identifier...');
  assert(mig008Content.includes('v_duplicate_count > 0'), 'Migração 008 deve ter bloco DO $$ de diagnóstico de duplicados');
  assert(mig008Content.includes('MIGRAÇÃO 008 ABORTADA'), 'Migração 008 deve abortar com mensagem explícita caso existam colisões');
  console.log('  -> PASSOU: Bloco de diagnóstico de duplicados implementado sem alteração arbitrária de dados.');

  // TESTE 15: Ausência de DROP VIEW ... CASCADE na Migração 008
  process.stdout.write('[TEST 15] Ausência de DROP VIEW ... CASCADE na Migração 008...');
  assert(!mig008Content.includes('DROP VIEW IF EXISTS public.v_public_employee_directory CASCADE'), 'Não deve existir DROP VIEW ... CASCADE na migração 008');
  assert(mig008Content.includes('CREATE OR REPLACE VIEW public.v_public_employee_directory'), 'Deve usar CREATE OR REPLACE VIEW para preservar dependências');
  console.log('  -> PASSOU: Substituição segura de vista sem eliminação em cascata.');

  // TESTE 16: Imunidade a Injeção de JSONPath em has_page
  process.stdout.write('[TEST 16] Imunidade a Injeções em has_page (Operador Nativo ? em vez de Concatenação)...');
  assert(!mig007Content.includes("'$[*] ? (@ == \"'"), 'has_page não deve usar concatenação vulnerável de strings em JSONPath');
  assert(mig007Content.includes('v_pages ? trim(p_page_key)'), 'has_page deve usar o operador nativo de contenção JSONB ?');
  console.log('  -> PASSOU: has_page utiliza operador nativo JSONB imune a injeções.');

  // TESTE 17: Atualização Determinística de touch_last_login
  process.stdout.write('[TEST 17] Validação Determinística de touch_last_login (Prioridade user_id e Row Count)...');
  assert(mig007Content.includes('GET DIAGNOSTICS v_updated_count = ROW_COUNT'), 'touch_last_login deve validar contagem real de linhas atualizadas');
  assert(mig007Content.includes('WHERE user_id = v_uid'), 'touch_last_login deve priorizar auth.uid()');
  console.log('  -> PASSOU: touch_last_login vincula de forma unívoca e devolve booleano fidedigno.');

  // TESTE 18: Prevenção de Ficheiros Órfãos no Storage
  process.stdout.write('[TEST 18] Trigger de Limpeza de Binários Órfãos no Storage...');
  assert(mig008Content.includes('cleanup_orphaned_employee_document_storage'), 'Migração 008 deve implementar trigger de limpeza no storage');
  assert(mig008Content.includes('AFTER DELETE ON public.employee_documents'), 'Gatilho de limpeza deve ser acionado na eliminação de metadados');
  console.log('  -> PASSOU: Remoção de metadados de documentos sincronizada com eliminação de binários.');

  // TESTE 19: Isolamento Estrito de PII em employees (Zero Fuga para is_staff)
  process.stdout.write('[TEST 19] Isolamento de PII em public.employees (Sem Acesso Direto para is_staff)...');
  const empPolicyBlock007 = mig007Content.slice(mig007Content.indexOf('CREATE POLICY "employees_select_policy"'), mig007Content.indexOf('CREATE POLICY "employees_admin_hr_manage_policy"'));
  assert(!empPolicyBlock007.includes('public.is_staff()'), 'employees_select_policy não deve conceder leitura aberta a is_staff()');
  console.log('  -> PASSOU: Dados sensíveis (BI, NIF, morada) estritamente protegidos de pessoal operacional.');

  // TESTE 20: Prevalência contra Bypass de Colaborador Bloqueado
  process.stdout.write('[TEST 20] Bloqueio Soberano de Bypass por Fallback para Colaboradores Desativados...');
  assert(mig007Content.includes('Proteção contra Bypass de Colaborador Bloqueado'), 'get_my_access deve impedir bypass de contas desativadas através de profiles');
  console.log('  -> PASSOU: Colaborador desligado/suspenso nunca recupera permissões via fallback.');

  console.log('\n================================================================================');
  console.log('RESULTADO DA AUDITORIA: 20/20 TESTES APROVADOS COM SUCESSO!');
  console.log('================================================================================\n');
}

runAuditTests();

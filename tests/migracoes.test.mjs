// Verificações estáticas das migrações (não precisam de base de dados).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
// Remove comentários de linha para não confundir texto explicativo com SQL executável
const semComentarios = (sql) => sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

test('1020: não faz UPDATE em avaliações existentes (as homologadas são imutáveis)', () => {
  const sql = semComentarios(ler('1020_atribuicao_por_confirmacao.sql'));
  // O UPDATE dentro de confirm_evaluation_attribution (função) é permitido; um UPDATE solto no topo não.
  const foraDeFuncoes = sql.replace(/\$\$[\s\S]*?\$\$/g, '');
  assert.ok(!/UPDATE\s+public\.evaluations/i.test(foraDeFuncoes), 'UPDATE solto em public.evaluations na 1020');
  assert.match(sql, /attribution_confirmed boolean NOT NULL DEFAULT true/i);
  assert.match(sql, /ALTER COLUMN attribution_confirmed SET DEFAULT false/i);
});

test('1022: a re-homologação exige motivo e guarda o histórico', () => {
  const sql = semComentarios(ler('1022_rehomologacao_com_motivo.sql'));
  assert.match(sql, /length\(v_reason\) < 10/);
  assert.match(sql, /INSERT INTO public\.evaluation_homologations/);
  assert.match(sql, /CHECK \(length\(btrim\(superseded_reason\)\) >= 10\)/);
  assert.match(sql, /v_role NOT IN \('ADMIN', 'HR'\)/);
  assert.match(sql, /txid_current\(\)/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.evaluation_homologations/);
});

test('1021: protege a configuração do login', () => {
  const sql = semComentarios(ler('1021_reposicao_configuracao_login.sql'));
  assert.match(sql, /BEFORE TRUNCATE ON public\.login_settings/);
  assert.match(sql, /BEFORE DELETE ON public\.login_settings/);
});

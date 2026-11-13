-- ============================================================================
-- 1010 — Limpar perguntas e categorias pré-definidas do formulário
-- Executar DEPOIS da 1009, no SQL Editor do Supabase (ou via CLI).
--
-- O que faz:
--   1. Apaga TODAS as perguntas do formulário (form_questions).
--   2. Apaga as ligações serviço <-> categoria (service_categories).
--   3. Apaga TODAS as categorias do formulário (form_categories).
--   4. Desliga os critérios/pesos do RH das categorias apagadas (category_code = NULL).
--
-- O que NÃO apaga:
--   - Avaliações já submetidas e respetivas respostas (guardam o seu próprio
--     questions_snapshot, por isso o histórico continua legível).
--   - Os pesos do RH (evaluation_criteria) e o limiar de aprovação: apenas ficam sem categoria.
--   - Clientes, serviços, prestadores, equipas, funcionários e utilizadores.
--
-- Idempotente: pode ser executada mais do que uma vez.
-- ============================================================================

BEGIN;

DELETE FROM public.service_categories;
DELETE FROM public.form_questions;
DELETE FROM public.form_categories;

UPDATE public.evaluation_criteria SET category_code = NULL WHERE category_code IS NOT NULL;

-- Verificação (devem ser todos 0):
SELECT
  (SELECT count(*) FROM public.form_questions)     AS perguntas_restantes,
  (SELECT count(*) FROM public.form_categories)    AS categorias_restantes,
  (SELECT count(*) FROM public.service_categories) AS ligacoes_restantes;

COMMIT;

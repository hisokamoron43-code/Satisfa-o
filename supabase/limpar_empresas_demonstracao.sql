-- Remove da base de dados as 5 empresas de demonstração (se existirem).
-- NÃO faz parte das migrações: corre-se à mão no SQL Editor do Supabase, passo a passo.
-- Só apaga empresas que NÃO têm avaliações associadas; as restantes ficam listadas para decidires.

-- PASSO 1 — Ver o que existe (só leitura)
SELECT c.id, c.company_name, c.internal_code,
       (SELECT count(*) FROM public.evaluations e WHERE e.client_id = c.id) AS avaliacoes_associadas
FROM public.clients c
WHERE (c.internal_code, c.company_name) IN (
  ('CLI-SNG-01', 'Sonangol E.P. — Sede'),
  ('CLI-BAI-02', 'Banco BAI — Edifício Sede'),
  ('CLI-UTL-03', 'Unitel Luanda Sul — Centro Técnico'),
  ('CLI-HGL-04', 'Hospital Geral de Luanda'),
  ('CLI-AER-05', 'ENANA — Aeroporto Internacional 4 de Fevereiro')
);

-- PASSO 2 — Apagar (só as que não têm avaliações). Se o PASSO 1 não devolveu nada, não há nada a fazer.
BEGIN;
DELETE FROM public.clients c
WHERE (c.internal_code, c.company_name) IN (
  ('CLI-SNG-01', 'Sonangol E.P. — Sede'),
  ('CLI-BAI-02', 'Banco BAI — Edifício Sede'),
  ('CLI-UTL-03', 'Unitel Luanda Sul — Centro Técnico'),
  ('CLI-HGL-04', 'Hospital Geral de Luanda'),
  ('CLI-AER-05', 'ENANA — Aeroporto Internacional 4 de Fevereiro')
)
AND NOT EXISTS (SELECT 1 FROM public.evaluations e WHERE e.client_id = c.id);
-- Confirma o resultado e só depois grava:
SELECT count(*) AS empresas_demo_restantes FROM public.clients
WHERE internal_code IN ('CLI-SNG-01','CLI-BAI-02','CLI-UTL-03','CLI-HGL-04','CLI-AER-05');
COMMIT;   -- ou ROLLBACK; se algo não estiver como esperavas

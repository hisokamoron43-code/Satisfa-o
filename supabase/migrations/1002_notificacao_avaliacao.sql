-- 1002 — Notificação ao gestor por e-mail (Edge Function notify-evaluation)
-- Não destrutiva e idempotente: pode ser executada mais do que uma vez.
-- Executar depois da 1001.

-- Marca quando o gestor foi avisado desta avaliação. A Edge Function usa-a para
-- garantir que cada avaliação gera no máximo um e-mail.
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS manager_notified_at timestamptz;

-- Nota: a escrita nesta coluna fica sujeita às políticas RLS da tabela evaluations;
-- a Edge Function usa a service role, que ignora o RLS.

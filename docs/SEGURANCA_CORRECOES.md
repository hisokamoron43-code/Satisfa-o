# Correções de segurança — auditoria SICSC

Este documento regista as correções aplicadas após a auditoria estática (relatório
`relatorio-auditoria-sicsc.md`). Cada correção indica o problema, o que mudou e como foi verificada.

## Estado por vulnerabilidade

| ID | Problema | Estado | O que mudou |
|---|---|---|---|
| VUL-01 | Homologação e pontuação gravadas pelo frontend | **Corrigido** (decisão confirmada) | A revisão passa pela RPC `update_evaluation_review` (HR/ADMIN, justificação obrigatória, auditoria). Pontuação técnica e classificação são calculadas só pela fórmula 80/20 e deixaram de ser editáveis. Não existe ajuste manual de pontuação; se for necessário no futuro, será uma funcionalidade nova com justificação e registo próprio. |
| VUL-02 | Imutabilidade incompleta; transições de estado sem regras | **Corrigido** | Após homologação, só `status` e `corrective_action_status` mudam, em transições válidas. `ARCHIVED` é final e nada volta a `PENDING_REVIEW`. |
| VUL-03 | Vistas públicas expõem clientes e prestadores | **Corrigido** | Anónimos deixaram de ler `v_public_clients` e `v_public_providers` (migração 1016). O `AppContext` deixou de carregar clientes e prestadores sem sessão. Não foi implementada pesquisa com limite, porque o formulário público não lista clientes: o nome é texto livre e a associação é feita no servidor. Anónimos continuam a ver equipas, serviços e os prestadores da equipa escolhida. |
| VUL-04 | Interface mostra sucesso quando a base de dados recusa | **Corrigido** | `updateEvaluationScoresInDb` devolve erro ao utilizador; sem fallback local. |
| VUL-05 | HR suspende ou altera Administradores | **Corrigido** | `admin-employees` / `update_employee` aplica hierarquia; ninguém suspende a própria conta. |
| VUL-06 | Enumeração anónima de contas e colaboradores | **Parcial** | `list_public_team_providers` só lista equipas ativas. `resolve_login_email` mantém-se (ver decisões). |
| VUL-07 | Limite de submissões contornável; sem deduplicação | **Parcial** | IP lido do último `X-Forwarded-For`; duplicados recusados em 10 min; campos JSON limitados a 20 KB. CAPTCHA pendente. |
| VUL-08 | Auditoria escrita e inundável por qualquer utilizador | **Corrigido** | `log_system_audit`: tipos de operação em lista branca, texto até 500 caracteres, máximo 300 registos por minuto. O frontend usa a RPC (já não há INSERT direto). |
| VUL-09 | Troca de palavra-passe só no frontend; senha fraca | **Corrigido** | Sem a troca, o RLS nega o acesso aos dados (`current_user_role` e `current_provider_id`). Mínimo passou de 8 para 10 caracteres. |
| VUL-10 | Upload anónimo de áudio sem quota | **Parcial** | Quota diária de 2000 ficheiros no bucket. Limpeza de órfãos pendente. |
| VUL-11 | Endpoint de e-mail sem autenticação em `server.ts` | **Corrigido** | Rota removida; servidor de desenvolvimento só escuta em `127.0.0.1`. |
| VUL-12 | Ficheiros sensíveis e lockfile dessincronizado | **Corrigido** | PDFs de exportação removidos (e ignorados pelo `.gitignore`); script destrutivo `999_NAO_EXECUTAR.sql` removido; nomes de empresas retirados do script de limpeza; `bun.lock` removido; `package-lock.json` sincronizado com o `package.json`. |
| VUL-13 | Cabeçalhos HTTP | **Parcial** | Acrescentados `Strict-Transport-Security` e `Cross-Origin-Opener-Policy`. `'unsafe-inline'` em estilos mantém-se. |

## Migração nova: `supabase/migrations/1016_seguranca_auditoria.sql`

Migração nova. As migrações 1000–1015 **não foram alteradas**, para não divergirem do que já
está aplicado em produção. Corrige `current_user_role`, `current_provider_id`, `log_system_audit`,
`guard_finalized_evaluation`, `list_public_team_providers` e `submit_evaluation_core`; cria
`update_evaluation_review` e `audio_upload_quota_ok`; e recria a policy de upload de áudio.
Retira a `anon` o acesso às vistas `v_public_clients` e `v_public_providers` (VUL-03).

## Ordem de implementação (produção)

1. **Staging primeiro.** Aplicar as migrações 1000–1016 num projeto de staging e correr
   `node supabase/tests/seguranca/run-seguranca.mjs` (ou os mesmos testes contra o staging).
2. **Confirmar o cabeçalho `X-Forwarded-For`** em staging: enviar um pedido com um valor
   forjado no cabeçalho e confirmar que o último valor é o IP real do cliente. Se a plataforma
   não acrescentar o IP real no fim, a regra de limite de VUL-07 tem de ser revista.
3. **Migração em produção:** aplicar `1016_seguranca_auditoria.sql` (SQL Editor ou `supabase db push`).
4. **Edge Function:** redeployar `admin-employees` (`supabase functions deploy admin-employees`).
5. **Auth do Supabase:** definir a palavra-passe mínima em **10 caracteres** nas definições de
   autenticação, para alinhar com a validação no servidor.
6. **Frontend:** o Render faz o deploy ao fazer push. Confirmar o build (`npm install && npm run build`).
7. **Verificação pós-deploy:** entrar com uma conta HR de teste, rever uma avaliação com justificação,
   tentar mudar o prestador de uma avaliação homologada (deve ser recusado) e confirmar que a
   auditoria regista a revisão.

## Decisões pendentes

Estas decisões não se resolvem só no código:

- **VUL-06 — `resolve_login_email`.** Permite confirmar identificadores e nomes de contas sem
  autenticação. A correção definitiva exige mudar o login (identificador normalizado no cliente)
  ou desativar `allow_full_name` e `allow_employee_number`, o que pode afetar utilizadores atuais.
  Os prestadores de equipas ativas continuam listados por nome (`list_public_team_providers`),
  porque o formulário público precisa disso.
- **VUL-07 — CAPTCHA** no formulário público (requer chave de um fornecedor como Cloudflare Turnstile).
- **VUL-10 — limpeza de ficheiros órfãos** (requer tarefa agendada, por exemplo com `pg_cron`).

Decisões já confirmadas pelo gestor:

- **VUL-01:** sem ajuste manual da pontuação técnica; a pontuação é só a fórmula 80/20.
- **VUL-03:** sem lista pública de clientes e sem pesquisa; o formulário não a usa.

## Como foi verificado

- **Base de dados:** 35 testes em PostgreSQL real (PGlite), com stubs do Supabase. Com as
  migrações originais, 19 cenários falham; com a versão corrigida passam 35/35
  (`supabase/tests/seguranca/`).
- **Frontend:** `tsc --noEmit` sem erros (118 ficheiros de `src`) e `npm run build` concluído.
- **Edge Function:** sintaxe validada com esbuild; não foi executada (requer Deno e o Supabase).

**Limitações:** os testes não reproduzem o PostgREST nem o comportamento real do proxy. O
comportamento de `X-Forwarded-For` e as chamadas REST diretas têm de ser confirmados em staging.

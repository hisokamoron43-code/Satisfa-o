# Implantação do SICSC — Supabase e Render

## 0. Antes de tudo: cópia de segurança (obrigatório)

Não apague tabelas. A migração `1000` é **não destrutiva** e pode ser executada sobre a base atual. Apagar tabelas remove os dados; não evita falta de dados.

No painel do Supabase: **Project Settings → Database → Backups** (ou um backup manual). Em alternativa, a partir de um computador com `pg_dump`:

```bash
pg_dump "<connection-string-do-painel>" --schema-only -f backup_esquema_$(date +%F).sql
pg_dump "<connection-string-do-painel>" --data-only   -f backup_dados_$(date +%F).sql
```

Guarde os dois ficheiros fora do projeto. Só avance quando o backup estiver verificado.

## 1. Verificar em staging primeiro

Se existir um projeto Supabase de teste, restaure o backup nele e execute os passos 2 a 5 antes de tocar em produção. A base de produção pode ter colunas ou políticas criadas por migrações antigas que não estão no repositório; o staging mostra isso sem risco.

## 2. Configuração de autenticação (Supabase)

**Authentication → Sign In / Providers → Email**: desative **"Allow new users to sign up"**. As contas são criadas apenas pela Edge Function (pelo RH/Administração). Com o registo público ativo, qualquer pessoa podia criar uma conta.

## 3. Executar a migração 1000

No **SQL Editor** do Supabase, cole e execute, por esta ordem, `supabase/migrations/1000_producao_consolidada.sql` e depois `supabase/migrations/1001_formularios_pesos_servicos.sql` e por fim `supabase/migrations/1002_notificacao_avaliacao.sql` (ou `supabase db push` se usar o CLI). Não volte a executar só a 1000 depois da 1001. A migração:

- acrescenta tabelas, colunas e índices em falta, sem apagar nada;
- cria o catálogo de páginas, as funções usadas pelo frontend e as políticas RLS;
- torna os buckets `evaluation-audio` e `employee-documents` privados;
- liga cada perfil ao utilizador de autenticação com o mesmo e-mail.

Pode ser executada duas vezes sem efeitos adversos (testado).

**Não execute** `supabase/obsoletas/999_NAO_EXECUTAR.sql`. Falha e apaga tabelas.

## 4. Garantir pelo menos um Administrador ativo

Sem um perfil ADMIN ativo ninguém consegue criar contas. Se não existir, execute no SQL Editor (substitua o e-mail):

```sql
insert into public.profiles (id, name, email, role, active, allowed_pages)
select id, 'Administrador', email, 'ADMIN', true, '{}'
from auth.users
where email = 'admin@exemplo.co.ao'
on conflict (id) do update set role = 'ADMIN', active = true;
```

O utilizador tem de existir previamente em **Authentication → Users**.

## 5. Publicar a Edge Function

```bash
supabase functions deploy admin-employees --no-verify-jwt --project-ref <ref-do-projeto>
supabase secrets set ALLOWED_ORIGINS=https://<dominio-do-render> --project-ref <ref-do-projeto>
# Exemplo: ALLOWED_ORIGINS=https://sicsc.onrender.com (sem barra no fim; vários separados por vírgula)
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos pelo Supabase às Edge Functions. Não os coloque no frontend.

### 5.1 Notificação por e-mail ao gestor (`notify-evaluation`)

O aviso ao gestor quando entra uma avaliação é enviado por uma Edge Function (o Render só serve o frontend estático). Requer uma conta no Resend (https://resend.com) com o domínio do remetente verificado.

```bash
supabase functions deploy notify-evaluation --no-verify-jwt --project-ref <ref-do-projeto>
supabase secrets set RESEND_API_KEY=<chave-resend> MANAGER_EMAIL=gestor@exemplo.co.ao MAIL_FROM="Sistema de Qualidade Aeternu <no-reply@aeternu.co.ao>" --project-ref <ref-do-projeto>
```

- `MANAGER_EMAIL` aceita vários endereços separados por vírgula.
- `ALLOWED_ORIGINS` (passo 5) é partilhado com a função `admin-employees`.
- A função é chamada pelo formulário público, sem sessão iniciada, com a chave publicável (`sb_publishable_...`), que não é um JWT; por isso tem de ser publicada com `--no-verify-jwt` (no painel: desligar *Verify JWT*). Não depende de login: valida o identificador, cada avaliação gera no máximo um e-mail e só avaliações com menos de 15 minutos podem ser notificadas.
- O ficheiro `server.ts` (rota `/api/send-evaluation-notification`) deixa de ser usado em produção.

## 6. Render (frontend)

Variáveis de ambiente do serviço estático (obrigatórias; sem elas a aplicação mostra um erro de configuração):

- `VITE_SUPABASE_URL` = `https://<ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = chave **anon** (pública)

Os cabeçalhos de segurança (CSP, X-Frame-Options, etc.) estão em `render.yaml`. A política de conteúdo deve ser verificada no navegador (consola sem erros de CSP) antes de divulgar o sistema.

## 7. Verificação de aceitação

Com um utilizador de cada papel, confirme:

1. **Criação de funcionário com páginas**: em Funcionários, ativar "Criar conta", escolher páginas na lista e criar. O colaborador entra com o identificador, é obrigado a trocar a palavra-passe e só vê as páginas escolhidas.
2. **Página não atribuída**: escrever `#audit` ou `#users` na barra de endereços mostra "Sem permissão".
3. **Prestador**: não vê avaliações, perfis nem prestadores de outros.
4. **Formulário público**: submeter com e sem NPS e com áudio. Sem NPS, o campo fica vazio na base de dados. O áudio aparece em `evaluation-audio/submissions/` e é reproduzido na análise.
5. **Homologação**: a pontuação e a classificação aparecem; uma avaliação homologada não pode ser alterada.
6. **Auditoria**: as ações ficam registadas com o e-mail técnico do utilizador real.
7. **Notificação**: submeter uma avaliação de teste no formulário público; o gestor recebe o e-mail e, na tabela `evaluations`, `manager_notified_at` fica preenchido.


## Diagnóstico: criar funcionários ou definir acessos falha

O ecrã passa a mostrar a causa real. Mapa das mensagens:

| Mensagem | Causa | Solução |
|---|---|---|
| "não está publicada neste projeto" (404) | A função não existe no Supabase | `supabase functions deploy admin-employees --no-verify-jwt` |
| "Não foi possível contactar a função administrativa" | CORS: `ALLOWED_ORIGINS` em falta ou diferente do endereço do site | `supabase secrets set ALLOWED_ORIGINS=https://sicsc.onrender.com` |
| "Invalid JWT" | A função foi publicada com verificação de JWT ativa | Republicar com `--no-verify-jwt` (o ficheiro `supabase/config.toml` já fixa isto) |
| "Conta sem perfil ativo" / "Acesso negado" | O utilizador não tem perfil ADMIN ou RH ativo em `profiles` | Ver o passo 4 (criar administrador) |
| Mensagens de validação (palavra-passe, identificador, página) | Dados do formulário | Corrigir o campo indicado |

Para ver o erro do lado do servidor: Supabase → Edge Functions → `admin-employees` → **Logs**.
Para ver o pedido no navegador: F12 → Network → filtro `admin-employees` → Status e Response.

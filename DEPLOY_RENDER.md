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

No **SQL Editor** do Supabase, cole e execute `supabase/migrations/1000_producao_consolidada.sql` (ou `supabase db push` se usar o CLI). A migração:

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
supabase functions deploy admin-employees --project-ref <ref-do-projeto>
supabase secrets set ALLOWED_ORIGINS=https://<dominio-do-render> --project-ref <ref-do-projeto>
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos pelo Supabase às Edge Functions. Não os coloque no frontend.

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

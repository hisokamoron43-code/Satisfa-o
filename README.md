# SICSC — Sistema Integrado de Controlo da Satisfação de Clientes (AETERNU LDA)

Aplicação React + Vite com Supabase (base de dados, autenticação, storage e Edge Functions).

## Desenvolvimento

```bash
npm ci
cp .env.example .env.local      # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
npm run lint                    # verificação de tipos
npm run build                   # build de produção
npm run test:db                 # bateria de testes da base de dados (PostgreSQL em memória)
```

## Estrutura

- `src/` — frontend.
- `supabase/migrations/1000_producao_consolidada.sql` — esquema de produção (única migração a executar).
- `supabase/functions/admin-employees/` — gestão de colaboradores, contas e páginas visíveis.
- `supabase/obsoletas/` — migrações antigas arquivadas. **Não executar.**
- `supabase/tests/` — testes da base de dados.
- `scripts/legacy/` — scripts antigos, arquivados.

## Documentação

- `DEPLOY_RENDER.md` — implantação, com cópia de segurança obrigatória antes de qualquer alteração.
- `CORRECOES.md` — registo de correções e pontos pendentes.

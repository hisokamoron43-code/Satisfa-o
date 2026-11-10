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
- `supabase/migrations/1000_producao_consolidada.sql` e `1001_formularios_pesos_servicos.sql` — esquema de produção. Executam-se **sempre juntas e por esta ordem** (a 1000 recria funções que a 1001 altera; correr só a 1000 depois da 1001 desfaz a 1001).
- `docs/ARQUITETURA_AVALIACAO.md` — modelo de dados, algoritmo de ponderação e componentes do módulo de avaliação.
- `npm run test:logic` testa o balanceamento de pesos e a pontuação por tipo de questão; `npm run test:db` testa as migrações.
- `supabase/functions/admin-employees/` — gestão de colaboradores, contas e páginas visíveis.
- `supabase/obsoletas/` — migrações antigas arquivadas. **Não executar.**
- `supabase/tests/` — testes da base de dados.
- `scripts/legacy/` — scripts antigos, arquivados.

## Documentação

- `DEPLOY_RENDER.md` — implantação, com cópia de segurança obrigatória antes de qualquer alteração.
- `CORRECOES.md` — registo de correções e pontos pendentes.

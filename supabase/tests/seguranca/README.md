# Testes de segurança das migrações

Corre as migrações (1000 → 1016) num PostgreSQL real (PGlite, já nas devDependencies)
com stubs mínimos do Supabase (`auth.uid()`, schema `storage`, roles `anon`/`authenticated`)
e verifica os comportamentos corrigidos na auditoria de segurança.

```bash
npm install
node supabase/tests/seguranca/run-seguranca.mjs
```

Cobre: IP de submissão (último X-Forwarded-For), duplicados, tamanhos máximos,
equipas inativas, palavra-passe temporária, lista branca de auditoria, imutabilidade
e transições de avaliações homologadas, revisão por RPC com justificação, e quota de áudio.

**Limitação:** os stubs não reproduzem o PostgREST nem a plataforma. O comportamento
do cabeçalho `X-Forwarded-For` tem de ser confirmado em staging.

# Testes da base de dados

`npm run test:db` executa a migração `1000_producao_consolidada.sql` num PostgreSQL real (PGlite, em memória),
com stubs de `auth` e `storage` e as roles do Supabase, e verifica:

- execução limpa e idempotência (a segunda execução não apaga dados);
- RLS por papel (anónimo, prestador, operacional, HR, ADMIN);
- submissão pública, validações e NPS opcional;
- homologação, cálculo, imutabilidade e mensagens de erro;
- páginas por funcionário (`get_my_access`, `has_page`);
- storage privado e vistas públicas.

Não substitui testes no projeto Supabase real: antes de produção, repetir os mesmos cenários contra staging.

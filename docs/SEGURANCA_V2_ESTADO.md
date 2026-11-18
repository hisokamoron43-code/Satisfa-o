# Correções de segurança v2 — estado final (sicsc-v34)

## Ordem de publicação (IMPORTANTE)

O login mudou: o navegador já não resolve identificadores (`resolve_login_email` deixou de ser
acessível a anon). Por isso a migração 1018 e a publicação do login têm de ser feitas na mesma janela:

1. Ativar TOTP em Supabase → Authentication → Multi-Factor (manual).
2. Definir `ALLOWED_ORIGINS` (domínio da aplicação, separado por vírgulas) nas variáveis das Edge Functions.
3. Aplicar, por ordem: `1016`, `1017`, `1018`, `1019`, `1020` (se ainda não aplicadas).
4. Publicar as Edge Functions: `supabase functions deploy login` e `supabase functions deploy submit-evaluation`
   (esta última não é usada pelo frontend enquanto não existirem chaves Turnstile).
5. Publicar o frontend (Render). Fazer 3–5 na mesma janela, logo após 3.

## Decisões tomadas por omissão (reversíveis)

- **Autorização de prestadores (N-03):** os prestadores ativos mantêm a visão das equipas (backfill na 1017).
  O RH pode retirar a autorização individualmente em Prestadores.
- **MFA (N-11):** obrigatória para ADMIN e HR 14 dias após a 1017 (`login_settings.mfa_enforced_from`).
  Antes disso, a inscrição é opcional e o ecrã de verificação só aparece a quem já tem fator.
- **Visibilidade do nome da empresa (N-07):** oculta por defeito; o RH decide no modal de revisão, antes da homologação.
- **Eliminação (N-02):** clientes, serviços e prestadores só são apagados por ADMIN, e apenas sem avaliações.
  O botão de eliminar na aplicação passa a desativar.
- **Turnstile (VUL-07):** código pronto em `supabase/functions/submit-evaluation`, desativado sem chave.

## Estado de cada item

| ID | Estado | Verificação |
|---|---|---|
| N-01 sicsc_compute_participants | CORRIGIDO E TESTADO | bateria v2 (N-01a/b); homologação E2E com trigger |
| N-02 eliminação de clientes | CORRIGIDO E TESTADO | N-02a–d; DEL1 na suíte de regressão |
| N-03 autorização de prestadores | CORRIGIDO E TESTADO | N-03a–c; backfill não testado isoladamente |
| N-04 CSV | CORRIGIDO, MAS NÃO TESTADO NO NAVEGADOR | testes unitários da função (12); ligação nas páginas verificada só por tipos e build |
| N-05 sicsc_find_activity | CORRIGIDO, MAS NÃO TESTADO DIRETAMENTE | mesmo padrão de REVOKE que N-06 (testado) |
| N-06 pertença e grupo | CORRIGIDO E TESTADO | N-06a/b |
| N-07 visibilidade pelo submissor | CORRIGIDO E TESTADO | N-07a–c; formulário sem a escolha (verificado por build) |
| N-08 anexos | PARCIALMENTE CORRIGIDO | configuração do bucket testada; validação de conteúdo real (magic bytes) não é feita; download forçado não testado no navegador |
| N-09 pesquisa e filtros | CORRIGIDO E TESTADO | testes unitários (filtros com vírgulas, parênteses e aspas) |
| N-10 privilégios SQL | CORRIGIDO E TESTADO | N-10a–c; anon executa 10 funções (eram 15) |
| N-11 MFA | PARCIALMENTE CORRIGIDO | enforcement na base de dados testado (N-11a–f); ecrã e fluxo TOTP não testados no navegador |
| N-12 mensagem de login | CORRIGIDO, MAS NÃO TESTADO EM PRODUÇÃO | resposta uniforme testada na lógica da Edge (unitário) |
| N-13 melhorias | PARCIALMENTE CORRIGIDO | `?token=` removido; dados de demonstração fora do bundle (verificado); `unsafe-inline` mantém-se |
| VUL-06 enumeração | CORRIGIDO, MAS NÃO TESTADO EM PRODUÇÃO | VUL06a–d na base de dados; Edge não executada (sem Deno) |
| VUL-07 abuso do formulário | PARCIALMENTE CORRIGIDO | limite e deduplicação testados; Turnstile desativado; IP do gateway não verificado em produção |
| VUL-10 áudios órfãos | PARCIALMENTE CORRIGIDO | relatório de órfãos (somente leitura) criado; eliminação manual e intencional; não testado |
| VUL-13 cabeçalhos | PARCIALMENTE CORRIGIDO | HSTS e COOP acrescentados; `unsafe-inline` mantém-se |
| VUL-01 a VUL-05, VUL-08, VUL-09, VUL-11, VUL-12 | CORRIGIDO E TESTADO | ver relatórios anteriores |

## Testes

- Unitários (`npm run test:unit-seguranca`): 12/12.
- Lógica (`npm run test:logic`): 81/81.
- Segurança (`npm run test:seguranca`): 35/35 (legado) e 40/40 (bateria v2, 15 pontos obrigatórios).
- Regressão de base de dados (`npm run test:db`): 127/146. As 19 falhas restantes existem também na v33 e vêm de
  dados de semente desatualizados na suíte (catálogo de categorias e critérios que o 1010/1011 não recriam).
  O teste `M2` (idempotência) falha de forma real: a 1010 apaga e recria categorias ao ser executada de novo.
  **Não voltar a executar 1010 e 1011 em bases com dados.**
- Homologação ponta a ponta (verificada à parte): RH homologa, nota 82, estado REVIEWED, snapshot e participantes gerados.
- Tipos (`tsc`): 0 erros. Build: concluído. Bundle: sem dados de demonstração nem referências ao login antigo.

## Limitações conhecidas

- As Edge Functions não foram executadas (sem Deno nem acesso ao `esm.sh` neste ambiente).
- Não há testes de navegador (CSP, ecrã de MFA, download de anexos).
- Os limites de sessão, a expiração de JWT e o IP real do gateway dependem da plataforma.

## Atribuição de equipa/funcionário por confirmação (migração 1020)

- O cliente escreve o nome da equipa ou do funcionário (texto livre). Não escolhe equipa nem funcionário.
- Na submissão, o sistema sugere a equipa/funcionário só quando há uma correspondência única entre ativos
  (ignora maiúsculas, acentos e pontuação). A sugestão **não** associa a avaliação.
- O RH (ou Administrador) confirma a associação no modal de revisão, com a função `confirm_evaluation_attribution`.
- Não é possível homologar uma avaliação sem equipa, funcionário ou confirmação. Avaliações anteriores ficam confirmadas.
- O formulário público deixou de mostrar termos técnicos (escrita livre, códigos de serviço, "Índice NPS") e a pergunta de privacidade.
- Testes: `atrib.mjs` (12/12 — ver `supabase/tests/seguranca/README.md`); regressão e segurança sem falhas novas.

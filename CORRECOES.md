# Registo de correções — SICSC

Cada item corresponde a um problema identificado na análise. "Verificado" significa que foi testado; "Corrigido (código)" significa que foi alterado e validado por tipos e build, mas precisa de teste no ambiente real.

## Bloqueantes de dados e segurança

| Problema | Estado | Como foi resolvido |
|---|---|---|
| A migração 999 não executa numa base de dados vazia | Verificado | Nova migração `1000_producao_consolidada.sql`, testada numa base vazia |
| A 999 apaga tabelas (`DROP ... CASCADE`) | Verificado | A 1000 não apaga nada (teste M2: dados sobrevivem à segunda execução). 999 arquivada em `supabase/obsoletas/` |
| Prestadores leem avaliações, perfis e prestadores de todos | Verificado | Prestador só lê avaliações homologadas que lhe foram atribuídas (S5–S9) |
| Anónimo insere avaliações já homologadas | Verificado | Sem INSERT direto; só `submit_evaluation` (S3) |
| Registos de auditoria forjáveis por anónimos e autenticados | Verificado | `log_audit_event` sem execução para anon/authenticated (S4); sem INSERT direto (S8); ator = utilizador autenticado (L1) |
| Frontend e base de dados incompatíveis (tabelas, funções, colunas) | Verificado | Esquema em snake_case alinhado com o frontend; todas as RPCs existem (X2); tabelas e vistas presentes (F5, V1) |
| Ficheiros internos (prompts, relatório, capturas) publicados na web | Corrigido (código) | Pasta removida do build; `dist/` com 3 ficheiros |

## Autenticação e permissões

| Problema | Estado | Como foi resolvido |
|---|---|---|
| Perfil ADMIN criado automaticamente para qualquer conta | Corrigido (código) | `getOrCreateUserProfile` só lê perfis ativos; sem perfil, o login é recusado e a sessão terminada |
| Papel lido de `user_metadata` (editável pelo utilizador) | Corrigido (código) | Papel vem apenas da tabela `profiles` |
| Login sem palavra-passe criava sessão local como ADMIN | Corrigido (código) | Removido |
| Troca de perfil local (`setActiveRole`) | Corrigido (código) | Removida |
| Dados de demonstração (utilizadores fictícios) em produção | Corrigido (código) | Removidos |
| Perfis desativados continuavam a entrar na interface | Corrigido (código) | Login recusa conta inativa; Edge Function desativa perfil e bloqueia a sessão |
| HR podia redefinir a palavra-passe de um ADMIN | Corrigido (código) | HR só altera contas de nível inferior a RH |
| Proteção do último administrador não funcionava | Corrigido (código) | Contagem por perfis com papel ADMIN ativo |
| Permissões por página não eram aplicadas (menu apenas) | Verificado (RPC) + Corrigido (código) | `get_my_access` / `has_page` (G1–G4); `AppLayout` bloqueia páginas não atribuídas; menu filtrado |
| Conta de colaborador criada sem utilizador de autenticação (fallback de inserção direta) | Corrigido (código) | Toda a criação passa pela Edge Function, com compensação em caso de erro |
| Número de funcionário repetível após eliminações | Verificado | Sequência `next_employee_number()` (E2) |
| Login não aceitava o identificador de acesso | Corrigido (código) | `signInWithSupabase` converte o identificador no e-mail técnico |
| Normalização do identificador diferente entre frontend e Edge | Verificado | Idênticas em 7 casos de teste |
| Troca de palavra-passe inicial não obrigatória | Verificado (RPC) + Corrigido (código) | Ecrã bloqueante `ChangePasswordPage` e função `clear_must_change_password` (Q1–Q2) |

## Funcionamento

| Problema | Estado | Como foi resolvido |
|---|---|---|
| Homologação enviava `p_threshold_override_reason`, que não existia | Verificado | Parâmetro existe (X1); devolve `finalScore`, `finalClassification`, `snapshot`, `finalizedBy`, `finalizedAt` (F1) |
| Pontuação calculada sem a fórmula do frontend | Verificado | `soma (nota / máximo) × peso` = 82 para o caso de teste (F2) |
| `assign_evaluation_workers` com erro de sintaxe | Verificado | Substituída por `assign_evaluation_provider` (F4) |
| Mensagem de erro de pesos "too many parameters" | Verificado | Mensagem correta com a soma atual (B1, C1) |
| Lista de avaliações vazia sem aviso | Corrigido (esquema) | Relação `provider_id` existe; a leitura falha de forma visível. Verificar com PostgREST em staging |
| Configuração de critérios e limiar voltava sempre ao padrão | Corrigido (esquema) | Colunas existem; limiar grava e lê (C2). Verificar em staging |
| Avaliação homologada alterável diretamente | Verificado | Trigger de imutabilidade (I2, I3); RLS sem INSERT/DELETE |
| Re-homologação de avaliação já homologada | Verificado | Bloqueada (I1) |
| Prestador podia homologar | Verificado | Bloqueado (A1) |
| NPS gravado como 10 quando não respondido | Verificado | NPS é opcional e fica `NULL` (D2); formulário só envia NPS respondido |
| Satisfação gravada como 5 sem resposta | Verificado | Recusada pelo servidor (D1); formulário exige respostas de avaliação |
| Respostas em falta gravadas como 5 | Corrigido (código) | Não são enviadas |
| Referência "AVAL-2026" fixa quando faltava a referência real | Corrigido (código) | Removida |
| Áudio guardado como base64 dentro da avaliação | Verificado (servidor) + Corrigido (código) | Formulário envia o ficheiro para o bucket privado; a base guarda só o caminho (S1, S2) |
| Áudio com URL público acessível a quem tivesse o link | Verificado (bucket privado, T1–T4) + Corrigido (código) | Reprodução por URL assinado de 5 minutos (`SecureAudio`) |
| Três nomes de bucket de áudio diferentes | Corrigido (código) | Único bucket `evaluation-audio` |
| Auditoria gravada com ator fixo `sistema@…` no fallback | Corrigido (código) | Fallback removido |
| Formulário público ativado por substring (`platform=` contém `form=`) | Corrigido (código) | Verificação exata de parâmetros |
| Edição de classificação diretamente no cliente (contornava o cálculo) | Corrigido (código) | Função removida; só o RPC homologa |

## Build, código e configuração

| Problema | Estado | Como foi resolvido |
|---|---|---|
| Erro TypeScript: `formQuestions` duplicado | Verificado | `tsc --noEmit` sem erros |
| `__dirname` em configuração ESM | Corrigido (código) | `import.meta.dirname` |
| Dependências não usadas (express, motion, dotenv, tsx, esbuild, @google/genai) | Corrigido (código) | Removidas; `bun.lock` removido (npm é a única fonte) |
| Chave e URL do Supabase fixas no código como fallback | Corrigido (código) | Sem fallback; se faltar configuração, a aplicação mostra erro |
| SQL da base de dados embutido no bundle | Corrigido (código) | Substituído por instrução curta |
| Truque de bloqueio de `fetch` em `index.html` | Corrigido (código) | Removido |
| Identificador do projeto escrito à mão na página de Definições | Corrigido (código) | Lido da configuração |
| Cabeçalhos de segurança ausentes | Corrigido (código) | CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy em `render.yaml` (a validar no navegador) |
| Scripts de teste que leem migrações inexistentes | Corrigido | Arquivados em `scripts/legacy/`; bateria atual em `supabase/tests/` (`npm run test:db`) |
| Documentação desatualizada (README do AI Studio, migração 004) | Corrigido | README e DEPLOY reescritos |
| Edge Function: CORS `*`, erros internos expostos, sem validação de páginas | Corrigido (código) | `ALLOWED_ORIGIN` configurável; mensagens genéricas; páginas validadas contra o catálogo |

## Não resolvido nesta entrega

- **Tipagem fraca**: 122 usos de `any` e `noImplicitAny: false`. Não corrigido.
- **Bundle de 1,4 MB**: falta divisão por rotas (code splitting). Não corrigido.
- **Ecrã de edição de páginas de um colaborador já criado**: a Edge Function (`update_access`) está pronta, mas o ecrã não foi ligado. Só a criação foi implementada, como pedido.
- **Limite de submissões anónimas (anti-spam)**: não implementado. Recomenda-se uma regra na camada de rede ou na Edge Function.
- **Sessão por inatividade**: não implementado.
- **Não testado**: a Edge Function em runtime Deno (apenas sintaxe), o fluxo completo no navegador, o comportamento do PostgREST e a base de produção real.

## Versão 2 — alterações desta entrega

| Área | Alteração | Estado |
|---|---|---|
| Nome da empresa | "AETERNU Angola/ANGOLA" substituído por "AETERNU LDA" em todas as páginas, rodapés, cabeçalhos e documentação | Corrigido |
| Dados fictícios | Mensagens de exemplo com pessoas inventadas removidas; texto de exemplo com números fixos na página de RH substituído pelo limiar real | Corrigido |
| Login | Caixa "Lembrar os meus dados" sem efeito removida; limite de tentativas no navegador (5 falhas → espera crescente); mensagens genéricas que não revelam se a conta existe ou está desativada | Corrigido (limite do servidor a configurar no Supabase Auth) |
| Calendário | Colunas de atividades em falta (location, start_time, end_time, team_name, assigned_provider_ids, supervisor_name) acrescentadas; estado por omissão `SCHEDULED` | Verificado (teste K1) |
| Mensagens | Substituídas por mensagens persistidas: conversas diretas, grupos com nome, escolha de membros, acrescentar membros pelo criador ou ADMIN; apenas membros leem e escrevem | Verificado (testes M3–M15) |
| Edição de funcionário | Ecrã "Editar dados" no dossiê: nome, categoria, estado profissional e páginas visíveis. Editar identificador e palavra-passe ainda não tem ecrã | Corrigido (código), não testado no navegador |
| Páginas do funcionário | Atualização de páginas aceite para ADMIN e RH, dentro das regras de autoridade | Corrigido (Edge Function) |
| Assinatura de páginas | `updateEmployeeAccessViaAdmin` alinhada com a Edge Function (`allowedPages`) | Corrigido |
| Limiar de nota positiva | Já existia no separador de Homologação (ADMIN/HR); mantido e validado pela RPC | Verificado (C2) |

Pontos que não foram revistos em profundidade: fluxo completo de preenchimento do formulário público no navegador, consistência de categorias e tipos de serviço em todas as páginas, e a constante de meta institucional de CSAT (80%) em `KpiDetailModal`, que deve ser confirmada pela direção.

## Versão 3 — endurecimento de segurança e login configurável

| Item | Estado | Como foi tratado |
|---|---|---|
| Enable RLS | Verificado | Todas as tabelas de `public` com RLS ativo (teste X3); novas tabelas incluídas |
| Tighten CORS | Corrigido | Edge Function aceita apenas origens em `ALLOWED_ORIGINS`; sem `*` |
| Parameterized SQL | Verificado | Nenhuma string SQL montada no frontend; acesso só por cliente Supabase e RPCs com parâmetros |
| Verify email addresses | Corrigido | E-mail do login validado (formato) antes de consultar; e-mail de contacto validado na Edge Function |
| Keep tokens out of local storage | Corrigido | Sessão em `sessionStorage` (não persiste ao fechar o separador); sessões antigas em `localStorage` são removidas |
| Hide .env files from git | Verificado | `.gitignore` ignora `.env*` e mantém apenas `.env.example` |
| Validate form inputs | Corrigido | Validação no servidor (tamanhos, intervalos, formatos) nas funções de submissão e na Edge Function |
| Protect admin routes | Verificado | Páginas só renderizam se atribuídas; ações administrativas validadas no servidor (testes) |
| Disable production debugging | Corrigido | `sourcemap: false`; sem `console` com dados; logs da Edge Function sem conteúdo |
| Server-side API secrets | Verificado | Nenhuma chave `service_role` no frontend (pesquisa no bundle) |
| Security review (Claude Code) | Não executado | Não tenho acesso à ferramenta `/security-review` do Claude Code neste ambiente. Foi feita uma revisão estática manual; recomenda-se executar a revisão com a ferramenta antes de produção |
| Rate limit requests | Corrigido | Login: bloqueio no navegador após 5 falhas. Base de dados: máximo de 30 submissões por hora por endereço (testes R1–R2). Limite de login no servidor: configurar em Auth → Rate limits |
| Validate file upload | Corrigido | Buckets privados com tipo MIME e tamanho máximo de 10 MB (teste U1) |
| Keep sensitive data from logs | Corrigido | Logs da Edge Function sem mensagens de erro nem e-mails |
| Hash passwords securely | Verificado | Feito pelo Supabase Auth (bcrypt); a aplicação nunca guarda palavras-passe. Regra: 8+ caracteres com letras e números |
| Verify webhook signatures | N/A | O sistema não recebe webhooks |
| Server side permissions | Verificado | RLS, funções com verificação de papel e Edge Function (testes) |
| Block cross-site scripting | Verificado | Sem `dangerouslySetInnerHTML`, `innerHTML` ou `eval`; CSP em `render.yaml` |
| Update dependencies | Corrigido | `npm update` dentro dos intervalos definidos; auditoria sem vulnerabilidades |

### Login configurável

- O administrador escolhe, em **Definições → Configuração de login**, os dados aceites: identificador de acesso, nome completo, número de funcionário e/ou e-mail (pelo menos um ativo).
- Só entram contas ativas. Um nome que corresponda a mais de um colaborador não inicia sessão; deve usar o número de funcionário.
- O administrador edita o identificador e redefine a palavra-passe de cada colaborador no dossiê ("Editar dados").
- Testes L2–L13 cobrem os métodos, a conta inativa e a alteração de configuração por HR (bloqueada).

## Versão 4 — clientes, relatórios, metas e modo escuro

### Aba de clientes
- Cadastro completo: NIF (9 a 14 dígitos), pessoa de contacto, e-mail, telefone, morada, cidade, sector, início e fim do contrato, serviços contratados e notas. Validação no formulário e na base de dados (formatos e datas de contrato).
- Metas com prazo por cliente: métrica (CSAT, NPS ou nº de avaliações), valor alvo, prazo, estado (pendente, em curso, concluída, não cumprida, atingida, vencida).
- O progresso conta apenas avaliações feitas desde a criação de cada meta, para mostrar a evolução real.
- Testes C10–C13 e G1–G4.

### Aba de relatórios
- Âmbito: global, por serviço, por funcionário (prestador) ou por cliente, com período opcional.
- Áreas: avaliações, clientes e metas, atividades, recursos humanos, equipa e serviços, homologação.
- Partilha por mensagem interna: escolhe destinatários ou um grupo; relatórios longos são divididos em partes.
- Descarregamento em texto e exportação CSV de avaliações mantidos.

### Modo claro/escuro e cores
- Botão flutuante em todos os ecrãs. A preferência é guardada no navegador (não contém dados sensíveis).
- As cores da marca passaram a tokens centrais (`brand`, `brand-dark`, `brand-deep`) em vez de valores repetidos (412 ocorrências em 28 ficheiros).
- O modo escuro remapeia as cores de superfície, texto e bordas. Não foi revisto ecrã a ecrã com o navegador: pode haver contrastes a ajustar.


## Versão 4 — regressões corrigidas e pendências

| Item | Estado | Como foi tratado |
|---|---|---|
| Modo demonstração voltou: login sem palavra-passe como utilizador fictício quando o Supabase não está configurado | Corrigido (código) | `signInWithSupabase` recusa; `getCurrentSupabaseUser` devolve nulo |
| `getMyAccess` devolvia ADMIN com todas as páginas sem Supabase | Corrigido (código) | Devolve não autenticado; `hasPage` devolve falso |
| Painel "Acesso Rápido" com palavras-passe fixas no ecrã de login | Corrigido (código) | Painel removido |
| Dados do sistema em `localStorage` (`sicsc_store_*`, `sicsc_emp_*`) | Corrigido (código) | Funções de leitura/escrita tornadas inertes; nada é gravado no navegador |
| Aplicação arrancava sem configuração do Supabase (chave de substituição) | Corrigido (código) | `SUPABASE_CONFIG_ERROR` preenchido e `App.tsx` mostra erro em vez da aplicação |
| Sessão por inatividade | Corrigido (código), não testado no navegador | `IdleSessionGuard`: 30 min (`VITE_IDLE_TIMEOUT_MINUTES`), aviso de 60 s com contagem, aviso no login após expirar |
| Bundle único de 1,4 MB | Corrigido (código), tamanho por medir | Páginas carregadas sob demanda (`React.lazy` + `Suspense`) |
| `change_identifier` podia deixar Auth e perfil dessincronizados | Corrigido (Edge Function) | Reposição do e-mail anterior se a atualização do perfil falhar |
| Ecrã de páginas e edição de identificador/palavra-passe | Já existiam na versão enviada | Sem alteração |

Ainda por fazer:
- **Tipagem fraca**: ativar `noImplicitAny` produz cerca de 640 erros; a redução dos `any` tem de ser feita por ficheiros, com `npm run lint` a validar cada passo.
- **Ramos de modo standby** (`if (!isSupabaseConfigured)`, cerca de 90) continuam no código, agora inalcançáveis; remoção por etapas.


## Versão 5 — módulo de avaliação, formulários e pesos

| Item | Estado | Notas |
|---|---|---|
| Tipos de questão: escala 1-10, escolha única/múltipla com valor de conformidade, Sim/Não/N.A., aberta, áudio+texto | Código feito, por testar no navegador | `QuestionTypeConfig` partilhado; o formulário do cliente renderiza e submete todos |
| Formulário preenchido completo ao lado das notas do auditor | Código feito, por testar no navegador | `EvaluationReviewWorkspace`: respostas por tipo, player de áudio, notas sugeridas, parecer qualitativo |
| Balanceamento automático de pesos (soma exata de 100,00 %) | Lógica testada (20 testes), UI por testar | `weightBalancer.ts` + `WeightBalancerPanel` com matriz antes → depois |
| Serviços ↔ categorias ↔ pesos ↔ questões | Código e SQL feitos, SQL por executar | `service_categories`, `evaluation_criteria.category_code`, filtro no formulário do cliente |
| Parecer qualitativo do auditor (áudio e argumentos escritos) | SQL por executar | Gravado e congelado na homologação (`evaluations.auditor_review`) |
| Homologação falhava sempre: o limiar era enviado sem justificação | Corrigido | O limiar só segue para o servidor quando é personalizado e justificado |
| Notas iniciais do auditor eram a nota máxima quando faltavam respostas | Corrigido | Agora só há sugestão onde existem respostas pontuáveis; o resto fica por avaliar |
| Gravações de questões e categorias a "dar sucesso" sem gravar | Corrigido | Erros do servidor passam a ser mostrados |
| Submissão do cliente com gravação paralela local e serviço por omissão | Corrigido | Sem cópias locais; serviço inválido é recusado |
| Servidor não valida o formato das respostas por tipo (`detailed_answers` é jsonb livre) | Por fazer | Recomendado validar no `submit_evaluation` |
| Pesos por serviço (matriz diferente por serviço) | Não feito | Hoje os pesos são globais; o serviço filtra categorias e questões |

## Versão 6 — pontuação 80/20, empresa e equipa automáticas

| Item | Estado | Como foi tratado |
|---|---|---|
| Nota: 80% pelas respostas do cliente e 20% pelo áudio e argumentos (10 + 10) | Verificado (DB 1003, testes F1–F3, T7–T11c) + lógica TS testada | Migração `1003_pontuacao_80_20.sql`: `calculate_and_finalize_evaluation` recalcula no servidor a partir de `questions_snapshot` e `detailed_answers`. Áudio e argumentos: nota do auditor 0–5 × 2 |
| Pesos dos critérios (soma 100) repartem os 80 pontos | Verificado | Critérios sem respostas pontuáveis saem do cálculo e os pesos reescalam-se |
| Áudio gravado ou argumentos escritos sem nota do auditor | Verificado (T11, T11b) | Homologação recusada com mensagem clara |
| Empresa associada automaticamente pelo nome (ou código interno) | Verificado (AUTO1, AUTO3) | `submit_evaluation` associa apenas quando corresponde a UM cliente ativo; caso contrário fica sem associação para revisão manual |
| Equipa que prestou o serviço associada automaticamente | Verificado (AUTO2, AUTO4) | Nova coluna `evaluations.team_id` / `team_name`; só equipas ativas. Antes a equipa não era gravada na base de dados |
| Re-execução das migrações 1000+1001 falhava (\"cannot drop columns from view\") | Verificado (M2) | `DROP VIEW IF EXISTS` antes do `CREATE OR REPLACE VIEW` na 1000 |
| RH não conseguia associar categorias a serviços (permissão em falta) | Verificado (T2–T4) | `GRANT SELECT, INSERT, UPDATE, DELETE` a `authenticated` (a RLS continua a limitar a ADMIN/HR) |
| Módulo puro de pontuação 80/20 (`src/services/finalScore.ts`) | Testado (`npm run test:logic`, 26 testes) | Espelha o cálculo do servidor |

Interface (concluído nesta versão, validado com `tsc`, `npm run test:logic` e `npm run build`):
- Ecrã de revisão do auditor, modal de análise e simulação do RH usam `calculateFinalScore` e a conformidade calculada a partir das respostas. As notas por critério deixaram de ser editáveis.
- Pré-visualização alinhada com o servidor: automático (máx. 80) + áudio (máx. 10) + argumentos (máx. 10).
- Removido o cálculo antigo `calculateWeightedScore` e `createHistoricalSnapshot` (sem uso).

Limitações conhecidas:
- (Resolvido na versão 8: ver abaixo.)


## Versão 7 — regras do áudio e dos argumentos, e reprodução de áudio

| Item | Estado | Como foi tratado |
|---|---|---|
| Sem áudio gravado: 10 pontos atribuídos automaticamente | Verificado (migração 1004, teste F2, `finalScore`) | Sem nota do analisador para o áudio |
| Sem comentário escrito: o analisador decide tudo ou nada (10 ou 0) | Verificado (N1–N3, testes de lógica) | Painel com dois botões; nota parcial recusada |
| Áudio gravado: nota 0–5 × 2 | Verificado (T7, T10, T11) | Sem alteração |
| Áudio não reproduzido no painel | Corrigido (código), não reproduzido em navegador | Tipo MIME enviado sem parâmetros (`audio/webm;codecs=opus` → `audio/webm`); gravações locais (`data:`/`blob:`) reproduzem diretamente; erro com botão "tentar novamente" (URL assinado expira em 5 min); falha de reprodução visível |

Causa provável da falha de reprodução: não foi possível reproduzir no navegador neste ambiente. As causas mais prováveis tratadas aqui são o tipo MIME com parâmetros no envio e a expiração do URL assinado. Se persistir, verificar no navegador a resposta de `createSignedUrl` e a consola do painel.

## Versão 8 — funcionário associado à equipa e equipa visível no formulário público

| Item | Estado | Como foi tratado |
|---|---|---|
| Sliders editáveis nos ecrãs do auditor | Verificado (0 controlos de intervalo nos três ecrãs) | Notas por critério só de leitura, calculadas a partir das respostas |
| Pré-visualização com fórmula antiga | Corrigido | Os três ecrãs usam `finalScore.ts` |
| Funcionário não associado na submissão pública | Verificado (PT3–PT6, testes da base de dados) | Cada prestador tem `team_id`. Com um só prestador ativo na equipa, fica associado automaticamente. Com vários, o cliente escolhe (opcional). Escolha de outra equipa é recusada |
| Formulário público não conseguia ler as equipas | Corrigido (código) | Tabela `teams` restrita a internos; o formulário passa a usar a vista `v_public_teams` (só equipas ativas, sem contactos) |
| Gestão do funcionário sem equipa | Corrigido (código) | Página de Prestadores: campo "Equipa" ao criar e editar |
| Lista de funcionários exposta a anónimos | Verificado (PT2) | Função `list_public_team_providers` devolve apenas id e nome |

Para ativar: depois de aplicar 1005, atribuir a cada prestador a sua equipa em Prestadores → Editar.

## Versão 9 — exportação para PDF

| Item | Estado | Como foi tratado |
|---|---|---|
| Botão PDF para os dados dos clientes (nome, código, NIF, contacto, contrato, serviços, estado) | Verificado (PDF gerado e texto conferido) | Página Clientes, botão "Exportar clientes (PDF)"; também em Relatórios |
| Botão PDF para as avaliações (referência, datas, empresa, serviço, equipa, funcionário, CSAT, NPS, pontuação final, classificação, estado) | Verificado | Página Avaliações (exporta a lista filtrada) e Relatórios |
| Relatório PDF com o âmbito, período e secções escolhidos | Verificado (secções de avaliações, clientes e metas, equipa, atividades e RH) | Página Relatórios, botão "Relatório (PDF)" |

Implementação: `src/services/pdfExport.ts`. As bibliotecas `jspdf` e `jspdf-autotable` são carregadas só ao exportar. O CSV das avaliações continua disponível.

## Versão 10 — correção do cartão de simulação do RH

| Item | Estado | Como foi tratado |
|---|---|---|
| Cartão de validação do RH ainda tinha campos numéricos editáveis por critério, com valores de teste (80, 90, 100, 60) e botão "Repor Valores de Teste (84%)" | Corrigido e verificado | Substituído por cartão só de leitura com os pesos reais e os pontos máximos por critério (peso × 0,8). Removido o estado `auditScores` e o botão de teste |
| Verificação anterior só procurava sliders (`type="range"`) e deixou de fora os campos numéricos | Corrigido no processo | Verificação feita por renderização real dos componentes (sem `range` nem `number` no ecrã do auditor) e por pesquisa de todos os controlos `number`/`range` nos três ecrãs |

Controlos `number` que permanecem de propósito: o limiar excecional na análise (decisão do analisador, com justificação obrigatória) e os pesos e limiares de configuração do RH.

## Versão 11 — apagar clientes e equipas, desfazer no calendário e importação em lote

| Item | Estado | Como foi tratado |
|---|---|---|
| Botão de apagar cliente | Verificado (DEL1: o histórico das avaliações mantém-se) | Página Clientes, detalhe do cliente, com confirmação que indica as avaliações ligadas. Disponível para ADMIN e RH |
| Apagar equipa | Corrigido (código) | O botão já existia na página de RH, mas sem confirmação e sem mensagem de erro. Agora pede confirmação e mostra o erro se falhar |
| Reverter alterações no calendário | Verificado (testes lógicos e de integração) | Botão "Desfazer" no calendário. Desfaz a última criação ou cancelamento de atividade. Ao desfazer um cancelamento, a atividade é recriada e os registos anteriores continuam válidos |
| Importação em lote de clientes (CSV) | Verificado (37 testes de lógica; DEL2 e DEL3) | Modelo CSV para descarregar, validação linha a linha e pré-visualização. Só o nome é obrigatório. Os lotes têm 40 clientes por pedido, sequenciais; o ficheiro pode ter qualquer número de linhas. Se um lote for recusado, é feito linha a linha para indicar quais falharam |

Notas:
- Duplicados são recusados pelo nome, NIF e código, contra a base de dados e dentro do próprio ficheiro.
- Os clientes importados sem código recebem um código automático (CLI-…).
- Os clientes importados sem contacto ou outros dados podem ser completados depois, pelo botão Editar.

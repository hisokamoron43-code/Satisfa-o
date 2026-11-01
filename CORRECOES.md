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

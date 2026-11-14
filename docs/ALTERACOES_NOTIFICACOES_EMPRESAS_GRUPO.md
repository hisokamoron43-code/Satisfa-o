# Alterações: erros em português, empresas, clientes, nota do grupo e supervisor

## 1. Notificações e erros em português
- `src/services/mensagensErro.ts` (`traduzirErro`) converte erros do PostgreSQL, PostgREST, Auth, Storage, rede e navegador em mensagens claras, com o motivo (ex.: «Já existe um registo com o mesmo nome da empresa (“ACME”)», «Não é possível apagar este cliente porque ainda está associado a outros registos»).
- Mensagens já em português (as `RAISE EXCEPTION` das funções SQL e das Edge Functions) mantêm-se tal como estão.
- Aplicado em `supabaseService.ts`, `employeesService.ts` e nas páginas/componentes que mostravam `err.message` em bruto.
- Quando um erro não tem tradução, aparece a mensagem padrão do contexto com o detalhe técnico no fim, e o original fica na consola do navegador.

## 2. Associação da empresa pelo nome escrito pelo cliente
- `src/services/clientMatching.ts` compara o nome livre com as empresas ativas da base de dados: ignora maiúsculas, acentos, pontuação e formas jurídicas (Lda, S.A., E.P.…), aceita palavras em ordem diferente, abreviações e pequenos erros de escrita.
- Resultado: `EXACT` e `AUTO` (associação segura), `SUGGEST` (confirmar entre candidatas) ou `NONE`.
- `EvaluationsPage`: o modal pré-seleciona a empresa quando a correspondência é segura, mostra o estado em português e o botão «Associar N empresa(s) automaticamente» trata de todas as avaliações pendentes de uma vez.
- Nomes ambíguos (ex.: «Banco» com dois bancos) nunca são associados sozinhos.

## 3. Novo cliente
- Obrigatórios: **nome da empresa** e **e-mail**. Pessoa de contacto, telefone, NIF, morada, sector e contrato passam a opcionais.
- O detalhe do cliente mostra «Dados em falta» para completar na edição.
- A importação em lote mantém a regra atual (só o nome é obrigatório). A extração de PDF fica para uma fase seguinte.

## 4. Nota para o grupo
- `src/services/grupoAvaliacao.ts`: a nota de uma avaliação conta para o prestador atribuído, para todos os membros ativos da equipa e para o supervisor da equipa.
- Aplicado na página de Prestadores (média, homologadas, tendência), nos relatórios por funcionário e no botão «Notificar grupo» de RH, que envia a notificação a cada membro (removidos os valores de reserva `'p1'` e `84`).
- Migração `1012_nota_grupo_supervisor_membro.sql`: política de leitura para membros do grupo (só avaliações homologadas) e funções auxiliares.

## 5. Supervisor: membro cadastrado ou prestador
- `teams.supervisor_employee_id` (migração 1012) ao lado de `supervisor_provider_id`; só um dos dois pode estar preenchido.
- `TeamsPage` lista membros cadastrados e prestadores (função `list_supervisor_candidates`). Se a migração ainda não foi executada, lista só os prestadores.

## Passos de instalação
1. Executar `supabase/migrations/1012_nota_grupo_supervisor_membro.sql` no Supabase (depois da 1011).
2. Publicar o frontend.

## Verificação feita
- `npm run test:logic`: 53 testes a passar (45 existentes + 8 novos).
- Não foi possível correr `npm run lint`/`build` (sem `node_modules` nem rede) nem a migração 1012 (sem PostgreSQL). Correr ambos antes de publicar.

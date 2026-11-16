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
- A importação em lote mantém a regra atual (só o nome é obrigatório).

## 4. Nota para o grupo
- `src/services/grupoAvaliacao.ts`: a nota de uma avaliação conta para o prestador atribuído, para todos os membros ativos da equipa e para o supervisor da equipa.
- Aplicado na página de Prestadores (média, homologadas, tendência), nos relatórios por funcionário e no botão «Notificar grupo» de RH, que envia a notificação a cada membro (removidos os valores de reserva `'p1'` e `84`).
- Migração `1012_nota_grupo_supervisor_membro.sql`: política de leitura para membros do grupo (só avaliações homologadas) e funções auxiliares.

## 5. Supervisor: membro cadastrado ou prestador
- `teams.supervisor_employee_id` (migração 1012) ao lado de `supervisor_provider_id`; só um dos dois pode estar preenchido.
- `TeamsPage` lista membros cadastrados e prestadores (função `list_supervisor_candidates`). Se a migração ainda não foi executada, lista só os prestadores.

## 6. Importação em lote com PDF
- `ClientImportModal` aceita CSV e PDF. O PDF é lido no navegador com `pdfjs-dist` (carregado só quando se escolhe um PDF).
- `src/services/pdfClientesExtracao.ts` (lógica pura) reconhece dois formatos: **tabela** (cabeçalho com colunas como Empresa, NIF, E-mail…, várias páginas, cabeçalho repetido, texto quebrado em duas linhas, rodapés e totais ignorados, «—» tratado como vazio) e **fichas** («Empresa: …», «NIF: …», um bloco por cliente).
- Os dados passam pela mesma validação do CSV e aparecem numa pré-visualização antes de importar, com a origem de cada linha («Pág. 2 · linha 5») e o motivo de cada erro. Só as linhas válidas são importadas; as falhas do servidor também indicam a página e a linha.
- Mensagens em português para PDF digitalizado (sem texto), protegido por palavra-passe, danificado, sem clientes, com mais de 300 páginas ou de 25 MB. Colunas não reconhecidas aparecem como aviso.
- Limitações: não lê imagens (OCR); títulos de coluna que quebram em duas linhas podem não ser reconhecidos; colunas centradas ou alinhadas à direita podem ser lidas na coluna errada.

## 7. Contas de acesso dos prestadores, «A Minha Equipa» e gestão de membros
- **Credenciais:** na página Prestadores (RH/Administrador) há um botão de chave por prestador. Cria o acesso (identificador + palavra-passe inicial, com gerador), redefine a palavra-passe e ativa/desativa a conta. Na primeira entrada o prestador tem de trocar a palavra-passe. Implementado na função `admin-employees` (ações `create_provider_account`, `list_provider_accounts`, `reset_provider_password`, `set_provider_account_status`); a conta fica ligada ao prestador por `profiles.provider_id` e vê só as páginas **A Minha Equipa** e **Mensagens**.
- **Aba «A Minha Equipa»** (`MyTeamPage`): separador **Notas** (nota média, positivas/negativas e lista das avaliações homologadas do grupo) e separador **Equipa** (membros e supervisor). Os dados vêm da função `my_team_overview()`, que devolve só os campos necessários (sem comentários do cliente). Os prestadores não têm leitura direta à tabela de avaliações. «Lançadas» foi interpretado como **homologadas**.
- **Equipas:** ao criar uma equipa escolhe-se o supervisor e os **membros** (quem já estava noutra equipa é movido, com aviso). Nas equipas existentes há **adicionar membro**, **retirar** e **mover para outra equipa**. Um prestador pertence a uma só equipa de cada vez.
- Migração `1013_contas_prestadores_minha_equipa.sql` (páginas `teams` e `my_team` no catálogo, índice único de uma conta por prestador, função `my_team_overview`). A política `evaluations_select_grupo` da 1012 foi retirada.
- Quem não tem acesso à página de entrada (ex.: um prestador) é levado automaticamente à primeira página permitida.

## 8. Notas por empresa e por tipo de serviço
- `src/services/clienteNotas.ts` calcula, para cada empresa, o **total de avaliações**, quantas estão homologadas, a **nota média geral** (média das notas técnicas oficiais, só das homologadas), positivas e negativas e a satisfação média do cliente (1 a 5).
- No detalhe do cliente (página Clientes) há a secção «Notas e histórico de avaliações»: resumo geral, tabela **por tipo de serviço** e o histórico avaliação a avaliação (data, serviço, nota, positiva/negativa ou «Por homologar»). A lista de clientes mostra também a nota média.
- A separação por serviço **foi possível**: usa os serviços que o cliente escolheu no formulário e, na falta deles, o serviço da avaliação. Uma avaliação que abrange vários serviços conta em cada um com a sua nota global (a nota oficial é uma só por avaliação); a página avisa disso. Avaliações sem serviço ficam em «Serviço não indicado».
- Os valores são calculados na hora a partir das avaliações, por isso estão sempre atualizados e não precisam de migração SQL.

## 9. Privacidade: os avaliados veem o nome da empresa?
- No último passo do formulário público, quem envia a avaliação escolhe: **«Não, manter o nome oculto»** (por defeito, recomendado) ou **«Sim, mostrar o nome da empresa»**. A escolha aparece no resumo antes de submeter.
- A escolha fica em `evaluations.client_visible_to_team`. Na migração 1013, a função `submit_evaluation` passa a guardá-la (a função anterior fica como `submit_evaluation_core`, chamada pela nova) e `my_team_overview()` só devolve o nome da empresa quando foi permitido.
- **A Minha Equipa** mostra «Empresa não revelada» quando o nome está oculto. O botão «Notificar grupo» de RH retira o nome da empresa do comentário partilhado (`ocultarEmpresaNoTexto`) quando a escolha foi ocultar, e avisa de qual foi a escolha.
- RH, Auditoria e administradores veem sempre o nome real. Avaliações anteriores à migração ficam com o nome oculto.
- Nota: se uma migração futura voltar a redefinir `submit_evaluation` por completo, a escolha deixa de ser gravada (a função nova substitui a que a guarda).

## 10. Mensagens ao estilo WhatsApp (migração 1014)
- **Menu da mensagem** (botão ⌄ na bolha, clique direito ou toque longo): reagir com emoji (👍 ❤️ 😂 😮 😢 🙏 e mais), **Responder**, **Reencaminhar**, **Copiar**, **Fixar/Desafixar**, **Corrigir** (só as próprias) e **Eliminar**.
- **Eliminar mensagem:** o autor escolhe «para todos» (fica «🚫 Eliminou esta mensagem.» e o documento é apagado) ou «só para mim». Os outros membros só podem eliminar para si.
- **Corrigir:** só o autor, a mensagem fica com a marca «editada». Sondagens não se corrigem.
- **Eliminar a conversa:** quem a iniciou vê o botão «Eliminar» no cabeçalho (conversas privadas e grupos) e apaga-a de forma permanente para todos, com mensagens, reações, sondagens e documentos. Fica registado na auditoria.
- **Reações:** uma por pessoa e mensagem; tocar no mesmo emoji retira-a. **Fixar:** até 3 mensagens por conversa, mostradas numa faixa por baixo do cabeçalho.
- **Reencaminhar** para uma ou várias conversas (o documento é copiado para a pasta da conversa de destino). A mensagem aparece como «↪ Encaminhada».
- **Sondagens:** botão ＋ → Sondagem (pergunta, 2 a 12 opções, uma ou várias respostas). Os membros votam e veem a contagem e as barras; passar o rato por cima mostra quem votou.
- Todas as regras estão na base de dados (funções `edit_message`, `delete_message`, `delete_conversation`, `react_to_message`, `set_message_pinned`, `forward_message`, `send_reply`, `create_poll`, `vote_poll`). «Eliminar para mim» usa a tabela `message_hidden`.
- Não incluído: «Marcar com estrela», «Detalhes», «Traduzir», «Perguntar à Meta AI», Fotos/Câmara/Localização/Contacto/Evento e vídeos.
- No modo de demonstração (sem Supabase) estas opções avisam que precisam da base de dados ligada.

## 11. Tempo real, barra móvel editável e indicadores
- **Mensagens em tempo real:** a página subscreve o Supabase Realtime (mensagens, reações, votos, membros e conversas). Mensagens novas, edições, eliminações, reações e votos chegam logo, sem recarregar. Ao voltar ao separador/telemóvel ou ao recuperar a ligação atualiza de imediato. Se o tempo real falhar, verifica a cada 5 s (em vez de 15 s); com ele ligado, a verificação de segurança é a cada 30 s. Um ponto junto a «Conversas» mostra o estado (verde = em tempo real). A conversa só é marcada como lida com o separador visível. A migração 1014 acrescenta as tabelas à publicação `supabase_realtime`.
- **Barra de acesso rápido editável (telemóvel):** toque longo em «Mais», ou «Personalizar barra de acesso rápido» no menu, abre o editor. Cada pessoa escolhe até 4 atalhos (e a ordem) **só entre as páginas a que tem acesso** (administradores veem todas). Se perder o acesso a uma página, o atalho desaparece sozinho. A escolha fica guardada **neste dispositivo e para este utilizador** (`localStorage`); «Repor» volta ao padrão.
- **Indicadores a 100 %:** não eram valores fixos. O CSAT é a percentagem de avaliações com média de estrelas ≥ 4, por isso com poucas avaliações todas boas dá 100 % (3 de 3). Agora o painel avisa quando há menos de 10 avaliações. Corrigidos valores enganadores: a **taxa de resposta** mostrava 100 % sem clientes ativos (agora «—»), o **NPS** mostrava 0 sem respostas (agora «—», com o número de respostas) e o CSAT/NPS do cliente também mostram «—» quando não há dados. Dois fatores que inflacionam a nota técnica por desenho: a média de estrelas é arredondada (3,5 conta como 4) e, sem áudio, os 10 pontos do áudio são atribuídos automaticamente.

## Passos de instalação
1. Executar no Supabase, por ordem, `1012_nota_grupo_supervisor_membro.sql` `1013_contas_prestadores_minha_equipa.sql` e `1014_mensagens_estilo_whatsapp.sql`, e republicar a função: `supabase functions deploy admin-employees --no-verify-jwt`.
2. Correr `npm install` (acrescenta `pdfjs-dist`; o `package-lock.json` não foi atualizado por falta de rede) e publicar o frontend.

## Verificação feita
- `npm run test:logic`: 60 testes a passar (45 existentes + 15 novos); as partes novas de contas, equipas e «A Minha Equipa» não têm testes automáticos.
- Não foi possível correr `npm run lint`/`build` (sem `node_modules` nem rede) nem a migração 1012 (sem PostgreSQL). Correr ambos antes de publicar.

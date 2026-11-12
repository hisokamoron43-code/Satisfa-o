# Empresas de demonstração e classificação do áudio/argumento

## Causa das empresas "pré-guardadas" e do erro ao atribuir
`src/services/supabaseService.ts` devolvia as listas de demonstração (`MOCK_CLIENTS`, `MOCK_PROVIDERS`, `MOCK_SERVICES`, `MOCK_EVALUATIONS`)
sempre que a base de dados vinha vazia ou dava erro de leitura. Essas empresas e prestadores tinham identificadores inventados que não existem
na base de dados, por isso associar uma avaliação a uma delas falhava ("Cliente não encontrado ou inativo" / UUID inválido).

Correção: as listas de demonstração foram esvaziadas e as funções de leitura devolvem `[]` (sem dados) ou `null` (erro, mantém o estado atual).
Se alguma destas empresas tiver sido mesmo gravada na base de dados, usar `supabase/limpar_empresas_demonstracao.sql`.

## Classificação do áudio e dos argumentos (0 a 5)
- Backend: já existia (`p_auditor_review` em `calculate_and_finalize_evaluation`, coluna `auditor_review`); complementa a avaliação e não altera a nota ponderada.
- RH (`HumanResourcesPage.tsx`): a classificação nunca era gravada porque `auditorReview` era passado como 6.º argumento de `finalizeEvaluation`, que só aceita 5. Corrigido.
- Análise de Avaliação (`EvaluationAnalysisPage.tsx`): não tinha estes campos. Painel novo, com nota 0–5 (botões, permite 0) e transcrição/notas.
- Em ambas as páginas, a homologação exige classificar o áudio e/ou os argumentos quando o cliente os deixou.

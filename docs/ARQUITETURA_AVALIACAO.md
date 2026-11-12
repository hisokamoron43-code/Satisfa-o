# SICSC — Arquitetura do módulo de avaliação, formulários e pesos

## 1. Modelo de dados

```
services ──< service_categories >── form_categories(code) ──┐
                                                            │ category (código)
evaluation_criteria (Pesos_RH) ── category_code ────────────┤
   weight_percentage (soma ativa = 100,00)                  │
                                                            ▼
                                                     form_questions
                                  type, options, option_scores, yes_score, no_score,
                                  affects_score, service_id (opcional)
                                                            │ congelado na submissão
                                                            ▼
evaluations ── detailed_answers (Respostas_Cliente), questions_snapshot
            ── criterion_ratings + criteria_snapshot (Avaliação_Auditor, imutável)
            ── auditor_review  { audio, writtenArguments, perQuestion }
```

Regras: categoria sem linhas em `service_categories` vale para todos os serviços; questão sem `service_id` vale para todos. O `questions_snapshot` guarda a configuração completa de cada questão (opções, valores de conformidade), por isso o formulário pode ser mostrado ao auditor exatamente como o cliente o viu, mesmo que o catálogo mude depois.

Tipos de questão (`QuestionType`): `RATING_5`, `RATING_10`, `NPS_10`, `SINGLE_CHOICE`, `MULTI_CHOICE`, `YES_NO_NA`, `SHORT_TEXT`/`TEXT_ONLY`, `AUDIO_AND_TEXT` (`MULTIPLE_CHOICE` mantém-se como sinónimo legado de escolha única).

Formato da resposta (`detailedAnswers[questionId]`): `rating`, `choice`, `choices[]`, `yesNo` (`YES`/`NO`/`NA`), `textAnswer`, `audioUrl`.

## 2. Ponderação (modelo 80/20, migração 1003)

A nota final tem 100 pontos:
- **80 pontos automáticos.** Para cada critério do RH (pesos que somam 100) com respostas pontuáveis, a conformidade é a média das conformidades das suas questões (0–1). Os pesos repartem os 80 pontos. Critérios sem respostas pontuáveis no serviço saem do cálculo e os restantes pesos são reescalados.
- **10 pontos de áudio.** Sem áudio gravado, são atribuídos automaticamente. Com áudio, o analisador atribui 0 a 5, multiplicado por 2.
- **10 pontos de argumentos escritos.** Com comentário, o analisador atribui 0 a 5, multiplicado por 2. Sem comentário, o analisador decide tudo ou nada: 10 pontos ou nenhum, pelas respostas dadas (migração 1004).

**Servidor (fonte de verdade).** `calculate_and_finalize_evaluation` recalcula tudo a partir de `questions_snapshot` e `detailed_answers`. O frontend não envia notas. As funções auxiliares `sicsc_norm_key` e `sicsc_question_conformity` espelham `normalizeKey` e `questionConformity`.

**Cliente (`src/services/finalScore.ts`, testado).** Mesma fórmula, usada só para pré-visualização.

**Conformidade (`src/services/questionScoring.ts`, testado).** Por tipo de questão: estrelas e escalas = valor ÷ máximo; escolha única = valor da opção; escolha múltipla = soma das opções marcadas ÷ soma dos valores positivos; Sim/Não = valores configuráveis, N.A. fica de fora. Texto e áudio não pontuam.

## 3. Componentes

| Componente | Função |
|---|---|
| `forms/QuestionTypeConfig` | tipo da questão + opções com valor de conformidade, Sim/Não, impacto na nota |
| `forms/QuestionEditor` | editor único de questões (usado no Editor de Formulários e no RH) |
| `forms/CategoryManager` | categorias, com escolha dos serviços em que se aplicam |
| `forms/ClientSatisfactionForm` | formulário do cliente: todos os tipos, categorias filtradas por serviço |
| `evaluation/WeightBalancerPanel` | alerta de balanceamento, matriz antes → depois, fixar pesos, valor por questão por serviço |
| `evaluation/EvaluationReviewWorkspace` | à esquerda o formulário respondido (estrelas, escolhas, texto, player de áudio); à direita sliders por critério com sugestão, auditoria qualitativa do áudio e dos argumentos, resultado ponderado |
| `security/IdleSessionGuard` | fim de sessão por inatividade |

## 4. Testes

- `npm run test:logic`: balanceamento e pontuação (20 testes).
- `npm run test:db`: migrações 1000 + 1001 em PGlite, incluindo tipos de questão, ligações serviço-categoria, parecer do auditor e imutabilidade.

## 5. Equipa e funcionário na submissão (migração 1005)

- `providers.team_id`: cada prestador pertence a uma equipa, definida na página de Prestadores.
- O formulário público lê as equipas ativas pela vista `v_public_teams` e os nomes dos prestadores da equipa pela função `list_public_team_providers`. A tabela `teams` e os contactos dos prestadores continuam restritos a utilizadores internos.
- `submit_evaluation`: se o cliente escolher um funcionário, este tem de pertencer à equipa indicada. Sem escolha, associa-se o único prestador ativo da equipa; com vários, fica por atribuir no ecrã de avaliações.

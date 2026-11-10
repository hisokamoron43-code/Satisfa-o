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

## 2. Ponderação

**Servidor (fonte de verdade).** `save_evaluation_criteria` recusa gravar se a soma dos critérios ativos não for 100 (tolerância 0,01). `calculate_and_finalize_evaluation` volta a validar, calcula `Σ (nota ÷ máximo × peso)` e congela o resultado. A nota oficial é sempre a que o auditor atribui por critério.

**Cliente (`src/services/weightBalancer.ts`, testado).**
1. Tudo em centésimas de ponto percentual (inteiros): 100 % = 10 000.
2. `checkWeights`: soma exata de 100,00 %, pesos entre 0 e 100, pelo menos uma categoria ativa.
3. `redistribute(items, pinnedIds)`: categorias fixadas ou acabadas de editar não se movem; o restante reparte-se proporcionalmente aos pesos atuais (partilha igual se todos forem 0), pelo método do maior resto, para somar exatamente 100,00 %. Sem solução (fixados > 100 %, ou tudo fixado com soma ≠ 100) devolve `ok: false` e pede ajuste manual.
4. `buildPlan(saved, draft, changedId, questions)`: devolve alertas (soma errada, categoria adicionada/removida/ativada/desativada, categoria com peso e sem questões ativas), a proposta e a matriz antes → depois.
5. `questionShares`: quanto vale cada questão = peso da categoria ÷ nº de questões ativas (filtrável por serviço).

**Nota sugerida (`src/services/questionScoring.ts`, testado).** Conformidade 0–1 por tipo: estrelas/escalas = valor ÷ máximo; escolha única = valor da opção; escolha múltipla = Σ opções marcadas ÷ Σ valores positivos; Sim/Não = valores configuráveis, N.A. fora; texto e áudio não pontuam. A nota sugerida do critério é a média das conformidades da sua categoria × máximo do critério. É um apoio: o auditor confirma ou ajusta cada nota.

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

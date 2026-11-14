-- ============================================================================
-- 1011 — Categorias, pesos do RH e perguntas ligados entre si
-- Executar DEPOIS da 1010, no SQL Editor do Supabase.
--
-- Regra única: a CATEGORIA do formulário é a fonte.
--   categoria  ->  1 critério de peso do RH (criado automaticamente)  ->  perguntas da categoria
--
--  1. Remove critérios do RH que não pertencem a nenhuma categoria existente
--     (os 4 pré-definidos Qualidade/Pontualidade/Segurança/Atendimento).
--  2. Cada categoria tem exatamente 1 critério (criado por trigger, peso 0; a primeira categoria fica com 100).
--  3. Nome, descrição, estado (ativo) e ordem do critério acompanham sempre a categoria.
--  4. Apagar uma categoria apaga o critério; renomear o código atualiza critério e perguntas.
--  5. Uma pergunta só pode apontar para uma categoria que exista (novas gravações validadas).
--  6. O RH só edita peso, pontuação máxima e estado; já não cria, renomeia nem apaga critérios.
--  7. O formulário público só mostra perguntas de categorias ativas.
--
-- Não apaga avaliações, clientes, serviços nem perguntas existentes. Idempotente.
-- ============================================================================

BEGIN;

-- 0. Código da categoria sempre normalizado (maiúsculas, sem espaços nas pontas)
CREATE OR REPLACE FUNCTION public.form_categories_normalize()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.code := upper(btrim(COALESCE(NULLIF(NEW.code, ''), NEW.id)));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_form_categories_normalize ON public.form_categories;
CREATE TRIGGER trg_form_categories_normalize BEFORE INSERT OR UPDATE OF code ON public.form_categories
  FOR EACH ROW EXECUTE FUNCTION public.form_categories_normalize();
UPDATE public.form_categories SET code = upper(btrim(code)) WHERE code IS DISTINCT FROM upper(btrim(code));

-- 1. Critérios sem categoria existente deixam de existir
DELETE FROM public.evaluation_criteria c
WHERE c.category_code IS NULL OR btrim(c.category_code) = ''
   OR NOT EXISTS (SELECT 1 FROM public.form_categories f WHERE f.code = upper(btrim(c.category_code)));
UPDATE public.evaluation_criteria SET category_code = upper(btrim(category_code)) WHERE category_code <> upper(btrim(category_code));

-- 2. Um critério por categoria + ligação com chave estrangeira
DELETE FROM public.evaluation_criteria a USING public.evaluation_criteria b
 WHERE a.category_code = b.category_code AND a.id > b.id;
CREATE UNIQUE INDEX IF NOT EXISTS evaluation_criteria_category_code_key ON public.evaluation_criteria (category_code);
ALTER TABLE public.evaluation_criteria DROP CONSTRAINT IF EXISTS evaluation_criteria_category_fk;
ALTER TABLE public.evaluation_criteria ADD CONSTRAINT evaluation_criteria_category_fk
  FOREIGN KEY (category_code) REFERENCES public.form_categories (code) ON UPDATE CASCADE ON DELETE CASCADE;

-- Perguntas: a categoria tem de existir (NOT VALID = não mexe nas linhas antigas, valida as novas)
ALTER TABLE public.form_questions DROP CONSTRAINT IF EXISTS form_questions_category_fk;
ALTER TABLE public.form_questions ADD CONSTRAINT form_questions_category_fk
  FOREIGN KEY (category) REFERENCES public.form_categories (code) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

-- 3. Critério criado/sincronizado a partir da categoria
CREATE OR REPLACE FUNCTION public.sync_criterion_from_category()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.evaluation_criteria
      (id, category_code, category_name, description, weight_percentage, max_score, min_score, active, display_order, updated_by)
    VALUES
      ('crit-' || lower(NEW.code), NEW.code, NEW.name, NEW.description,
       CASE WHEN EXISTS (SELECT 1 FROM public.evaluation_criteria WHERE active) THEN 0 ELSE 100 END,
       5, 0, NEW.active, NEW.display_order, 'Sistema')
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE public.evaluation_criteria
       SET category_name = NEW.name, description = NEW.description, active = NEW.active,
           display_order = NEW.display_order, updated_at = now()
     WHERE category_code = NEW.code;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_criterion_ins ON public.form_categories;
DROP TRIGGER IF EXISTS trg_sync_criterion_upd ON public.form_categories;
CREATE TRIGGER trg_sync_criterion_ins AFTER INSERT ON public.form_categories
  FOR EACH ROW EXECUTE FUNCTION public.sync_criterion_from_category();
CREATE TRIGGER trg_sync_criterion_upd AFTER UPDATE OF name, description, active, display_order ON public.form_categories
  FOR EACH ROW EXECUTE FUNCTION public.sync_criterion_from_category();

-- Categorias que já existem e ainda não têm critério
INSERT INTO public.evaluation_criteria
  (id, category_code, category_name, description, weight_percentage, max_score, min_score, active, display_order, updated_by)
SELECT 'crit-' || lower(f.code), f.code, f.name, f.description,
       CASE WHEN EXISTS (SELECT 1 FROM public.evaluation_criteria WHERE active) THEN 0 ELSE 100 END,
       5, 0, f.active, f.display_order, 'Sistema'
FROM public.form_categories f
WHERE NOT EXISTS (SELECT 1 FROM public.evaluation_criteria c WHERE c.category_code = f.code)
ORDER BY f.display_order, f.code
ON CONFLICT DO NOTHING;

-- 6. O RH só ajusta peso / pontuação máxima / estado dos critérios que existem (1 por categoria)
CREATE OR REPLACE FUNCTION public.save_evaluation_criteria(p_criteria jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  c jsonb;
  v_email text := public.current_user_email();
  v_total numeric;
  v_count integer;
  v_code text;
BEGIN
  IF COALESCE(public.current_user_role()::text, '') NOT IN ('ADMIN', 'HR') THEN
    RAISE EXCEPTION 'Acesso negado: apenas ADMIN e HR podem gerir critérios.';
  END IF;
  IF jsonb_typeof(p_criteria) <> 'array' THEN
    RAISE EXCEPTION 'Lista de critérios inválida.';
  END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(p_criteria) LOOP
    v_code := upper(btrim(COALESCE(c->>'categoryCode', '')));
    IF v_code = '' OR NOT EXISTS (SELECT 1 FROM public.form_categories WHERE code = v_code) THEN
      RAISE EXCEPTION 'Cada peso tem de pertencer a uma categoria existente do formulário (categoria "%").', v_code;
    END IF;
    IF (c->>'maxScore')::numeric <= 0 THEN
      RAISE EXCEPTION 'A pontuação máxima da categoria "%" deve ser positiva.', v_code;
    END IF;
    UPDATE public.evaluation_criteria SET
      weight_percentage = (c->>'weightPercentage')::numeric,
      max_score = (c->>'maxScore')::numeric,
      min_score = COALESCE((c->>'minScore')::numeric, 0),
      active = COALESCE((c->>'active')::boolean, true),
      updated_at = now(), updated_by = v_email
    WHERE category_code = v_code;
  END LOOP;

  SELECT COALESCE(SUM(weight_percentage), 0), COUNT(*) INTO v_total, v_count
  FROM public.evaluation_criteria WHERE active;
  IF v_count = 0 OR abs(v_total - 100) > 0.01 THEN
    RAISE EXCEPTION 'A soma dos pesos das categorias ativas deve ser exatamente 100%% (soma atual: %)', v_total;
  END IF;

  PERFORM public.log_audit_event('UPDATE', 'evaluation_criteria', NULL, 'SUCCESS',
    format('Pesos das categorias atualizados (%s categorias)', jsonb_array_length(p_criteria)), v_email);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. Formulário público: só perguntas ativas de categorias ativas
CREATE OR REPLACE VIEW public.v_public_form_questions AS
  SELECT q.id, q.version_id, q.text, q.description, q.category, q.type, q.required, q.active, q.display_order,
         q.service_id, q.options, q.conditional_on,
         q.option_scores, q.yes_score, q.no_score, q.affects_score
  FROM public.form_questions q
  WHERE q.active = true
    AND EXISTS (SELECT 1 FROM public.form_categories f WHERE f.code = upper(btrim(q.category)) AND f.active);
GRANT SELECT ON public.v_public_form_questions TO anon, authenticated;

-- Verificação: categorias, critérios e soma dos pesos ativos
SELECT
  (SELECT count(*) FROM public.form_categories)                                   AS categorias,
  (SELECT count(*) FROM public.evaluation_criteria)                               AS criterios,
  (SELECT COALESCE(sum(weight_percentage), 0) FROM public.evaluation_criteria WHERE active) AS soma_pesos_ativos;

COMMIT;

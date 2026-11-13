-- ============================================================================
-- 1008 — Numeração das avaliações a partir de AVAL-0001
-- Executar DEPOIS da 1007. Idempotente e sem apagar dados.
--
--  • As referências passam a começar em AVAL-0001 e a subir (AVAL-0002, AVAL-0003, ...).
--  • As avaliações já existentes mantêm a referência (são imutáveis depois de homologadas).
--  • O verificador nunca devolve uma referência que já exista, por isso a reexecução é segura.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.next_evaluation_reference()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref text;
BEGIN
  LOOP
    v_ref := 'AVAL-' || lpad(nextval('public.evaluation_reference_seq')::text, 4, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.evaluations e WHERE e.reference = v_ref);
  END LOOP;
  RETURN v_ref;
END;
$$;

ALTER TABLE public.evaluations ALTER COLUMN reference SET DEFAULT public.next_evaluation_reference();
ALTER SEQUENCE public.evaluation_reference_seq RESTART WITH 1;

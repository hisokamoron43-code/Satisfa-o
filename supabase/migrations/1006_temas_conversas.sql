-- ============================================================================
-- 1006 — Temas de conversa e marcação de mensagens (importantes)
-- Executar DEPOIS da 1005. Idempotente e sem apagar dados.
--
--  • conversation_topics: temas (assuntos) de uma conversa ou grupo, criados por qualquer membro.
--    Nomes repetidos (sem diferença de maiúsculas) devolvem o tema já existente.
--  • messages.topic_id: cada mensagem pode ficar marcada com um tema da mesma conversa.
--  • messages.important: mensagem marcada como importante, para ser encontrada depois.
--  • send_message passa a receber o tema e a marcação de importância (validados no servidor).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversation_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 80),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_topics_title_key ON public.conversation_topics (conversation_id, lower(btrim(title)));

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS topic_id uuid REFERENCES public.conversation_topics(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS important boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_messages_topic ON public.messages (conversation_id, topic_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_important ON public.messages (conversation_id, important) WHERE important;

ALTER TABLE public.conversation_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_topics_member_select ON public.conversation_topics;
CREATE POLICY conversation_topics_member_select ON public.conversation_topics FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id));
REVOKE ALL ON public.conversation_topics FROM anon, authenticated;
GRANT SELECT ON public.conversation_topics TO authenticated;

-- Criar tema (ou devolver o existente com o mesmo nome)
CREATE OR REPLACE FUNCTION public.create_conversation_topic(p_conversation_id uuid, p_title text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_title text := btrim(COALESCE(p_title, ''));
  v_id uuid;
BEGIN
  IF NOT public.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Não é membro desta conversa.';
  END IF;
  IF length(v_title) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'O tema deve ter entre 2 e 80 caracteres.';
  END IF;
  SELECT t.id INTO v_id FROM public.conversation_topics t
  WHERE t.conversation_id = p_conversation_id AND lower(btrim(t.title)) = lower(v_title);
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  INSERT INTO public.conversation_topics (conversation_id, title, created_by)
  VALUES (p_conversation_id, v_title, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Enviar mensagem com tema e marcação de importância (substitui a versão de 2 parâmetros)
DROP FUNCTION IF EXISTS public.send_message(uuid, text);
CREATE OR REPLACE FUNCTION public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_topic_id uuid DEFAULT NULL,
  p_important boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Não é membro desta conversa.';
  END IF;
  IF length(btrim(COALESCE(p_body, ''))) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'A mensagem deve ter entre 1 e 4000 caracteres.';
  END IF;
  IF p_topic_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversation_topics t WHERE t.id = p_topic_id AND t.conversation_id = p_conversation_id
  ) THEN
    RAISE EXCEPTION 'O tema indicado não pertence a esta conversa.';
  END IF;
  INSERT INTO public.messages (conversation_id, sender_id, body, topic_id, important)
  VALUES (p_conversation_id, auth.uid(), btrim(p_body), p_topic_id, COALESCE(p_important, false))
  RETURNING id INTO v_id;
  UPDATE public.conversations SET updated_at = now() WHERE id = p_conversation_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_conversation_topic(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_conversation_topic(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.send_message(uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text, uuid, boolean) TO authenticated;

-- ============================================================================
-- 1014 — Mensagens ao estilo WhatsApp
-- Executar DEPOIS da 1013. Idempotente e sem apagar dados existentes.
--
--  • Editar («corrigir») a própria mensagem; fica marcada como «editada».
--  • Eliminar a própria mensagem PARA TODOS (fica «Mensagem eliminada») ou só PARA MIM.
--  • Quem iniciou a conversa pode eliminá-la de forma permanente para todos (grupo ou privada).
--  • Reagir com emoji (uma reação por pessoa e mensagem; repetir o mesmo emoji retira-a).
--  • Fixar até 3 mensagens por conversa (qualquer membro).
--  • Encaminhar uma mensagem (e o seu documento) para outras conversas.
--  • Responder a uma mensagem e criar sondagens (uma ou várias respostas) com votação.
-- Todas as regras são aplicadas na base de dados, não só no ecrã.
-- ============================================================================

-- 1) Novas colunas em messages ---------------------------------------------------------------------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS forwarded boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS poll_question text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS poll_multiple boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_messages_pinned ON public.messages (conversation_id) WHERE pinned_at IS NOT NULL;

-- 2) Tabelas de apoio ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.message_hidden (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 100),
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_poll_options_message ON public.poll_options (message_id, position);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (option_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_message ON public.poll_votes (message_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_hidden ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- A leitura segue a das mensagens (a política de messages aplica-se dentro do EXISTS)
DROP POLICY IF EXISTS message_reactions_select ON public.message_reactions;
CREATE POLICY message_reactions_select ON public.message_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_reactions.message_id));
DROP POLICY IF EXISTS poll_options_select ON public.poll_options;
CREATE POLICY poll_options_select ON public.poll_options FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = poll_options.message_id));
DROP POLICY IF EXISTS poll_votes_select ON public.poll_votes;
CREATE POLICY poll_votes_select ON public.poll_votes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = poll_votes.message_id));
DROP POLICY IF EXISTS message_hidden_select ON public.message_hidden;
CREATE POLICY message_hidden_select ON public.message_hidden FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

REVOKE ALL ON public.message_reactions, public.message_hidden, public.poll_options, public.poll_votes FROM anon, authenticated;
GRANT SELECT ON public.message_reactions, public.message_hidden, public.poll_options, public.poll_votes TO authenticated;

-- 3) Mensagens «eliminadas para mim» deixam de aparecer a essa pessoa -----------------------------------
DROP POLICY IF EXISTS messages_member_select ON public.messages;
CREATE POLICY messages_member_select ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = messages.conversation_id
        AND m.profile_id = auth.uid()
        AND (m.history_from IS NULL OR messages.created_at >= m.history_from)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.message_hidden h
      WHERE h.message_id = messages.id AND h.profile_id = auth.uid()
    )
  );

-- 4) Auxiliar: conversa de uma mensagem que eu posso ver (NULL se não puder) --------------------------------
CREATE OR REPLACE FUNCTION public.visible_message_conversation(p_message_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT ms.conversation_id
  FROM public.messages ms
  JOIN public.conversation_members m ON m.conversation_id = ms.conversation_id AND m.profile_id = auth.uid()
  WHERE ms.id = p_message_id
    AND (m.history_from IS NULL OR ms.created_at >= m.history_from)
    AND NOT EXISTS (SELECT 1 FROM public.message_hidden h WHERE h.message_id = ms.id AND h.profile_id = auth.uid());
$$;

-- 5) Editar a própria mensagem ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edit_message(p_message_id uuid, p_body text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_body text := btrim(COALESCE(p_body, ''));
  v_msg public.messages%ROWTYPE;
BEGIN
  IF public.visible_message_conversation(p_message_id) IS NULL THEN
    RAISE EXCEPTION 'Mensagem não encontrada.';
  END IF;
  SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id;
  IF v_msg.sender_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Só pode corrigir as suas próprias mensagens.';
  END IF;
  IF v_msg.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta mensagem já foi eliminada.';
  END IF;
  IF v_msg.poll_question IS NOT NULL THEN
    RAISE EXCEPTION 'As sondagens não podem ser corrigidas. Elimine-a e crie outra.';
  END IF;
  IF length(v_body) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'A mensagem deve ter entre 1 e 4000 caracteres.';
  END IF;
  UPDATE public.messages SET body = v_body, edited_at = now() WHERE id = p_message_id;
  RETURN true;
END;
$$;

-- 6) Eliminar uma mensagem: para todos (só o autor) ou só para mim --------------------------------------
CREATE OR REPLACE FUNCTION public.delete_message(p_message_id uuid, p_for_all boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_msg public.messages%ROWTYPE;
BEGIN
  IF public.visible_message_conversation(p_message_id) IS NULL THEN
    RAISE EXCEPTION 'Mensagem não encontrada.';
  END IF;
  SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id;

  IF COALESCE(p_for_all, false) THEN
    IF v_msg.sender_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Só pode eliminar para todos as suas próprias mensagens. Pode eliminá-la só para si.';
    END IF;
    IF v_msg.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Esta mensagem já foi eliminada.';
    END IF;
    DELETE FROM public.poll_options WHERE message_id = p_message_id;      -- apaga também os votos
    DELETE FROM public.message_reactions WHERE message_id = p_message_id;
    UPDATE public.messages SET
      body = '🚫 Mensagem eliminada', deleted_at = now(), deleted_by = auth.uid(),
      attachment_name = NULL, attachment_path = NULL, attachment_size = NULL, attachment_type = NULL,
      important = false, pinned_at = NULL, pinned_by = NULL, poll_question = NULL, poll_multiple = false, edited_at = NULL
    WHERE id = p_message_id;
    RETURN jsonb_build_object('success', true, 'attachmentPath', v_msg.attachment_path);
  END IF;

  INSERT INTO public.message_hidden (message_id, profile_id) VALUES (p_message_id, auth.uid())
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('success', true, 'attachmentPath', NULL);
END;
$$;

-- 7) Eliminar a conversa para todos, de forma permanente (só quem a iniciou) -----------------------------
CREATE OR REPLACE FUNCTION public.delete_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_conv public.conversations%ROWTYPE;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND OR NOT public.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Conversa não encontrada.';
  END IF;
  IF v_conv.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Só quem iniciou a conversa a pode eliminar para todos.';
  END IF;
  PERFORM public.log_audit_event('DELETE', 'Conversation', p_conversation_id::text, 'SUCCESS',
    format('Conversa %s eliminada de forma permanente para todos os membros.', COALESCE(v_conv.title, v_conv.kind)),
    (SELECT email FROM public.profiles WHERE id = auth.uid()));
  DELETE FROM public.conversations WHERE id = p_conversation_id;   -- mensagens, reações, sondagens e membros em cascata
  RETURN true;
END;
$$;

-- 8) Reagir (uma reação por pessoa; o mesmo emoji outra vez retira-a) -------------------------------------
CREATE OR REPLACE FUNCTION public.react_to_message(p_message_id uuid, p_emoji text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_emoji text := btrim(COALESCE(p_emoji, ''));
  v_current text;
  v_deleted timestamptz;
BEGIN
  IF public.visible_message_conversation(p_message_id) IS NULL THEN
    RAISE EXCEPTION 'Mensagem não encontrada.';
  END IF;
  SELECT deleted_at INTO v_deleted FROM public.messages WHERE id = p_message_id;
  IF v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'Não é possível reagir a uma mensagem eliminada.';
  END IF;
  IF v_emoji <> '' AND length(v_emoji) > 16 THEN
    RAISE EXCEPTION 'Reação inválida.';
  END IF;

  SELECT emoji INTO v_current FROM public.message_reactions WHERE message_id = p_message_id AND profile_id = auth.uid();
  IF v_emoji = '' OR v_current = v_emoji THEN
    DELETE FROM public.message_reactions WHERE message_id = p_message_id AND profile_id = auth.uid();
    RETURN NULL;
  END IF;
  INSERT INTO public.message_reactions (message_id, profile_id, emoji) VALUES (p_message_id, auth.uid(), v_emoji)
  ON CONFLICT (message_id, profile_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now();
  RETURN v_emoji;
END;
$$;

-- 9) Fixar / desafixar (até 3 por conversa) ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_message_pinned(p_message_id uuid, p_pinned boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_conv uuid := public.visible_message_conversation(p_message_id);
  v_msg public.messages%ROWTYPE;
BEGIN
  IF v_conv IS NULL THEN
    RAISE EXCEPTION 'Mensagem não encontrada.';
  END IF;
  SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id;
  IF v_msg.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Não é possível fixar uma mensagem eliminada.';
  END IF;
  IF COALESCE(p_pinned, true) THEN
    IF v_msg.pinned_at IS NULL AND (SELECT count(*) FROM public.messages WHERE conversation_id = v_conv AND pinned_at IS NOT NULL) >= 3 THEN
      RAISE EXCEPTION 'Só pode fixar até 3 mensagens por conversa. Desafixe uma primeiro.';
    END IF;
    UPDATE public.messages SET pinned_at = COALESCE(pinned_at, now()), pinned_by = COALESCE(pinned_by, auth.uid()) WHERE id = p_message_id;
  ELSE
    UPDATE public.messages SET pinned_at = NULL, pinned_by = NULL WHERE id = p_message_id;
  END IF;
  RETURN true;
END;
$$;

-- 10) Encaminhar para outra conversa (a pessoa tem de ser membro de ambas) ---------------------------------
CREATE OR REPLACE FUNCTION public.forward_message(p_message_id uuid, p_target_conversation_id uuid, p_attachment_path text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_msg public.messages%ROWTYPE;
  v_id uuid;
BEGIN
  IF public.visible_message_conversation(p_message_id) IS NULL THEN
    RAISE EXCEPTION 'Mensagem não encontrada.';
  END IF;
  IF NOT public.is_conversation_member(p_target_conversation_id) THEN
    RAISE EXCEPTION 'Não é membro da conversa de destino.';
  END IF;
  SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id;
  IF v_msg.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Não é possível encaminhar uma mensagem eliminada.';
  END IF;
  IF v_msg.poll_question IS NOT NULL THEN
    RAISE EXCEPTION 'As sondagens não podem ser encaminhadas.';
  END IF;

  IF v_msg.attachment_path IS NOT NULL THEN
    IF p_attachment_path IS NULL
       OR left(p_attachment_path, length(p_target_conversation_id::text) + 1) <> p_target_conversation_id::text || '/' THEN
      RAISE EXCEPTION 'O documento não pôde ser copiado para a conversa de destino.';
    END IF;
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, body, important, forwarded,
                               attachment_name, attachment_path, attachment_size, attachment_type)
  VALUES (p_target_conversation_id, auth.uid(), v_msg.body, false, true,
          v_msg.attachment_name,
          CASE WHEN v_msg.attachment_path IS NOT NULL THEN p_attachment_path END,
          v_msg.attachment_size, v_msg.attachment_type)
  RETURNING id INTO v_id;
  UPDATE public.conversations SET updated_at = now() WHERE id = p_target_conversation_id;
  RETURN v_id;
END;
$$;

-- 11) Responder a uma mensagem ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_reply(p_conversation_id uuid, p_reply_to_id uuid, p_body text, p_important boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_body text := btrim(COALESCE(p_body, ''));
  v_id uuid;
BEGIN
  IF NOT public.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Não é membro desta conversa.';
  END IF;
  IF length(v_body) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'A mensagem deve ter entre 1 e 4000 caracteres.';
  END IF;
  IF p_reply_to_id IS NOT NULL AND public.visible_message_conversation(p_reply_to_id) IS DISTINCT FROM p_conversation_id THEN
    RAISE EXCEPTION 'A mensagem a que quer responder não pertence a esta conversa.';
  END IF;
  INSERT INTO public.messages (conversation_id, sender_id, body, important, reply_to_id)
  VALUES (p_conversation_id, auth.uid(), v_body, COALESCE(p_important, false), p_reply_to_id)
  RETURNING id INTO v_id;
  UPDATE public.conversations SET updated_at = now() WHERE id = p_conversation_id;
  RETURN v_id;
END;
$$;

-- 12) Sondagens -----------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_poll(p_conversation_id uuid, p_question text, p_options text[], p_multiple boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_question text := btrim(COALESCE(p_question, ''));
  v_opts text[];
  v_id uuid;
  v_i integer;
BEGIN
  IF NOT public.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Não é membro desta conversa.';
  END IF;
  IF length(v_question) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'A pergunta da sondagem deve ter entre 2 e 200 caracteres.';
  END IF;

  -- opções limpas, sem vazias nem repetidas (ignora maiúsculas)
  SELECT COALESCE(array_agg(o ORDER BY first_pos), '{}') INTO v_opts
  FROM (
    SELECT (array_agg(btrim(t.o) ORDER BY t.ord))[1] AS o, min(t.ord) AS first_pos
    FROM unnest(COALESCE(p_options, '{}')) WITH ORDINALITY AS t(o, ord)
    WHERE btrim(t.o) <> ''
    GROUP BY lower(btrim(t.o))
  ) d;
  IF COALESCE(array_length(v_opts, 1), 0) < 2 THEN
    RAISE EXCEPTION 'A sondagem precisa de pelo menos 2 opções diferentes.';
  END IF;
  IF array_length(v_opts, 1) > 12 THEN
    RAISE EXCEPTION 'A sondagem pode ter no máximo 12 opções.';
  END IF;
  FOR v_i IN 1..array_length(v_opts, 1) LOOP
    IF length(v_opts[v_i]) > 100 THEN
      RAISE EXCEPTION 'Cada opção deve ter no máximo 100 caracteres.';
    END IF;
  END LOOP;

  INSERT INTO public.messages (conversation_id, sender_id, body, poll_question, poll_multiple)
  VALUES (p_conversation_id, auth.uid(), '📊 ' || v_question, v_question, COALESCE(p_multiple, false))
  RETURNING id INTO v_id;
  INSERT INTO public.poll_options (message_id, text, position)
  SELECT v_id, o, ord - 1 FROM unnest(v_opts) WITH ORDINALITY AS t(o, ord);
  UPDATE public.conversations SET updated_at = now() WHERE id = p_conversation_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.vote_poll(p_message_id uuid, p_option_ids uuid[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_msg public.messages%ROWTYPE;
  v_ids uuid[] := COALESCE(p_option_ids, '{}');
BEGIN
  IF public.visible_message_conversation(p_message_id) IS NULL THEN
    RAISE EXCEPTION 'Sondagem não encontrada.';
  END IF;
  SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id;
  IF v_msg.poll_question IS NULL OR v_msg.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta mensagem não é uma sondagem.';
  END IF;
  IF NOT v_msg.poll_multiple AND COALESCE(array_length(v_ids, 1), 0) > 1 THEN
    RAISE EXCEPTION 'Esta sondagem só aceita uma resposta.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS x
    WHERE NOT EXISTS (SELECT 1 FROM public.poll_options po WHERE po.id = x AND po.message_id = p_message_id)
  ) THEN
    RAISE EXCEPTION 'Opção inválida para esta sondagem.';
  END IF;

  DELETE FROM public.poll_votes WHERE message_id = p_message_id AND profile_id = auth.uid();
  INSERT INTO public.poll_votes (option_id, message_id, profile_id)
  SELECT x, p_message_id, auth.uid() FROM unnest(v_ids) AS x
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;

-- 13) Documentos: o autor pode apagar os seus; quem iniciou a conversa apaga todos os da conversa -------------
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL AND to_regprocedure('storage.foldername(text)') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS message_files_owner_delete ON storage.objects';
    EXECUTE $p$CREATE POLICY message_files_owner_delete ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'message-files' AND (
        owner = auth.uid()
        OR EXISTS (SELECT 1 FROM public.conversations c
                   WHERE c.id::text = (storage.foldername(name))[1] AND c.created_by = auth.uid())
      ))$p$;
  END IF;
END $$;

-- 14) Permissões das funções --------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.visible_message_conversation(uuid), public.edit_message(uuid, text),
  public.delete_message(uuid, boolean), public.delete_conversation(uuid), public.react_to_message(uuid, text),
  public.set_message_pinned(uuid, boolean), public.forward_message(uuid, uuid, text),
  public.send_reply(uuid, uuid, text, boolean), public.create_poll(uuid, text, text[], boolean),
  public.vote_poll(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.visible_message_conversation(uuid), public.edit_message(uuid, text),
  public.delete_message(uuid, boolean), public.delete_conversation(uuid), public.react_to_message(uuid, text),
  public.set_message_pinned(uuid, boolean), public.forward_message(uuid, uuid, text),
  public.send_reply(uuid, uuid, text, boolean), public.create_poll(uuid, text, text[], boolean),
  public.vote_poll(uuid, uuid[]) TO authenticated;

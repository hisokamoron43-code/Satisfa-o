-- ============================================================================
-- 1007 — Temas como conversas e histórico por membro
-- Executar DEPOIS da 1006. Idempotente e sem apagar dados.
--
--  • conversations.topic: tema (assunto) da conversa, mostrado como etiqueta na lista e usado para filtrar.
--  • conversation_members.history_from: NULL = o membro vê todo o histórico da conversa;
--    uma data = o membro só vê as mensagens enviadas a partir dessa data (entrada sem histórico).
--  • messages_member_select respeita esse ponto de entrada (aplicado na base de dados, não só no ecrã).
--  • create_conversation_full: cria grupo com tema. set_conversation_topic: define/altera o tema.
--  • add_group_members_v2: acrescenta membros e escolhe se veem o histórico anterior.
-- ============================================================================

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS topic text;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_topic_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_topic_check
  CHECK (topic IS NULL OR length(btrim(topic)) BETWEEN 2 AND 60);

ALTER TABLE public.conversation_members ADD COLUMN IF NOT EXISTS history_from timestamptz;

-- Leitura de mensagens: membro com ponto de entrada só vê mensagens a partir dele
DROP POLICY IF EXISTS messages_member_select ON public.messages;
CREATE POLICY messages_member_select ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = messages.conversation_id
      AND m.profile_id = auth.uid()
      AND (m.history_from IS NULL OR messages.created_at >= m.history_from)
  ));

-- Criar grupo com tema (DIRECT delega na função existente, que já evita duplicados)
CREATE OR REPLACE FUNCTION public.create_conversation_full(p_kind text, p_title text, p_member_ids uuid[], p_topic text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_title text := btrim(COALESCE(p_title, ''));
  v_topic text := NULLIF(btrim(COALESCE(p_topic, '')), '');
  v_ids uuid[];
  v_id uuid;
BEGIN
  IF p_kind = 'DIRECT' THEN
    RETURN public.create_conversation('DIRECT', NULL, p_member_ids);
  END IF;
  IF p_kind <> 'GROUP' THEN
    RAISE EXCEPTION 'Tipo de conversa inválido.';
  END IF;
  IF length(v_title) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'O nome do grupo ou tema deve ter entre 2 e 80 caracteres.';
  END IF;
  SELECT COALESCE(array_agg(p.id), '{}') INTO v_ids
  FROM public.profiles p
  WHERE p.id = ANY (COALESCE(p_member_ids, '{}'::uuid[])) AND p.active = true AND p.id <> v_me;
  IF COALESCE(array_length(v_ids, 1), 0) < 1 THEN
    RAISE EXCEPTION 'Escolha pelo menos um colega ativo.';
  END IF;

  INSERT INTO public.conversations (kind, title, topic, created_by)
  VALUES ('GROUP', v_title, v_topic, v_me)
  RETURNING id INTO v_id;
  INSERT INTO public.conversation_members (conversation_id, profile_id, added_by)
  VALUES (v_id, v_me, v_me);
  INSERT INTO public.conversation_members (conversation_id, profile_id, added_by)
  SELECT v_id, x, v_me FROM unnest(v_ids) AS x;
  RETURN v_id;
END;
$$;

-- Definir ou limpar o tema de uma conversa (qualquer membro)
CREATE OR REPLACE FUNCTION public.set_conversation_topic(p_conversation_id uuid, p_topic text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_topic text := NULLIF(btrim(COALESCE(p_topic, '')), '');
BEGIN
  IF NOT public.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Não é membro desta conversa.';
  END IF;
  IF v_topic IS NOT NULL AND length(v_topic) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'O tema deve ter entre 2 e 60 caracteres.';
  END IF;
  UPDATE public.conversations SET topic = v_topic, updated_at = now() WHERE id = p_conversation_id;
END;
$$;

-- Acrescentar membros; p_share_history decide se veem o que foi dito antes
CREATE OR REPLACE FUNCTION public.add_group_members_v2(p_conversation_id uuid, p_member_ids uuid[], p_share_history boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_conv public.conversations%ROWTYPE;
  v_added integer;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND OR v_conv.kind <> 'GROUP' THEN
    RAISE EXCEPTION 'Grupo não encontrado.';
  END IF;
  IF v_conv.created_by IS DISTINCT FROM v_me AND public.current_user_role()::text IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Apenas o criador do grupo ou um Administrador pode acrescentar membros.';
  END IF;
  INSERT INTO public.conversation_members (conversation_id, profile_id, added_by, history_from)
  SELECT p_conversation_id, p.id, v_me, CASE WHEN COALESCE(p_share_history, true) THEN NULL ELSE now() END
  FROM public.profiles p
  WHERE p.id = ANY (COALESCE(p_member_ids, '{}'::uuid[])) AND p.active = true AND p.id <> v_me
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  RETURN v_added;
END;
$$;

REVOKE ALL ON FUNCTION public.create_conversation_full(text, text, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_conversation_full(text, text, uuid[], text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_conversation_topic(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_conversation_topic(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.add_group_members_v2(uuid, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_group_members_v2(uuid, uuid[], boolean) TO authenticated;

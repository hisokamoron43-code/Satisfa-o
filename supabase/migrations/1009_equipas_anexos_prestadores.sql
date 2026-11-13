-- ============================================================================
-- 1009 — Supervisor de equipa cadastrado, anexos nas mensagens e destinatários com prestadores
-- Executar DEPOIS da 1008. Idempotente e sem apagar dados.
--
--  • teams.supervisor_provider_id: o supervisor é sempre um funcionário (prestador) cadastrado (chave estrangeira).
--  • messages.attachment_*: documentos enviados numa conversa, guardados no bucket privado 'message-files'.
--  • send_message_v2: envia texto e/ou documento; o documento tem de estar na pasta da conversa.
--  • list_message_recipients_v2: destinatários com o prestador ligado (quando o prestador tem conta).
-- ============================================================================

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS supervisor_provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_teams_supervisor_provider ON public.teams (supervisor_provider_id);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_size bigint;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_type text;
CREATE INDEX IF NOT EXISTS idx_messages_attachment_name ON public.messages (conversation_id, lower(attachment_name));

CREATE OR REPLACE FUNCTION public.list_message_recipients_v2()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.name, 'role', p.role, 'department', p.department, 'providerId', p.provider_id)
         ORDER BY p.name), '[]'::jsonb)
  FROM public.profiles p
  WHERE p.active = true AND p.id <> auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.send_message_v2(
  p_conversation_id uuid,
  p_body text,
  p_important boolean DEFAULT false,
  p_attachment jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_body text := btrim(COALESCE(p_body, ''));
  v_name text := NULLIF(btrim(COALESCE(p_attachment->>'name', '')), '');
  v_path text := NULLIF(btrim(COALESCE(p_attachment->>'path', '')), '');
  v_size bigint := NULLIF(p_attachment->>'size', '')::bigint;
BEGIN
  IF NOT public.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'Não é membro desta conversa.';
  END IF;
  IF v_path IS NULL THEN
    IF length(v_body) NOT BETWEEN 1 AND 4000 THEN
      RAISE EXCEPTION 'A mensagem deve ter entre 1 e 4000 caracteres.';
    END IF;
  ELSE
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'O documento precisa de um nome.';
    END IF;
    IF left(v_path, length(p_conversation_id::text) + 1) <> p_conversation_id::text || '/' THEN
      RAISE EXCEPTION 'O documento não pertence a esta conversa.';
    END IF;
    IF COALESCE(v_size, 0) <= 0 OR v_size > 10485760 THEN
      RAISE EXCEPTION 'O documento deve ter entre 1 byte e 10 MB.';
    END IF;
    IF v_body = '' THEN
      v_body := '📎 ' || v_name;
    END IF;
    IF length(v_body) > 4000 THEN
      RAISE EXCEPTION 'A mensagem deve ter no máximo 4000 caracteres.';
    END IF;
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, body, important,
                               attachment_name, attachment_path, attachment_size, attachment_type)
  VALUES (p_conversation_id, auth.uid(), v_body, COALESCE(p_important, false),
          v_name, v_path, v_size, NULLIF(p_attachment->>'type', ''))
  RETURNING id INTO v_id;
  UPDATE public.conversations SET updated_at = now() WHERE id = p_conversation_id;
  RETURN v_id;
END;
$$;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('message-files', 'message-files', false, 10485760)
    ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;
  END IF;
  IF to_regclass('storage.objects') IS NOT NULL AND to_regprocedure('storage.foldername(text)') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS message_files_member_insert ON storage.objects';
    EXECUTE $p$CREATE POLICY message_files_member_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'message-files' AND public.is_conversation_member(((storage.foldername(name))[1])::uuid))$p$;
    EXECUTE 'DROP POLICY IF EXISTS message_files_member_select ON storage.objects';
    EXECUTE $p$CREATE POLICY message_files_member_select ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'message-files' AND public.is_conversation_member(((storage.foldername(name))[1])::uuid))$p$;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.list_message_recipients_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_message_recipients_v2() TO authenticated;
REVOKE ALL ON FUNCTION public.send_message_v2(uuid, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message_v2(uuid, text, boolean, jsonb) TO authenticated;

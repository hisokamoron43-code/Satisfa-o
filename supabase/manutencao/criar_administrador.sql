-- ============================================================================
-- CRIAR O PRIMEIRO ADMINISTRADOR
--
-- 1) Authentication > Users > Add user: e-mail + palavra-passe, com "Auto Confirm User" ativo.
-- 2) Substitua o e-mail abaixo (o MESMO escrito no passo 1) e corra este script.
-- 3) Inicie sessão no site com esse e-mail e palavra-passe.
-- O perfil tem de ter o mesmo id do utilizador de Authentication (é assim que o sistema o reconhece).
-- ============================================================================
BEGIN;

DO $$
DECLARE
  v_email text := lower(btrim('COLOQUE_AQUI_O_EMAIL'));
  v_uid   uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não existe nenhum utilizador "%" em Authentication. Crie-o primeiro (e confirme que o e-mail está escrito exatamente igual).', v_email;
  END IF;

  -- Se já existir outro perfil com este e-mail mas com id diferente, remove-o (o e-mail é único)
  DELETE FROM public.profiles WHERE lower(email) = v_email AND id <> v_uid;

  INSERT INTO public.profiles (id, name, email, role, department, active, allowed_pages, must_change_password)
  VALUES (v_uid, 'Administrador', v_email, 'ADMIN', 'Administração', true, '{}', false)
  ON CONFLICT (id) DO UPDATE
    SET role = 'ADMIN', active = true, email = EXCLUDED.email, must_change_password = false;

  -- Configuração do login (necessária para iniciar sessão)
  INSERT INTO public.login_settings (id, mfa_enforced_from)
  VALUES (1, now() + interval '14 days')
  ON CONFLICT (id) DO NOTHING;
END $$;

COMMIT;

-- Confirmação: deve aparecer 1 linha com role = ADMIN e active = true
SELECT u.email, u.email_confirmed_at, p.id = u.id AS perfil_ligado, p.role, p.active
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) = lower(btrim('COLOQUE_AQUI_O_EMAIL'));

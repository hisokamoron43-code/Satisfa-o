-- ============================================================================
-- DIAGNÓSTICO DE LOGIN (só leitura). Substitua o e-mail e corra os blocos um a um.
-- ============================================================================

-- 1) Existe a linha de configuração do login? (tem de devolver 1 linha; 0 linhas = ninguém consegue entrar)
SELECT * FROM public.login_settings;

-- 2) A conta existe em Authentication e está confirmada?
SELECT id, email, email_confirmed_at, banned_until, last_sign_in_at
FROM auth.users WHERE lower(email) LIKE lower('%COLOQUE_PARTE_DO_EMAIL%');

-- 3) O perfil existe, está ativo e tem o MESMO id que o utilizador de Authentication?
SELECT p.id, p.email, p.role, p.active, p.must_change_password,
       (p.id = u.id) AS ligado_ao_auth
FROM public.profiles p
LEFT JOIN auth.users u ON lower(u.email) = lower(p.email);

-- 4) O que o login resolve para este identificador? (devolve o e-mail se estiver tudo certo; NULL se não)
SELECT public.resolve_login_email('COLOQUE_AQUI_O_EMAIL');

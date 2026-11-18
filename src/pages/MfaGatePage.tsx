import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { enrollTotp, confirmTotpEnrollment, verifyTotpSession } from '../services/supabaseService';

/**
 * Ecrã de autenticação de dois fatores (TOTP) para ADMIN e HR.
 * 'enroll': primeira configuração (QR code + primeiro código).
 * 'verify': a sessão ainda não tem o segundo fator confirmado.
 * A exigência real está na base de dados (current_user_role): este ecrã só leva o utilizador até lá.
 */
export const MfaGatePage: React.FC<{ mode: 'enroll' | 'verify' }> = ({ mode }) => {
  const { refreshMfaState, logout } = useApp();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [erro, setErro] = useState<string>('');
  const [aGravar, setAGravar] = useState<boolean>(false);

  useEffect(() => {
    if (mode !== 'enroll') return;
    enrollTotp().then((r) => {
      if (!r.success) { setErro(r.error || 'Não foi possível iniciar a configuração.'); return; }
      setFactorId(r.factorId || null);
      setQr(r.qr || '');
      setSecret(r.secret || '');
    });
  }, [mode]);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    if (!/^\d{6}$/.test(code.trim())) { setErro('Introduza o código de 6 dígitos da aplicação.'); return; }
    setAGravar(true);
    const res = mode === 'enroll' && factorId
      ? await confirmTotpEnrollment(factorId, code)
      : await verifyTotpSession(code);
    setAGravar(false);
    if (!res.success) { setErro(res.error || 'Código inválido.'); return; }
    setCode('');
    await refreshMfaState();
  };

  return (
    <div className="bg-slate-950 min-h-screen flex items-center justify-center p-6 text-white">
      <div className="w-full max-w-md space-y-6 bg-white/5 border border-white/10 rounded-3xl p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-black tracking-tight">Autenticação de dois fatores</h1>
          <p className="text-sm text-slate-300">
            {mode === 'enroll'
              ? 'Para aceder aos dados de RH e de administração é obrigatória uma segunda verificação. Configure uma aplicação de autenticação (Google Authenticator, Microsoft Authenticator ou equivalente).'
              : 'Introduza o código de 6 dígitos da sua aplicação de autenticação.'}
          </p>
        </div>

        {mode === 'enroll' && qr && (
          <div className="space-y-3 text-center">
            <img src={qr} alt="QR code para a aplicação de autenticação" className="mx-auto bg-white p-2 rounded-xl w-48 h-48" />
            <p className="text-xs text-slate-300">
              Não consegue ler o QR code? Introduza manualmente esta chave: <span className="font-mono text-white break-all">{secret}</span>
            </p>
          </div>
        )}

        <form onSubmit={submeter} className="space-y-4">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full text-center text-2xl tracking-[0.5em] font-mono p-3 rounded-xl bg-white text-slate-900"
          />
          {erro && <p className="text-sm text-red-300 text-center">{erro}</p>}
          <button
            type="submit"
            disabled={aGravar || (mode === 'enroll' && !factorId)}
            className="w-full py-3 rounded-xl bg-brand text-slate-950 font-black disabled:opacity-50"
          >
            {aGravar ? 'A verificar…' : 'Confirmar'}
          </button>
        </form>

        <button onClick={() => logout()} className="w-full text-xs text-slate-400 hover:text-white underline">
          Terminar sessão
        </button>
      </div>
    </div>
  );
};

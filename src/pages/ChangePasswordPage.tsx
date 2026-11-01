import React, { useState } from 'react';
import { supabase } from '../services/supabaseService';
import { useApp } from '../context/AppContext';
import { isStrongPassword } from '../lib/authIdentifier';

const MIN_LENGTH = 8;

/** Ecrã bloqueante: a palavra-passe inicial definida por um administrador tem de ser trocada. */
export const ChangePasswordPage: React.FC = () => {
  const { logout } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isStrongPassword(password)) {
      setError('A nova palavra-passe deve ter pelo menos 8 caracteres, com letras e números.');
      return;
    }
    if (password !== confirm) {
      setError('As palavras-passe não coincidem.');
      return;
    }
    setSaving(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        setError('Não foi possível alterar a palavra-passe. Tente novamente.');
        return;
      }
      const { error: rpcErr } = await supabase.rpc('clear_must_change_password');
      if (rpcErr) {
        setError('Palavra-passe alterada, mas não foi possível concluir. Tente novamente.');
        return;
      }
      window.location.reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-100 min-h-screen flex items-center justify-center p-4 font-['Inter',sans-serif]">
      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-sm">
        <div>
          <p className="text-sm font-bold text-slate-900">Defina uma nova palavra-passe</p>
          <p className="text-xs text-slate-500 mt-1">Por segurança, a palavra-passe inicial tem de ser alterada antes de continuar.</p>
        </div>
        <input
          type="password" required autoComplete="new-password" placeholder={`Nova palavra-passe (mín. ${MIN_LENGTH})`}
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <input
          type="password" required autoComplete="new-password" placeholder="Confirmar nova palavra-passe"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        <button type="submit" disabled={saving}
          className="w-full px-4 py-2.5 bg-brand-dark hover:bg-brand-deep text-white rounded-xl text-sm font-bold transition cursor-pointer disabled:opacity-60">
          {saving ? 'A guardar…' : 'Guardar nova palavra-passe'}
        </button>
        <button type="button" onClick={() => logout()} className="w-full text-xs text-slate-500 hover:underline cursor-pointer">
          Terminar sessão
        </button>
      </form>
    </div>
  );
};

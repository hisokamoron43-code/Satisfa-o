import React, { useMemo, useState } from 'react';
import { X, KeyRound, Copy, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { Provider } from '../../types';
import {
  createProviderAccount, resetProviderPassword, setProviderAccountActive, suggestProviderIdentifier,
  type ProviderAccount,
} from '../../services/employeesService';
import { validateIdentifier, isStrongPassword } from '../../lib/authIdentifier';
import { traduzirErro } from '../../services/mensagensErro';

interface Props {
  provider: Provider;
  account?: ProviderAccount;
  onClose: () => void;
  /** Chamado depois de criar, redefinir ou ativar/desativar, para recarregar a lista de contas. */
  onChanged: () => void;
}

/** Palavra-passe aleatória forte (letras sem confusões e números), ex.: «Kx7mP2qRt9». */
function gerarPalavraPasse(): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const numeros = '23456789';
  const all = letras + numeros;
  const rnd = new Uint32Array(10);
  crypto.getRandomValues(rnd);
  const chars = Array.from(rnd, (n) => all[n % all.length]);
  // garante pelo menos um número e uma letra
  chars[0] = letras[rnd[0] % letras.length];
  chars[9] = numeros[rnd[9] % numeros.length];
  return chars.join('');
}

export const ProviderAccountModal: React.FC<Props> = ({ provider, account, onClose, onChanged }) => {
  const [identifier, setIdentifier] = useState(() => suggestProviderIdentifier(provider.name, provider.internalCode));
  const [password, setPassword] = useState(() => gerarPalavraPasse());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ identifier: string; password: string; kind: 'created' | 'reset' } | null>(null);

  const idCheck = useMemo(() => validateIdentifier(identifier), [identifier]);

  const copy = (text: string) => { try { navigator.clipboard?.writeText(text); } catch { /* ignorar */ } };

  const criar = async () => {
    setError(null);
    if (identifier.includes('@')) { setError('Use um identificador simples (sem @), por exemplo joao.silva.'); return; }
    if (!idCheck.valid) { setError(idCheck.error || 'Identificador inválido.'); return; }
    if (!isStrongPassword(password)) { setError('A palavra-passe deve ter pelo menos 8 caracteres, com letras e números.'); return; }
    setBusy(true);
    const res = await createProviderAccount(provider.id, identifier, password);
    setBusy(false);
    if (!res.success) { setError(traduzirErro(res.error, 'Não foi possível criar o acesso.')); return; }
    setDone({ identifier: res.data?.identifier || idCheck.normalized || identifier, password, kind: 'created' });
    onChanged();
  };

  const redefinir = async () => {
    setError(null);
    if (!isStrongPassword(password)) { setError('A palavra-passe deve ter pelo menos 8 caracteres, com letras e números.'); return; }
    setBusy(true);
    const res = await resetProviderPassword(provider.id, password);
    setBusy(false);
    if (!res.success) { setError(traduzirErro(res.error, 'Não foi possível redefinir a palavra-passe.')); return; }
    setDone({ identifier: account?.identifier ?? '', password, kind: 'reset' });
    onChanged();
  };

  const alternarEstado = async () => {
    if (!account) return;
    const ativar = !account.active;
    if (!ativar && !window.confirm(`Desativar o acesso de ${provider.name}? A sessão atual é terminada e deixa de poder entrar.`)) return;
    setError(null);
    setBusy(true);
    const res = await setProviderAccountActive(provider.id, ativar);
    setBusy(false);
    if (!res.success) { setError(traduzirErro(res.error, 'Não foi possível alterar o estado do acesso.')); return; }
    onChanged();
    onClose();
  };

  return (
    <div className="modal-overlay fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="prov-acc-title">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="prov-acc-title" className="text-lg font-black text-slate-900 flex items-center gap-2"><KeyRound className="w-5 h-5 text-brand-dark" /> Acesso ao sistema</h3>
            <p className="text-slate-500 mt-0.5">{provider.name}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>

        {done ? (
          <div className="space-y-3">
            <p className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900">
              {done.kind === 'created' ? 'Acesso criado.' : 'Palavra-passe redefinida.'} Entregue estas credenciais ao prestador. <strong>A palavra-passe não volta a ser mostrada.</strong>
              No primeiro acesso ser-lhe-á pedido que a troque.
            </p>
            <dl className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 font-mono">
              {done.identifier && <div className="flex items-center justify-between gap-2"><dt className="text-slate-500 font-sans">Identificador</dt><dd className="font-bold">{done.identifier}</dd></div>}
              <div className="flex items-center justify-between gap-2"><dt className="text-slate-500 font-sans">Palavra-passe</dt><dd className="font-bold">{done.password}</dd></div>
            </dl>
            <div className="flex justify-end gap-2">
              <button onClick={() => copy(`Identificador: ${done.identifier}\nPalavra-passe: ${done.password}`)} className="px-3 py-2 border border-slate-300 rounded-xl font-bold flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> Copiar</button>
              <button onClick={onClose} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold">Concluir</button>
            </div>
          </div>
        ) : account ? (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <p className="flex items-center gap-2">
                {account.active ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> : <ShieldAlert className="w-4 h-4 text-rose-600" />}
                <strong>{account.active ? 'Acesso ativo' : 'Acesso desativado'}</strong>
              </p>
              <p>Identificador: <strong className="font-mono">{account.identifier}</strong></p>
              {account.mustChangePassword && <p className="text-amber-700">Ainda não trocou a palavra-passe inicial.</p>}
              {account.lastLoginAt && <p className="text-slate-500">Último acesso: {new Date(account.lastLoginAt).toLocaleString('pt-PT')}</p>}
            </div>

            <div className="space-y-2">
              <label className="block font-bold text-slate-700 uppercase">Nova palavra-passe</label>
              <div className="flex gap-2">
                <input value={password} onChange={(e) => setPassword(e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand" />
                <button type="button" onClick={() => setPassword(gerarPalavraPasse())} className="px-3 border border-slate-300 rounded-xl" title="Gerar outra" aria-label="Gerar outra palavra-passe"><RefreshCw className="w-4 h-4" /></button>
              </div>
              <button onClick={redefinir} disabled={busy} className="w-full px-4 py-2 bg-brand-dark text-white rounded-xl font-bold disabled:opacity-50">{busy ? 'A guardar…' : 'Redefinir palavra-passe'}</button>
            </div>

            <button onClick={alternarEstado} disabled={busy} className={`w-full px-4 py-2 rounded-xl font-bold border disabled:opacity-50 ${account.active ? 'border-rose-300 text-rose-700 hover:bg-rose-50' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>
              {account.active ? 'Desativar acesso' : 'Reativar acesso'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-slate-600">
              O prestador entra com o identificador e a palavra-passe, e vê apenas <strong>A Minha Equipa</strong> (as notas das avaliações do seu grupo) e as <strong>Mensagens</strong>.
              Na primeira entrada tem de trocar a palavra-passe.
            </p>
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">Identificador de acesso *</label>
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="ex.: joao.silva"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand" />
              {!idCheck.valid && identifier.trim() !== '' && <p className="text-rose-600 mt-1">{idCheck.error}</p>}
            </div>
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">Palavra-passe inicial *</label>
              <div className="flex gap-2">
                <input value={password} onChange={(e) => setPassword(e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand" />
                <button type="button" onClick={() => setPassword(gerarPalavraPasse())} className="px-3 border border-slate-300 rounded-xl" title="Gerar outra" aria-label="Gerar outra palavra-passe"><RefreshCw className="w-4 h-4" /></button>
              </div>
              <p className="text-slate-500 mt-1">Mínimo 8 caracteres, com letras e números.</p>
            </div>
            <button onClick={criar} disabled={busy} className="w-full px-4 py-2.5 bg-brand-dark text-white rounded-xl font-bold disabled:opacity-50">{busy ? 'A criar…' : 'Criar acesso'}</button>
          </div>
        )}

        {error && <p className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200">{error}</p>}
      </div>
    </div>
  );
};

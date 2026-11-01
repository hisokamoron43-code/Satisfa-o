import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { LoginMethods, fetchLoginMethods, saveLoginMethodsInDb } from '../services/supabaseService';

const LABELS: Record<keyof LoginMethods, string> = {
  access_identifier: 'Identificador de acesso (ex.: joao.neto)',
  full_name: 'Nome completo (ex.: João Neto Silva)',
  employee_number: 'Número de funcionário (ex.: AET-010)',
  email: 'E-mail da conta',
};

/** Apenas o Administrador escolhe quais os dados aceites para iniciar sessão. */
export const LoginSettingsCard: React.FC = () => {
  const { currentUser } = useApp();
  const [methods, setMethods] = useState<LoginMethods | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchLoginMethods().then(setMethods); }, []);
  if (currentUser?.role !== 'ADMIN' || !methods) return null;

  const toggle = (key: keyof LoginMethods) => {
    const next = { ...methods, [key]: !methods[key] };
    if (!Object.values(next).some(Boolean)) { setMsg('Pelo menos um método de login deve estar ativo.'); return; }
    setMethods(next);
    setMsg(null);
  };

  const save = async () => {
    setSaving(true);
    const r = await saveLoginMethodsInDb(methods);
    setSaving(false);
    setMsg(r.success ? 'Configuração de login guardada.' : (r.error || 'Não foi possível guardar.'));
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
      <div className="pb-3 border-b border-slate-100">
        <h3 className="text-base font-black text-slate-900">Configuração de login</h3>
        <p className="text-xs text-slate-500 mt-1">
          Escolha com que dados os colaboradores podem iniciar sessão. Só funcionam para contas ativas.
          A criação e a edição de contas são feitas na página de Funcionários.
        </p>
      </div>
      <div className="space-y-2">
        {(Object.keys(LABELS) as (keyof LoginMethods)[]).map(key => (
          <label key={key} className="flex items-center gap-3 cursor-pointer text-sm text-slate-800">
            <input type="checkbox" className="accent-brand-dark w-4 h-4" checked={methods[key]} onChange={() => toggle(key)} />
            {LABELS[key]}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-brand-dark hover:bg-brand-deep disabled:opacity-60 text-white rounded-xl text-xs font-bold cursor-pointer">
          {saving ? 'A guardar…' : 'Guardar configuração'}
        </button>
        {msg && <span className="text-xs text-slate-600">{msg}</span>}
      </div>
    </div>
  );
};

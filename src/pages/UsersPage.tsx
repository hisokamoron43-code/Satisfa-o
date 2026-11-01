import React from 'react';
import { useApp } from '../context/AppContext';
import { Shield, UserCheck, CheckCircle2, Lock } from 'lucide-react';

export const UsersPage: React.FC = () => {
  const { currentUser, systemUsers } = useApp();

  const roleLabels: Record<string, string> = {
    ADMIN: 'Administrador (Acesso Total)',
    HR: 'Recursos Humanos (Gestão de Ocorrências & Permissões)',
    DIRECTOR: 'Direcção (Indicadores e Relatórios)',
    OPERATIONAL: 'Responsável Operacional (Supervisão)',
    PROVIDER: 'Prestador de Serviços (Acesso Restrito)'
  };

  const displayUsers = systemUsers ?? [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Utilizadores & Contas do Sistema</h2>
          <p className="text-xs text-slate-500 mt-0.5">Gestão baseada no princípio do menor privilégio, contas devidamente separadas e controlo por função (RBAC).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayUsers.map(user => (
          <div key={user.id} className={`bg-white rounded-2xl p-5 border shadow-xs flex flex-col justify-between ${currentUser?.id === user.id ? 'border-brand ring-1 ring-brand' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-brand-dark border border-emerald-200 flex items-center justify-center font-bold text-sm">
                  {user.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">{user.name}</h3>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${user.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                {user.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Perfil:</span>
                <span className="font-bold text-slate-800">{roleLabels[user.role] || user.role}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Departamento:</span>
                <span className="text-slate-800 font-semibold">{user.department}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Último Login:</span>
                <span className="text-slate-600">{user.lastLogin}</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">ID: {user.id}</span>
              {currentUser?.id === user.id ? (
                <span className="text-xs text-brand-dark font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Conta Autenticada Ativa
                </span>
              ) : (
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Conta Separada
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

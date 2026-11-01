import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { FileText, Search, ShieldCheck } from 'lucide-react';

export const AuditPage: React.FC = () => {
  const { auditLogs } = useApp();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = auditLogs.filter(log =>
    log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.operationType.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.affectedEntity.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Registo de Auditoria e Segurança</h2>
          <p className="text-xs text-slate-500 mt-0.5">Registo imutável de operações críticas, alterações de estado e acessos confidenciais no SICSC.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar nos registos de auditoria..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand transition"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">Timestamp / Operação</th>
                <th className="p-4">Utilizador Responsável</th>
                <th className="p-4">Entidade Afetada</th>
                <th className="p-4">Detalhes da Operação</th>
                <th className="p-4 text-right">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition">
                  <td className="p-4">
                    <p className="font-bold text-slate-900">{log.timestamp}</p>
                    <span className="inline-block mt-0.5 px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">
                      {log.operationType}
                    </span>
                  </td>
                  <td className="p-4">
                    <p className="font-bold text-slate-800">{log.userName}</p>
                    <p className="text-[11px] text-slate-500">{log.userEmail}</p>
                  </td>
                  <td className="p-4 font-semibold text-slate-700">
                    {log.affectedEntity} {log.recordId ? `(${log.recordId})` : ''}
                  </td>
                  <td className="p-4 text-slate-600 max-w-md">{log.details}</td>
                  <td className="p-4 text-right">
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full">
                      {log.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

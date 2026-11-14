import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Provider } from '../types';
import { avaliacoesDoPrestador } from '../services/grupoAvaliacao';
import { UserCheck, Search, Plus, Edit3, Trash2, Power, CheckCircle2, XCircle, ShieldCheck, ShieldAlert, X, Mail, Briefcase, Star, Award, Shield } from 'lucide-react';
import { KpiDetailModal } from '../components/analytics/KpiDetailModal';

export const ProvidersPage: React.FC = () => {
  const { providers, addProvider, updateProvider, deleteProvider, toggleProviderAccess, services, teams, currentUser, evaluations, clients } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKpiModal, setSelectedKpiModal] = useState<string | null>(null);

  const totalProviders = providers.length;
  const activeProviders = providers.filter(p => p.status === 'ACTIVE').length;
  const authorizedProviders = providers.filter(p => p.evaluationAccessAuthorized).length;
  const avgCsatTech = evaluations.length > 0 
    ? (evaluations.reduce((acc, curr) => acc + (curr.satisfactionRating || 0), 0) / evaluations.length).toFixed(1)
    : '4.9';
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);

  // Deletion modal
  const [deletingProvider, setDeletingProvider] = useState<Provider | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Access toggle modal for reason
  const [accessModalProvider, setAccessModalProvider] = useState<Provider | null>(null);
  const [accessReason, setAccessReason] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [internalCode, setInternalCode] = useState('');
  const [professionalEmail, setProfessionalEmail] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [teamId, setTeamId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');

  const filteredProviders = providers.filter(prov => 
    prov.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prov.internalCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    prov.professionalEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenModal = (prov?: Provider) => {
    if (prov) {
      setEditingProvider(prov);
      setName(prov.name);
      setInternalCode(prov.internalCode);
      setProfessionalEmail(prov.professionalEmail);
      setSelectedServices(prov.services);
      setTeamId(prov.teamId ?? '');
    } else {
      setEditingProvider(null);
      setName('');
      setInternalCode('');
      setProfessionalEmail('');
      setSelectedServices(services[0] ? [services[0].name] : []);
      setTeamId('');
    }
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !internalCode || !professionalEmail) {
      setErrorMsg('Preencha os campos obrigatórios (Nome, Código e E-mail).');
      return;
    }

    if (!editingProvider) {
      addProvider({
        name,
        internalCode,
        professionalEmail,
        services: selectedServices,
        teamId: teamId || undefined,
        status: 'ACTIVE',
        evaluationAccessAuthorized: false
      });
    } else {
      updateProvider(editingProvider.id, {
        name,
        internalCode,
        professionalEmail,
        services: selectedServices,
        teamId: teamId || undefined
      });
    }
    setIsModalOpen(false);
  };

  const handleServiceToggle = (srvName: string) => {
    if (selectedServices.includes(srvName)) {
      setSelectedServices(selectedServices.filter(s => s !== srvName));
    } else {
      setSelectedServices([...selectedServices, srvName]);
    }
  };

  const confirmToggleAccess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessModalProvider) return;
    toggleProviderAccess(accessModalProvider.id, accessReason || 'Alteração administrativa autorizada.');
    setAccessModalProvider(null);
    setAccessReason('');
  };

  const canManageAccess = currentUser?.role === 'ADMIN' || currentUser?.role === 'HR';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Prestadores de Serviços</h2>
          <p className="text-xs text-slate-500 mt-0.5">Técnicos e operacionais da AETERNU responsáveis pelas intervenções no terreno.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          style={{ backgroundColor: '#8CBF26' }}
          className="text-slate-950 font-extrabold px-4 py-2.5 rounded-xl shadow-md text-xs flex items-center justify-center gap-2 hover:opacity-95 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Prestador</span>
        </button>
      </div>

      {/* Interactive KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setSelectedKpiModal('total')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Técnicos e Prestadores</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{totalProviders}</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
              {activeProviders} Ativos
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver quadro de pessoal e qualificações &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('csat')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">CSAT Técnico Média</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              ★
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{avgCsatTech} <span className="text-sm font-normal text-slate-500">/ 5.0</span></span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
              Desempenho Elevado
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver histórico de avaliações técnicas &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('sla')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Pontualidade nas Intervenções</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">97.8%</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full">
              Meta &ge; 95%
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver cumprimento de horários no terreno &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('pending')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Acessos Autorizados pelo RH</span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{authorizedProviders}</span>
            <span className="text-[10px] bg-purple-100 text-purple-800 font-extrabold px-2 py-0.5 rounded-full">
              {Math.round((authorizedProviders / (totalProviders || 1)) * 100)}% Habilitados
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver permissões e auditoria de acessos &rarr;</p>
        </button>
      </div>
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por prestador, código ou e-mail..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand transition"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">Prestador / Código</th>
                <th className="p-4">E-mail Profissional</th>
                <th className="p-4">Serviços Associados</th>
                <th className="p-4">Histórico Homologado</th>
                <th className="p-4">Acesso a Avaliações</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProviders.map(prov => (
                <tr key={prov.id} className="hover:bg-slate-50/80 transition">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-brand-dark border border-emerald-200 flex items-center justify-center font-bold flex-shrink-0">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{prov.name}</p>
                        <p className="text-[11px] text-slate-500">{prov.internalCode}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{prov.professionalEmail}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {prov.services.map((srv, i) => (
                        <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-semibold rounded-md">
                          {srv}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-4">
                    {(() => {
                      const provEvals = avaliacoesDoPrestador(evaluations, prov, teams);
                      const homologated = provEvals.filter(e => !!e.finalizedAt);
                      const totalHomologated = homologated.length;
                      const avgTechScore = totalHomologated > 0
                        ? (homologated.reduce((acc, curr) => acc + (curr.technicalScore || 0), 0) / totalHomologated).toFixed(1)
                        : null;
                      
                      // Tendência recente (últimas avaliações ordenadas por data)
                      const recentEvals = [...homologated].sort((a, b) => b.serviceDate.localeCompare(a.serviceDate)).slice(0, 3);
                      const isPositiveTrend = recentEvals.length > 0 && (recentEvals.reduce((acc, c) => acc + (c.technicalScore || 0), 0) / recentEvals.length) >= 75;

                      return (
                        <div className="space-y-1 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800">{totalHomologated} homologadas</span>
                          </div>
                          {avgTechScore ? (
                            <div className="flex items-center gap-2">
                              <span className="font-black text-brand-dark bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                {avgTechScore}% Média
                              </span>
                              <span className={`text-[10px] font-bold ${isPositiveTrend ? 'text-emerald-700' : 'text-slate-500'}`}>
                                {isPositiveTrend ? '↑ Tendência Alta' : '→ Estável'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">Sem homologações</span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="p-4">
                    <button
                      disabled={!canManageAccess}
                      onClick={() => {
                        setAccessModalProvider(prov);
                        setAccessReason('');
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold transition ${prov.evaluationAccessAuthorized ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                      title={canManageAccess ? 'Clique para alterar permissão' : 'Requer perfil de RH ou Administrador'}
                    >
                      {prov.evaluationAccessAuthorized ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                      {prov.evaluationAccessAuthorized ? 'Autorizado' : 'Não Autorizado'}
                    </button>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${prov.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                      {prov.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {prov.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenModal(prov)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingProvider(prov)}
                        className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition"
                        title="Remover Prestador"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Access Grant/Revoke Confirmation Modal */}
      {accessModalProvider && (
        <div className="modal-overlay fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-black text-slate-900">
                {accessModalProvider.evaluationAccessAuthorized ? 'Revogar Acesso a Avaliações' : 'Conceder Acesso a Avaliações'}
              </h3>
              <button onClick={() => setAccessModalProvider(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-slate-600 mb-4">
              Vai {accessModalProvider.evaluationAccessAuthorized ? 'revogar' : 'conceder'} o acesso às próprias avaliações do prestador <strong className="text-slate-900">{accessModalProvider.name}</strong>. Esta alteração será registada na auditoria de Recursos Humanos.
            </p>

            <form onSubmit={confirmToggleAccess} className="space-y-4">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Motivo da Alteração *</label>
                <textarea
                  required
                  rows={3}
                  value={accessReason}
                  onChange={(e) => setAccessReason(e.target.value)}
                  placeholder="Justifique a alteração de privilégios..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAccessModalProvider(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: '#8CBF26' }}
                  className="px-5 py-2 text-slate-950 font-extrabold rounded-xl shadow-md hover:opacity-95 transition"
                >
                  Confirmar Alteração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Deactivate Confirmation Modal */}
      {deletingProvider && (
        <div className="modal-overlay fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-black text-slate-900">
                Remover Prestador
              </h3>
              <button onClick={() => setDeletingProvider(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-slate-600 mb-4">
              Tem a certeza de que deseja remover o prestador <strong className="text-slate-900">{deletingProvider.name}</strong> ({deletingProvider.internalCode})? O seu registo será desativado na base de dados do Supabase.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingProvider(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  await deleteProvider(deletingProvider.id);
                  setIsDeleting(false);
                  setDeletingProvider(null);
                }}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl shadow-md transition disabled:opacity-50"
              >
                {isDeleting ? 'A remover...' : 'Confirmar Remoção'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Create/Edit */}
      {isModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-black text-slate-900">
                {editingProvider ? 'Editar Prestador' : 'Novo Prestador'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-xs border border-red-200">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Carlos Manuel"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">Código Interno *</label>
                  <input
                    type="text"
                    required
                    value={internalCode}
                    onChange={(e) => setInternalCode(e.target.value)}
                    placeholder="PRV-001"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">E-mail Profissional *</label>
                  <input
                    type="email"
                    required
                    value={professionalEmail}
                    onChange={(e) => setProfessionalEmail(e.target.value)}
                    placeholder="carlos@prestador.aeternu.co.ao"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1.5">Equipa</label>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-950"
                >
                  <option value="">Sem equipa</option>
                  {teams.filter(t => t.status === 'ACTIVE').map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">A equipa define os funcionários que aparecem no formulário de satisfação para essa equipa.</p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1.5">Serviços Habilitados</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {services.map(srv => (
                    <label key={srv.id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-slate-200/50 rounded">
                      <input
                        type="checkbox"
                        checked={selectedServices.includes(srv.name)}
                        onChange={() => handleServiceToggle(srv.name)}
                        className="rounded text-brand focus:ring-brand"
                      />
                      <span className="text-slate-800 font-medium">{srv.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: '#8CBF26' }}
                  className="px-5 py-2 text-slate-950 font-extrabold rounded-xl shadow-md hover:opacity-95 transition"
                >
                  {editingServiceText(editingProvider)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Universal KPI Detail Modal */}
      {selectedKpiModal && (
        <KpiDetailModal
          kpiType={selectedKpiModal as any}
          isOpen={!!selectedKpiModal}
          onClose={() => setSelectedKpiModal(null)}
          evaluations={evaluations}
          services={services}
          clients={clients}
        />
      )}
    </div>
  );

  function editingServiceText(prov: Provider | null) {
    return prov ? 'Guardar Alterações' : 'Criar Prestador';
  }
};

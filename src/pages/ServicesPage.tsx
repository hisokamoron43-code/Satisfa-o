import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ServiceItem } from '../types';
import { Briefcase, Search, Plus, Edit3, Power, CheckCircle2, XCircle, X, BarChart3, Star, Clock, AlertCircle } from 'lucide-react';
import { KpiDetailModal } from '../components/analytics/KpiDetailModal';

export const ServicesPage: React.FC = () => {
  const { services, addService, updateService, toggleServiceStatus, evaluations, clients } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKpiModal, setSelectedKpiModal] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);

  const totalServices = services.length;
  const activeServices = services.filter(s => s.status === 'ACTIVE').length;
  const avgCsatScore = evaluations.length > 0 
    ? (evaluations.reduce((acc, curr) => acc + (curr.satisfactionRating || 0), 0) / evaluations.length).toFixed(1)
    : '4.9';

  // Form state
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [evaluationIndicator, setEvaluationIndicator] = useState<'CSAT' | 'NPS' | 'CSAT_AND_NPS'>('CSAT_AND_NPS');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const filteredServices = services.filter(service => 
    service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    service.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    service.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenModal = (service?: ServiceItem) => {
    if (service) {
      setEditingService(service);
      setName(service.name);
      setCode(service.code);
      setDescription(service.description);
      setEvaluationIndicator(service.evaluationIndicator);
    } else {
      setEditingService(null);
      setName('');
      setCode('');
      setDescription('');
      setEvaluationIndicator('CSAT_AND_NPS');
    }
    setErrorMsg('');
    setIsSaving(false);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) {
      setErrorMsg('Preencha os campos obrigatórios (Nome e Código).');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      if (!editingService) {
        const res = await addService({
          name,
          code,
          description,
          status: 'ACTIVE',
          evaluationIndicator
        });
        if (!res.success) {
          setErrorMsg(res.error || 'Falha ao gravar serviço no Supabase.');
          setIsSaving(false);
          return;
        }
      } else {
        const res = await updateService(editingService.id, {
          name,
          code,
          description,
          evaluationIndicator
        });
        if (!res.success) {
          setErrorMsg(res.error || 'Falha ao atualizar serviço no Supabase.');
          setIsSaving(false);
          return;
        }
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro inesperado.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Catálogo de Serviços</h2>
          <p className="text-xs text-slate-500 mt-0.5">Serviços de Higiene, Segurança, Ambiente e Manutenção prestados pela AETERNU.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          style={{ backgroundColor: '#8CBF26' }}
          className="text-slate-950 font-extrabold px-4 py-2.5 rounded-xl shadow-md text-xs flex items-center justify-center gap-2 hover:opacity-95 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Serviço</span>
        </button>
      </div>

      {/* Interactive KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setSelectedKpiModal('total')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Catálogo de Serviços</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{totalServices}</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
              {activeServices} Ativos
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver serviços e abrangência &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('csat')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Avaliação Média dos Serviços</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              ★
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{avgCsatScore} <span className="text-sm font-normal text-slate-500">/ 5.0</span></span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
              Qualidade Alta
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver notas de CSAT por tipo de serviço &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('sla')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Conformidade Operacional</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">99.1%</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full">
              Padrão AETERNU
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver métricas de prazos e execução &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('response_rate')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Taxa de Resposta do Cliente</span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">94.2%</span>
            <span className="text-[10px] bg-purple-100 text-purple-800 font-extrabold px-2 py-0.5 rounded-full">
              Engajamento Elevado
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver rácio de respostas por intervenção &rarr;</p>
        </button>
      </div>
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por nome do serviço, código ou descrição..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand transition"
          />
        </div>
      </div>

      {/* Services Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-4">Serviço / Código</th>
                <th className="p-4">Descrição</th>
                <th className="p-4">Indicador de Avaliação</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredServices.map(service => (
                <tr key={service.id} className="hover:bg-slate-50/80 transition">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-brand-dark border border-emerald-200 flex items-center justify-center font-bold flex-shrink-0">
                        <Briefcase className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{service.name}</p>
                        <p className="text-[11px] text-slate-500">{service.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-slate-600 max-w-md">
                    <p className="line-clamp-2">{service.description}</p>
                  </td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-800 font-bold rounded-lg text-[10px]">
                      {service.evaluationIndicator === 'CSAT_AND_NPS' ? 'CSAT & NPS' : service.evaluationIndicator}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${service.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                      {service.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {service.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenModal(service)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleServiceStatus(service.id)}
                        className={`p-1.5 rounded-lg transition ${service.status === 'ACTIVE' ? 'bg-amber-50 hover:bg-amber-100 text-amber-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'}`}
                        title={service.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Create/Edit */}
      {isModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-black text-slate-900">
                {editingService ? 'Editar Serviço' : 'Novo Serviço'}
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
                <label className="block font-bold text-slate-700 uppercase mb-1">Nome do Serviço *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Auditoria de Segurança Ocupacional"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Código *</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="HST-AUD-06"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Descrição</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Breve descrição técnica do serviço..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase mb-1">Indicador de Avaliação</label>
                <select
                  value={evaluationIndicator}
                  onChange={(e) => setEvaluationIndicator(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="CSAT_AND_NPS">CSAT & NPS</option>
                  <option value="CSAT">Apenas CSAT</option>
                  <option value="NPS">Apenas NPS</option>
                </select>
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
                  {editingService ? 'Guardar Alterações' : 'Criar Serviço'}
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
};

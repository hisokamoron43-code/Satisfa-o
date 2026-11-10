import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Star, 
  TrendingUp, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  MessageSquare, 
  Building2, 
  ArrowUpRight,
  Filter,
  ShieldCheck,
  CheckSquare,
  Calendar as CalendarIcon,
  X,
  MousePointerClick,
  HelpCircle
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { DateRangeCalendarPicker, DateRange } from '../components/DateRangeCalendarPicker';
import { KpiDetailModal, KpiType } from '../components/analytics/KpiDetailModal';

export const DashboardPage: React.FC = () => {
  const { evaluations, clients, services, hrCases, setActiveTab } = useApp();
  const [timeFilter, setTimeFilter] = useState<'7d' | '30d' | '90d' | 'custom' | 'all'>('30d');
  const [selectedKpi, setSelectedKpi] = useState<KpiType | null>(null);

  const [customRange, setCustomRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
    label: undefined
  });

  // Extract all evaluation dates for dot indicators on the calendar
  const evaluationDates = useMemo(() => {
    return evaluations
      .map(e => (e.evaluationDate || e.serviceDate || '').substring(0, 10))
      .filter(Boolean);
  }, [evaluations]);

  // Dynamically filter evaluations based on selected time window / calendar dates
  const filteredEvaluations = useMemo(() => {
    if (timeFilter === 'all') return evaluations;

    const today = new Date();
    const todayStr = today.toISOString().substring(0, 10);
    let startLimit: string | null = null;
    let endLimit: string | null = todayStr;

    if (timeFilter === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      startLimit = d.toISOString().substring(0, 10);
    } else if (timeFilter === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      startLimit = d.toISOString().substring(0, 10);
    } else if (timeFilter === '90d') {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      startLimit = d.toISOString().substring(0, 10);
    } else if (timeFilter === 'custom' && customRange.startDate) {
      startLimit = customRange.startDate;
      endLimit = customRange.endDate || customRange.startDate;
    }

    if (!startLimit) return evaluations;

    return evaluations.filter(e => {
      const d = (e.evaluationDate || e.serviceDate || '').substring(0, 10);
      if (!d) return true;
      if (endLimit && d > endLimit) return false;
      return d >= startLimit;
    });
  }, [evaluations, timeFilter, customRange]);

  // Handler when calendar range is applied
  const handleApplyCalendarRange = (range: DateRange) => {
    setCustomRange(range);
    setTimeFilter('custom');
  };

  const handleResetFilter = () => {
    setCustomRange({ startDate: null, endDate: null, label: undefined });
    setTimeFilter('30d');
  };

  // Metrics calculation based on filtered dataset
  const totalEvaluations = filteredEvaluations.length;
  const pendingReviewCount = filteredEvaluations.filter(e => e.status === 'PENDING_REVIEW').length;
  const openCorrectiveActions = filteredEvaluations.filter(e => e.correctiveActionStatus === 'PENDING' || e.correctiveActionStatus === 'IN_PROGRESS').length;
  
  // CSAT calculation (percentage of ratings >= 4)
  const satisfiedCount = filteredEvaluations.filter(e => e.satisfactionRating >= 4).length;
  const csatPercentage = totalEvaluations > 0 ? Math.round((satisfiedCount / totalEvaluations) * 100) : 0;

  // NPS calculation (Promoters 9-10 % minus Detractors 0-6 %)
  const npsScores = filteredEvaluations.filter(e => e.npsScore !== undefined && e.npsScore !== null).map(e => e.npsScore!);
  const promoters = npsScores.filter(score => score >= 9).length;
  const detractors = npsScores.filter(score => score <= 6).length;
  const npsValue = npsScores.length > 0 ? Math.round(((promoters - detractors) / npsScores.length) * 100) : 0;

  // Response rate calculation: percentage of active clients who have submitted at least one evaluation
  const activeClientsCount = clients.filter(c => c.status === 'ACTIVE').length;
  const uniqueClientsResponded = new Set(filteredEvaluations.map(e => e.clientId).filter(Boolean)).size;
  const responseRate = activeClientsCount > 0 
    ? Math.min(100, Math.round((uniqueClientsResponded / activeClientsCount) * 100))
    : (totalEvaluations > 0 ? 100 : 0);

  // Chart data for satisfaction trend over time (aggregated by date)
  const trendData = useMemo(() => {
    if (filteredEvaluations.length === 0) {
      return [{ name: 'Sem registos', satisfaction: 0 }];
    }

    const groups: Record<string, { sum: number; count: number }> = {};
    
    filteredEvaluations.forEach((ev) => {
      const dateStr = (ev.evaluationDate || '').substring(0, 10);
      if (!dateStr) return;
      
      const key = dateStr; // Sortable YYYY-MM-DD
      
      if (!groups[key]) {
        groups[key] = { sum: 0, count: 0 };
      }
      groups[key].sum += ev.satisfactionRating;
      groups[key].count += 1;
    });

    return Object.entries(groups)
      .sort((a, b) => a[0].localeCompare(b[0])) // Sort by YYYY-MM-DD
      .map(([dateStr, b]) => {
        const date = new Date(dateStr);
        return {
          name: date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }),
          satisfaction: b.count > 0 ? Number((b.sum / b.count).toFixed(1)) : 0
        };
      });
  }, [filteredEvaluations]);

  // Chart data by service
  const serviceSatisfactionData = services.map(srv => {
    const srvEvals = filteredEvaluations.filter(e => e.serviceId === srv.id);
    const avg = srvEvals.length > 0 
      ? Number((srvEvals.reduce((acc, curr) => acc + curr.satisfactionRating, 0) / srvEvals.length).toFixed(1))
      : 4.0;
    return {
      name: srv.name.length > 20 ? srv.name.substring(0, 18) + '...' : srv.name,
      satisfaction: avg,
      total: srvEvals.length
    };
  });

  // Distribution Pie Chart
  const positiveEvals = filteredEvaluations.filter(e => e.satisfactionRating >= 4).length;
  const neutralEvals = filteredEvaluations.filter(e => e.satisfactionRating === 3).length;
  const negativeEvals = filteredEvaluations.filter(e => e.satisfactionRating <= 2).length;

  const distributionData = [
    { name: 'Satisfeitos (4-5 ★)', value: positiveEvals, color: '#8CBF26' },
    { name: 'Neutros (3 ★)', value: neutralEvals, color: '#94a3b8' },
    { name: 'Insatisfeitos (1-2 ★)', value: negativeEvals, color: '#ef4444' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Welcome & Filter Banner */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-brand-dark text-xs font-bold border border-emerald-200">
              AETERNU LDA
            </span>
            <span className="text-xs text-slate-400">Moeda: AOA (Kz)</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Indicadores de Controlo de Qualidade</h2>
          <p className="text-xs text-slate-500 mt-0.5">Visão consolidada da satisfação dos clientes e desempenho dos prestadores. Clique em qualquer indicador para abrir a análise detalhada.</p>

          {/* Active Filter Pill */}
          {timeFilter !== '30d' && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 text-xs">
              <span className="text-slate-500 font-medium">Período ativo:</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-brand/20 text-slate-950 font-bold border border-brand/40 flex items-center gap-1.5">
                <CalendarIcon className="w-3 h-3 text-brand-dark" />
                {timeFilter === 'custom' 
                  ? (customRange.label || `${customRange.startDate} até ${customRange.endDate}`) 
                  : timeFilter === '7d' 
                  ? 'Últimos 7 Dias' 
                  : timeFilter === '90d' 
                  ? 'Últimos 90 Dias' 
                  : 'Todo o Histórico'}
                <span className="text-slate-600 font-normal">({filteredEvaluations.length} avaliações)</span>
                <button 
                  onClick={handleResetFilter} 
                  className="hover:text-red-600 transition ml-1 p-0.5" 
                  title="Restabelecer período padrão (30 dias)"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}
        </div>

        {/* Filter Toolbar with Presets & DateRangeCalendarPicker */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-2xl p-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-0.5" />
            <button 
              onClick={() => {
                setTimeFilter('7d');
                setCustomRange({ startDate: null, endDate: null, label: undefined });
              }}
              className={`px-3 py-1.5 rounded-xl font-semibold transition ${timeFilter === '7d' ? 'bg-brand text-slate-950 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'}`}
            >
              7 Dias
            </button>
            <button 
              onClick={() => {
                setTimeFilter('30d');
                setCustomRange({ startDate: null, endDate: null, label: undefined });
              }}
              className={`px-3 py-1.5 rounded-xl font-semibold transition ${timeFilter === '30d' ? 'bg-brand text-slate-950 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'}`}
            >
              30 Dias
            </button>
            <button 
              onClick={() => {
                setTimeFilter('90d');
                setCustomRange({ startDate: null, endDate: null, label: undefined });
              }}
              className={`px-3 py-1.5 rounded-xl font-semibold transition ${timeFilter === '90d' ? 'bg-brand text-slate-950 font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-200/60'}`}
            >
              90 Dias
            </button>
          </div>

          <DateRangeCalendarPicker
            currentRange={customRange}
            onApplyRange={handleApplyCalendarRange}
            onClear={handleResetFilter}
            evaluationDates={evaluationDates}
          />
        </div>
      </div>

      {/* INTERACTIVE KPI CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        
        {/* 1. CSAT */}
        <div 
          onClick={() => setSelectedKpi('csat')}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group relative"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Índice CSAT
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-brand-dark group-hover:scale-110 transition-transform">
              <Star className="w-4 h-4 fill-brand text-brand-dark" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">{csatPercentage}%</div>
            <p className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> {satisfiedCount} de {totalEvaluations} ≥ 4★
            </p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 group-hover:text-brand-dark">
            <span>👆 Detalhes</span>
            <MousePointerClick className="w-3 h-3" />
          </div>
        </div>

        {/* 2. NPS */}
        <div 
          onClick={() => setSelectedKpi('nps')}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs hover:border-[#00A3E0] hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group relative"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Índice NPS
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">{npsValue > 0 ? `+${npsValue}` : npsValue} pts</div>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">Escala -100 a +100</p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 group-hover:text-blue-600">
            <span>👆 Detalhes</span>
            <MousePointerClick className="w-3 h-3" />
          </div>
        </div>

        {/* 3. Total Evaluations */}
        <div 
          onClick={() => setSelectedKpi('total')}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs hover:border-purple-400 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group relative"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Total Avaliações
            </span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600 group-hover:scale-110 transition-transform">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">{totalEvaluations}</div>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">{clients.length} clientes ativos</p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 group-hover:text-purple-600">
            <span>👆 Detalhes</span>
            <MousePointerClick className="w-3 h-3" />
          </div>
        </div>

        {/* 4. Pending Review */}
        <div 
          onClick={() => setSelectedKpi('pending')}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs hover:border-amber-400 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group relative"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Pendente (RH)
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-600">{pendingReviewCount}</div>
            <p className="text-[10px] text-amber-600 font-bold mt-0.5">Análise de RH</p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 group-hover:text-amber-600">
            <span>👆 Detalhes</span>
            <MousePointerClick className="w-3 h-3" />
          </div>
        </div>

        {/* 5. Corrective Actions */}
        <div 
          onClick={() => setSelectedKpi('corrective')}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs hover:border-red-400 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group relative"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Ações Corretivas
            </span>
            <div className="p-2 rounded-xl bg-red-50 text-red-600 group-hover:scale-110 transition-transform">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-red-600">{openCorrectiveActions}</div>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">Em resolução</p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 group-hover:text-red-600">
            <span>👆 Detalhes</span>
            <MousePointerClick className="w-3 h-3" />
          </div>
        </div>

        {/* 6. Response Rate */}
        <div 
          onClick={() => setSelectedKpi('response_rate')}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group relative"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Taxa Resposta
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-brand-dark group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">{responseRate}%</div>
            <p className="text-[10px] text-emerald-600 font-bold mt-0.5">Meta: &gt; 80%</p>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 group-hover:text-brand-dark">
            <span>👆 Detalhes</span>
            <MousePointerClick className="w-3 h-3" />
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-black text-slate-900">Evolução Temporal da Satisfação</h3>
              <p className="text-xs text-slate-500 font-medium">Média de pontuação por data</p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-800 font-extrabold px-3 py-1 rounded-xl">Média (1-5★)</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis domain={[1, 5]} stroke="#64748b" fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="satisfaction" stroke="#8CBF26" strokeWidth={3} dot={{ r: 5, fill: '#2D6A28' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900">Distribuição de Avaliações</h3>
            <p className="text-xs text-slate-500 font-medium">Proporção de feedback por nível</p>
          </div>
          <div className="h-52 w-full my-auto">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={distributionData} 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={50} 
                  outerRadius={75} 
                  paddingAngle={4}
                  dataKey="value"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
            {distributionData.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-slate-600 font-medium">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></span>
                  {item.name}
                </span>
                <span className="font-black text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Service Bar Chart */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-black text-slate-900">Satisfação Média por Tipo de Serviço</h3>
            <p className="text-xs text-slate-500 font-medium">Avaliações consolidadas por área de intervenção da AETERNU</p>
          </div>
          <button 
            onClick={() => setActiveTab('services')}
            className="text-xs text-brand-dark font-black hover:underline flex items-center gap-1"
          >
            Ver Serviços <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serviceSatisfactionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
              <YAxis domain={[0, 5]} stroke="#64748b" fontSize={12} />
              <Tooltip />
              <Bar dataKey="satisfaction" fill="#8CBF26" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Evaluations Table & Priority Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-black text-slate-900">Avaliações Recentes</h3>
              <p className="text-xs text-slate-500 font-medium">Últimos registos submetidos pelos clientes</p>
            </div>
            <button 
              onClick={() => setActiveTab('evaluations')}
              className="text-xs text-brand-dark font-black hover:underline"
            >
              Ver todas ({filteredEvaluations.length} {filteredEvaluations.length !== evaluations.length ? `de ${evaluations.length}` : ''})
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-black border-b border-slate-200">
                <tr>
                  <th className="p-3">Ref. / Cliente</th>
                  <th className="p-3">Serviço</th>
                  <th className="p-3">Classificação (CSAT / NPS)</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvaluations.slice(0, 5).map(ev => (
                  <tr key={ev.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3">
                      <p className="font-bold text-slate-900">{ev.reference}</p>
                      <p className="text-[11px] text-slate-500">{ev.clientName}</p>
                    </td>
                    <td className="p-3 text-slate-700 font-medium">{ev.serviceName}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded-md font-extrabold text-[11px] ${ev.satisfactionRating >= 4 ? 'bg-emerald-100 text-emerald-800' : ev.satisfactionRating === 3 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                          ★ {ev.satisfactionRating}/5
                        </span>
                        {ev.npsScore !== undefined && ev.npsScore !== null && (
                          <span className="text-[10px] text-slate-500 font-bold">NPS {ev.npsScore}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                        ev.status === 'PENDING_REVIEW' 
                          ? 'bg-amber-100 text-amber-800' 
                          : ev.status === 'RESOLVED' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {ev.status === 'PENDING_REVIEW' ? 'Pendente de Análise' : ev.status === 'RESOLVED' ? 'Resolvido' : 'Analisado'}
                      </span>
                    </td>
                    <td className="p-3 text-right text-slate-500 font-medium">{ev.evaluationDate}</td>
                  </tr>
                ))}
                {filteredEvaluations.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      Nenhuma avaliação registada no período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Priority Actions List */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-900">Ações Urgentes de RH</h3>
              <span className="text-[10px] bg-red-100 text-red-700 font-extrabold px-2.5 py-0.5 rounded-full">
                {hrCases.filter(c => c.status !== 'RESOLVIDO').length} pendentes
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4 font-medium">Ocorrências que exigem acompanhamento do Departamento de Recursos Humanos.</p>

            <div className="space-y-3">
              {hrCases.filter(c => c.status !== 'RESOLVIDO').map(cCase => (
                <div key={cCase.id} className="p-3.5 bg-red-50/60 border border-red-200 rounded-2xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-xs text-red-900">{cCase.occurrenceType}</span>
                    <span className="text-[10px] bg-red-200/80 text-red-800 font-bold px-1.5 py-0.5 rounded">
                      {cCase.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 line-clamp-2 mt-1">{cCase.internalNotes}</p>
                  <div className="mt-2.5 pt-2 border-t border-red-200/60 flex items-center justify-between text-[10px] text-slate-500 font-medium">
                    <span>Resp: {cCase.assignedTo}</span>
                    <button 
                      onClick={() => setActiveTab('hr')}
                      className="text-brand-dark font-black hover:underline flex items-center gap-0.5"
                    >
                      Gerir <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
              {hrCases.filter(c => c.status !== 'RESOLVIDO').length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  <CheckSquare className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <span className="text-xs font-bold">Não existem ocorrências pendentes de ação corretiva.</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 text-center">
            <button 
              onClick={() => setActiveTab('hr')}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black text-xs py-3 rounded-2xl transition shadow-xs"
            >
              Abrir Módulo de Recursos Humanos (RH)
            </button>
          </div>
        </div>
      </div>

      {/* KPI Detail Modal Dialog */}
      <KpiDetailModal
        kpiType={selectedKpi}
        isOpen={!!selectedKpi}
        onClose={() => setSelectedKpi(null)}
        evaluations={filteredEvaluations}
        services={services}
        clients={clients}
      />
    </div>
  );
};

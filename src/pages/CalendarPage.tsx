import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Building2, 
  Users, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  Filter, 
  Briefcase,
  MapPin,
  UserCheck,
  X,
  BarChart3,
  Award
} from 'lucide-react';
import { KpiDetailModal } from '../components/analytics/KpiDetailModal';

export const CalendarPage: React.FC = () => {
  const { clients, services, teams, providers, activities, addActivity, deleteActivity, evaluations, undoLastActivityChange, activityUndoLabel, activityUndoCount } = useApp();
  const [undoError, setUndoError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('month');
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('all');
  const [selectedKpiModal, setSelectedKpiModal] = useState<string | null>(null);

  const totalTasks = activities.length;
  const conflictTasks = activities.filter(a => a.status === 'CONFLICT').length;
  const scheduledTasks = activities.filter(a => a.status === 'SCHEDULED' || a.status === 'COMPLETED').length;
  
  // Real dynamic date navigation state
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null); // 'YYYY-MM-DD'

  // New activity form state
  const [modalClient, setModalClient] = useState(clients[0]?.companyName || 'Sonangol');
  const [modalTitle, setModalTitle] = useState('');
  const [modalDate, setModalDate] = useState(new Date().toISOString().substring(0, 10));
  const [modalTime, setModalTime] = useState('09:00');
  const [modalEndTime, setModalEndTime] = useState('11:00');
  const [modalService, setModalService] = useState(services[0]?.name || 'Inspecção de Extintores');
  const [modalTeam, setModalTeam] = useState(teams[0]?.name || 'Equipa Operacional');
  const [modalLocation, setModalLocation] = useState('Luanda - Sede Principal');
  const [modalProvider, setModalProvider] = useState(providers[0]?.name || 'Carlos Neto');

  // Month navigation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-11
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Handle saving new activity
  const handleSaveActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTitle.trim()) return;

    // Check if there's any conflict on the same date/time
    const hasConflict = activities.some(
      act => act.activityDate === modalDate && act.startTime === modalTime
    );

    addActivity({
      title: modalTitle.trim(),
      clientName: modalClient,
      clientId: clients.find(c => c.companyName === modalClient)?.id,
      serviceName: modalService,
      location: modalLocation,
      activityDate: modalDate,
      startTime: modalTime,
      endTime: modalEndTime,
      teamName: modalTeam,
      assignedProviderIds: [modalProvider],
      status: hasConflict ? 'CONFLICT' : 'SCHEDULED'
    });

    setModalTitle('');
    setIsModalOpen(false);
  };

  // Filter activities
  const filteredActivities = activities.filter(act => {
    if (selectedClientFilter === 'all') return true;
    return act.clientName?.toLowerCase().includes(selectedClientFilter.toLowerCase());
  });

  // Calculate days for month view
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  let startDayOfWeek = firstDayOfMonth.getDay() - 1; // 0 = Mon, 6 = Sun
  if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday becomes 6

  // Hours for timetable
  const hoursList = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-fadeIn">
      
      {/* CABEÇALHO DA FUNCIONALIDADE DE CALENDÁRIO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        
        {/* Identificação da Marca & Título */}
        <div className="flex items-center gap-4">
          <svg className="w-12 h-12 flex-shrink-0" viewBox="0 0 100 100" fill="none">
            <defs>
              <linearGradient id="aeternuGradLeft" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2D6A28"/>
                <stop offset="100%" stopColor="#8CBF26"/>
              </linearGradient>
              <linearGradient id="aeternuGradRight" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8CBF26"/>
                <stop offset="100%" stopColor="#1B4D1B"/>
              </linearGradient>
            </defs>
            <path d="M 20 85 L 50 15 L 68 50 L 50 85 Z" fill="url(#aeternuGradLeft)" />
            <path d="M 50 15 L 80 85 L 62 85 L 42 45 Z" fill="url(#aeternuGradRight)" />
          </svg>

          <div>
            <span className="text-xs font-bold text-brand-dark uppercase tracking-wider block">Funcionalidade Operacional • SICSC</span>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Calendário de Agendamento &amp; Visitas</h1>
            <p className="text-xs text-slate-500 mt-0.5">Gestão interativa em tempo real por cliente cadastrado, inspecções técnicas e operações.</p>
          </div>
        </div>

        {/* Controles de Visão & Novo Agendamento */}
        <div className="flex items-center gap-3">
          {/* Desfazer a última alteração do calendário (criar ou cancelar atividade) */}
          <div className="flex flex-col items-end">
            <button
              onClick={async () => {
                setUndoError(null);
                const r = await undoLastActivityChange();
                if (!r.success) setUndoError(r.error || 'Não foi possível desfazer.');
              }}
              disabled={!activityUndoLabel}
              title={activityUndoLabel ? `Desfazer: ${activityUndoLabel}` : 'Sem alterações para desfazer'}
              className="px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-40 rounded-xl text-xs font-bold text-slate-800"
            >
              ↶ Desfazer{activityUndoCount > 0 ? ` (${activityUndoCount})` : ''}
            </button>
            {undoError && <span className="text-[10px] text-red-700 mt-1 max-w-[220px] text-right">{undoError}</span>}
          </div>

          {/* Alternador de Visão (Dia / Semana / Mês) */}
          <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex text-xs font-bold">
            <button 
              onClick={() => setViewMode('day')} 
              className={`px-3.5 py-2 rounded-lg transition ${viewMode === 'day' ? 'bg-brand text-slate-950 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Dia
            </button>
            <button 
              onClick={() => setViewMode('week')} 
              className={`px-3.5 py-2 rounded-lg transition ${viewMode === 'week' ? 'bg-brand text-slate-950 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Semana
            </button>
            <button 
              onClick={() => setViewMode('month')} 
              className={`px-3.5 py-2 rounded-lg transition ${viewMode === 'month' ? 'bg-brand text-slate-950 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Mês
            </button>
          </div>

          {/* Botão Adicionar Evento */}
          <button 
            onClick={() => {
              setModalDate(new Date().toISOString().substring(0, 10));
              setIsModalOpen(true);
            }} 
            className="bg-brand hover:bg-[#7ab01f] text-slate-950 font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 transition shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Agendar Tarefa</span>
          </button>
        </div>

      </div>

      {/* Interactive KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setSelectedKpiModal('total')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Total de Actividades Agendadas</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <CalendarIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{totalTasks}</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
              {scheduledTasks} Regulares
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver tarefas e atribuições &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('corrective')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Conflitos de Agendamento</span>
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{conflictTasks}</span>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${conflictTasks > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {conflictTasks > 0 ? 'Requer Ajuste' : 'Sem Conflitos'}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver detalhes de sobreposição &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('sla')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Taxa de Cumprimento de Agenda</span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">97.2%</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full">
              Meta &ge; 95%
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver índices de pontualidade e execução &rarr;</p>
        </button>

        <button
          onClick={() => setSelectedKpiModal('response_rate')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-brand hover:shadow-md transition text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Cobertura de Clientes</span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">100%</span>
            <span className="text-[10px] bg-purple-100 text-purple-800 font-extrabold px-2 py-0.5 rounded-full">
              {clients.length} Clientes
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Clique para ver calendário por cliente &rarr;</p>
        </button>
      </div>
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Navegador de Mês / Ano Real */}
        <div className="flex items-center gap-3">
          <button 
            onClick={handlePrevMonth}
            className="p-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-2xs"
            title="Mês Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center min-w-[160px]">
            <span className="text-sm font-black text-slate-950">{monthNames[month]} {year}</span>
          </div>
          <button 
            onClick={handleNextMonth}
            className="p-2 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-2xs"
            title="Próximo Mês"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button 
            onClick={handleToday}
            className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-100 transition shadow-2xs"
          >
            Hoje
          </button>
        </div>

        {/* Dropdown / Filtro de Cliente Cadastrado */}
        <div className="flex items-center gap-3 flex-1 justify-end">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider whitespace-nowrap">Filtrar por Cliente:</span>
          <select 
            value={selectedClientFilter} 
            onChange={(e) => setSelectedClientFilter(e.target.value)}
            className="w-full md:w-72 bg-white border border-slate-300 text-slate-900 text-xs font-semibold rounded-xl p-2.5 focus:outline-none focus:border-brand transition"
          >
            <option value="all">Todos os Clientes Cadastrados ({clients.length})</option>
            {clients.map(client => (
              <option key={client.id} value={client.companyName}>{client.companyName} ({client.internalCode})</option>
            ))}
          </select>
        </div>

      </div>

      {/* VISÃO MENSAL REAL */}
      {viewMode === 'month' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-brand" />
              <span>Visão Mensal de Operações — {monthNames[month]} {year} (Clique em qualquer dia para ver ou agendar)</span>
            </h3>
            <span className="text-xs text-slate-500 font-semibold">{daysInMonth} Dias • Gestão Global de Clientes</span>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-600">
            <div className="p-2 bg-slate-100 rounded-lg">Seg</div>
            <div className="p-2 bg-slate-100 rounded-lg">Ter</div>
            <div className="p-2 bg-slate-100 rounded-lg">Qua</div>
            <div className="p-2 bg-slate-100 rounded-lg">Qui</div>
            <div className="p-2 bg-slate-100 rounded-lg">Sex</div>
            <div className="p-2 bg-slate-100 rounded-lg">Sáb</div>
            <div className="p-2 bg-slate-100 rounded-lg">Dom</div>

            {/* Espaços vazios iniciais antes do dia 1 do mês */}
            {Array.from({ length: startDayOfWeek }).map((_, idx) => (
              <div key={`empty-${idx}`} className="min-h-[85px] border border-slate-100 rounded-xl p-2.5 bg-slate-50/20 opacity-40"></div>
            ))}

            {/* Dias reais do mês */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const formattedDay = String(dayNum).padStart(2, '0');
              const formattedMonth = String(month + 1).padStart(2, '0');
              const dateStr = `${year}-${formattedMonth}-${formattedDay}`;

              const todayObj = new Date();
              const isToday = dayNum === todayObj.getDate() && month === todayObj.getMonth() && year === todayObj.getFullYear();
              
              const dayActivities = filteredActivities.filter(a => a.activityDate === dateStr);

              return (
                <div 
                  key={dayNum} 
                  onClick={() => setSelectedDayDate(dateStr)}
                  className={`min-h-[90px] border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between transition cursor-pointer hover:border-brand hover:shadow-md ${
                    isToday ? 'bg-emerald-50 border-brand ring-1 ring-brand' : 'bg-slate-50/50 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${isToday ? 'text-brand-dark' : 'text-slate-800'}`}>{dayNum}</span>
                    {isToday && <span className="text-[8px] bg-brand text-slate-950 font-extrabold px-1.5 py-0.5 rounded">Hoje</span>}
                  </div>
                  
                  <div className="space-y-1 my-1">
                    {dayActivities.slice(0, 2).map((act, idx) => (
                      <div key={idx} className="text-[9px] bg-white border border-slate-200 p-1 rounded truncate font-bold text-slate-800">
                        {act.startTime} {act.clientName || act.title}
                      </div>
                    ))}
                    {dayActivities.length === 0 && (
                      <div className="text-[9px] text-slate-400 italic">Sem tarefas</div>
                    )}
                  </div>

                  <span className="text-[9px] font-bold text-brand-dark text-right">
                    {dayActivities.length > 0 ? `${dayActivities.length} Tarefa(s)` : '+ Agendar'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VISÃO SEMANAL REAL */}
      {viewMode === 'week' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-brand" />
              <span>Visão Semanal de Operações — {monthNames[month]} {year}</span>
            </h3>
            <span className="text-xs text-slate-500 font-semibold">Horários por Hora (08:00 - 17:00)</span>
          </div>

          <div className="space-y-3">
            {hoursList.map(hour => (
              <div key={hour} className="flex items-start gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="w-16 font-mono font-bold text-xs text-slate-500 pt-1">{hour}</span>
                <div className="flex-1 space-y-2">
                  {filteredActivities.filter(a => a.startTime?.startsWith(hour.substring(0, 2))).map(act => (
                    <div key={act.id} className="bg-white border border-slate-200 p-3 rounded-xl flex items-center justify-between shadow-xs">
                      <div>
                        <span className="font-bold text-xs text-slate-950 block">{act.activityDate} • {act.startTime} - {act.title}</span>
                        <span className="text-xs text-slate-500">Cliente: {act.clientName} • Serviço: {act.serviceName} • Equipa: {act.teamName}</span>
                      </div>
                      <button onClick={() => deleteActivity(act.id)} className="text-slate-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {filteredActivities.filter(a => a.startTime?.startsWith(hour.substring(0, 2))).length === 0 && (
                    <span className="text-xs text-slate-400 italic">Nenhum agendamento neste horário.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VISÃO DIÁRIA REAL */}
      {viewMode === 'day' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-brand" />
              <span>Visão Diária — {currentDate.toLocaleDateString('pt-PT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </h3>
            <button 
              onClick={() => {
                setModalDate(currentDate.toISOString().substring(0, 10));
                setIsModalOpen(true);
              }}
              className="px-3 py-1.5 bg-brand text-slate-950 rounded-xl text-xs font-bold hover:bg-[#7ab01f] transition"
            >
              + Adicionar Tarefa para hoje
            </button>
          </div>

          <div className="space-y-3">
            {hoursList.map(hour => {
              const dateStr = currentDate.toISOString().substring(0, 10);
              const dayActs = filteredActivities.filter(a => a.activityDate === dateStr && a.startTime?.startsWith(hour.substring(0, 2)));

              return (
                <div key={hour} className="flex items-start gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="w-16 font-mono font-bold text-xs text-slate-500 pt-1">{hour}</span>
                  <div className="flex-1 space-y-2">
                    {dayActs.map(act => (
                      <div key={act.id} className="bg-white border border-slate-200 p-3 rounded-xl flex items-center justify-between shadow-xs">
                        <div>
                          <span className="font-bold text-xs text-slate-900 block">{act.startTime} - {act.title}</span>
                          <span className="text-xs text-slate-500">Cliente: {act.clientName} • Equipa: {act.teamName}</span>
                        </div>
                        <button onClick={() => deleteActivity(act.id)} className="text-slate-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {dayActs.length === 0 && (
                      <span className="text-xs text-slate-400 italic">Nenhum evento às {hour}.</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL INTERATIVO DE DETALHES DO DIA SELECIONADO */}
      {selectedDayDate && (
        <div className="modal-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-scaleUp">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand/20 border border-brand flex items-center justify-center text-brand-dark font-black text-sm">
                  {selectedDayDate.substring(8, 10)}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Actividades do Dia</h3>
                  <p className="text-xs text-slate-500">Data: {selectedDayDate}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedDayDate(null)} 
                className="text-slate-400 hover:text-slate-600 text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Lista de Atividades do Dia */}
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {activities.filter(a => a.activityDate === selectedDayDate).map(act => (
                <div key={act.id} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-brand/30 text-slate-950">
                        {act.startTime} - {act.endTime}
                      </span>
                      <span className="text-xs font-bold text-slate-900">{act.title}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">Cliente: <strong className="text-slate-800">{act.clientName}</strong> • Equipa: {act.teamName}</p>
                  </div>
                  <button 
                    onClick={() => deleteActivity(act.id)} 
                    className="p-2 text-slate-400 hover:text-red-600 transition"
                    title="Remover Tarefa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {activities.filter(a => a.activityDate === selectedDayDate).length === 0 && (
                <div className="p-8 text-center text-slate-400 text-xs font-medium">
                  Nenhuma actividade agendada para este dia específico. Clique abaixo para agendar a primeira tarefa baseada nos clientes cadastrados.
                </div>
              )}
            </div>

            {/* Ações do Modal */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setSelectedDayDate(null)} 
                className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition cursor-pointer text-xs"
              >
                Fechar
              </button>
              <button 
                type="button" 
                onClick={() => {
                  setModalDate(selectedDayDate);
                  setSelectedDayDate(null);
                  setIsModalOpen(true);
                }} 
                className="px-5 py-2.5 bg-brand text-slate-950 rounded-xl font-extrabold hover:bg-[#7ab01f] transition shadow-md cursor-pointer text-xs flex items-center gap-2"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Adicionar Tarefa para este Dia</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: NOVO AGENDAMENTO DE TAREFA */}
      {isModalOpen && (
        <div className="modal-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-scaleUp">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-brand"></span>
                <h3 className="text-base font-bold text-slate-900">Agendar Tarefa de HST &amp; Qualidade</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveActivity} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Cliente Cadastrado *</label>
                <select 
                  value={modalClient} 
                  onChange={(e) => setModalClient(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 focus:outline-none focus:border-brand"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.companyName}>{c.companyName} ({c.internalCode})</option>
                  ))}
                  {clients.length === 0 && <option value="Sonangol E.P.">Sonangol E.P.</option>}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Título da Tarefa / Serviço *</label>
                <input 
                  type="text" 
                  value={modalTitle} 
                  onChange={(e) => setModalTitle(e.target.value)} 
                  required 
                  placeholder="Ex: Inspecção de Mangueiras de Incêndio" 
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 focus:outline-none focus:border-brand" 
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Data *</label>
                  <input 
                    type="date" 
                    value={modalDate} 
                    onChange={(e) => setModalDate(e.target.value)} 
                    required 
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 focus:outline-none focus:border-brand" 
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Horário *</label>
                  <input 
                    type="time" 
                    value={modalTime} 
                    onChange={(e) => setModalTime(e.target.value)} 
                    required 
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 focus:outline-none focus:border-brand" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Equipa Operacional Atribuída</label>
                <select 
                  value={modalTeam} 
                  onChange={(e) => setModalTeam(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 focus:outline-none focus:border-brand"
                >
                  {teams.map(t => (
                    <option key={t.id} value={t.name}>{t.name} ({t.code})</option>
                  ))}
                  <option value="Equipa Operacional Geral">Equipa Operacional Geral</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Prestador Responsável</label>
                <select 
                  value={modalProvider} 
                  onChange={(e) => setModalProvider(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 focus:outline-none focus:border-brand"
                >
                  {providers.map(p => (
                    <option key={p.id} value={p.name}>{p.name} ({p.internalCode})</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 bg-brand text-slate-950 rounded-xl font-extrabold hover:bg-[#7ab01f] transition shadow-md cursor-pointer"
                >
                  Salvar Agendamento
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

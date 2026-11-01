import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Check, 
  RotateCcw,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export interface DateRange {
  startDate: string | null; // 'YYYY-MM-DD'
  endDate: string | null;   // 'YYYY-MM-DD'
  label?: string;
}

interface DateRangeCalendarPickerProps {
  currentRange: DateRange;
  onApplyRange: (range: DateRange) => void;
  onClear: () => void;
  evaluationDates?: string[]; // Array of 'YYYY-MM-DD' to show indicator dots on days with data
}

export const DateRangeCalendarPicker: React.FC<DateRangeCalendarPickerProps> = ({
  currentRange,
  onApplyRange,
  onClear,
  evaluationDates = []
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Draft selection while picker is open
  const [draftStart, setDraftStart] = useState<string | null>(currentRange.startDate);
  const [draftEnd, setDraftEnd] = useState<string | null>(currentRange.endDate);
  
  // Current calendar view (year and month)
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (currentRange.endDate) {
      const d = new Date(currentRange.endDate);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  // Sync draft with incoming props when opening
  useEffect(() => {
    if (isOpen) {
      setDraftStart(currentRange.startDate);
      setDraftEnd(currentRange.endDate);
      if (currentRange.endDate) {
        const d = new Date(currentRange.endDate);
        if (!isNaN(d.getTime())) setViewDate(d);
      }
    }
  }, [isOpen, currentRange]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Date formatting helpers
  const formatDateToYMD = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDisplayDate = (ymd: string | null): string => {
    if (!ymd) return '';
    try {
      const parts = ymd.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return ymd;
    } catch {
      return ymd;
    }
  };

  // Month navigation
  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // Calendar matrix computation
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
  // Adjust so Monday is 0, Sunday is 6
  const startOffset = (firstDayOfMonth + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // Quick preset handlers
  const applyPreset = (presetType: 'today' | '7d' | '30d' | '90d' | 'this_month' | 'last_month' | 'all') => {
    const now = new Date();
    const todayStr = formatDateToYMD(now);

    if (presetType === 'today') {
      const range = { startDate: todayStr, endDate: todayStr, label: 'Hoje' };
      onApplyRange(range);
      setIsOpen(false);
      return;
    }

    if (presetType === '7d') {
      const past = new Date();
      past.setDate(past.getDate() - 7);
      const range = { startDate: formatDateToYMD(past), endDate: todayStr, label: 'Últimos 7 Dias' };
      onApplyRange(range);
      setIsOpen(false);
      return;
    }

    if (presetType === '30d') {
      const past = new Date();
      past.setDate(past.getDate() - 30);
      const range = { startDate: formatDateToYMD(past), endDate: todayStr, label: 'Últimos 30 Dias' };
      onApplyRange(range);
      setIsOpen(false);
      return;
    }

    if (presetType === '90d') {
      const past = new Date();
      past.setDate(past.getDate() - 90);
      const range = { startDate: formatDateToYMD(past), endDate: todayStr, label: 'Últimos 90 Dias' };
      onApplyRange(range);
      setIsOpen(false);
      return;
    }

    if (presetType === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const range = { 
        startDate: formatDateToYMD(start), 
        endDate: formatDateToYMD(end), 
        label: `${monthNames[now.getMonth()]} ${now.getFullYear()}` 
      };
      onApplyRange(range);
      setIsOpen(false);
      return;
    }

    if (presetType === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      const range = { 
        startDate: formatDateToYMD(start), 
        endDate: formatDateToYMD(end), 
        label: `${monthNames[start.getMonth()]} ${start.getFullYear()}` 
      };
      onApplyRange(range);
      setIsOpen(false);
      return;
    }

    if (presetType === 'all') {
      onClear();
      setIsOpen(false);
    }
  };

  // Handle day click
  const handleDayClick = (dayNumber: number) => {
    const clickedDate = new Date(year, month, dayNumber);
    const dateStr = formatDateToYMD(clickedDate);

    if (!draftStart || (draftStart && draftEnd)) {
      // First click or reset
      setDraftStart(dateStr);
      setDraftEnd(null);
    } else {
      // Second click: determine range
      if (dateStr < draftStart) {
        setDraftEnd(draftStart);
        setDraftStart(dateStr);
      } else {
        setDraftEnd(dateStr);
      }
    }
  };

  const handleApplyDraft = () => {
    if (!draftStart) {
      onClear();
      setIsOpen(false);
      return;
    }

    const finalEnd = draftEnd || draftStart;
    const finalLabel = draftStart === finalEnd 
      ? formatDisplayDate(draftStart)
      : `${formatDisplayDate(draftStart)} — ${formatDisplayDate(finalEnd)}`;

    onApplyRange({
      startDate: draftStart,
      endDate: finalEnd,
      label: finalLabel
    });
    setIsOpen(false);
  };

  // Helper to check day states
  const isSelectedStart = (dateStr: string) => draftStart === dateStr;
  const isSelectedEnd = (dateStr: string) => draftEnd === dateStr;
  const isInRange = (dateStr: string) => {
    if (!draftStart || !draftEnd) return false;
    return dateStr > draftStart && dateStr < draftEnd;
  };
  const hasEvaluationsOnDate = (dateStr: string) => evaluationDates.includes(dateStr);

  const isCustomActive = !!(currentRange.startDate || currentRange.endDate);

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition border shadow-xs ${
          isCustomActive
            ? 'bg-brand text-slate-950 border-[#7aa91f]'
            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
        }`}
        title="Filtrar por data e período de avaliação"
      >
        <CalendarIcon className={`w-3.5 h-3.5 ${isCustomActive ? 'text-slate-950' : 'text-brand-dark'}`} />
        <span className="truncate max-w-[150px] sm:max-w-none">
          {currentRange.label || 'Calendário'}
        </span>
        {isCustomActive && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="ml-1 p-0.5 rounded-full hover:bg-black/10 text-slate-900"
            title="Limpar filtro de data"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {/* Popover / Dropdown Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-xs sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:p-0 sm:bg-transparent">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm sm:w-[360px] p-4 text-slate-800 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-50 text-brand-dark">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900">Filtrar por Período</h4>
                  <p className="text-[10px] text-slate-500">Selecione uma data ou intervalo de dias</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Presets Pills */}
            <div className="py-2.5 flex flex-wrap gap-1.5 border-b border-slate-100">
              <button
                onClick={() => applyPreset('today')}
                className="px-2 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700"
              >
                Hoje
              </button>
              <button
                onClick={() => applyPreset('7d')}
                className="px-2 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700"
              >
                7 Dias
              </button>
              <button
                onClick={() => applyPreset('30d')}
                className="px-2 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700"
              >
                30 Dias
              </button>
              <button
                onClick={() => applyPreset('this_month')}
                className="px-2 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700"
              >
                Este Mês
              </button>
              <button
                onClick={() => applyPreset('last_month')}
                className="px-2 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700"
              >
                Mês Passado
              </button>
              <button
                onClick={() => applyPreset('all')}
                className="px-2 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700"
              >
                Tudo
              </button>
            </div>

            {/* Month & Year Navigation */}
            <div className="flex items-center justify-between pt-3 pb-2">
              <button
                onClick={prevMonth}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition"
                title="Mês anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-black text-slate-800 tracking-tight">
                {monthNames[month]} {year}
              </span>
              <button
                onClick={nextMonth}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition"
                title="Mês seguinte"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-1">
              <span>Seg</span>
              <span>Ter</span>
              <span>Qua</span>
              <span>Qui</span>
              <span>Sex</span>
              <span>Sáb</span>
              <span>Dom</span>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {/* Empty leading offsets */}
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`offset-${i}`} className="h-8" />
              ))}

              {/* Month Days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateObj = new Date(year, month, dayNum);
                const dateStr = formatDateToYMD(dateObj);

                const isStart = isSelectedStart(dateStr);
                const isEnd = isSelectedEnd(dateStr);
                const inRange = isInRange(dateStr);
                const hasData = hasEvaluationsOnDate(dateStr);

                let cellStyle = 'hover:bg-slate-100 text-slate-700';

                if (isStart || isEnd) {
                  cellStyle = 'bg-brand text-slate-950 font-black shadow-xs';
                } else if (inRange) {
                  cellStyle = 'bg-lime-50 text-brand-dark font-bold';
                }

                return (
                  <button
                    key={`day-${dayNum}`}
                    onClick={() => handleDayClick(dayNum)}
                    className={`h-8 w-full rounded-lg text-xs font-medium relative flex flex-col items-center justify-center transition ${cellStyle}`}
                  >
                    <span>{dayNum}</span>
                    {hasData && (
                      <span 
                        className={`absolute bottom-0.5 w-1 h-1 rounded-full ${
                          isStart || isEnd ? 'bg-slate-950' : 'bg-brand-dark'
                        }`} 
                        title="Contém avaliações de clientes"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Direct Date Inputs (De / Até) */}
            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Data Início
                </label>
                <input
                  type="date"
                  value={draftStart || ''}
                  onChange={(e) => setDraftStart(e.target.value || null)}
                  className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-brand text-slate-800 font-medium"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Data Fim
                </label>
                <input
                  type="date"
                  value={draftEnd || ''}
                  onChange={(e) => setDraftEnd(e.target.value || null)}
                  className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-brand text-slate-800 font-medium"
                />
              </div>
            </div>

            {/* Selection Status & Action Buttons */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  setDraftStart(null);
                  setDraftEnd(null);
                  onClear();
                  setIsOpen(false);
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              >
                <RotateCcw className="w-3 h-3" />
                Limpar
              </button>

              <button
                onClick={handleApplyDraft}
                disabled={!draftStart}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-black bg-brand hover:bg-[#7aa91f] text-slate-950 rounded-xl transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-3.5 h-3.5" />
                Aplicar Intervalo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

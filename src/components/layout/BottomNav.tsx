import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { APP_PAGES } from '../../config/pages';
import {
  LayoutDashboard, Star, MessageSquare, Building2, Calendar, Users, BarChart3, Contact, Menu, Briefcase, UserCheck,
  ClipboardList, FileText, Settings, ShieldAlert, CheckCircle, X, ChevronUp, ChevronDown, RotateCcw,
} from 'lucide-react';
import {
  MAX_SHORTCUTS, loadShortcuts, moveItem, pagesAvailable, resolveShortcuts, saveShortcuts,
} from '../../lib/bottomNavPrefs';

interface BottomNavProps {
  /** Abre o menu completo (gaveta lateral) com todas as páginas agrupadas por secção. */
  onMore: () => void;
}

/** Evento que o menu lateral dispara para abrir o editor da barra. */
export const EDIT_BOTTOM_NAV_EVENT = 'sicsc:edit-bottom-nav';

const ICONS: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard, evaluations: Star, my_team: Users, messages: MessageSquare, clients: Building2,
  calendar: Calendar, hr: Users, employees: Contact, reports: BarChart3, services: Briefcase, providers: UserCheck,
  teams: Users, evaluation_analysis: ClipboardList, form_editor: FileText, access_profiles: ShieldAlert,
  users: Users, audit: ShieldAlert, settings: Settings,
};
const SHORT_LABELS: Record<string, string> = {
  dashboard: 'Painel', evaluations: 'Avaliações', my_team: 'Minha equipa', messages: 'Mensagens', clients: 'Clientes',
  calendar: 'Calendário', hr: 'RH', employees: 'Funcionários', reports: 'Relatórios', services: 'Serviços',
  providers: 'Prestadores', teams: 'Equipas', evaluation_analysis: 'Análise', form_editor: 'Formulário',
  access_profiles: 'Perfis', users: 'Utilizadores', audit: 'Auditoria', settings: 'Definições',
};
const iconOf = (key: string) => ICONS[key] ?? CheckCircle;
const labelOf = (key: string) => SHORT_LABELS[key] ?? APP_PAGES.find(p => p.key === key)?.name ?? key;
const fullNameOf = (key: string) => APP_PAGES.find(p => p.key === key)?.name ?? key;
const CATALOG_KEYS = APP_PAGES.map(p => p.key);

export const BottomNav: React.FC<BottomNavProps> = ({ onMore }) => {
  const { activeTab, setActiveTab, currentUser, evaluationQueueCounts } = useApp();
  const isAdmin = currentUser?.role === 'ADMIN';
  const userId = currentUser?.id;
  const available = useMemo(() => pagesAvailable(CATALOG_KEYS, currentUser?.allowedPages ?? [], isAdmin), [currentUser?.allowedPages, isAdmin]);

  const [saved, setSaved] = useState<string[] | null>(() => loadShortcuts(userId));
  const [editing, setEditing] = useState(false);
  useEffect(() => { setSaved(loadShortcuts(userId)); }, [userId]);

  const shortcuts = useMemo(() => resolveShortcuts(available, saved), [available, saved]);
  const inShortcuts = shortcuts.includes(activeTab === 'employee_management' ? 'employees' : activeTab);
  const pending = (evaluationQueueCounts?.unassignedClient ?? 0) + (evaluationQueueCounts?.unassignedProvider ?? 0);

  // O menu lateral pode pedir para abrir o editor
  useEffect(() => {
    const open = () => setEditing(true);
    window.addEventListener(EDIT_BOTTOM_NAV_EVENT, open);
    return () => window.removeEventListener(EDIT_BOTTOM_NAV_EVENT, open);
  }, []);

  // Toque longo em «Mais» também abre o editor
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const startPress = () => { longPressed.current = false; press.current = setTimeout(() => { longPressed.current = true; setEditing(true); }, 600); };
  const endPress = () => { if (press.current) { clearTimeout(press.current); press.current = null; } };

  const save = useCallback((keys: string[] | null) => { saveShortcuts(userId, keys); setSaved(keys); }, [userId]);

  // Itens da barra: atalhos configurados + "Mais" (que está sempre presente)
  const items = [
    ...shortcuts.map(id => ({ key: id, Icon: iconOf(id), label: labelOf(id), badge: id === 'evaluations' ? pending : 0 })),
    { key: '__more', Icon: Menu, label: 'Mais', badge: 0 },
  ];
  const n = items.length;
  const currentKey = activeTab === 'employee_management' ? 'employees' : activeTab;
  // Quando a aba ativa não é um atalho, o destaque fica em "Mais" (comportamento anterior)
  const activeIndex = inShortcuts ? Math.max(0, shortcuts.indexOf(currentKey)) : n - 1;

  return (
    <>
      {/* Barra encostada ao fundo do ecrã, em toda a largura, com a mesma cor da sidebar */}
      <nav
        aria-label="Navegação principal"
        className="bottom-nav fixed inset-x-0 bottom-0 z-40 lg:hidden bg-gradient-to-r from-brand-deep via-brand-dark to-brand-deep border-t border-white/10 shadow-[0_-6px_20px_-10px_rgba(0,0,0,0.45)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      >
        <div className="relative mx-auto max-w-xl h-16">
          {/* Destaque da aba ativa: pílula que desliza até ao item selecionado (sempre dentro da barra) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${100 / n}%`, transform: `translateX(${activeIndex * 100}%)` }}
          >
            <div className="mx-auto mt-2 w-14 h-8 rounded-full bg-brand shadow-[0_6px_16px_-6px_rgba(140,191,38,0.8)]" />
          </div>

          <div className="relative z-10 flex h-full">
            {items.map((it, i) => {
              const active = i === activeIndex;
              const isMore = it.key === '__more';
              const Icon = it.Icon;
              const moreHandlers = isMore
                ? {
                    onPointerDown: startPress,
                    onPointerUp: endPress,
                    onPointerLeave: endPress,
                    onPointerCancel: endPress,
                    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
                    'aria-haspopup': 'dialog' as const,
                  }
                : {};
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => {
                    if (isMore) { if (!longPressed.current) onMore(); }
                    else setActiveTab(it.key);
                  }}
                  {...moreHandlers}
                  aria-current={active && !isMore ? 'page' : undefined}
                  title={isMore ? 'Toque longo para personalizar a barra' : undefined}
                  className={`relative flex-1 min-w-0 h-full flex flex-col items-center pt-2 gap-1 transition-colors duration-300 ${active ? 'text-white' : 'text-white/90 hover:text-white'}`}
                >
                  <span className={`flex items-center justify-center w-14 h-8 transition-colors duration-300 ${active ? 'text-brand-deep' : ''}`}>
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className={`truncate max-w-full px-0.5 text-[11px] leading-none tracking-tight transition-all duration-300 ${active ? 'font-extrabold' : 'font-semibold'}`}>{it.label}</span>
                  {it.badge > 0 && (
                    <span className="absolute top-1 left-[calc(50%+10px)] min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-brand-dark">
                      {it.badge > 99 ? '99+' : it.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {editing && (
        <BottomNavEditor
          available={available}
          current={shortcuts}
          customised={saved !== null}
          onClose={() => setEditing(false)}
          onSave={keys => { save(keys); setEditing(false); }}
          onReset={() => { save(null); setEditing(false); }}
        />
      )}
    </>
  );
};

// ===================== Editor da barra =====================
const BottomNavEditor: React.FC<{
  available: string[];
  current: string[];
  customised: boolean;
  onClose: () => void;
  onSave: (keys: string[]) => void;
  onReset: () => void;
}> = ({ available, current, customised, onClose, onSave, onReset }) => {
  const [picked, setPicked] = useState<string[]>(current);
  const toggle = (key: string) => setPicked(prev => prev.includes(key) ? prev.filter(k => k !== key) : (prev.length >= MAX_SHORTCUTS ? prev : [...prev, key]));
  const full = picked.length >= MAX_SHORTCUTS;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Personalizar barra de acesso rápido" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[88vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-900">Barra de acesso rápido</h3>
            <p className="text-xs text-slate-500 mt-0.5">Escolha até {MAX_SHORTCUTS} atalhos, só entre as páginas a que tem acesso. O botão «Mais» fica sempre.</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 overflow-y-auto space-y-4 pb-3">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase mb-1.5">A sua barra ({picked.length}/{MAX_SHORTCUTS})</p>
            {picked.length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-xl p-3">Sem atalhos. Só aparece o botão «Mais».</p>
            ) : (
              <ul className="space-y-1.5">
                {picked.map((key, i) => {
                  const Icon = iconOf(key);
                  return (
                    <li key={key} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                      <Icon className="w-4 h-4 text-slate-600 shrink-0" />
                      <span className="flex-1 text-sm font-semibold text-slate-900 truncate">{fullNameOf(key)}</span>
                      <button onClick={() => setPicked(p => moveItem(p, i, -1))} disabled={i === 0} aria-label={`Subir ${fullNameOf(key)}`} className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => setPicked(p => moveItem(p, i, 1))} disabled={i === picked.length - 1} aria-label={`Descer ${fullNameOf(key)}`} className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => toggle(key)} aria-label={`Retirar ${fullNameOf(key)}`} className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-600"><X className="w-4 h-4" /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase mb-1.5">Páginas disponíveis para si</p>
            <ul className="grid grid-cols-1 gap-1.5">
              {available.map(key => {
                const Icon = iconOf(key);
                const isOn = picked.includes(key);
                const blocked = !isOn && full;
                return (
                  <li key={key}>
                    <button onClick={() => toggle(key)} disabled={blocked}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-sm ${isOn ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200 hover:bg-slate-50'} ${blocked ? 'opacity-40' : ''}`}>
                      <Icon className="w-4 h-4 text-slate-600 shrink-0" />
                      <span className="flex-1 font-medium text-slate-900 truncate">{fullNameOf(key)}</span>
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center text-[11px] text-white ${isOn ? 'bg-brand-dark border-brand-dark' : 'border-slate-300'}`}>{isOn ? '✓' : ''}</span>
                    </button>
                  </li>
                );
              })}
              {available.length === 0 && <li className="text-xs text-slate-500">Ainda não tem páginas atribuídas.</li>}
            </ul>
            {full && <p className="text-[11px] text-amber-700 mt-1.5">Chegou ao máximo de {MAX_SHORTCUTS}. Retire um atalho para escolher outro.</p>}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={onReset} disabled={!customised} className="px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4" /> Repor
          </button>
          <button onClick={() => onSave(picked)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-brand-dark text-white">Guardar</button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { useApp } from '../../context/AppContext';
import { LayoutDashboard, Star, MessageSquare, Building2, Calendar, Users, BarChart3, Contact, Menu } from 'lucide-react';

interface BottomNavProps {
  /** Abre o menu completo (gaveta lateral) com todas as páginas agrupadas por secção. */
  onMore: () => void;
}

/** Atalhos por ordem de prioridade; só aparecem os que o utilizador pode ver (máx. 3 + "Mais"). */
const SHORTCUTS = [
  { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
  { id: 'evaluations', label: 'Avaliações', icon: Star },
  { id: 'messages', label: 'Mensagens', icon: MessageSquare },
  { id: 'clients', label: 'Clientes', icon: Building2 },
  { id: 'calendar', label: 'Calendário', icon: Calendar },
  { id: 'hr', label: 'RH', icon: Users },
  { id: 'employees', label: 'Equipa', icon: Contact },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
];

export const BottomNav: React.FC<BottomNavProps> = ({ onMore }) => {
  const { activeTab, setActiveTab, currentUser, evaluationQueueCounts } = useApp();
  const isAdmin = currentUser?.role === 'ADMIN';
  const allowed = currentUser?.allowedPages ?? [];
  const items = SHORTCUTS.filter(s => isAdmin || allowed.includes(s.id)).slice(0, 3);
  const inShortcuts = items.some(i => i.id === activeTab);
  const pending = (evaluationQueueCounts?.unassignedClient ?? 0) + (evaluationQueueCounts?.unassignedProvider ?? 0);

  const base = 'relative flex-1 min-h-14 flex flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold transition cursor-pointer';
  const on = 'bg-brand/20 text-brand';
  const off = 'text-slate-300 hover:text-white';

  return (
    <nav
      aria-label="Navegação principal"
      className="bottom-nav fixed inset-x-0 bottom-0 z-40 lg:hidden px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto max-w-md flex items-center gap-1 p-1.5 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl">
        {items.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`${base} ${active ? on : off}`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
              {id === 'evaluations' && pending > 0 && (
                <span className="absolute top-1.5 right-[22%] min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center">
                  {pending > 99 ? '99+' : pending}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          aria-haspopup="dialog"
          className={`${base} ${!inShortcuts ? on : off}`}
        >
          <Menu className="w-5 h-5" />
          <span>Mais</span>
        </button>
      </div>
    </nav>
  );
};

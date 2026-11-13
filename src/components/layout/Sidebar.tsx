import React from 'react';
import { useApp } from '../../context/AppContext';
import { APP_PAGE_MAP } from '../../config/pages';
import type { PageSection } from '../../config/pages';
import { 
  LayoutDashboard, 
  Building2, 
  Calendar,
  Briefcase, 
  Users, 
  Star, 
  UserCheck, 
  BarChart3, 
  ShieldAlert, 
  FileText, 
  Settings,
  CheckCircle,
  ChevronRight,
  LogOut,
  MessageSquare,
  ClipboardList,
  Contact
} from 'lucide-react';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, setMobileOpen }) => {
  const { activeTab, setActiveTab, currentUser, logout, evaluationQueueCounts } = useApp();

  const allNavItems = [
    { id: 'dashboard', label: 'Painel Geral', icon: LayoutDashboard },
    { id: 'clients', label: 'Clientes', icon: Building2 },
    { id: 'calendar', label: 'Calendário & Operações', icon: Calendar },
    { id: 'services', label: 'Serviços', icon: Briefcase },
    { id: 'providers', label: 'Prestadores', icon: UserCheck },
    { id: 'teams', label: 'Equipas', icon: Users },
    { id: 'messages', label: 'Mensagens Internas', icon: MessageSquare },
    { id: 'evaluations', label: 'Avaliações', icon: Star, count: (evaluationQueueCounts.unassignedClient + evaluationQueueCounts.unassignedProvider) },
    { id: 'evaluation_analysis', label: 'Análise de Avaliação', icon: CheckCircle },
    { id: 'form_editor', label: 'Edição de Formulário', icon: ClipboardList },
    { id: 'hr', label: 'Recursos Humanos', icon: Users },
    { id: 'employees', label: 'Funcionários', icon: Contact },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    { id: 'users', label: 'Utilizadores', icon: ShieldAlert },
    { id: 'audit', label: 'Auditoria', icon: FileText },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  // Visibilidade do menu: apenas as páginas atribuídas ao utilizador (ADMIN vê todas)
  const isAdmin = currentUser?.role === 'ADMIN';
  const allowedPages = currentUser?.allowedPages ?? [];
  const navItems = allNavItems.filter(item => isAdmin || allowedPages.includes(item.id));

  // Agrupa o menu pelas secções definidas em config/pages.ts
  const SECTION_ORDER: PageSection[] = ['Visão Geral', 'Operações', 'Qualidade & RH', 'Direção', 'Administração', 'Segurança', 'Sistema'];
  const groups = SECTION_ORDER
    .map(section => ({ section, items: navItems.filter(item => (APP_PAGE_MAP[item.id]?.section ?? 'Sistema') === section) }))
    .filter(g => g.items.length > 0);

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div 
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-xs"
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-72 max-w-[85vw] bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out border-r border-slate-800
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Top Brand Area */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* SVG Logo Aeternu */}
            <svg className="w-9 h-9 flex-shrink-0" viewBox="0 0 100 100" fill="none">
              <defs>
                <linearGradient id="sidebarGradLeft" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#2D6A28"/>
                  <stop offset="100%" stopColor="#8CBF26"/>
                </linearGradient>
                <linearGradient id="sidebarGradRight" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8CBF26"/>
                  <stop offset="100%" stopColor="#1B4D1B"/>
                </linearGradient>
              </defs>
              <path d="M 20 85 L 50 15 L 68 50 L 50 85 Z" fill="url(#sidebarGradLeft)" />
              <path d="M 50 15 L 80 85 L 62 85 L 42 45 Z" fill="url(#sidebarGradRight)" />
            </svg>
            <div>
              <h1 className="text-lg font-black tracking-wider text-white leading-none">AETERNU</h1>
              <p className="text-xs font-semibold tracking-wide text-brand mt-1">SICSC · Qualidade</p>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-4 py-3">
          {groups.map((group) => (
            <div key={group.section} className="mb-3">
              {groups.length > 1 && (
                <p className="px-3.5 pt-2 pb-1.5 text-xs font-semibold text-slate-400">{group.section}</p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileOpen(false);
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      className={`
                        w-full flex items-center justify-between px-3.5 min-h-11 rounded-xl text-sm font-semibold transition group
                        ${isActive 
                          ? 'bg-brand text-slate-950 shadow-md font-bold' 
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'}
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-slate-950' : 'text-brand group-hover:scale-110 transition-transform'}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.count && item.count > 0 ? (
                        <span className="text-xs min-w-5 text-center px-1.5 py-0.5 rounded-md bg-rose-500 text-white font-extrabold">
                          {item.count}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Footer & Logout */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center text-brand font-bold text-xs flex-shrink-0">
                {currentUser?.name ? currentUser.name.charAt(0) : 'A'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-white truncate">{currentUser?.name || 'Utilizador'}</p>
                <p className="text-[10px] text-slate-400 truncate">{currentUser?.email || 'aeternu.co.ao'}</p>
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-red-950/40 hover:text-red-400 text-slate-300 text-sm min-h-11 rounded-xl transition border border-slate-700/60"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Terminar Sessão</span>
          </button>
        </div>
      </aside>
    </>
  );
};

import React, { useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { APP_PAGE_MAP } from '../../config/pages';
import type { PageSection } from '../../config/pages';
import {
  LayoutDashboard, Building2, Calendar, Briefcase, Users, Star, UserCheck, BarChart3,
  ShieldAlert, FileText, Settings, CheckCircle, LogOut, MessageSquare, ClipboardList,
  Contact, ChevronLeft
} from 'lucide-react';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, setMobileOpen, collapsed, setCollapsed }) => {
  const { activeTab, setActiveTab, currentUser, logout, evaluationQueueCounts } = useApp();

  const allNavItems = [
    { id: 'dashboard', label: 'Painel Geral', icon: LayoutDashboard },
    { id: 'clients', label: 'Clientes', icon: Building2 },
    { id: 'calendar', label: 'Calendário & Operações', icon: Calendar },
    { id: 'services', label: 'Serviços', icon: Briefcase },
    { id: 'providers', label: 'Prestadores', icon: UserCheck },
    { id: 'teams', label: 'Equipas', icon: Users },
    { id: 'my_team', label: 'A Minha Equipa', icon: Users },
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

  // Visibilidade: apenas as páginas atribuídas ao utilizador (ADMIN vê todas)
  const isAdmin = currentUser?.role === 'ADMIN';
  const allowedPages = currentUser?.allowedPages ?? [];
  const navItems = allNavItems.filter(item => isAdmin || allowedPages.includes(item.id));

  const SECTION_ORDER: PageSection[] = ['Visão Geral', 'Operações', 'Qualidade & RH', 'Direção', 'Administração', 'Segurança', 'Sistema'];
  const groups = SECTION_ORDER
    .map(section => ({ section, items: navItems.filter(item => (APP_PAGE_MAP[item.id]?.section ?? 'Sistema') === section) }))
    .filter(g => g.items.length > 0);

  // Indicador deslizante: mede o botão ativo e desloca a pílula branca até ele
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const medir = () => {
      const btn = itemRefs.current[activeTab];
      const nav = navRef.current;
      if (!btn || !nav) { setPill(null); return; }
      const b = btn.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      const top = b.top - n.top + nav.scrollTop;
      setPill(prev => (prev && prev.top === top && prev.height === b.height ? prev : { top, height: b.height }));
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [activeTab, collapsed, mobileOpen, navItems.length]);

  const recolhida = collapsed; // só tem efeito em ecrãs grandes (lg)

  return (
    <>
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/55 z-40 lg:hidden"
        />
      )}

      <aside
        className={`
          fixed z-50 inset-y-0 left-0 flex flex-col overflow-hidden
          rounded-r-2xl lg:rounded-none border-r border-white/10
          text-white lg:shadow-none
          bg-gradient-to-b from-[#16301F] to-[#0B1A12]
          transition-[transform,width,visibility] duration-300 ${EASE}
          w-64 max-w-[80vw]
          ${recolhida ? 'lg:w-[5.25rem]' : 'lg:w-64'}
          ${mobileOpen ? 'translate-x-0 visible shadow-2xl' : '-translate-x-full invisible lg:visible lg:translate-x-0'}
        `}
      >
        {/* Marca */}
        <div className={`flex items-center shrink-0 h-14 lg:h-[4.75rem] px-4 ${recolhida ? 'lg:justify-center lg:px-0' : 'justify-between'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5" viewBox="0 0 100 100" fill="none" aria-hidden>
                <defs>
                  <linearGradient id="sbGradL" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#A7C47B" />
                    <stop offset="100%" stopColor="#ffffff" />
                  </linearGradient>
                  <linearGradient id="sbGradR" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#A7C47B" />
                  </linearGradient>
                </defs>
                <path d="M 20 85 L 50 15 L 68 50 L 50 85 Z" fill="url(#sbGradL)" />
                <path d="M 50 15 L 80 85 L 62 85 L 42 45 Z" fill="url(#sbGradR)" />
              </svg>
            </div>
            <div className={`min-w-0 ${recolhida ? 'lg:hidden' : ''}`}>
              <h1 className="text-sm font-black tracking-[0.18em] leading-none text-white">AETERNU</h1>
              <p className="text-[11px] font-medium tracking-wide text-[#B4C9A0] mt-1">SICSC · Qualidade</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
            title={recolhida ? 'Expandir menu' : 'Recolher menu'}
            className={`hidden lg:flex w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 ring-1 ring-white/10 items-center justify-center transition-colors duration-200 ${recolhida ? 'absolute top-[4.6rem] left-1/2 -translate-x-1/2' : ''}`}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${EASE} ${recolhida ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Navegação */}
        <nav ref={navRef} aria-label="Menu principal" className="relative flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 pt-1 scrollbar-none">
          {/* Realce do item ativo (desliza até ao item) */}
          {pill && (
            <div
              aria-hidden
              className={`absolute top-0 left-2 right-2 rounded-xl bg-white/[0.13] ring-1 ring-white/10 transition-[transform,height] duration-300 ${EASE}`}
              style={{ transform: `translateY(${pill.top}px)`, height: pill.height }}
            />
          )}

          {groups.map((group) => (
            <div key={group.section} className="mb-1">
              {groups.length > 1 && (
                <p className={`px-3 pt-3 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60 ${recolhida ? 'lg:invisible' : ''}`}>
                  {group.section}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  const count = item.count && item.count > 0 ? item.count : 0;
                  return (
                    <button
                      key={item.id}
                      ref={(el) => { itemRefs.current[item.id] = el; }}
                      type="button"
                      onClick={() => { setActiveTab(item.id); setMobileOpen(false); }}
                      aria-current={isActive ? 'page' : undefined}
                      title={recolhida ? item.label : undefined}
                      className={`
                        group relative z-10 w-full flex items-center gap-2.5 px-2 min-h-10 rounded-xl text-sm lg:text-[15px]
                        transition-colors duration-200 ${recolhida ? 'lg:justify-center lg:px-0' : ''}
                        ${isActive ? 'text-white font-bold' : 'text-white/90 font-medium hover:text-white hover:bg-white/[0.06]'}
                      `}
                    >
                      <span
                        className={`flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 transition-colors duration-200 ${isActive ? 'bg-[#4E7D3A] text-white' : 'bg-white/[0.08] text-white/90 group-hover:bg-white/15'}`}
                      >
                        <Icon className="w-4 h-4" />
                      </span>

                      <span className={`flex-1 min-w-0 truncate text-left ${recolhida ? 'lg:hidden' : ''}`}>{item.label}</span>

                      {count > 0 && (
                        <span className={`text-[11px] min-w-5 text-center px-1.5 py-0.5 rounded-md bg-rose-600 text-white font-bold ${recolhida ? 'lg:absolute lg:top-0.5 lg:right-1 lg:min-w-0 lg:w-2.5 lg:h-2.5 lg:p-0 lg:text-[0px]' : ''}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Rodapé: utilizador e sessão (uma só linha) */}
        <div className="shrink-0 border-t border-white/10 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className={`flex items-center gap-2.5 rounded-xl bg-white/[0.07] p-2 ${recolhida ? 'lg:flex-col lg:gap-2' : ''}`}>
            <div className="w-8 h-8 rounded-lg bg-[#3F6B2E] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className={`flex-1 min-w-0 ${recolhida ? 'lg:hidden' : ''}`}>
              <p className="text-[13px] font-semibold text-white truncate leading-tight">{currentUser?.name || 'Utilizador'}</p>
              <p className="text-[11px] text-white/70 truncate leading-tight mt-0.5">{currentUser?.email || 'aeternu.co.ao'}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Terminar sessão"
              aria-label="Terminar sessão"
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg text-white/85 hover:text-white hover:bg-red-500/30 transition-colors duration-200"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setMobileOpen(false); window.dispatchEvent(new Event('sicsc:edit-bottom-nav')); }}
            className="lg:hidden mt-1.5 w-full min-h-9 rounded-lg text-white/75 hover:text-white hover:bg-white/[0.06] text-xs font-medium"
          >
            Personalizar barra de acesso rápido
          </button>
        </div>
      </aside>
    </>
  );
};

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
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-xs"
        />
      )}

      <aside
        className={`
          fixed z-50 top-3 bottom-3 left-3 flex flex-col overflow-hidden rounded-[28px]
          text-white shadow-[0_20px_60px_-15px_rgba(15,60,15,0.55)] ring-1 ring-white/10
          bg-gradient-to-b from-[#2D6A28] via-[#1B4D1B] to-[#0a2410]
          transition-[transform,width] duration-500 ${EASE}
          w-[17.5rem] max-w-[calc(100vw-1.5rem)]
          ${recolhida ? 'lg:w-[5.25rem]' : 'lg:w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-[120%] lg:translate-x-0'}
        `}
      >
        {/* Brilhos decorativos em vidro */}
        <div aria-hidden className="pointer-events-none absolute -top-20 -left-16 w-56 h-56 rounded-full bg-brand/25 blur-3xl animate-sidebar-float" />
        <div aria-hidden className="pointer-events-none absolute bottom-10 -right-20 w-60 h-60 rounded-full bg-brand/15 blur-3xl animate-sidebar-float-slow" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-white/[0.03] backdrop-blur-[2px]" />

        {/* Marca */}
        <div className={`relative z-10 flex items-center ${recolhida ? 'lg:justify-center lg:px-0' : 'justify-between'} px-5 pt-5 pb-4`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur flex items-center justify-center flex-shrink-0 transition-transform duration-500 hover:rotate-6">
              <svg className="w-6 h-6" viewBox="0 0 100 100" fill="none">
                <defs>
                  <linearGradient id="sbGradL" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#8CBF26" />
                    <stop offset="100%" stopColor="#ffffff" />
                  </linearGradient>
                  <linearGradient id="sbGradR" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#8CBF26" />
                  </linearGradient>
                </defs>
                <path d="M 20 85 L 50 15 L 68 50 L 50 85 Z" fill="url(#sbGradL)" />
                <path d="M 50 15 L 80 85 L 62 85 L 42 45 Z" fill="url(#sbGradR)" />
              </svg>
            </div>
            <div className={`min-w-0 transition-all duration-300 ${recolhida ? 'lg:hidden' : ''}`}>
              <h1 className="text-base font-black tracking-[0.18em] leading-none">AETERNU</h1>
              <p className="text-[11px] font-semibold tracking-wide text-brand mt-1.5">SICSC · Qualidade</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
            title={recolhida ? 'Expandir menu' : 'Recolher menu'}
            className={`hidden lg:flex w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 ring-1 ring-white/10 items-center justify-center transition-all duration-300 ${recolhida ? 'absolute top-[4.6rem] left-1/2 -translate-x-1/2' : ''}`}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform duration-500 ${EASE} ${recolhida ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Navegação */}
        <nav ref={navRef} aria-label="Menu principal" className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 pt-2 scrollbar-none">
          {/* Pílula branca que desliza para o item ativo */}
          {pill && (
            <div
              aria-hidden
              className={`absolute left-3 right-3 rounded-2xl bg-white shadow-[0_10px_30px_-8px_rgba(140,191,38,0.6)] transition-[transform,height] duration-500 ${EASE}`}
              style={{ transform: `translateY(${pill.top}px)`, height: pill.height }}
            />
          )}

          {groups.map((group) => (
            <div key={group.section} className="mb-2">
              {groups.length > 1 && (
                <p className={`px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/50 transition-opacity duration-300 ${recolhida ? 'lg:opacity-0' : ''}`}>
                  {group.section}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      ref={(el) => { itemRefs.current[item.id] = el; }}
                      type="button"
                      onClick={() => { setActiveTab(item.id); setMobileOpen(false); }}
                      aria-current={isActive ? 'page' : undefined}
                      title={recolhida ? item.label : undefined}
                      className={`
                        group relative z-10 w-full flex items-center gap-3 px-2.5 min-h-11 rounded-2xl text-sm font-semibold
                        transition-colors duration-300 ${recolhida ? 'lg:justify-center lg:px-0' : ''}
                        ${isActive ? 'text-[#1B4D1B]' : 'text-white/85 hover:text-white'}
                      `}
                    >
                      <span
                        className={`
                          flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 transition-all duration-500 ${EASE}
                          ${isActive
                            ? 'bg-gradient-to-br from-[#8CBF26] to-[#2D6A28] text-white shadow-md scale-100'
                            : 'bg-white/10 group-hover:bg-white/20 group-hover:scale-110'}
                        `}
                      >
                        <Icon className="w-[17px] h-[17px]" />
                      </span>

                      <span
                        className={`
                          flex-1 min-w-0 flex items-center justify-between gap-2 overflow-hidden whitespace-nowrap transition-all duration-300 ${EASE}
                          ${recolhida ? 'lg:max-w-0 lg:opacity-0' : 'max-w-[12rem] opacity-100'}
                        `}
                      >
                        <span className="truncate">{item.label}</span>
                        {item.count && item.count > 0 ? (
                          <span className="text-[11px] min-w-5 text-center px-1.5 py-0.5 rounded-lg bg-rose-500 text-white font-extrabold shadow-sm">
                            {item.count}
                          </span>
                        ) : null}
                      </span>

                      {/* Contador em modo recolhido */}
                      {recolhida && item.count && item.count > 0 ? (
                        <span className="hidden lg:block absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-[#1B4D1B]" />
                      ) : null}

                      {/* Etiqueta flutuante em modo recolhido */}
                      {recolhida && (
                        <span className="hidden lg:block pointer-events-none absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-slate-900/95 text-white text-xs font-semibold whitespace-nowrap shadow-xl opacity-0 translate-x-[-6px] group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ring-1 ring-white/10">
                          {item.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Rodapé: utilizador e sessão */}
        <div className="relative z-10 p-3">
          <div className={`rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur-md p-3 ${recolhida ? 'lg:p-2' : ''}`}>
            <div className={`flex items-center gap-2.5 ${recolhida ? 'lg:justify-center' : ''}`}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#8CBF26] to-[#2D6A28] flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-md">
                {currentUser?.name ? currentUser.name.charAt(0) : 'A'}
              </div>
              <div className={`min-w-0 overflow-hidden transition-all duration-300 ${recolhida ? 'lg:hidden' : ''}`}>
                <p className="text-xs font-bold text-white truncate">{currentUser?.name || 'Utilizador'}</p>
                <p className="text-[10px] text-white/60 truncate">{currentUser?.email || 'aeternu.co.ao'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Terminar sessão"
              className={`mt-3 w-full flex items-center justify-center gap-2 min-h-10 rounded-xl bg-white/10 hover:bg-red-500/30 text-white/90 hover:text-white text-xs font-semibold transition-colors duration-300 ring-1 ring-white/10 ${recolhida ? 'lg:px-0' : ''}`}
            >
              <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
              <span className={recolhida ? 'lg:hidden' : ''}>Terminar Sessão</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setMobileOpen(false); window.dispatchEvent(new Event('sicsc:edit-bottom-nav')); }}
            className="lg:hidden mt-2 w-full min-h-10 rounded-xl bg-white/10 text-white/85 text-xs font-semibold ring-1 ring-white/10"
          >
            Personalizar barra de acesso rápido
          </button>
        </div>
      </aside>
    </>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  Menu, 
  Bell, 
  Search, 
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  User, 
  KeyRound, 
  LogOut, 
  Database,
  X,
  Sparkles,
  Save
} from 'lucide-react';

interface HeaderProps {
  setMobileOpen: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ setMobileOpen }) => {
  const { activeTab, setActiveTab, currentUser, evaluations, logout } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  
  // Form states
  const [editName, setEditName] = useState(currentUser?.name || '');
  const [editDept, setEditDept] = useState(currentUser?.department || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentUser) {
      setEditName(currentUser.name);
      setEditDept(currentUser.department);
    }
  }, [currentUser]);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const titles: Record<string, string> = {
    dashboard: 'Painel Geral de Qualidade',
    clients: 'Gestão de Clientes & Comercial',
    calendar: 'Calendário Operacional & Tarefas',
    services: 'Catálogo de Serviços & Intervenções',
    providers: 'Prestadores de Serviços & Equipas',
    evaluations: 'Avaliações de Clientes',
    evaluation_analysis: 'Análise de Avaliação & Homologação',
    form_editor: 'Edição do Formulário de Satisfação',
    hr: 'Recursos Humanos & Qualidade',
    employees: 'Gestão de Funcionários & Dossiês',
    messages: 'Comunicação Interna & Mensagens',
    reports: 'Relatórios & Indicadores',
    users: 'Utilizadores & Permissões',
    audit: 'Registo de Auditoria',
    settings: 'Configurações do Sistema'
  };

  const pendingCount = evaluations.filter(e => e.status === 'PENDING_REVIEW').length;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('Perfil atualizado com sucesso!');
    setTimeout(() => {
      setSuccessMessage('');
      setIsEditProfileOpen(false);
    }, 1500);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setErrorMessage('A nova palavra-passe deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('As palavras-passe não coincidem.');
      return;
    }
    setErrorMessage('');
    setSuccessMessage('Palavra-passe alterada com sucesso!');
    setTimeout(() => {
      setSuccessMessage('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsChangePasswordOpen(false);
    }, 1500);
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-3.5 flex items-center justify-between shadow-xs">
        {/* Left side: Mobile menu toggle & Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand animate-pulse"></span>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">AETERNU SICSC</span>
            </div>
            <h2 className="text-lg lg:text-xl font-extrabold text-slate-900 tracking-tight">
              {titles[activeTab] || 'Dashboard'}
            </h2>
          </div>
        </div>

        {/* Right side: Search, Notifications & App Profile Dropdown */}
        <div className="flex items-center gap-3">
          {/* Supabase Status Quick Link */}
          <button
            onClick={() => setActiveTab('settings')}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl text-[11px] font-bold text-brand-deep transition"
            title="Supabase PostgreSQL Ativo - Clique para ver configurações"
          >
            <Database className="w-3.5 h-3.5 text-brand-dark" />
            <span>Supabase Ativo</span>
          </button>

          {/* Quick Search */}
          <div className="hidden md:flex items-center relative w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand transition"
            />
          </div>

          {/* Notifications Dropdown Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition border border-slate-200/80"
              aria-label="Notificações"
            >
              <Bell className="w-4 h-4" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 text-[10px] font-extrabold rounded-full flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>

            {/* Notifications Flyout */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 py-3 z-50 text-xs">
                <div className="px-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="font-bold text-slate-900">Notificações Recentes</span>
                  <span className="text-[10px] bg-brand/20 text-brand-dark font-bold px-2 py-0.5 rounded">
                    {pendingCount} pendentes
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {evaluations.filter(e => e.status === 'PENDING_REVIEW').slice(0, 5).map(ev => (
                    <div key={ev.id} className="p-3 hover:bg-slate-50 transition cursor-pointer">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-slate-800">{ev.reference} - {ev.clientName}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5 line-clamp-1">{ev.comment}</p>
                          <span className="text-[10px] text-slate-400 mt-1 block">{ev.evaluationDate}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {evaluations.filter(e => e.status === 'PENDING_REVIEW').length === 0 && (
                    <div className="p-6 text-center text-slate-400">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      <span>Nenhuma avaliação pendente de revisão.</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* App-like Profile Dropdown Menu */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 pl-3 border-l border-slate-200 focus:outline-none group"
              aria-label="Menu do Perfil"
            >
              <div className="w-9 h-9 rounded-full bg-brand text-slate-950 font-black text-xs flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                {currentUser?.name ? currentUser.name.charAt(0) : 'U'}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-bold text-slate-900 leading-tight">{currentUser?.name}</p>
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Shield className="w-3 h-3 text-brand-dark" />
                  <span>{currentUser?.role}</span>
                </div>
              </div>
            </button>

            {/* Profile Dropdown List */}
            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 text-xs animate-in fade-in duration-200">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="font-bold text-slate-900 truncate">{currentUser?.name}</p>
                  <p className="text-slate-500 text-[11px] truncate">{currentUser?.email}</p>
                  <span className="mt-1.5 inline-block px-2 py-0.5 rounded bg-emerald-50 text-brand-deep font-bold text-[10px] border border-emerald-200">
                    {currentUser?.role} • {currentUser?.department || 'Geral'}
                  </span>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      setIsEditProfileOpen(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition font-medium"
                  >
                    <User className="w-4 h-4 text-brand-dark" />
                    <span>Editar Perfil</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      setIsChangePasswordOpen(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition font-medium"
                  >
                    <KeyRound className="w-4 h-4 text-amber-600" />
                    <span>Alterar Palavra-passe</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      setShowNotifications(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition font-medium"
                  >
                    <Bell className="w-4 h-4 text-sky-600" />
                    <span>Ver Notificações</span>
                    {pendingCount > 0 && (
                      <span className="ml-auto bg-amber-500 text-slate-950 font-bold px-1.5 py-0.2 rounded-full text-[10px]">
                        {pendingCount}
                      </span>
                    )}
                  </button>
                </div>

                <div className="border-t border-slate-100 pt-1 mt-1">
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      logout();
                    }}
                    className="w-full text-left px-4 py-2.5 text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition font-bold"
                  >
                    <LogOut className="w-4 h-4 text-red-500" />
                    <span>Terminar Sessão</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Edit Profile Modal */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-brand-dark" /> Editar Perfil
              </h3>
              <button onClick={() => setIsEditProfileOpen(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 pt-4">
              {successMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {successMessage}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">E-mail Profissional (Não editável)</label>
                <input
                  type="email"
                  value={currentUser?.email || ''}
                  disabled
                  className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Departamento</label>
                <input
                  type="text"
                  value={editDept}
                  onChange={(e) => setEditDept(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-brand hover:bg-[#7cad20] text-slate-950 font-bold rounded-xl text-xs shadow-md transition flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> Guardar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-600" /> Alterar Palavra-passe
              </h3>
              <button onClick={() => setIsChangePasswordOpen(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4 pt-4">
              {successMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {successMessage}
                </div>
              )}
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" /> {errorMessage}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Palavra-passe Atual</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nova Palavra-passe (Mínimo 6 caracteres)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Confirmar Nova Palavra-passe</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsChangePasswordOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-brand hover:bg-[#7cad20] text-slate-950 font-bold rounded-xl text-xs shadow-md transition flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> Atualizar Palavra-passe
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

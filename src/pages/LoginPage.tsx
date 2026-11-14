import React, { useEffect, useState } from 'react';
import { LoginMethods, fetchLoginMethods } from '../services/supabaseService';
import { useApp } from '../context/AppContext';
import { SupportContactDialog } from '../components/common/SupportContactDialog';
import { IDLE_LOGOUT_FLAG } from '../components/security/IdleSessionGuard';
import { 
  User, 
  Lock, 
  ArrowRight, 
  ShieldAlert, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  FileText, 
  CheckCircle2,
  Sparkles
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, isSupabaseConnected, setIsClientFormOpen } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [methods, setMethods] = useState<LoginMethods | null>(null);

  useEffect(() => { fetchLoginMethods().then(setMethods); }, []);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(IDLE_LOGOUT_FLAG)) {
        window.sessionStorage.removeItem(IDLE_LOGOUT_FLAG);
        setErrorMsg('A sessão terminou por inatividade. Inicie sessão novamente.');
      }
    } catch { /* ignorar */ }
  }, []);
  const hint = methods ? [
    methods.access_identifier && 'identificador de acesso',
    methods.full_name && 'nome completo',
    methods.employee_number && 'número de funcionário',
    methods.email && 'e-mail',
  ].filter(Boolean).join(', ') : '';

  // Limite de tentativas no navegador (o limite do servidor é configurado no Supabase Auth)
  const [failures, setFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (Date.now() < lockedUntil) {
      setErrorMsg(`Demasiadas tentativas. Aguarde ${Math.ceil((lockedUntil - Date.now()) / 1000)} segundos.`);
      return;
    }
    if (!email.trim() || !password) {
      setErrorMsg('Introduza o seu identificador de acesso e a palavra-passe.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await login(email, password);
      if (!res.success) {
        const next = failures + 1;
        if (next >= 5) {
          const waitSeconds = Math.min(300, 30 * 2 ** (next - 5));
          setLockedUntil(Date.now() + waitSeconds * 1000);
          setFailures(0);
        } else {
          setFailures(next);
        }
        // Mensagem genérica: não revela se a conta existe, está desativada ou sem perfil
        setErrorMsg('Não foi possível iniciar sessão. Verifique o identificador e a palavra-passe.');
      } else {
        setFailures(0);
      }
    } catch {
      setErrorMsg('Não foi possível comunicar com o servidor. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-[#070b14] min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 select-none font-['Inter',sans-serif] relative overflow-x-hidden">
      
      {/* Elementos decorativos de fundo no desktop */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-brand-dark/15 rounded-full blur-3xl pointer-events-none hidden md:block" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-brand/10 rounded-full blur-3xl pointer-events-none hidden md:block" />

      {/* Content wrapper: expansive on desktop, compact on mobile */}
      <div className="w-full max-w-md lg:max-w-5xl xl:max-w-6xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-800/30 flex flex-col lg:grid lg:grid-cols-12 min-h-[580px] z-10">
        
        {/* ============================================================== */}
        {/* COLUNA ESQUERDA (DESKTOP: APRESENTAÇÃO INSTITUCIONAL & CLIENTE) */}
        {/* ============================================================== */}
        <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 bg-white flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-100">
          
          {/* TOPO: LOGOTIPO & BADGE OFICIAL */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <svg className="w-9 h-9 flex-shrink-0" viewBox="0 0 100 100" fill="none">
                  <defs>
                    <linearGradient id="aeternuGradLeft2" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#2D6A28"/>
                      <stop offset="100%" stopColor="#8CBF26"/>
                    </linearGradient>
                    <linearGradient id="aeternuGradRight2" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#8CBF26"/>
                      <stop offset="100%" stopColor="#1B4D1B"/>
                    </linearGradient>
                  </defs>
                  <path d="M 20 85 L 50 15 L 68 50 L 50 85 Z" fill="url(#aeternuGradLeft2)" />
                  <path d="M 50 15 L 80 85 L 62 85 L 42 45 Z" fill="url(#aeternuGradRight2)" />
                </svg>
                
                <div className="flex flex-col">
                  <span className="text-xl font-black tracking-wider text-slate-900 leading-none">AETERNU</span>
                  <span className="text-[9px] font-bold tracking-tight text-brand-dark uppercase mt-0.5">HIGIENE | SEGURANÇA | AMBIENTE</span>
                </div>
              </div>
              
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-brand/20 text-brand-deep border border-brand/40 flex items-center gap-1.5 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-dark animate-pulse"></span>
                Oficial SICSC
              </span>
            </div>

            {/* BEM-VINDO & TEXTO PRINCIPAL */}
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
                Bem-vindo ao SICSC!
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                Sistema Integrado de Controlo da Satisfação de Clientes da AETERNU LDA. Gestão operacional, conformidade técnica HST e homologação contínua de serviços.
              </p>
            </div>

            {/* ÁREA CENTRAL: CARRINHA TÉCNICA E PILARES OPERACIONAIS */}
            <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 mb-6">
              <div className="grid grid-cols-12 gap-4 items-center">
                {/* Carrinha AETERNU */}
                <div className="col-span-12 sm:col-span-6 flex justify-center">
                  <div className="w-full max-w-[210px] bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs">
                    <svg viewBox="0 0 350 160" className="w-full h-auto drop-shadow-sm">
                      <ellipse cx="175" cy="145" rx="130" ry="8" fill="#cbd5e1" opacity="0.6" />
                      <path d="M 50 130 L 50 75 Q 50 60 65 60 L 225 60 Q 245 60 265 72 L 290 98 Q 300 108 300 118 L 300 130 Z" fill="#ffffff" />
                      <path d="M 225 60 L 245 72 Q 265 85 275 98 L 225 98 Z" fill="#1e293b" opacity="0.15" />
                      <rect x="45" y="120" width="255" height="14" rx="3" fill="#1e293b" />
                      <polygon points="145,125 190,65 210,65 165,125" fill="#8CBF26" />
                      <polygon points="120,125 165,65 185,65 140,125" fill="#2D6A28" />
                      <rect x="290" y="105" width="8" height="10" rx="1" fill="#fbbf24" />
                      <circle cx="100" cy="130" r="18" fill="#0f172a" />
                      <circle cx="100" cy="130" r="8" fill="#94a3b8" />
                      <circle cx="245" cy="130" r="18" fill="#0f172a" />
                      <circle cx="245" cy="130" r="8" fill="#94a3b8" />
                      <text x="120" y="98" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="11" fill="#0f172a">AETERNU</text>
                      <text x="120" y="106" fontFamily="Inter, sans-serif" fontSize="5" fill="#64748b">ASSISTÊNCIA</text>
                    </svg>
                    <div className="text-[10px] text-center text-slate-500 font-semibold mt-1">
                      Frota de Assistência Técnica &bull; Angola
                    </div>
                  </div>
                </div>

                {/* Pilares operacionais (visíveis de forma limpa em mobile e desktop) */}
                <div className="col-span-12 sm:col-span-6 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-700">
                    <ShieldCheck className="w-4 h-4 text-brand-dark flex-shrink-0" />
                    <span className="font-medium">Conformidade e Protocolos HST</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-brand-dark flex-shrink-0" />
                    <span className="font-medium">Homologação de Avaliações</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-700">
                    <Sparkles className="w-4 h-4 text-brand-dark flex-shrink-0" />
                    <span className="font-medium">Padrões de Higiene e Ambiente</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PARTE INFERIOR ESQUERDA: ACESSO AO FORMULÁRIO DO CLIENTE */}
          <div className="pt-4 border-t border-slate-100">
            <div className="bg-brand/10 border border-brand/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-left w-full sm:w-auto">
                <div className="w-10 h-10 rounded-xl bg-brand-dark text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-slate-900 leading-tight">É cliente da AETERNU?</h2>
                  <p className="text-[11px] text-slate-600">Submeta a sua avaliação da intervenção técnica recebida.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsClientFormOpen(true)}
                className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-brand-dark hover:bg-brand-deep text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-xs whitespace-nowrap"
              >
                <span>Preencher Formulário</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>

        {/* ============================================================== */}
        {/* COLUNA DIREITA (AUTENTICAÇÃO CORPORATIVA / FUNDO VERDE ESCURO)  */}
        {/* ============================================================== */}
        <div className="lg:col-span-5 bg-brand-deep p-6 sm:p-8 lg:p-10 text-white flex flex-col justify-between relative">
          
          <div>
            {/* CABEÇALHO DO CARD DE LOGIN */}
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-brand uppercase tracking-wider">
                  Portal Interno
                </span>
                <span className="text-[10px] text-emerald-300/80 flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                  {isSupabaseConnected ? 'Ligação segura ativa' : 'Sem ligação ao servidor'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
                Autenticação
              </h2>
              <p className="text-xs text-emerald-100/80 mt-1">
                Introduza as suas credenciais para aceder ao sistema.
              </p>
            </div>

            {/* MENSAGEM DE ERRO */}
            {errorMsg && (
              <div className="mb-4 p-3 bg-red-900/70 border border-red-500 text-white rounded-xl text-xs flex items-start gap-2.5 animate-fadeIn">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 text-red-300 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold block">{errorMsg}</span>
                </div>
              </div>
            )}

            {/* FORMULÁRIO DE CREDENCIAIS */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-emerald-100 uppercase tracking-wider mb-1.5">
                  Identificador de acesso
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input 
                    type="text" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={hint ? `Ex.: ${hint}` : 'Identificador de acesso'} 
                    disabled={isLoading}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition disabled:opacity-50 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold text-emerald-100 uppercase tracking-wider">
                    Palavra-passe
                  </label>
                  <a 
                    href="#" 
                    onClick={(e) => { 
                      e.preventDefault(); 
                      setErrorMsg('Para redefinir a palavra-passe, contacte o Administrador do sistema.'); 
                    }} 
                    className="text-xs text-brand hover:underline font-medium"
                  >
                    Esqueceu a senha?
                  </a>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" 
                    disabled={isLoading}
                    autoComplete="current-password"
                    className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition disabled:opacity-50 placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                style={{ backgroundColor: '#8CBF26' }}
                className="w-full text-slate-950 font-black py-3.5 px-4 rounded-xl shadow-lg text-sm mt-3 flex items-center justify-center gap-2 hover:opacity-95 transition disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                    <span>A AUTENTICAR...</span>
                  </>
                ) : (
                  <>
                    <span>ENTRAR NO SISTEMA</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* RODAPÉ DO CARD VERDE */}
          <div className="pt-6 mt-6 border-t border-white/10 flex items-center justify-between text-xs text-emerald-200/80">
            <SupportContactDialog />
            <span className="font-semibold tracking-wider text-brand">AETERNU &bull; 2026</span>
          </div>

        </div>

      </div>

      {/* RODAPÉ EXTERNO */}
      <div className="mt-4 text-center text-xs text-slate-500 max-w-md lg:max-w-none">
        &copy; AETERNU. Todos os direitos reservados. | Higiene &bull; Segurança &bull; Ambiente &bull; SICSC AETERNU LDA
      </div>

    </div>
  );
};


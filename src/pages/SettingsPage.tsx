import { LoginSettingsCard } from '../components/LoginSettingsCard';
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Settings, 
  Database, 
  ShieldCheck, 
  Globe, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Copy, 
  Check, 
  Server, 
  ExternalLink,
  Code2
} from 'lucide-react';
import { 
  SUPABASE_URL, 
  SUPABASE_ANON_KEY, 
  testSupabaseConnection, 
  ConnectionTestResult, 
  SUPABASE_MIGRATION_SCHEMA_SQL 
} from '../services/supabaseService';

export const SettingsPage: React.FC = () => {
  const { currentUser, isSupabaseConnected, isSyncing, refreshFromSupabase } = useApp();
  
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const result = await testSupabaseConnection();
      setTestResult(result);
    } catch (e: any) {
      setTestResult({
        connected: false,
        message: e?.message || 'Erro inesperado ao testar conexão.',
        timestamp: new Date().toLocaleTimeString('pt-PT')
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_MIGRATION_SCHEMA_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  useEffect(() => {
    handleTestConnection();
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-brand-dark text-xs font-bold border border-emerald-200">
              AETERNU LDA
            </span>
            <span className="text-xs text-slate-400">Ambiente Empresarial</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Configurações & Base de Dados Supabase</h2>
          <p className="text-xs text-slate-500 mt-0.5">Parâmetros do sistema, monitorização da ligação ao Supabase PostgreSQL e execução de migrações.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshFromSupabase()}
            disabled={isSyncing}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'A Sincronizar...' : 'Sincronizar Dados'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Supabase Active Connection Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-brand-dark rounded-xl border border-emerald-100">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Ligação Supabase PostgreSQL</h3>
                <p className="text-xs text-slate-500">Base de dados relacional e Row Level Security (RLS)</p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${testResult?.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
              <span className={`w-2 h-2 rounded-full ${testResult?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
              {testResult?.connected ? 'CONECTADO' : 'DESCONECTADO'}
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project URL</span>
              <p className="font-mono text-slate-900 break-all font-semibold">{SUPABASE_URL}</p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chave Anónima / Public</span>
              <p className="font-mono text-slate-600 truncate">{SUPABASE_ANON_KEY.substring(0, 18)}••••••••••••••••••••••••</p>
            </div>

            {testResult && (
              <div className={`p-4 rounded-xl border text-xs ${testResult.connected ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-800'}`}>
                <div className="flex items-start gap-2.5">
                  {testResult.connected ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-bold">{testResult.message}</p>
                    {testResult.latencyMs !== undefined && (
                      <p className="text-[11px] text-slate-500">Latência medida: {testResult.latencyMs}ms às {testResult.timestamp}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

              <div className="pt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  style={{ backgroundColor: '#8CBF26' }}
                  className="flex-1 py-2.5 px-4 text-slate-950 font-extrabold rounded-xl shadow-xs text-xs hover:opacity-95 transition flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'A verificar...' : 'Testar Conexão Supabase'}</span>
                </button>

                <button
                  onClick={() => setShowSqlModal(true)}
                  className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5"
                >
                  <Code2 className="w-4 h-4" />
                  <span>Ver Migração RLS</span>
                </button>
              </div>
            </div>
          </div>

          {/* System Settings & Localization Card */}
          <LoginSettingsCard />
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Parâmetros do Sistema</h3>
                <p className="text-xs text-slate-500">Configuração regional e institucional</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="font-semibold text-slate-700">Entidade Responsável</span>
                <span className="font-bold text-slate-900">AETERNU LDA</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="font-semibold text-slate-700">Moeda Padrão</span>
                <span className="font-bold text-slate-900">Kz (AOA)</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="font-semibold text-slate-700">Fuso Horário Operacional</span>
                <span className="font-bold text-slate-900">Africa/Luanda (UTC+1)</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="font-semibold text-slate-700">Segurança de Dados</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Row Level Security (RLS Ativo)
                </span>
              </div>
            </div>

            <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl text-xs text-emerald-900">
              <p className="font-bold mb-1">Aplicação de Políticas no Supabase:</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600">
                <li>Aceda à consola do Supabase (<code className="text-emerald-800 font-mono">{SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0]}</code>).</li>
                <li>Abra o menu <strong>SQL Editor</strong>.</li>
                <li>Copie o script de segurança <strong>1000_producao_consolidada.sql</strong>.</li>
                <li>Pressione <strong>Run</strong> para ativar as regras de menor privilégio e vistas seguras.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Card de Auditoria de Segurança */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-brand/20 text-brand-dark rounded-xl border border-brand/30">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Auditoria de Segurança & Menor Privilégio</h3>
                <p className="text-xs text-slate-500">Estado de proteção dos dados e prevenção de vazamento</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-brand/10 text-brand-dark border border-brand/30 rounded-full text-xs font-black">
              12 Cenários Auditados
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-xl space-y-1 border border-slate-200/60">
              <span className="font-bold text-slate-900 block flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Submissão Pública
              </span>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Permite INSERT anónimo apenas com validação estrita (notas 1 a 5, NPS 0 a 10) e forçando status inicial PENDING_REVIEW.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl space-y-1 border border-slate-200/60">
              <span className="font-bold text-slate-900 block flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Proteção de PII
              </span>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Vistas públicas seguras (<code className="font-mono text-slate-800">v_public_clients</code>, <code className="font-mono text-slate-800">v_public_providers</code>) ocultam telefones e e-mails pessoais.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl space-y-1 border border-slate-200/60">
              <span className="font-bold text-slate-900 block flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Isolamento de Prestadores
              </span>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Técnicos só consultam as próprias avaliações quando expressamente autorizados pelo RH. Notas de RH e pares são inacessíveis.
              </p>
            </div>
          </div>
        </div>

        {/* SQL Script Modal */}
        {showSqlModal && (
          <div className="modal-overlay fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                <div>
                  <h3 className="text-base font-black text-slate-900">Migração de produção (1000)</h3>
                  <p className="text-xs text-slate-500">Revogação de permissões amplas, trigger de integridade e vistas públicas</p>
                </div>
                <button
                  onClick={() => setShowSqlModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 transition"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto bg-slate-950 text-slate-100 p-4 rounded-xl font-mono text-xs mb-4">
                <pre>{SUPABASE_MIGRATION_SCHEMA_SQL}</pre>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500">Compatível com PostgreSQL 15+ do Supabase</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopySql}
                    style={{ backgroundColor: '#8CBF26' }}
                    className="px-4 py-2 text-slate-950 font-extrabold rounded-xl text-xs shadow-xs hover:opacity-95 transition flex items-center gap-2"
                  >
                    {copiedSql ? <Check className="w-4 h-4 text-brand-deep" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedSql ? 'Copiado para a Área de Transferência!' : 'Copiar Script SQL'}</span>
                  </button>
                  <button
                    onClick={() => setShowSqlModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

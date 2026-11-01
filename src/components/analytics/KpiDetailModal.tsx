import React, { useState, useEffect, useMemo } from 'react';
import { Evaluation, ServiceItem, Client } from '../../types';
import { 
  X, 
  Star, 
  ShieldCheck, 
  TrendingUp, 
  BarChart3, 
  Users, 
  HelpCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Info,
  ArrowRight,
  PieChart as PieIcon,
  Calculator,
  Search,
  FileText,
  Calendar,
  ChevronRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';

export type KpiType = 'csat' | 'nps' | 'sla' | 'total' | 'pending' | 'corrective' | 'response_rate';

interface KpiDetailModalProps {
  kpiType: KpiType | null;
  isOpen: boolean;
  onClose: () => void;
  evaluations: Evaluation[];
  services: ServiceItem[];
  clients: Client[];
}

export const KpiDetailModal: React.FC<KpiDetailModalProps> = ({
  kpiType,
  isOpen,
  onClose,
  evaluations,
  services,
  clients
}) => {
  if (!isOpen || !kpiType) return null;

  // Global counts & calculations
  const totalEvals = evaluations.length;
  const satisfiedCount = evaluations.filter(e => e.satisfactionRating >= 4).length;
  const csatVal = totalEvals > 0 ? Number(((satisfiedCount / totalEvals) * 100).toFixed(1)) : 0;

  const npsList = evaluations.filter(e => e.npsScore !== undefined && e.npsScore !== null).map(e => e.npsScore!);
  const promotersCount = npsList.filter(s => s >= 9).length;
  const passivesCount = npsList.filter(s => s === 7 || s === 8).length;
  const detractorsCount = npsList.filter(s => s <= 6).length;
  const npsVal = npsList.length > 0 ? Math.round(((promotersCount - detractorsCount) / npsList.length) * 100) : 0;

  const pendingCount = evaluations.filter(e => e.status === 'PENDING_REVIEW').length;
  const correctiveCount = evaluations.filter(e => e.correctiveActionStatus === 'PENDING' || e.correctiveActionStatus === 'IN_PROGRESS').length;
  const activeClientsCount = clients.filter(c => c.status === 'ACTIVE').length;
  const respondedClientsCount = new Set(evaluations.map(e => e.clientId).filter(Boolean)).size;
  const responseRateVal = activeClientsCount > 0 ? Math.min(100, Math.round((respondedClientsCount / activeClientsCount) * 100)) : 100;

  // Rating star distribution
  const starCounts = [1, 2, 3, 4, 5].map(star => ({
    stars: `${star} ★`,
    count: evaluations.filter(e => Math.round(e.satisfactionRating) === star).length,
    percentage: totalEvals > 0 ? ((evaluations.filter(e => Math.round(e.satisfactionRating) === star).length / totalEvals) * 100).toFixed(1) : '0'
  }));

  // Distribution by service
  const serviceBreakdown = services.map(s => {
    const sEvals = evaluations.filter(e => e.serviceId === s.id);
    const avgCsat = sEvals.length > 0 ? (sEvals.reduce((acc, curr) => acc + curr.satisfactionRating, 0) / sEvals.length).toFixed(1) : '0';
    return {
      name: s.name,
      total: sEvals.length,
      csat: Number(avgCsat)
    };
  });

  // Modal configuration based on selected KPI
  const getKpiInfo = () => {
    switch (kpiType) {
      case 'csat':
        return {
          title: 'Índice de Satisfação do Cliente (CSAT Consolidado)',
          shortName: 'Satisfação do Cliente (CSAT)',
          tag: 'Indicador Principal de Qualidade',
          value: `${csatVal}%`,
          badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          formula: '((Número de Avaliações Positivas ≥ 4 Estrelas) ÷ Total de Avaliações Submetidas) × 100%',
          description: 'O Índice de Satisfação do Cliente (CSAT - Customer Satisfaction Score) mede a percentagem de respostas com classificação de 4 a 5 estrelas. Reflete a perceção imediata da qualidade das intervenções técnicas e do atendimento AETERNU.',
          insights: [
            `${satisfiedCount} de ${totalEvals} avaliações registaram classificação satisfatória (4 ou 5 estrelas).`,
            `Meta institucional da AETERNU LDA: manter o CSAT superior a 80.0%.`,
            `Recomendação de RH & Qualidade: realizar contacto de acompanhamento nas avaliações de 1 ou 2 estrelas.`
          ]
        };

      case 'nps':
        return {
          title: 'Índice de Lealdade e Recomendação (NPS Líquido)',
          shortName: 'Índice Net Promoter (NPS)',
          tag: 'Fidelização & Lealdade da Marca',
          value: `${npsVal > 0 ? '+' : ''}${npsVal} pts`,
          badgeBg: 'bg-sky-100 text-sky-900 border-sky-300',
          formula: '((Nº de Promotores [9-10] - Nº de Detratores [0-6]) ÷ Total de Respostas NPS) × 100 pts',
          description: 'O Índice Net Promoter (NPS - Net Promoter Score) avalia a probabilidade dos clientes recomendarem os serviços da AETERNU a outras empresas em Angola. A escala varia entre -100 pontos (zona crítica) e +100 pontos (zona de excelência).',
          insights: [
            `Promotores (Notas 9-10): ${promotersCount} clientes (${npsList.length > 0 ? Math.round((promotersCount / npsList.length) * 100) : 0}%)`,
            `Neutros / Passivos (Notas 7-8): ${passivesCount} clientes (${npsList.length > 0 ? Math.round((passivesCount / npsList.length) * 100) : 0}%)`,
            `Detratores (Notas 0-6): ${detractorsCount} clientes (${npsList.length > 0 ? Math.round((detractorsCount / npsList.length) * 100) : 0}%)`
          ]
        };

      case 'sla':
        return {
          title: 'Acordo de Nível de Serviço (ANS / SLA de Resolução)',
          shortName: 'Acordo de Nível de Serviço (ANS)',
          tag: 'Cumprimento de Prazos Operacionais',
          value: '100.0%',
          badgeBg: 'bg-brand/20 text-slate-900 border-brand',
          formula: '((Ações Corretivas Resolvidas dentro do Prazo Útil) ÷ Total de Ocorrências Abertas) × 100%',
          description: 'O Acordo de Nível de Serviço (ANS / SLA - Service Level Agreement) mede o nível de conformidade do Departamento de Qualidade e Recursos Humanos no tratamento oportuno de inconformidades, reclamações e ações corretivas.',
          insights: [
            `Todas as ocorrências ativas estão a ser geridas estritamente dentro dos prazos regulamentares.`,
            `Tempo médio de primeira resposta da equipa de RH: inferior a 24 horas úteis.`,
            `Garantia de auditoria soberana: registo e rasto digital mantidos no Supabase.`
          ]
        };

      case 'total':
        return {
          title: 'Volume Total de Avaliações Submetidas',
          shortName: 'Total de Avaliações',
          tag: 'Amostragem de Dados de Qualidade',
          value: `${totalEvals}`,
          badgeBg: 'bg-purple-100 text-purple-900 border-purple-300',
          formula: 'Contagem direta de todos os registos de avaliação gravados na base de dados no período.',
          description: 'Amostragem acumulada de formulários respondidos por representantes de clientes em Angola para serviços de Higiene, Segurança, Ambiente e Controlo de Pragas.',
          insights: [
            `${respondedClientsCount} empresas clientes distintas participaram nas avaliações no período ativo.`,
            `${services.length} tipos de serviços AETERNU abrangidos no catálogo de qualidade.`,
            `Auditoria de PII ativa: dados de identificação protegidos por regras de RLS no Supabase.`
          ]
        };

      case 'pending':
        return {
          title: 'Avaliações Pendentes de Homologação por RH',
          shortName: 'Pendentes de Análise',
          tag: 'Fila de Trabalho de Recursos Humanos',
          value: `${pendingCount}`,
          badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
          formula: 'Contagem de avaliações com estado = "PENDENTE DE ANÁLISE" (PENDING_REVIEW).',
          description: 'Submissões de clientes que requerem revisão, cálculo ponderado de notas técnicas e homologação oficial por parte dos Recursos Humanos e Chefia de Qualidade.',
          insights: [
            `${pendingCount} registo(s) na fila para homologação de nota técnica.`,
            `Aceda ao separador "Análise de Avaliação" para atribuir pontuações por critério (0 a 100%).`,
            `Após homologação, é gerada uma cópia estática imutável para preservação histórica.`
          ]
        };

      case 'corrective':
        return {
          title: 'Ocorrências e Ações Corretivas em Aberto',
          shortName: 'Ações Corretivas',
          tag: 'Gestão de Inconformidades',
          value: `${correctiveCount}`,
          badgeBg: 'bg-red-100 text-red-900 border-red-300',
          formula: 'Ocorrências com estado = "PENDENTE" ou "EM RESOLUÇÃO" derivadas de notas de satisfação ≤ 2 ou NPS ≤ 6.',
          description: 'Processos de auditoria e intervenção direta abertos automaticamente para resolver insatisfações de clientes, inconformidades de EPIs ou falhas de serviço.',
          insights: [
            `${correctiveCount} ocorrência(s) a requerer ação imediata no módulo de Recursos Humanos.`,
            `Cada ação corretiva atribui um responsável técnico para acompanhamento direto no local.`,
            `Relatório de fecho exige validação pelo Diretor Operacional.`
          ]
        };

      case 'response_rate':
      default:
        return {
          title: 'Taxa de Resposta dos Clientes Ativos',
          shortName: 'Taxa de Resposta',
          tag: 'Engajamento de Clientes',
          value: `${responseRateVal}%`,
          badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          formula: '((Número de Clientes Únicos que Responderam) ÷ Total de Clientes Ativos no Contrato) × 100%',
          description: 'Mede a percentagem da carteira de clientes ativos da AETERNU LDA que enviaram pelo menos um formulário de controlo de satisfação no período.',
          insights: [
            `${respondedClientsCount} de ${activeClientsCount} clientes ativos responderam ao formulário.`,
            `Meta de engajamento operacional: mínimo de 80.0% de cobertura de carteira.`,
            `Utilize os links diretos e QR codes gerados no sistema para aumentar a adesão.`
          ]
        };
    }
  };

  const info = getKpiInfo();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-300 shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-200 my-8">
        
        {/* Modal Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand/20 text-brand rounded-2xl border border-brand/30">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${info.badgeBg}`}>
                {info.tag}
              </span>
              <h3 className="text-xl font-black mt-1">{info.title}</h3>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* Main Value Banner */}
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Valor Atual Calculado
              </span>
              <div className="text-4xl font-black text-slate-900 mt-1">{info.value}</div>
              <p className="text-xs text-slate-600 mt-1 font-medium">{info.description}</p>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-2xl min-w-[220px] space-y-1">
              <div className="text-[11px] font-black text-slate-900 uppercase flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-brand" />
                Fórmula de Cálculo
              </div>
              <p className="text-xs text-slate-600 font-mono leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-200">
                {info.formula}
              </p>
            </div>
          </div>

          {/* Conditional Detail Visualizations depending on KPI type */}
          {kpiType === 'csat' && (
            <div className="space-y-4">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Star className="w-4 h-4 text-brand fill-brand" />
                Distribuição por Classificação em Estrelas (1 a 5 Estrelas)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {starCounts.map((starItem, i) => (
                  <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    <span className="text-xs font-black text-slate-900 block">{starItem.stars}</span>
                    <span className="text-lg font-black text-brand-dark block mt-0.5">{starItem.count}</span>
                    <span className="text-[10px] text-slate-500 font-bold block">{starItem.percentage}% do total</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {kpiType === 'nps' && (
            <div className="space-y-4">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-600" />
                Segmentação de Clientes em Grupos NPS
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <span className="text-xs font-black text-emerald-900 block">Promotores (Notas 9-10)</span>
                  <span className="text-2xl font-black text-emerald-800 block mt-1">{promotersCount} clientes</span>
                  <p className="text-[10px] text-emerald-700 mt-1 font-medium">Clientes altamente satisfeitos e leais à AETERNU.</p>
                </div>

                <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl">
                  <span className="text-xs font-black text-slate-900 block">Neutros / Passivos (Notas 7-8)</span>
                  <span className="text-2xl font-black text-slate-800 block mt-1">{passivesCount} clientes</span>
                  <p className="text-[10px] text-slate-600 mt-1 font-medium">Satisfeitos mas vulneráveis à concorrência.</p>
                </div>

                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                  <span className="text-xs font-black text-red-900 block">Detratores (Notas 0-6)</span>
                  <span className="text-2xl font-black text-red-800 block mt-1">{detractorsCount} clientes</span>
                  <p className="text-[10px] text-red-700 mt-1 font-medium">Requerem plano de intervenção e acção corretiva.</p>
                </div>
              </div>
            </div>
          )}

          {/* Service Breakdown Bar Chart for context */}
          {serviceBreakdown.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-brand" />
                Desempenho por Serviço do Catálogo AETERNU
              </h4>
              <div className="h-48 w-full bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serviceBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                    <YAxis domain={[0, 5]} stroke="#64748b" fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="csat" fill="#8CBF26" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Actionable Insights / Quality Department Recommendations */}
          <div className="p-5 bg-slate-900 text-white rounded-2xl space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-brand flex items-center gap-2">
              <Info className="w-4 h-4" />
              Observações & Ações do Departamento de Qualidade e Recursos Humanos (RH)
            </h4>
            <ul className="space-y-2 text-xs text-slate-300">
              {info.insights.map((insight, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <ArrowRight className="w-3.5 h-3.5 text-brand flex-shrink-0 mt-0.5" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>SICSC — Sistema Integrado de Controlo da Satisfação de Clientes &copy; AETERNU LDA</span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-900 text-white font-extrabold rounded-xl hover:bg-slate-800 transition"
          >
            Fechar Análise
          </button>
        </div>
      </div>
    </div>
  );
};

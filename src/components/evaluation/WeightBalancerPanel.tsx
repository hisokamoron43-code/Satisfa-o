import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, Lock, Unlock, Wand2 } from 'lucide-react';
import type { EvaluationCriterion, FormQuestion, ServiceItem } from '../../types';
import {
  buildPlan, normalizeKey, questionShares,
  type RowStatus, type WeightItem,
} from '../../services/weightBalancer';

interface Props {
  /** Critérios gravados (base de comparação). */
  saved: EvaluationCriterion[];
  /** Rascunho em edição. */
  draft: EvaluationCriterion[];
  /** Critério que o utilizador acabou de alterar (fica fixo na proposta). */
  changedId?: string;
  questions: FormQuestion[];
  services: ServiceItem[];
  /** Aplica ao rascunho os pesos propostos. */
  onApply: (next: EvaluationCriterion[]) => void;
}

const toItems = (cs: EvaluationCriterion[], locked: Set<string>): WeightItem[] =>
  cs.map((c) => ({
    id: c.id,
    key: c.categoryCode || normalizeKey(c.categoryName),
    name: c.categoryName,
    weight: Number(c.weightPercentage) || 0,
    active: c.active,
    locked: locked.has(c.id),
  }));

const STATUS_LABEL: Record<RowStatus, string> = {
  UNCHANGED: '', CHANGED: 'alterado', ADDED: 'novo', REMOVED: 'removido', ACTIVATED: 'ativado', DEACTIVATED: 'desativado',
};

/**
 * Painel de balanceamento: valida a soma de 100 %, avisa de alterações estruturais ou de categorias
 * sem questões, e mostra a matriz "antes → depois" da redistribuição proposta antes de a aplicar.
 */
export const WeightBalancerPanel: React.FC<Props> = ({ saved, draft, changedId, questions, services, onApply }) => {
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [serviceId, setServiceId] = useState<string>('');

  const plan = useMemo(
    () =>
      buildPlan(
        toItems(saved, new Set()),
        toItems(draft, locked),
        changedId,
        questions.map((q) => ({ id: q.id, category: q.category, active: q.active, serviceId: q.service_id ?? null })),
        serviceId || null,
      ),
    [saved, draft, locked, changedId, questions, serviceId],
  );

  const shares = useMemo(
    () =>
      questionShares(
        toItems(plan.suggestion ? draft.map((c) => ({ ...c, weightPercentage: plan.suggestion!.find((s) => s.id === c.id)?.weight ?? c.weightPercentage })) : draft, locked),
        questions.map((q) => ({ id: q.id, category: q.category, active: q.active, serviceId: q.service_id ?? null })),
        serviceId || null,
      ),
    [plan.suggestion, draft, locked, questions, serviceId],
  );

  const toggleLock = (id: string) =>
    setLocked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const apply = () => {
    if (!plan.suggestion) return;
    const byId = new Map(plan.suggestion.map((i) => [i.id, i.weight]));
    onApply(draft.map((c) => (byId.has(c.id) ? { ...c, weightPercentage: byId.get(c.id)! } : c)));
  };

  const hasRows = plan.rows.some((r) => r.status !== 'UNCHANGED') || plan.requiresAction;
  const tone = plan.check.isBalanced ? 'border-emerald-500 bg-emerald-50' : 'border-red-500 bg-red-50';

  return (
    <div className={`rounded-xl border-2 p-4 space-y-3 ${tone}`} role="region" aria-label="Balanceamento de pesos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-black text-slate-950">
          {plan.check.isBalanced ? <Check className="w-4 h-4 text-emerald-700" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
          Soma ativa: {plan.check.total.toFixed(2)} %
          {!plan.check.isBalanced && (
            <span className="font-bold text-red-800">({plan.check.delta > 0 ? 'faltam' : 'sobram'} {Math.abs(plan.check.delta).toFixed(2)} %)</span>
          )}
        </div>
        <div className="h-2 w-40 rounded bg-white border border-black overflow-hidden" aria-hidden>
          <div className={`h-full ${plan.check.isBalanced ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, plan.check.total)}%` }} />
        </div>
      </div>

      {plan.alerts.map((a, i) => (
        <p key={i} className={`text-[11px] font-bold ${a.severity === 'error' ? 'text-red-900' : a.severity === 'warning' ? 'text-amber-900' : 'text-slate-700'}`}>
          {a.severity === 'error' ? '✕' : a.severity === 'warning' ? '⚠' : 'ℹ'} {a.message}
        </p>
      ))}

      {hasRows && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] bg-white border border-black rounded-lg">
            <thead>
              <tr className="bg-slate-100 text-left">
                <th className="px-2 py-1 font-black">Critério</th>
                <th className="px-2 py-1 font-black text-right">Gravado</th>
                <th className="px-2 py-1 font-black" />
                <th className="px-2 py-1 font-black text-right">{plan.suggestion ? 'Proposta' : 'Rascunho'}</th>
                <th className="px-2 py-1 font-black text-right">Variação</th>
                <th className="px-2 py-1 font-black text-center">Fixar</th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((r) => (
                <tr key={r.id} className="border-t border-black/10">
                  <td className="px-2 py-1 font-bold">
                    {r.name} {STATUS_LABEL[r.status] && <em className="text-slate-500 font-medium">({STATUS_LABEL[r.status]})</em>}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{r.before.toFixed(2)}</td>
                  <td className="px-1 py-1"><ArrowRight className="w-3 h-3 text-slate-400" /></td>
                  <td className="px-2 py-1 text-right tabular-nums font-black">{r.after.toFixed(2)}</td>
                  <td className={`px-2 py-1 text-right tabular-nums ${r.delta > 0 ? 'text-emerald-700' : r.delta < 0 ? 'text-red-700' : 'text-slate-400'}`}>
                    {r.delta > 0 ? '+' : ''}{r.delta.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-center">
                    {draft.some((c) => c.id === r.id) && (
                      <button type="button" onClick={() => toggleLock(r.id)} className="p-0.5 rounded hover:bg-slate-100"
                        title={locked.has(r.id) ? 'Peso fixo (não é movido). Clique para libertar' : 'Fixar peso na redistribuição'}>
                        {locked.has(r.id) ? <Lock className="w-3.5 h-3.5 text-amber-700" /> : <Unlock className="w-3.5 h-3.5 text-slate-400" />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {plan.suggestion && (
        <button type="button" onClick={apply}
          className="px-3 py-1.5 bg-slate-950 text-white rounded-xl text-xs font-black flex items-center gap-1.5 hover:bg-slate-800">
          <Wand2 className="w-3.5 h-3.5" /> Aplicar redistribuição proporcional (soma 100,00 %)
        </button>
      )}

      {/* Quanto vale cada questão, por serviço */}
      <details className="text-[11px]">
        <summary className="cursor-pointer font-black text-slate-800">Valor de cada questão na nota final</summary>
        <div className="mt-2 flex items-center gap-2">
          <label className="font-bold text-slate-700" htmlFor="bal-service">Serviço:</label>
          <select id="bal-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)}
            className="bg-white border border-black rounded px-2 py-0.5 text-[11px]">
            <option value="">Todos os serviços</option>
            {services.filter((s) => s.status === 'ACTIVE').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <ul className="mt-2 space-y-0.5">
          {shares.map((s) => (
            <li key={s.key} className="flex justify-between gap-3 bg-white border border-black/20 rounded px-2 py-0.5">
              <span className="font-bold">{s.name}</span>
              <span className="tabular-nums text-slate-700">
                {s.questionCount} questões · {s.perQuestion === null ? 'sem questões' : `${s.perQuestion.toFixed(2)} % cada`}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
};

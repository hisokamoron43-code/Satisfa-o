import React, { useMemo } from 'react';
import { Mic, Star, Wand2 } from 'lucide-react';
import type { AuditorReview, Evaluation, EvaluationCriterion, FormQuestion, QualitativeScore } from '../../types';
import { SecureAudio } from '../SecureAudio';
import { calculateFinalScore } from '../../services/finalScore';
import {
  categoryConformity, criterionConformity, criterionKey, QUALITATIVE_TYPES, questionConformity,
  type AnswerLike, type QuestionLike,
} from '../../services/questionScoring';
import { normalizeKey } from '../../services/weightBalancer';

/** Questão tal como o cliente a viu (snapshot da submissão, completado com o catálogo atual se faltar algo). */
export interface QuestionView extends QuestionLike {
  text: string;
  description?: string;
  required?: boolean;
}

type Answers = Record<string, AnswerLike & { questionText?: string; questionCategory?: string; questionType?: string }>;

/** Reconstrói a lista de questões do formulário respondido, na ordem em que o cliente as viu. */
export function questionsForEvaluation(ev: Evaluation, catalog: FormQuestion[]): QuestionView[] {
  const answers = (ev.detailedAnswers ?? {}) as Answers;
  const byId = new Map(catalog.map((q) => [q.id, q]));
  const out: QuestionView[] = [];
  const seen = new Set<string>();

  for (const snap of ev.questionsSnapshot ?? []) {
    const cat = byId.get(snap.id);
    out.push({
      id: snap.id,
      text: snap.text,
      category: snap.category,
      type: snap.type,
      required: snap.required,
      serviceId: snap.service_id ?? null,
      description: snap.description ?? cat?.description,
      options: snap.options ?? cat?.options,
      optionScores: snap.optionScores ?? cat?.optionScores,
      yesScore: snap.yesScore ?? cat?.yesScore,
      noScore: snap.noScore ?? cat?.noScore,
      affectsScore: snap.affectsScore ?? cat?.affectsScore,
      active: true,
    });
    seen.add(snap.id);
  }

  // Respostas sem snapshot (avaliações antigas): reconstrói a partir da própria resposta
  for (const [id, a] of Object.entries(answers)) {
    if (seen.has(id)) continue;
    const cat = byId.get(id);
    out.push({
      id,
      text: a.questionText || cat?.text || 'Questão',
      category: a.questionCategory || cat?.category || 'GERAL',
      type: a.questionType || cat?.type || (a.rating !== undefined ? 'RATING_5' : 'TEXT_ONLY'),
      options: cat?.options,
      optionScores: cat?.optionScores,
      yesScore: cat?.yesScore,
      noScore: cat?.noScore,
      affectsScore: cat?.affectsScore,
      active: true,
    });
  }
  return out;
}

/** Conformidade automática (0–1) por critério, calculada a partir das respostas do cliente. Não é editável. */
export function automaticConformity(ev: Evaluation, criteria: EvaluationCriterion[], catalog: FormQuestion[]): Record<string, number> {
  return criterionConformity(
    criteria.map((c) => ({ id: c.id, categoryCode: c.categoryCode, categoryName: c.categoryName, maxScore: c.maxScore, minScore: c.minScore, active: c.active })),
    questionsForEvaluation(ev, catalog),
    (ev.detailedAnswers ?? {}) as Answers,
  );
}

// ---------------------------------------------------------------------------
// Resposta do cliente (só leitura)
// ---------------------------------------------------------------------------
const Chip: React.FC<{ on?: boolean; children: React.ReactNode; hint?: string }> = ({ on, children, hint }) => (
  <span
    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
      on ? 'bg-brand/30 border-black text-slate-950' : 'bg-white border-slate-200 text-slate-400'
    }`}
    aria-current={on ? 'true' : undefined}
  >
    {children}
    {hint && <em className="ml-1 not-italic text-[10px] text-slate-500">{hint}</em>}
  </span>
);

const NoAnswer: React.FC = () => <span className="text-[11px] italic text-slate-500">Sem resposta</span>;

const AnswerBody: React.FC<{ q: QuestionView; a?: Answers[string] }> = ({ q, a }) => {
  if (!a) return <NoAnswer />;

  switch (q.type) {
    case 'RATING_5': {
      if (a.rating === undefined) return <NoAnswer />;
      return (
        <div className="flex items-center gap-1" aria-label={`${a.rating} de 5 estrelas`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`w-5 h-5 ${n <= (a.rating ?? 0) ? 'fill-amber-400 text-amber-500' : 'text-slate-300'}`} />
          ))}
          <span className="ml-2 text-xs font-black">{a.rating}/5</span>
        </div>
      );
    }
    case 'RATING_10':
    case 'NPS_10': {
      if (a.rating === undefined) return <NoAnswer />;
      const start = q.type === 'NPS_10' ? 0 : 1;
      const nums = Array.from({ length: 11 - start }, (_, i) => i + start);
      return (
        <div className="flex flex-wrap items-center gap-1" aria-label={`${a.rating} de 10`}>
          {nums.map((n) => <Chip key={n} on={n === a.rating}>{n}</Chip>)}
          <span className="ml-2 text-xs font-black">{a.rating}/10</span>
        </div>
      );
    }
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
    case 'MULTI_CHOICE': {
      const picked = q.type === 'MULTI_CHOICE' ? a.choices ?? [] : (a.choice ?? a.textAnswer) ? [a.choice ?? a.textAnswer!] : [];
      if (picked.length === 0) return <NoAnswer />;
      const opts = q.options && q.options.length > 0 ? q.options : picked;
      return (
        <div className="flex flex-wrap gap-1.5">
          {opts.map((o) => (
            <Chip key={o} on={picked.includes(o)} hint={q.optionScores && o in q.optionScores ? `${Math.round(q.optionScores[o] * 100)}%` : undefined}>
              {picked.includes(o) ? '✓ ' : ''}{o}
            </Chip>
          ))}
        </div>
      );
    }
    case 'YES_NO_NA':
      if (!a.yesNo) return <NoAnswer />;
      return (
        <div className="flex gap-1.5">
          <Chip on={a.yesNo === 'YES'}>Sim</Chip>
          <Chip on={a.yesNo === 'NO'}>Não</Chip>
          <Chip on={a.yesNo === 'NA'}>Não aplicável</Chip>
        </div>
      );
    default:
      return (
        <div className="space-y-2">
          {a.audioUrl && (
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-slate-600 shrink-0" />
              <SecureAudio stored={a.audioUrl} className="w-full h-9" />
            </div>
          )}
          {a.textAnswer ? (
            <p className="whitespace-pre-wrap text-xs text-slate-900 bg-white border border-black/20 rounded-lg p-2.5">{a.textAnswer}</p>
          ) : !a.audioUrl ? <NoAnswer /> : null}
        </div>
      );
  }
};

// ---------------------------------------------------------------------------
// Controlo de nota 0..5 do auditor para conteúdos livres
// ---------------------------------------------------------------------------
export const QualitativeInput: React.FC<{
  label: string;
  value?: QualitativeScore;
  onChange: (v: QualitativeScore | undefined) => void;
  compact?: boolean;
  readOnly?: boolean;
}> = ({ label, value, onChange, compact, readOnly }) => (
  <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-[11px]' : 'text-xs'}`}>
    <span className="font-bold text-slate-700">{label}</span>
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[0, 1, 2, 3, 4, 5].map((n) => {
        const on = value !== undefined && Math.round(value.score) === n && Number.isInteger(value.score);
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={readOnly}
            onClick={() => onChange({ ...value, score: n })}
            className={`w-9 h-9 rounded-lg border-2 font-black tabular-nums transition ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-900'} ${readOnly ? 'opacity-70 cursor-default' : 'cursor-pointer'}`}
          >
            {n}
          </button>
        );
      })}
    </div>
    <span className="font-black tabular-nums">{value ? `${value.score.toFixed(1)} / 5` : 'por classificar'}</span>
    {value && !readOnly && (
      <button type="button" onClick={() => onChange(undefined)} className="text-[10px] underline text-slate-500">limpar</button>
    )}
  </div>
);

/** Que conteúdo livre o cliente deixou (áudio e/ou texto) — é isso que o auditor tem de classificar. */
/** Marcador que o formulário acrescenta ao comentário quando o cliente gravou áudio (não é texto escrito). */
export const AUDIO_MARK = '*(Áudio de testemunho gravado pelo cliente)*';

export function qualitativeContent(evaluation: Evaluation): { hasAudio: boolean; hasWritten: boolean } {
  const answers = Object.values((evaluation.detailedAnswers ?? {}) as Record<string, any>);
  const hasAudio = Boolean(evaluation.audioRecordingUrl) || answers.some((a) => a?.audioUrl);
  const writtenComment = (evaluation.comment ?? '').split(AUDIO_MARK).join('').trim();
  const hasWritten = writtenComment.length > 0 || answers.some((a) => typeof a?.textAnswer === 'string' && a.textAnswer.trim());
  return { hasAudio, hasWritten };
}

/** Mensagem de erro se falta classificar o áudio ou os argumentos (0 a 5); null se está completo. */
/** Painel do analisador: áudio (0–5) e argumentos escritos (0–5), ou decisão tudo ou nada quando não há comentário. */
export const AuditorQualitativePanel: React.FC<{
  evaluation: Evaluation;
  review: AuditorReview;
  onReviewChange: (r: AuditorReview) => void;
  locked?: boolean;
}> = ({ evaluation, review, onReviewChange, locked }) => {
  const { hasAudio, hasWritten } = qualitativeContent(evaluation);

  const setQual = (key: 'audio' | 'writtenArguments', v: QualitativeScore | undefined) => {
    const next = { ...review } as Record<string, unknown>;
    if (v) next[key] = { ...(review[key] ?? {}), ...v };
    else delete next[key];
    onReviewChange(next as AuditorReview);
  };
  const setDecision = (full: boolean) =>
    onReviewChange({ ...review, writtenArguments: { ...(review.writtenArguments ?? {}), score: full ? 5 : 0 } as QualitativeScore });

  const decided = review.writtenArguments?.score;
  return (
    <div className="p-3 bg-white border-2 border-black rounded-xl space-y-3">
      <h4 className="text-xs font-black uppercase text-slate-950">Auditoria qualitativa</h4>

      {hasAudio ? (
        <div className="space-y-1.5">
          <QualitativeInput label="Áudio do cliente (0 a 5 → 0 a 10 pts)" value={review.audio} onChange={(v) => setQual('audio', v)} readOnly={locked} />
          <textarea
            rows={2} maxLength={2000} value={review.audio?.transcript ?? ''} disabled={locked}
            onChange={(e) => onReviewChange({ ...review, audio: { score: review.audio?.score ?? 0, ...review.audio, transcript: e.target.value } })}
            placeholder="Transcrição ou resumo do que o cliente disse no áudio…"
            className="w-full text-[11px] border border-black rounded-lg p-2 disabled:bg-slate-100"
            aria-label="Transcrição do áudio"
          />
        </div>
      ) : (
        <p className="text-[11px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 rounded-lg p-2">
          Sem áudio gravado: 10 pontos atribuídos automaticamente.
        </p>
      )}

      {hasWritten ? (
        <div className="space-y-1.5">
          <QualitativeInput label="Argumentos escritos (0 a 5 → 0 a 10 pts)" value={review.writtenArguments} onChange={(v) => setQual('writtenArguments', v)} readOnly={locked} />
          <textarea
            rows={2} maxLength={2000} value={review.writtenArguments?.notes ?? ''} disabled={locked}
            onChange={(e) => onReviewChange({ ...review, writtenArguments: { score: review.writtenArguments?.score ?? 0, ...review.writtenArguments, notes: e.target.value } })}
            placeholder="Análise crítica dos argumentos: fundamentados, concretos, coerentes com o serviço?"
            className="w-full text-[11px] border border-black rounded-lg p-2 disabled:bg-slate-100"
            aria-label="Análise dos argumentos escritos"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-slate-900">
            O cliente não escreveu comentário. Pelas respostas dadas, o analisador decide se atribui os 10 pontos dos argumentos ou nenhum (ex.: cliente demasiado irritado para dar parecer).
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={locked} onClick={() => setDecision(true)}
              className={`px-3 py-1.5 rounded-lg border-2 text-[11px] font-black disabled:opacity-50 ${decided === 5 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-800 border-slate-300'}`}>
              Atribuir 10 pontos
            </button>
            <button type="button" disabled={locked} onClick={() => setDecision(false)}
              className={`px-3 py-1.5 rounded-lg border-2 text-[11px] font-black disabled:opacity-50 ${decided === 0 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-800 border-slate-300'}`}>
              Não atribuir (0 pontos)
            </button>
          </div>
          <textarea
            rows={2} maxLength={2000} value={review.writtenArguments?.notes ?? ''} disabled={locked}
            onChange={(e) => onReviewChange({ ...review, writtenArguments: { score: review.writtenArguments?.score ?? 0, ...review.writtenArguments, notes: e.target.value } })}
            placeholder="Justificação da decisão (opcional)"
            className="w-full text-[11px] border border-black rounded-lg p-2 disabled:bg-slate-100"
            aria-label="Justificação da decisão sobre os argumentos"
          />
        </div>
      )}

      <p className="text-[10px] text-slate-500">Cada nota vale o dobro em pontos. Ficam gravadas, de forma imutável, junto da homologação.</p>
    </div>
  );
};

export function missingQualitativeMessage(evaluation: Evaluation, review: AuditorReview): string | null {
  const { hasAudio, hasWritten } = qualitativeContent(evaluation);
  const missing: string[] = [];
  if (hasAudio && review.audio?.score === undefined) missing.push('o áudio do cliente (0 a 5)');
  if (hasWritten && review.writtenArguments?.score === undefined) missing.push('os argumentos escritos (0 a 5)');
  const decision = review.writtenArguments?.score;
  if (!hasWritten && decision !== 0 && decision !== 5) missing.push('se o analisador atribui os 10 pontos dos argumentos ou nenhum');
  return missing.length > 0 ? `Falta classificar ${missing.join(' e ')} antes de homologar.` : null;
}

// ---------------------------------------------------------------------------
// Ecrã principal
// ---------------------------------------------------------------------------
interface Props {
  evaluation: Evaluation;
  criteria: EvaluationCriterion[];
  catalog: FormQuestion[];
  passingThreshold: number;
  review: AuditorReview;
  onReviewChange: (r: AuditorReview) => void;
  error?: string | null;
}

export const EvaluationReviewWorkspace: React.FC<Props> = ({
  evaluation, criteria, catalog, passingThreshold, review, onReviewChange, error,
}) => {
  const answers = (evaluation.detailedAnswers ?? {}) as Answers;
  const questions = useMemo(() => questionsForEvaluation(evaluation, catalog), [evaluation, catalog]);
  const activeCriteria = useMemo(() => criteria.filter((c) => c.active), [criteria]);

  const conformity = useMemo(() => automaticConformity(evaluation, criteria, catalog), [evaluation, criteria, catalog]);
  const applicableWeight = activeCriteria.reduce((s, c) => (conformity[c.id] !== undefined ? s + c.weightPercentage : s), 0);
  const byCategory = useMemo(() => categoryConformity(questions, answers, null), [questions, answers]);

  // Agrupa as questões por categoria, na ordem do formulário
  const groups = useMemo(() => {
    const map = new Map<string, QuestionView[]>();
    for (const q of questions) {
      const k = normalizeKey(q.category);
      map.set(k, [...(map.get(k) ?? []), q]);
    }
    return [...map.entries()];
  }, [questions]);

  const criterionByKey = useMemo(() => new Map(activeCriteria.map((c) => [criterionKey(c), c])), [activeCriteria]);

  const { hasAudio, hasWritten } = qualitativeContent(evaluation);
  const missingQual = missingQualitativeMessage(evaluation, review);

  const setPerQuestion = (id: string, v: QualitativeScore | undefined) => {
    const per = { ...(review.perQuestion ?? {}) };
    if (v) per[id] = v; else delete per[id];
    onReviewChange({ ...review, perQuestion: Object.keys(per).length > 0 ? per : undefined });
  };

  const calc = calculateFinalScore({
    criteria: activeCriteria,
    conformity,
    hasAudio,
    audioScore: review.audio?.score ?? null,
    hasWritten,
    argumentScore: review.writtenArguments?.score ?? null,
    passingThreshold,
  });
  const ready = calc.success && !missingQual;

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* ===================== ESQUERDA: formulário como o cliente respondeu ===================== */}
      <section className="lg:col-span-3 space-y-3" aria-label="Formulário preenchido pelo cliente">
        <div className="p-3 bg-slate-50 border border-black rounded-xl text-xs flex flex-wrap gap-x-4 gap-y-1">
          <span>Cliente: <strong>{evaluation.clientName}</strong></span>
          <span>Serviço: <strong>{evaluation.serviceName}</strong></span>
          <span>Equipa: <strong>{evaluation.teamName || evaluation.providerName || 'Equipa geral'}</strong></span>
          <span>Data do serviço: {evaluation.serviceDate || evaluation.evaluationDate}</span>
          <span>Satisfação global: <strong>★ {evaluation.satisfactionRating}/5</strong>{evaluation.npsScore !== undefined && <> · NPS <strong>{evaluation.npsScore}</strong></>}</span>
        </div>

        {evaluation.audioRecordingUrl && (
          <div className="p-3 bg-white border border-black rounded-xl space-y-1.5">
            <span className="text-[11px] font-black uppercase text-slate-700 flex items-center gap-1.5"><Mic className="w-3.5 h-3.5" /> Testemunho em áudio do cliente</span>
            <SecureAudio stored={evaluation.audioRecordingUrl} className="w-full h-10" />
          </div>
        )}

        {groups.length === 0 && (
          <p className="p-3 bg-amber-50 border border-amber-400 rounded-xl text-xs font-bold text-amber-900">
            Esta avaliação não guardou o detalhe das questões. Só estão disponíveis os dados gerais acima.
          </p>
        )}

        {groups.map(([key, qs]) => {
          const crit = criterionByKey.get(key);
          const conf = byCategory[key];
          return (
            <div key={key} className="bg-white border border-black rounded-xl overflow-hidden">
              <header className="px-3 py-2 bg-slate-100 border-b border-black flex flex-wrap items-center justify-between gap-2">
                <h5 className="text-xs font-black text-slate-950 uppercase">{crit?.categoryName ?? qs[0].category}</h5>
                <span className="text-[11px] font-bold text-slate-700">
                  {crit ? `Peso ${crit.weightPercentage}%` : 'Sem critério de RH associado'}
                  {conf?.ratio !== null && conf?.ratio !== undefined && ` · conformidade das respostas ${(conf.ratio * 100).toFixed(0)}% (${conf.scored}/${conf.total})`}
                </span>
              </header>
              <div className="divide-y divide-black/10">
                {qs.map((q, i) => {
                  const a = answers[q.id];
                  const c = questionConformity(q, a);
                  const qualitative = QUALITATIVE_TYPES.includes(q.type);
                  return (
                    <article key={q.id} className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h6 className="text-xs font-bold text-slate-950">{i + 1}. {q.text}{q.required ? ' *' : ''}</h6>
                        {c !== null && <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 border border-black/20 text-[10px] font-black">{Math.round(c * 100)}%</span>}
                      </div>
                      {q.description && <p className="text-[11px] text-slate-600">{q.description}</p>}
                      <AnswerBody q={q} a={a} />
                      {qualitative && (a?.textAnswer || a?.audioUrl) && (
                        <div className="pt-1 border-t border-dashed border-black/20">
                          <QualitativeInput compact label="Nota do auditor a esta resposta" value={review.perQuestion?.[q.id]} onChange={(v) => setPerQuestion(q.id, v)} />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}

        {evaluation.comment?.trim() && (
          <div className="p-3 bg-white border border-black rounded-xl">
            <span className="text-[11px] font-black uppercase text-slate-700">Comentário submetido</span>
            <p className="mt-1 whitespace-pre-wrap text-xs text-slate-900">{evaluation.comment}</p>
          </div>
        )}
      </section>

      {/* ===================== DIREITA: painel do auditor ===================== */}
      <aside className="lg:col-span-2 space-y-3 lg:sticky lg:top-2 self-start" aria-label="Avaliação técnica do auditor">
        <div className="p-3 bg-white border-2 border-black rounded-xl space-y-3">
          <div>
            <h4 className="text-xs font-black uppercase text-slate-950">Parte automática · 80 pontos</h4>
            <p className="text-[10px] text-slate-600">Calculada a partir das respostas do cliente. Não é editável.</p>
          </div>
          {activeCriteria.map((c) => {
            const r = conformity[c.id];
            const pts = r !== undefined && applicableWeight > 0 ? (r * c.weightPercentage / applicableWeight) * 80 : null;
            return (
              <div key={c.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-950">{c.categoryName} <span className="font-bold text-slate-500">· peso {c.weightPercentage}%</span></span>
                  <span className="text-[11px] font-black tabular-nums">{r === undefined ? 'sem respostas pontuáveis' : `${(r * 100).toFixed(0)}%`}</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden" aria-hidden="true">
                  <div className="h-2 bg-slate-900" style={{ width: `${(r ?? 0) * 100}%` }} />
                </div>
                <div className="text-right text-[10px] font-mono text-slate-700">{pts === null ? '—' : `+${pts.toFixed(2)} pts`}</div>
              </div>
            );
          })}
        </div>

        <AuditorQualitativePanel evaluation={evaluation} review={review} onReviewChange={onReviewChange} />

        <div className="p-3 bg-white border-2 border-black rounded-xl space-y-1.5" aria-live="polite">
          <span className="text-[10px] font-black uppercase text-slate-600">Pontuação final</span>
          <div className="text-2xl font-black text-slate-950">{ready ? `${calc.finalScore.toFixed(2)} / 100` : '—'}</div>
          {ready ? (
            <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black border border-black ${calc.finalClassification === 'POSITIVE' ? 'bg-emerald-100 text-emerald-950' : 'bg-red-100 text-red-950'}`}>
              {calc.finalClassification === 'POSITIVE' ? '✓ Classificação positiva' : '✕ Classificação negativa'} (limiar {passingThreshold}%)
            </span>
          ) : (
            <span className="inline-block px-2 py-1 rounded bg-amber-100 text-amber-950 font-bold text-xs border border-black">
              {missingQual ?? calc.errors[0] ?? 'Sem cálculo'}
            </span>
          )}
          {calc.success && (
            <p className="text-[10px] text-slate-600 font-mono">
              Automático {calc.automaticPoints.toFixed(2)} / 80 · Áudio {calc.audioPoints.toFixed(1)} / 10 · Argumentos {calc.argumentPoints.toFixed(1)} / 10
            </p>
          )}
          {error && <p className="text-xs text-red-700 font-bold bg-red-50 p-2 rounded-lg border border-red-300">{error}</p>}
        </div>
      </aside>
    </div>
  );
};

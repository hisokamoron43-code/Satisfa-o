import React, { useMemo, useState } from 'react';
import type { ChatMessage, ConversationSummary, MessagePoll } from '../../services/supabaseService';

export const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const MORE_EMOJIS = ['👏', '🔥', '🎉', '😍', '🤔', '😅', '😡', '💯', '✅', '❌', '👀', '🙌', '💪', '😉', '🤝', '😭'];

// ===================== Moldura dos modais =====================
export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; narrow?: boolean }> = ({ title, onClose, children, footer, narrow }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={onClose}>
    <div className={`bg-white rounded-2xl shadow-xl w-full ${narrow ? 'max-w-sm' : 'max-w-lg'} max-h-[90vh] flex flex-col`} onClick={e => e.stopPropagation()}>
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-base font-black text-slate-900">{title}</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-lg leading-none" aria-label="Fechar">×</button>
      </div>
      <div className="p-5 space-y-4 overflow-y-auto">{children}</div>
      {footer && <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">{footer}</div>}
    </div>
  </div>
);

// ===================== Menu de ações da mensagem =====================
interface MenuProps {
  message: ChatMessage;
  mine: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export const MessageMenu: React.FC<MenuProps> = ({ message, mine, onClose, onReact, onReply, onForward, onCopy, onPin, onEdit, onDelete }) => {
  const [more, setMore] = useState(false);
  const mineReaction = message.reactions?.find(r => r.mine)?.emoji;
  const deleted = !!message.deleted;
  const isPoll = !!message.poll;

  const Item: React.FC<{ label: string; icon: string; danger?: boolean; onClick: () => void }> = ({ label, icon, danger, onClick }) => (
    <button onClick={() => { onClick(); }} className={`w-full flex items-center justify-between px-4 py-3 text-left text-[15px] hover:bg-slate-50 border-b border-slate-100 last:border-0 ${danger ? 'text-rose-700' : 'text-slate-900'}`}>
      <span>{label}</span><span aria-hidden="true" className="text-lg">{icon}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Opções da mensagem" onClick={onClose}>
      <div className="w-full max-w-xs space-y-3" onClick={e => e.stopPropagation()}>
        {!deleted && (
          <div className="bg-white rounded-full shadow-lg px-3 py-2 flex items-center justify-between gap-1 flex-wrap">
            {(more ? [...QUICK_EMOJIS, ...MORE_EMOJIS] : QUICK_EMOJIS).map(e => (
              <button key={e} onClick={() => onReact(e)} aria-label={`Reagir com ${e}`}
                className={`text-2xl w-10 h-10 rounded-full hover:bg-slate-100 ${mineReaction === e ? 'bg-emerald-100' : ''}`}>{e}</button>
            ))}
            {!more && <button onClick={() => setMore(true)} aria-label="Mais emojis" className="w-9 h-9 rounded-full bg-slate-100 text-xl text-slate-600">+</button>}
          </div>
        )}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {!deleted && <Item label="Responder" icon="↩" onClick={onReply} />}
          {!deleted && !isPoll && <Item label="Reencaminhar" icon="↪" onClick={onForward} />}
          {!deleted && !isPoll && <Item label="Copiar" icon="⧉" onClick={onCopy} />}
          {!deleted && <Item label={message.pinned ? 'Desafixar' : 'Fixar'} icon="📌" onClick={onPin} />}
          {!deleted && mine && !isPoll && <Item label="Corrigir" icon="✎" onClick={onEdit} />}
          <Item label="Eliminar" icon="🗑" danger onClick={onDelete} />
        </div>
      </div>
    </div>
  );
};

// ===================== Reações por baixo da mensagem =====================
export const ReactionChips: React.FC<{ message: ChatMessage; onToggle: (emoji: string) => void }> = ({ message, onToggle }) => {
  if (!message.reactions?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1 pb-3">
      {message.reactions.map(r => (
        <button key={r.emoji} onClick={() => onToggle(r.emoji)} title={r.names.join(', ')}
          className={`px-1.5 py-0.5 rounded-full text-xs border ${r.mine ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'} shadow-sm`}>
          <span>{r.emoji}</span>{r.count > 1 && <span className="ml-1 font-semibold text-slate-700">{r.count}</span>}
        </button>
      ))}
    </div>
  );
};

// ===================== Sondagem na conversa =====================
export const PollCard: React.FC<{ poll: MessagePoll; onVote: (optionIds: string[]) => void }> = ({ poll, onVote }) => {
  const mine = poll.options.filter(o => o.mine).map(o => o.id);
  const toggle = (id: string) => {
    if (poll.multiple) onVote(mine.includes(id) ? mine.filter(x => x !== id) : [...mine, id]);
    else onVote(mine.includes(id) ? [] : [id]);
  };
  return (
    <div className="min-w-[230px] pr-14 pb-3">
      <p className="text-[11px] font-bold text-slate-500 uppercase">📊 Sondagem</p>
      <p className="text-[14.5px] font-semibold text-slate-900 mb-0.5">{poll.question}</p>
      <p className="text-[11px] text-slate-500 mb-2">{poll.multiple ? 'Pode escolher várias respostas' : 'Escolha uma resposta'}</p>
      <ul className="space-y-1.5">
        {poll.options.map(o => {
          const pct = poll.totalVoters > 0 ? Math.round((o.votes / poll.totalVoters) * 100) : 0;
          return (
            <li key={o.id}>
              <button onClick={() => toggle(o.id)} className="w-full text-left" title={o.voters.length ? o.voters.join(', ') : 'Sem votos'}>
                <span className="flex items-center justify-between gap-2 text-[13.5px]">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`w-4 h-4 shrink-0 border-2 flex items-center justify-center text-[10px] text-white ${poll.multiple ? 'rounded' : 'rounded-full'} ${o.mine ? 'bg-brand-dark border-brand-dark' : 'border-slate-400'}`}>{o.mine ? '✓' : ''}</span>
                    <span className="truncate">{o.text}</span>
                  </span>
                  <span className="text-xs font-semibold text-slate-600 shrink-0">{o.votes}</span>
                </span>
                <span className="block h-1.5 mt-1 bg-slate-200 rounded-full overflow-hidden"><span className="block h-full bg-brand-dark" style={{ width: `${pct}%` }} /></span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-slate-500 mt-2">{poll.totalVoters} {poll.totalVoters === 1 ? 'pessoa votou' : 'pessoas votaram'}</p>
    </div>
  );
};

// ===================== Criar sondagem =====================
export const PollModal: React.FC<{ onClose: () => void; onCreate: (question: string, options: string[], multiple: boolean) => Promise<string | null> }> = ({ onClose, onCreate }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = options.map(o => o.trim()).filter(Boolean);
  const distinct = new Set(filled.map(o => o.toLowerCase())).size;
  const valid = question.trim().length >= 2 && distinct >= 2 && distinct === filled.length;

  const submit = async () => {
    setBusy(true); setError(null);
    const err = await onCreate(question.trim(), filled, multiple);
    setBusy(false);
    if (err) setError(err); else onClose();
  };

  return (
    <Sheet title="Criar sondagem" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-lg hover:bg-slate-100">Cancelar</button>
        <button onClick={submit} disabled={!valid || busy} className="px-4 py-2 text-sm font-semibold bg-brand-dark text-white rounded-lg disabled:opacity-40">{busy ? 'A enviar…' : 'Enviar sondagem'}</button>
      </>
    }>
      <label className="block text-xs font-bold text-slate-600">Pergunta
        <input value={question} onChange={e => setQuestion(e.target.value)} maxLength={200} placeholder="Faça uma pergunta"
          className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-normal focus:outline-none focus:ring-2 focus:ring-brand" />
      </label>
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-600">Opções (mínimo 2, máximo 12)</p>
        {options.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input value={o} onChange={e => setOptions(prev => prev.map((x, j) => (j === i ? e.target.value : x)))} maxLength={100} placeholder={`Opção ${i + 1}`}
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            {options.length > 2 && <button onClick={() => setOptions(prev => prev.filter((_, j) => j !== i))} className="px-2 text-rose-600 font-bold" aria-label={`Remover opção ${i + 1}`}>×</button>}
          </div>
        ))}
        {options.length < 12 && <button onClick={() => setOptions(prev => [...prev, ''])} className="text-xs font-semibold text-brand-dark">+ Adicionar opção</button>}
        {filled.length !== distinct && <p className="text-xs text-amber-700">Há opções repetidas. Cada opção deve ser diferente.</p>}
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-800">
        <input type="checkbox" checked={multiple} onChange={e => setMultiple(e.target.checked)} className="accent-brand-dark" /> Permitir várias respostas
      </label>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
    </Sheet>
  );
};

// ===================== Encaminhar =====================
export const ForwardModal: React.FC<{
  message: ChatMessage;
  conversations: ConversationSummary[];
  currentId: string | null;
  onClose: () => void;
  onForward: (targetIds: string[]) => Promise<string | null>;
}> = ({ message, conversations, currentId, onClose, onForward }) => {
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useMemo(() => conversations.filter(c => c.title.toLowerCase().includes(search.trim().toLowerCase())), [conversations, search]);

  const submit = async () => {
    setBusy(true); setError(null);
    const err = await onForward(picked);
    setBusy(false);
    if (err) setError(err); else onClose();
  };

  return (
    <Sheet title="Reencaminhar para…" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-lg hover:bg-slate-100">Cancelar</button>
        <button onClick={submit} disabled={picked.length === 0 || busy} className="px-4 py-2 text-sm font-semibold bg-brand-dark text-white rounded-lg disabled:opacity-40">
          {busy ? 'A enviar…' : `Reencaminhar${picked.length ? ` (${picked.length})` : ''}`}
        </button>
      </>
    }>
      <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 truncate">
        {message.attachmentPath ? `📎 ${message.attachmentName ?? 'documento'}` : message.body}
      </p>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar conversa"
        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
      <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
        {list.length === 0 && <li className="p-3 text-sm text-slate-500">Nenhuma conversa encontrada.</li>}
        {list.map(c => (
          <li key={c.id}>
            <label className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-slate-50">
              <input type="checkbox" className="accent-brand-dark" checked={picked.includes(c.id)}
                onChange={() => setPicked(prev => (prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]))} />
              <span className="font-semibold text-slate-900 truncate">{c.title}</span>
              <span className="text-xs text-slate-500 ml-auto shrink-0">{c.kind === 'GROUP' ? 'Grupo' : 'Direta'}{c.id === currentId ? ' · esta' : ''}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
    </Sheet>
  );
};

// ===================== Confirmar eliminar mensagem =====================
export const DeleteMessageModal: React.FC<{
  mine: boolean;
  alreadyDeleted: boolean;
  onClose: () => void;
  onDelete: (forAll: boolean) => Promise<string | null>;
}> = ({ mine, alreadyDeleted, onClose, onDelete }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (forAll: boolean) => {
    setBusy(true); setError(null);
    const err = await onDelete(forAll);
    setBusy(false);
    if (err) setError(err); else onClose();
  };
  return (
    <Sheet title="Eliminar mensagem?" onClose={onClose} narrow>
      <div className="space-y-2">
        {mine && !alreadyDeleted && (
          <button disabled={busy} onClick={() => run(true)} className="w-full px-4 py-3 text-left rounded-xl border border-rose-200 bg-rose-50 text-rose-800 font-semibold disabled:opacity-50">
            Eliminar para todos
            <span className="block text-xs font-normal text-rose-700">Todos os membros passam a ver «Mensagem eliminada».</span>
          </button>
        )}
        <button disabled={busy} onClick={() => run(false)} className="w-full px-4 py-3 text-left rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-900 disabled:opacity-50">
          Eliminar para mim
          <span className="block text-xs font-normal text-slate-500">Deixa de aparecer só a si. Os outros continuam a ver.</span>
        </button>
        {!mine && <p className="text-xs text-slate-500">Só o autor pode eliminar uma mensagem para todos.</p>}
        <button onClick={onClose} disabled={busy} className="w-full px-4 py-2.5 text-sm font-semibold text-slate-700 rounded-xl hover:bg-slate-100">Cancelar</button>
      </div>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
    </Sheet>
  );
};

// ===================== Confirmar eliminar conversa =====================
export const DeleteConversationModal: React.FC<{
  title: string;
  kind: 'DIRECT' | 'GROUP';
  onClose: () => void;
  onDelete: () => Promise<string | null>;
}> = ({ title, kind, onClose, onDelete }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setError(null);
    const err = await onDelete();
    setBusy(false);
    if (err) setError(err); else onClose();
  };
  return (
    <Sheet title="Eliminar conversa para todos?" onClose={onClose} narrow footer={
      <>
        <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-lg hover:bg-slate-100">Cancelar</button>
        <button onClick={run} disabled={busy} className="px-4 py-2 text-sm font-semibold bg-rose-600 text-white rounded-lg disabled:opacity-50">{busy ? 'A eliminar…' : 'Eliminar para todos'}</button>
      </>
    }>
      <p className="text-sm text-slate-800">
        {kind === 'GROUP' ? 'O grupo' : 'A conversa com'} <strong>{title}</strong> e todas as suas mensagens, documentos e sondagens vão ser apagados
        <strong> de forma permanente para todos</strong>. Esta ação não pode ser desfeita.
      </p>
      <p className="text-xs text-slate-500">Só quem iniciou a conversa tem esta opção.</p>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
    </Sheet>
  );
};

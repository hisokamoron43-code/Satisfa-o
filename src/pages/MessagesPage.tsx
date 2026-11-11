import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  ChatMessage, ConversationSummary, MessageRecipient,
  fetchConversations, fetchMessageRecipients, fetchMessages, sendMessageInDb,
  createConversationInDb, addGroupMembersInDb, markConversationReadInDb,
} from '../services/supabaseService';

const MAX_BODY = 4000;
const POLL_MS = 15000;

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const MessagesPage: React.FC = () => {
  const { currentUser } = useApp();
  const meId = currentUser?.id ?? '';
  const meName = currentUser?.name ?? '';

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => conversations.find(c => c.id === selectedId) ?? null, [conversations, selectedId]);
  const isCreatorOrAdmin = !!selected && selected.kind === 'GROUP' &&
    (selected.createdBy === meId || currentUser?.role === 'ADMIN');

  const loadList = useCallback(async () => {
    if (!meId) return;
    setConversations(await fetchConversations(meId, meName));
  }, [meId, meName]);

  const loadThread = useCallback(async (id: string) => {
    setMessages(await fetchMessages(id, meId, meName));
    await markConversationReadInDb(id);
  }, [meId, meName]);

  useEffect(() => {
    fetchMessageRecipients().then(setRecipients);
    loadList();
    const t = setInterval(loadList, POLL_MS);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    loadThread(selectedId);
    const t = setInterval(() => loadThread(selectedId), POLL_MS);
    return () => clearInterval(t);
  }, [selectedId, loadThread]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    const body = draft.trim();
    if (!body) return;
    if (body.length > MAX_BODY) { setError(`A mensagem não pode ter mais de ${MAX_BODY} caracteres.`); return; }
    setSending(true);
    setError(null);
    const res = await sendMessageInDb(selectedId, body);
    setSending(false);
    if (!res.success) { setError(res.error || 'Não foi possível enviar a mensagem.'); return; }
    setDraft('');
    await loadThread(selectedId);
    await loadList();
  };

  const onCreated = async (id: string) => {
    setShowNew(false);
    await loadList();
    setSelectedId(id);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-180px)] min-h-[480px]">
      {/* Lista de conversas */}
      <aside className="lg:w-80 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">Mensagens internas</span>
          <button onClick={() => setShowNew(true)} className="px-3 py-1.5 bg-brand-dark hover:bg-brand-deep text-white rounded-lg text-xs font-bold cursor-pointer">
            Nova conversa
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="p-4 text-xs text-slate-500">Ainda não tem conversas. Use "Nova conversa" para escrever a um colega ou criar um grupo.</p>
          )}
          {conversations.map(c => (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${selectedId === c.id ? 'bg-emerald-50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900 truncate">
                  {c.kind === 'GROUP' ? '👥 ' : ''}{c.title}
                </span>
                {c.unread > 0 && <span className="text-[10px] font-black bg-brand-dark text-white rounded-full px-2 py-0.5">{c.unread}</span>}
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">{c.lastBody ?? 'Sem mensagens'}</p>
            </button>
          ))}
        </div>
      </aside>

      {/* Conversa */}
      <section className="flex-1 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Selecione uma conversa.</div>
        ) : (
          <>
            <header className="p-4 border-b border-slate-200 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{selected.title}</p>
                <p className="text-xs text-slate-500 truncate">
                  {selected.kind === 'GROUP' ? 'Grupo' : 'Conversa direta'} · {selected.members.map(m => m.id === meId ? 'Você' : m.name).join(', ')}
                </p>
              </div>
              {isCreatorOrAdmin && (
                <button onClick={() => setShowAddMembers(true)} className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-bold cursor-pointer shrink-0">
                  Adicionar membros
                </button>
              )}
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {messages.length === 0 && <p className="text-xs text-slate-500 text-center">Sem mensagens nesta conversa.</p>}
              {messages.map(m => {
                const mine = m.senderId === meId;
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'bg-brand-dark text-white' : 'bg-white border border-slate-200 text-slate-900'}`}>
                      {!mine && <p className="text-[11px] font-bold text-brand-dark mb-0.5">{m.senderName}</p>}
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`text-[10px] mt-1 ${mine ? 'text-emerald-100' : 'text-slate-400'}`}>{timeLabel(m.createdAt)}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <form onSubmit={send} className="p-3 border-t border-slate-200 space-y-2">
              {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
              <div className="flex gap-2">
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} maxLength={MAX_BODY}
                  placeholder="Escreva uma mensagem…"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand" />
                <button type="submit" disabled={sending || !draft.trim()}
                  className="px-4 py-2 bg-brand-dark hover:bg-brand-deep disabled:opacity-50 text-white rounded-xl text-sm font-bold cursor-pointer">
                  Enviar
                </button>
              </div>
              <p className="text-[10px] text-slate-400 text-right">{draft.length}/{MAX_BODY}</p>
            </form>
          </>
        )}
      </section>

      {showNew && (
        <NewConversationModal recipients={recipients} onClose={() => setShowNew(false)} onCreated={onCreated} />
      )}
      {showAddMembers && selected && (
        <AddMembersModal conversation={selected} recipients={recipients}
          onClose={() => setShowAddMembers(false)}
          onDone={async () => { setShowAddMembers(false); await loadList(); }} />
      )}
    </div>
  );
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="modal-overlay fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-900">{title}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer text-lg leading-none">×</button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  </div>
);

const NewConversationModal: React.FC<{
  recipients: MessageRecipient[]; onClose: () => void; onCreated: (id: string) => void;
}> = ({ recipients, onClose, onCreated }) => {
  const [kind, setKind] = useState<'DIRECT' | 'GROUP'>('DIRECT');
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = recipients.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  const toggle = (id: string) => {
    if (kind === 'DIRECT') { setPicked([id]); return; }
    setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const create = async () => {
    setError(null);
    if (picked.length === 0) { setError('Selecione pelo menos um destinatário.'); return; }
    if (kind === 'GROUP' && title.trim().length < 2) { setError('Indique um nome para o grupo (mínimo 2 caracteres).'); return; }
    setSaving(true);
    const res = await createConversationInDb(kind, title.trim(), picked);
    setSaving(false);
    if (!res.success || !res.id) { setError(res.error || 'Não foi possível criar a conversa.'); return; }
    onCreated(res.id);
  };

  return (
    <Modal title="Nova conversa" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2">
          {(['DIRECT', 'GROUP'] as const).map(k => (
            <button key={k} type="button" onClick={() => { setKind(k); setPicked([]); }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer border ${kind === k ? 'bg-brand-dark text-white border-brand-dark' : 'border-slate-300 text-slate-700'}`}>
              {k === 'DIRECT' ? 'Conversa direta' : 'Novo grupo'}
            </button>
          ))}
        </div>
        {kind === 'GROUP' && (
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Nome do grupo"
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        )}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar pessoa…"
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
          {filtered.length === 0 && <p className="p-3 text-xs text-slate-500">Nenhuma pessoa encontrada.</p>}
          {filtered.map(r => (
            <label key={r.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
              <input type={kind === 'DIRECT' ? 'radio' : 'checkbox'} name="recipient" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} className="accent-brand-dark" />
              <span className="text-sm text-slate-900">{r.name}</span>
              <span className="text-[10px] text-slate-500 ml-auto">{r.department}</span>
            </label>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">{picked.length} selecionado(s)</p>
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        <button onClick={create} disabled={saving}
          className="w-full py-2.5 bg-brand-dark hover:bg-brand-deep disabled:opacity-60 text-white rounded-xl text-sm font-bold cursor-pointer">
          {saving ? 'A criar…' : kind === 'GROUP' ? 'Criar grupo' : 'Iniciar conversa'}
        </button>
      </div>
    </Modal>
  );
};

const AddMembersModal: React.FC<{
  conversation: ConversationSummary; recipients: MessageRecipient[]; onClose: () => void; onDone: () => void;
}> = ({ conversation, recipients, onClose, onDone }) => {
  const memberIds = new Set(conversation.members.map(m => m.id));
  const candidates = recipients.filter(r => !memberIds.has(r.id));
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (picked.length === 0) { setError('Selecione pelo menos uma pessoa.'); return; }
    const res = await addGroupMembersInDb(conversation.id, picked);
    if (!res.success) { setError(res.error || 'Não foi possível acrescentar membros.'); return; }
    onDone();
  };

  return (
    <Modal title={`Adicionar a ${conversation.title}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
          {candidates.length === 0 && <p className="p-3 text-xs text-slate-500">Todas as pessoas já são membros.</p>}
          {candidates.map(r => (
            <label key={r.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" checked={picked.includes(r.id)}
                onChange={() => setPicked(p => p.includes(r.id) ? p.filter(x => x !== r.id) : [...p, r.id])} className="accent-brand-dark" />
              <span className="text-sm text-slate-900">{r.name}</span>
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        <button onClick={save} disabled={candidates.length === 0}
          className="w-full py-2.5 bg-brand-dark disabled:opacity-50 text-white rounded-xl text-sm font-bold cursor-pointer">
          Acrescentar ao grupo
        </button>
      </div>
    </Modal>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  ChatMessage, ConversationSummary, ConversationTopic, MessageFilter, MessageRecipient,
  fetchConversations, fetchMessageRecipients, fetchMessages, fetchTopics, sendMessageInDb, createTopicInDb,
  createConversationInDb, addGroupMembersInDb, markConversationReadInDb,
} from '../services/supabaseService';

const MAX_BODY = 4000;
const POLL_MS = 15000;

const timeLabel = (iso: string) =>
  new Date(iso.replace(' ', 'T')).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const EMPTY_FILTER: MessageFilter = { from: '', to: '', topicId: '', important: false, text: '' };

export const MessagesPage: React.FC = () => {
  const { currentUser } = useApp();
  const meId = currentUser?.id ?? '';
  const meName = currentUser?.name ?? '';

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [topics, setTopics] = useState<ConversationTopic[]>([]);
  const [filter, setFilter] = useState<MessageFilter>(EMPTY_FILTER);
  const [showFilters, setShowFilters] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [composeTopic, setComposeTopic] = useState('');
  const [composeImportant, setComposeImportant] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [topicError, setTopicError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => conversations.find(c => c.id === selectedId) ?? null, [conversations, selectedId]);
  const isCreatorOrAdmin = !!selected && selected.kind === 'GROUP' &&
    (selected.createdBy === meId || currentUser?.role === 'ADMIN');
  const filterActive = !!(filter.from || filter.to || filter.topicId || filter.important || filter.text);
  const topicTitle = (id?: string) => topics.find(t => t.id === id)?.title;

  const visibleConversations = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(c => c.title.toLowerCase().includes(q) || (c.lastBody ?? '').toLowerCase().includes(q));
  }, [conversations, listSearch]);

  const loadList = useCallback(async () => {
    if (!meId) return;
    setConversations(await fetchConversations(meId, meName));
  }, [meId, meName]);

  const loadThread = useCallback(async (id: string) => {
    setMessages(await fetchMessages(id, meId, meName, filter));
    await markConversationReadInDb(id);
  }, [meId, meName, filter]);

  const loadTopics = useCallback(async (id: string) => {
    setTopics(await fetchTopics(id));
  }, []);

  useEffect(() => {
    fetchMessageRecipients().then(setRecipients);
    loadList();
    const t = setInterval(loadList, POLL_MS);
    return () => clearInterval(t);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); setTopics([]); return; }
    loadTopics(selectedId);
    loadThread(selectedId);
    const t = setInterval(() => loadThread(selectedId), POLL_MS);
    return () => clearInterval(t);
  }, [selectedId, loadThread, loadTopics]);

  // Ao mudar de conversa, limpa os filtros e o tema escolhido para o envio
  useEffect(() => { setFilter(EMPTY_FILTER); setComposeTopic(''); setComposeImportant(false); setTopicError(null); }, [selectedId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    const body = draft.trim();
    if (!body) return;
    if (body.length > MAX_BODY) { setError(`A mensagem não pode ter mais de ${MAX_BODY} caracteres.`); return; }
    setSending(true);
    setError(null);
    const res = await sendMessageInDb(selectedId, body, { topicId: composeTopic || undefined, important: composeImportant });
    setSending(false);
    if (!res.success) { setError(res.error || 'Não foi possível enviar a mensagem.'); return; }
    setDraft('');
    setComposeImportant(false);
    await loadThread(selectedId);
    await loadList();
  };

  const createTopic = async () => {
    if (!selectedId) return;
    setTopicError(null);
    const res = await createTopicInDb(selectedId, newTopic);
    if (!res.success || !res.id) { setTopicError(res.error || 'Não foi possível criar o tema.'); return; }
    setNewTopic('');
    await loadTopics(selectedId);
    setComposeTopic(res.id);
  };

  const onCreated = async (id: string) => {
    setShowNew(false);
    await loadList();
    setSelectedId(id);
  };

  const topicChip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer whitespace-nowrap ${active ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-180px)] min-h-[480px]">
      {/* Lista de conversas */}
      <aside className="lg:w-80 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">Mensagens internas</span>
            <button onClick={() => setShowNew(true)} className="px-3 py-1.5 bg-brand-dark hover:bg-brand-deep text-white rounded-lg text-xs font-bold cursor-pointer">
              Nova conversa
            </button>
          </div>
          <input value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="Pesquisar conversas…"
            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="p-4 text-xs text-slate-500">Ainda não tem conversas. Use "Nova conversa" para escrever a um colega ou criar um grupo.</p>
          )}
          {conversations.length > 0 && visibleConversations.length === 0 && (
            <p className="p-4 text-xs text-slate-500">Nenhuma conversa corresponde à pesquisa.</p>
          )}
          {visibleConversations.map(c => (
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
            <header className="p-4 border-b border-slate-200 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{selected.title}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {selected.kind === 'GROUP' ? 'Grupo' : 'Conversa direta'} · {selected.members.map(m => m.id === meId ? 'Você' : m.name).join(', ')}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setShowFilters(v => !v)}
                    className={`px-3 py-1.5 border rounded-lg text-xs font-bold cursor-pointer ${filterActive || showFilters ? 'border-brand-dark text-brand-dark' : 'border-slate-300 hover:bg-slate-50'}`}>
                    Filtros{filterActive ? ' (ativos)' : ''}
                  </button>
                  {isCreatorOrAdmin && (
                    <button onClick={() => setShowAddMembers(true)} className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-bold cursor-pointer">
                      Adicionar membros
                    </button>
                  )}
                </div>
              </div>

              {/* Temas da conversa */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Temas:</span>
                <button onClick={() => setFilter(f => ({ ...f, topicId: '' }))} className={topicChip(!filter.topicId)}>Todos</button>
                <button onClick={() => setFilter(f => ({ ...f, topicId: 'NONE' }))} className={topicChip(filter.topicId === 'NONE')}>Sem tema</button>
                {topics.map(t => (
                  <button key={t.id} onClick={() => setFilter(f => ({ ...f, topicId: t.id }))} className={topicChip(filter.topicId === t.id)}>{t.title}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={newTopic} onChange={e => setNewTopic(e.target.value)} maxLength={80} placeholder="Novo tema (ex.: Auditoria Luanda)"
                  className="flex-1 min-w-[180px] px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand" />
                <button onClick={createTopic} disabled={newTopic.trim().length < 2}
                  className="px-3 py-1.5 bg-slate-900 disabled:opacity-40 text-white rounded-lg text-xs font-bold cursor-pointer">Criar tema</button>
                {topicError && <span className="text-[11px] text-rose-600 font-medium">{topicError}</span>}
              </div>

              {/* Filtros: datas, tema, importantes e texto */}
              {showFilters && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <label className="space-y-1">
                    <span className="font-bold text-slate-600">De</span>
                    <input type="date" value={filter.from ?? ''} max={filter.to || undefined}
                      onChange={e => setFilter(f => ({ ...f, from: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white" />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold text-slate-600">Até</span>
                    <input type="date" value={filter.to ?? ''} min={filter.from || undefined}
                      onChange={e => setFilter(f => ({ ...f, to: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white" />
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold text-slate-600">Tema</span>
                    <select value={filter.topicId ?? ''} onChange={e => setFilter(f => ({ ...f, topicId: e.target.value }))}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white">
                      <option value="">Todos</option>
                      <option value="NONE">Sem tema</option>
                      {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-bold text-slate-600">Texto</span>
                    <input value={filter.text ?? ''} onChange={e => setFilter(f => ({ ...f, text: e.target.value }))} placeholder="Palavra na mensagem"
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white" />
                  </label>
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-2 font-bold text-slate-700 py-1.5">
                      <input type="checkbox" checked={!!filter.important} onChange={e => setFilter(f => ({ ...f, important: e.target.checked }))} className="accent-brand-dark" />
                      Só importantes
                    </label>
                    <button onClick={() => setFilter(EMPTY_FILTER)} disabled={!filterActive}
                      className="ml-auto px-2.5 py-1.5 border border-slate-300 rounded-lg font-bold disabled:opacity-40 bg-white">Limpar</button>
                  </div>
                </div>
              )}
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {messages.length === 0 && (
                <p className="text-xs text-slate-500 text-center">
                  {filterActive ? 'Nenhuma mensagem corresponde aos filtros.' : 'Sem mensagens nesta conversa.'}
                </p>
              )}
              {messages.map(m => {
                const mine = m.senderId === meId;
                const topic = m.topicTitle ?? topicTitle(m.topicId);
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'bg-brand-dark text-white' : 'bg-white border border-slate-200 text-slate-900'}`}>
                      {!mine && <p className="text-[11px] font-bold text-brand-dark mb-0.5">{m.senderName}</p>}
                      {(topic || m.important) && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          {m.important && <span className={`text-[10px] font-black ${mine ? 'text-amber-200' : 'text-amber-600'}`}>★ Importante</span>}
                          {topic && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${mine ? 'bg-white/20' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>{topic}</span>}
                        </div>
                      )}
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
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <label className="font-bold text-slate-600">Tema desta mensagem:</label>
                <select value={composeTopic} onChange={e => setComposeTopic(e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg bg-white">
                  <option value="">Sem tema</option>
                  {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
                <label className="flex items-center gap-1.5 font-bold text-slate-700 ml-2">
                  <input type="checkbox" checked={composeImportant} onChange={e => setComposeImportant(e.target.checked)} className="accent-brand-dark" />
                  ★ Marcar como importante
                </label>
              </div>
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  ChatMessage, ConversationSummary, MessageFilter, MessageRecipient,
  addGroupMembersInDb, createConversationInDb, fetchConversations, fetchMessageRecipients, fetchMessages,
  markConversationReadInDb, sendMessageInDb, setConversationTopicInDb,
} from '../services/supabaseService';

const MAX_BODY = 4000;
const POLL_MS = 15000;
const EMPTY_FILTER: MessageFilter = { from: '', to: '', topicId: '', important: false, text: '' };

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const listTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  return same
    ? d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const dayLabel = (iso: string) => {
  const d = new Date(iso.replace(' ', 'T'));
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yest.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' });
};

const timeOf = (iso: string) => new Date(iso.replace(' ', 'T')).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

export const MessagesPage: React.FC = () => {
  const { currentUser } = useApp();
  const meId = currentUser?.id ?? '';
  const meName = currentUser?.name ?? '';

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [filter, setFilter] = useState<MessageFilter>(EMPTY_FILTER);
  const [showFilters, setShowFilters] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [activeTopic, setActiveTopic] = useState('');           // '' todos · 'NONE' sem tema · nome do tema
  const [topicDraft, setTopicDraft] = useState('');
  const [topicError, setTopicError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [important, setImportant] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState<{ topic?: string } | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => conversations.find(c => c.id === selectedId) ?? null, [conversations, selectedId]);
  const topics = useMemo(
    () => [...new Set(conversations.map(c => c.topic).filter((t): t is string => !!t))].sort((a, b) => a.localeCompare(b)),
    [conversations],
  );
  const filterActive = !!(filter.from || filter.to || filter.important || filter.text);
  const canManage = !!selected && selected.kind === 'GROUP' && (selected.createdBy === meId || currentUser?.role === 'ADMIN');

  const visible = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return conversations.filter(c => {
      if (activeTopic === 'NONE' && c.topic) return false;
      if (activeTopic && activeTopic !== 'NONE' && c.topic !== activeTopic) return false;
      if (!q) return true;
      return c.title.toLowerCase().includes(q) || (c.lastBody ?? '').toLowerCase().includes(q) || (c.topic ?? '').toLowerCase().includes(q);
    });
  }, [conversations, listSearch, activeTopic]);

  const loadList = useCallback(async () => {
    if (!meId) return;
    setConversations(await fetchConversations(meId, meName));
  }, [meId, meName]);

  const loadThread = useCallback(async (id: string) => {
    setMessages(await fetchMessages(id, meId, meName, filter));
    await markConversationReadInDb(id);
  }, [meId, meName, filter]);

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

  useEffect(() => {
    setFilter(EMPTY_FILTER); setShowFilters(false); setShowTopics(false);
    setTopicDraft(''); setTopicError(null); setImportant(false); setError(null);
  }, [selectedId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    const body = draft.trim();
    if (!body) return;
    if (body.length > MAX_BODY) { setError(`A mensagem não pode ter mais de ${MAX_BODY} caracteres.`); return; }
    setSending(true); setError(null);
    const res = await sendMessageInDb(selectedId, body, { important });
    setSending(false);
    if (!res.success) { setError(res.error || 'Não foi possível enviar a mensagem.'); return; }
    setDraft(''); setImportant(false);
    await loadThread(selectedId);
    await loadList();
  };

  const setTopic = async (topic: string) => {
    if (!selectedId) return;
    setTopicError(null);
    const res = await setConversationTopicInDb(selectedId, topic);
    if (!res.success) { setTopicError(res.error || 'Não foi possível definir o tema.'); return; }
    setTopicDraft('');
    await loadList();
  };

  const subtitle = selected
    ? `${selected.kind === 'GROUP' ? (selected.topic ? 'Tema' : 'Grupo') : 'Conversa direta'} · ${selected.members.map(m => (m.id === meId ? 'Você' : m.name)).join(', ')}`
    : '';

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-180px)] min-h-[520px]">
      {/* ===================== LISTA (estilo exemplo 1) ===================== */}
      <aside className={`${selected ? 'hidden lg:flex' : 'flex'} lg:w-[360px] flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden`}>
        <div className="px-4 pt-4 pb-3 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-black text-slate-900">Comunicação Interna</span>
            <button onClick={() => setShowNew({})} className="px-3 py-1.5 bg-brand-dark hover:bg-brand-deep text-white rounded-lg text-xs font-bold cursor-pointer">
              Nova conversa
            </button>
          </div>
          <input value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="🔍 Pesquisar conversas ou temas…"
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-brand" />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[['', 'Todos'], ['NONE', 'Sem tema'], ...topics.map(t => [t, t])].map(([value, label]) => (
              <button key={value} onClick={() => setActiveTopic(value)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap cursor-pointer ${activeTopic === value ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white text-slate-700 border-slate-300'}`}>
                {label}
              </button>
            ))}
            <button onClick={() => setShowNew({ topic: '' })}
              className="px-3 py-1 rounded-full text-[11px] font-bold border border-dashed border-brand-dark text-brand-dark bg-emerald-50 whitespace-nowrap cursor-pointer">
              + Criar tema
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {conversations.length === 0 && (
            <p className="p-4 text-xs text-slate-500">Ainda não tem conversas. Use "Nova conversa" para escrever a um colega ou criar um grupo.</p>
          )}
          {conversations.length > 0 && visible.length === 0 && (
            <p className="p-4 text-xs text-slate-500">Nenhuma conversa corresponde aos filtros.</p>
          )}
          {visible.map(c => {
            const isTopic = !!c.topic;
            const tag = c.kind === 'DIRECT' ? 'Direta' : isTopic ? 'Tema' : 'Grupo';
            const snippet = c.lastBody ? `${c.lastSenderId === meId ? 'Você: ' : ''}${c.lastBody}` : 'Sem mensagens';
            return (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={`w-full flex gap-3 text-left px-4 py-3 cursor-pointer hover:bg-slate-50 ${selectedId === c.id ? 'bg-emerald-50' : ''}`}>
                <span className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-xs font-black ${isTopic ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-900'}`}>
                  {initials(c.title)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 truncate">{c.title}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">{listTime(c.lastAt ?? c.updatedAt)}</span>
                  </span>
                  <span className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isTopic ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-600'}`}>{tag}</span>
                    {isTopic && c.kind === 'GROUP' && <span className="text-[10px] text-slate-500 truncate">{c.topic}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs text-slate-500 truncate">{snippet}</span>
                    {c.unread > 0 && <span className="text-[10px] font-black bg-brand-dark text-white rounded-full px-1.5 py-0.5 shrink-0">{c.unread}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ===================== CONVERSA (estilo exemplo 2) ===================== */}
      <section className={`${selected ? 'flex' : 'hidden lg:flex'} flex-1 flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden`}>
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500">Selecione uma conversa para começar.</div>
        ) : (
          <>
            <header className="px-4 py-3 border-b border-slate-200 bg-white space-y-2">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedId(null)} className="lg:hidden w-8 h-8 rounded-lg border border-slate-200 text-slate-700" aria-label="Voltar">←</button>
                <span className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black ${selected.topic ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-900'}`}>{initials(selected.title)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-900 truncate">{selected.title}</p>
                  <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setShowTopics(v => !v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${showTopics ? 'bg-emerald-50 border-brand-dark text-brand-dark' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                    Tema & Filtros
                  </button>
                  {canManage && (
                    <button onClick={() => setShowMembers(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer">
                      Membros
                    </button>
                  )}
                </div>
              </div>

              {showTopics && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                  <div>
                    <p className="font-bold text-slate-700 mb-1.5">Tema desta conversa</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <button onClick={() => setTopic('')} className={`px-2.5 py-1 rounded-full font-bold border cursor-pointer ${!selected.topic ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white border-slate-300 text-slate-700'}`}>Sem tema</button>
                      {topics.map(t => (
                        <button key={t} onClick={() => setTopic(t)} className={`px-2.5 py-1 rounded-full font-bold border cursor-pointer ${selected.topic === t ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white border-slate-300 text-slate-700'}`}>{t}</button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input value={topicDraft} onChange={e => setTopicDraft(e.target.value)} maxLength={60} placeholder="Novo tema (ex.: Auditoria Luanda)"
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand" />
                      <button onClick={() => setTopic(topicDraft)} disabled={topicDraft.trim().length < 2}
                        className="px-3 py-1.5 bg-slate-900 disabled:opacity-40 text-white rounded-lg font-bold cursor-pointer">Criar tema</button>
                    </div>
                    {topicError && <p className="text-rose-600 font-medium mt-1">{topicError}</p>}
                  </div>

                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 pt-2 border-t border-slate-200">
                    <label className="space-y-1"><span className="font-bold text-slate-600">De</span>
                      <input type="date" value={filter.from ?? ''} max={filter.to || undefined} onChange={e => setFilter(f => ({ ...f, from: e.target.value }))}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg" /></label>
                    <label className="space-y-1"><span className="font-bold text-slate-600">Até</span>
                      <input type="date" value={filter.to ?? ''} min={filter.from || undefined} onChange={e => setFilter(f => ({ ...f, to: e.target.value }))}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg" /></label>
                    <label className="space-y-1"><span className="font-bold text-slate-600">Texto</span>
                      <input value={filter.text ?? ''} onChange={e => setFilter(f => ({ ...f, text: e.target.value }))} placeholder="Palavra"
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg" /></label>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-1.5 font-bold text-slate-700 py-1">
                        <input type="checkbox" checked={!!filter.important} onChange={e => setFilter(f => ({ ...f, important: e.target.checked }))} className="accent-brand-dark" />★ Importantes
                      </label>
                      <button onClick={() => setFilter(EMPTY_FILTER)} disabled={!filterActive} className="ml-auto px-2 py-1 border border-slate-300 rounded-lg font-bold bg-white disabled:opacity-40">Limpar</button>
                    </div>
                  </div>
                </div>
              )}
            </header>

            {/* Mensagens: as minhas a verde da empresa; as dos outros a cinzento */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 bg-slate-100">
              {messages.length === 0 && (
                <p className="text-xs text-slate-500 text-center mt-8">
                  {filterActive ? 'Nenhuma mensagem corresponde aos filtros.' : 'Ainda não há mensagens. Escreva a primeira.'}
                </p>
              )}
              {messages.map((m, i) => {
                const mine = m.senderId === meId;
                const newDay = i === 0 || dayLabel(messages[i - 1].createdAt) !== dayLabel(m.createdAt);
                return (
                  <React.Fragment key={m.id}>
                    {newDay && (
                      <div className="flex justify-center py-1">
                        <span className="text-[10px] font-bold text-slate-600 bg-white/80 px-3 py-0.5 rounded-full shadow-sm">{dayLabel(m.createdAt)}</span>
                      </div>
                    )}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] px-3.5 py-2 shadow-sm ${mine
                        ? 'bg-brand-dark text-white rounded-2xl rounded-br-md'
                        : 'bg-slate-300/70 text-slate-900 rounded-2xl rounded-bl-md'}`}>
                        {!mine && <p className="text-[11px] font-black text-slate-700 mb-0.5">{m.senderName}</p>}
                        {m.important && <p className={`text-[10px] font-black mb-0.5 ${mine ? 'text-amber-200' : 'text-amber-700'}`}>★ Importante</p>}
                        <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`text-[10px] mt-1 text-right ${mine ? 'text-emerald-100' : 'text-slate-600'}`}>{timeOf(m.createdAt)}</p>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={endRef} />
            </div>

            <form onSubmit={send} className="p-3 bg-white border-t border-slate-200 space-y-2">
              {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
              <div className="flex gap-2 items-end">
                <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} maxLength={MAX_BODY}
                  placeholder="Escreva uma mensagem…"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand" />
                <button type="submit" disabled={sending || !draft.trim()}
                  className="px-4 py-2.5 bg-brand-dark hover:bg-brand-deep disabled:opacity-50 text-white rounded-2xl text-sm font-bold cursor-pointer">Enviar</button>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <label className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={important} onChange={e => setImportant(e.target.checked)} className="accent-brand-dark" />★ Marcar como importante
                </label>
                <span className="text-slate-400">{draft.length}/{MAX_BODY}</span>
              </div>
            </form>
          </>
        )}
      </section>

      {showNew && (
        <NewConversationModal
          recipients={recipients}
          meId={meId}
          initialTopic={showNew.topic}
          onClose={() => setShowNew(null)}
          onCreated={async (id) => { setShowNew(null); await loadList(); setSelectedId(id); }}
        />
      )}
      {showMembers && selected && (
        <AddMembersModal conversation={selected} recipients={recipients}
          onClose={() => setShowMembers(false)}
          onDone={async () => { setShowMembers(false); await loadList(); }} />
      )}
    </div>
  );
};

// ===================== MODAIS =====================

const Overlay: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }> = ({ title, onClose, children, footer }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-base font-black text-slate-900">{title}</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-lg leading-none" aria-label="Fechar">×</button>
      </div>
      <div className="p-5 space-y-4 overflow-y-auto">{children}</div>
      <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">{footer}</div>
    </div>
  </div>
);

const MemberPicker: React.FC<{ recipients: MessageRecipient[]; selected: string[]; onChange: (ids: string[]) => void; exclude?: string[] }> = ({ recipients, selected, onChange, exclude = [] }) => {
  const list = recipients.filter(r => !exclude.includes(r.id));
  return (
    <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
      {list.length === 0 && <p className="p-3 text-xs text-slate-500">Não há mais colegas para acrescentar.</p>}
      {list.map(r => (
        <label key={r.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
          <input type="checkbox" className="accent-brand-dark" checked={selected.includes(r.id)}
            onChange={e => onChange(e.target.checked ? [...selected, r.id] : selected.filter(x => x !== r.id))} />
          <span className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[11px] font-black">{initials(r.name)}</span>
          <span className="min-w-0">
            <span className="block text-xs font-bold text-slate-900 truncate">{r.name}</span>
            <span className="block text-[10px] text-slate-500 truncate">{r.department}</span>
          </span>
        </label>
      ))}
    </div>
  );
};

const NewConversationModal: React.FC<{ recipients: MessageRecipient[]; meId: string; initialTopic?: string; onClose: () => void; onCreated: (id: string) => void }> = ({ recipients, meId, initialTopic, onClose, onCreated }) => {
  const topicMode = initialTopic !== undefined;
  const [kind, setKind] = useState<'DIRECT' | 'GROUP'>(topicMode ? 'GROUP' : 'DIRECT');
  const [title, setTitle] = useState(initialTopic ?? '');
  const [topic, setTopicName] = useState(initialTopic ?? '');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (kind === 'DIRECT' && memberIds.length !== 1) { setError('Escolha um colega.'); return; }
    if (kind === 'GROUP' && title.trim().length < 2) { setError(topicMode ? 'Escreva o nome do tema.' : 'Escreva o nome do grupo.'); return; }
    setBusy(true);
    const res = await createConversationInDb(kind, kind === 'GROUP' ? title.trim() : '', memberIds, kind === 'GROUP' ? topic : undefined);
    setBusy(false);
    if (!res.success || !res.id) { setError(res.error || 'Não foi possível criar a conversa.'); return; }
    onCreated(res.id);
  };

  return (
    <Overlay title={topicMode ? 'Criar tema' : 'Nova conversa'} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold">Cancelar</button>
        <button onClick={submit} disabled={busy} className="px-4 py-2 bg-brand-dark text-white rounded-lg text-xs font-bold disabled:opacity-50">{busy ? 'A criar…' : 'Criar'}</button>
      </>}>
      {!topicMode && (
        <div className="grid grid-cols-2 gap-2">
          {(['DIRECT', 'GROUP'] as const).map(k => (
            <button key={k} onClick={() => { setKind(k); setMemberIds([]); }}
              className={`px-3 py-2 rounded-xl text-xs font-bold border ${kind === k ? 'bg-brand-dark text-white border-brand-dark' : 'border-slate-300 text-slate-700'}`}>
              {k === 'DIRECT' ? 'Conversa direta' : 'Grupo ou tema'}
            </button>
          ))}
        </div>
      )}
      {kind === 'GROUP' && (
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">{topicMode ? 'Nome do tema (ex.: Auditoria Luanda)' : 'Nome do grupo'}</label>
          <input value={title} onChange={e => { setTitle(e.target.value); if (topicMode) setTopicName(e.target.value); }} maxLength={80}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          {!topicMode && (
            <>
              <label className="block text-xs font-bold text-slate-700">Tema (opcional)</label>
              <input value={topic} onChange={e => setTopicName(e.target.value)} maxLength={60} placeholder="Ex.: Homologação"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </>
          )}
        </div>
      )}
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-700">{kind === 'DIRECT' ? 'Colega' : 'Membros'}</p>
        {kind === 'DIRECT'
          ? <select value={memberIds[0] ?? ''} onChange={e => setMemberIds(e.target.value ? [e.target.value] : [])} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm">
              <option value="">Escolher…</option>
              {recipients.filter(r => r.id !== meId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          : <MemberPicker recipients={recipients} selected={memberIds} onChange={setMemberIds} exclude={[meId]} />}
      </div>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
    </Overlay>
  );
};

const AddMembersModal: React.FC<{ conversation: ConversationSummary; recipients: MessageRecipient[]; onClose: () => void; onDone: () => void }> = ({ conversation, recipients, onClose, onDone }) => {
  const [ids, setIds] = useState<string[]>([]);
  const [shareHistory, setShareHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = conversation.members.map(m => m.id);

  const submit = async () => {
    if (ids.length === 0) { setError('Escolha pelo menos um colega.'); return; }
    setBusy(true);
    const res = await addGroupMembersInDb(conversation.id, ids, shareHistory);
    setBusy(false);
    if (!res.success) { setError(res.error || 'Não foi possível acrescentar membros.'); return; }
    onDone();
  };

  return (
    <Overlay title={`Adicionar membros · ${conversation.title}`} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold">Cancelar</button>
        <button onClick={submit} disabled={busy || ids.length === 0} className="px-4 py-2 bg-brand-dark text-white rounded-lg text-xs font-bold disabled:opacity-50">
          {busy ? 'A acrescentar…' : `Acrescentar ${ids.length || ''}`.trim()}
        </button>
      </>}>
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-700">Histórico para os novos membros</p>
        <div className="grid grid-cols-1 gap-2">
          <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer ${!shareHistory ? 'border-brand-dark bg-emerald-50' : 'border-slate-200'}`}>
            <input type="radio" name="hist" className="accent-brand-dark mt-0.5" checked={!shareHistory} onChange={() => setShareHistory(false)} />
            <span className="text-xs"><span className="block font-bold text-slate-900">Só mensagens a partir de agora</span><span className="text-slate-500">Não veem o que foi conversado antes de entrar.</span></span>
          </label>
          <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer ${shareHistory ? 'border-brand-dark bg-emerald-50' : 'border-slate-200'}`}>
            <input type="radio" name="hist" className="accent-brand-dark mt-0.5" checked={shareHistory} onChange={() => setShareHistory(true)} />
            <span className="text-xs"><span className="block font-bold text-slate-900">Incluir o histórico anterior</span><span className="text-slate-500">Veem todas as mensagens desde o início da conversa.</span></span>
          </label>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-700">Colegas a acrescentar</p>
        <MemberPicker recipients={recipients} selected={ids} onChange={setIds} exclude={existing} />
      </div>
      {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
    </Overlay>
  );
};

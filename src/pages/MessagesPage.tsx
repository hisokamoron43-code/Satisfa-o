import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  ChatMessage, ConversationSummary, MessageFilter, MessageRecipient,
  addGroupMembersInDb, createConversationInDb, fetchConversations, fetchMessageRecipients, fetchMessages,
  findDuplicateAttachments, getAttachmentUrl, markConversationReadInDb, sendMessageInDb, setConversationTopicInDb,
  uploadMessageAttachment,
} from '../services/supabaseService';
import { SearchableSelect } from '../components/ui/SearchableSelect';

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

// Cores de nome por remetente (como no WhatsApp, cada pessoa tem uma cor estável dentro do grupo)
const SENDER_COLORS = ['text-teal-700', 'text-orange-700', 'text-violet-700', 'text-sky-700', 'text-rose-700', 'text-amber-700', 'text-emerald-800'];
const senderColor = (id?: string) => {
  let h = 0;
  for (const ch of id ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
};

const Avatar: React.FC<{ title: string; kind: 'DIRECT' | 'GROUP'; size?: 'sm' | 'md' }> = ({ title, kind, size = 'md' }) => {
  const dim = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-12 h-12 text-sm';
  if (kind === 'GROUP') {
    return <span className={`${dim} shrink-0 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold`} aria-hidden="true">👥</span>;
  }
  return <span className={`${dim} shrink-0 rounded-full bg-emerald-100 text-brand-dark flex items-center justify-center font-black`} aria-hidden="true">{initials(title)}</span>;
};

// Marcas de leitura: ✓✓ nas mensagens enviadas por mim
const Ticks: React.FC = () => <span className="text-[12px] font-bold text-brand-dark tracking-tighter" aria-label="Enviada">✓✓</span>;

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
  const [listFilter, setListFilter] = useState<'ALL' | 'UNREAD' | 'GROUPS' | 'TOPICS'>('ALL');
  const [activeTopic, setActiveTopic] = useState('');           // '' todos · 'NONE' sem tema · nome do tema
  const [topicDraft, setTopicDraft] = useState('');
  const [topicError, setTopicError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [important, setImportant] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      if (listFilter === 'UNREAD' && c.unread === 0) return false;
      if (listFilter === 'GROUPS' && c.kind !== 'GROUP') return false;
      if (listFilter === 'TOPICS' && !c.topic) return false;
      if (!q) return true;
      return c.title.toLowerCase().includes(q) || (c.lastBody ?? '').toLowerCase().includes(q) || (c.topic ?? '').toLowerCase().includes(q);
    });
  }, [conversations, listSearch, listFilter]);

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

  // Ao escolher um documento, avisa logo se já existir outro com o mesmo nome nesta conversa
  const onPickFile = async (f: File | null) => {
    setPendingFile(f);
    setDupWarning(null);
    if (f && selectedId) {
      const d = await findDuplicateAttachments(selectedId, f.name);
      if (d.length > 0) {
        const when = new Date(d[0].createdAt.replace(' ', 'T')).toLocaleDateString('pt-PT');
        setDupWarning(`Já existe um documento com o nome "${f.name}" nesta conversa (${d.length} envio(s), o mais recente em ${when}).`);
      }
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    const body = draft.trim();
    if (!body && !pendingFile) return;
    if (body.length > MAX_BODY) { setError(`A mensagem não pode ter mais de ${MAX_BODY} caracteres.`); return; }
    setSending(true); setError(null);
    let attachment: { name: string; path: string; size: number; type: string } | undefined;
    if (pendingFile) {
      const dups = await findDuplicateAttachments(selectedId, pendingFile.name);
      if (dups.length > 0) {
        const names = [...new Set(dups.map(d => recipients.find(r => r.id === d.senderId)?.name ?? 'outro colega'))].join(', ');
        const when = new Date(dups[0].createdAt.replace(' ', 'T')).toLocaleDateString('pt-PT');
        if (!window.confirm(`Já existe um documento com o nome "${pendingFile.name}" nesta conversa (enviado por ${names} em ${when}).\n\nDeseja enviá-lo novamente?`)) {
          setSending(false);
          return;
        }
      }
      const up = await uploadMessageAttachment(selectedId, pendingFile);
      if (!up.success || !up.path) { setSending(false); setError(up.error || 'Não foi possível enviar o documento.'); return; }
      attachment = { name: pendingFile.name, path: up.path, size: pendingFile.size, type: pendingFile.type || 'application/octet-stream' };
    }
    const res = await sendMessageInDb(selectedId, body, { important, attachment });
    setSending(false);
    if (!res.success) { setError(res.error || 'Não foi possível enviar a mensagem.'); return; }
    setDraft(''); setImportant(false); setPendingFile(null); setDupWarning(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const FILTERS: Array<[typeof listFilter, string]> = [['ALL', 'Tudo'], ['UNREAD', 'Não lidas'], ['GROUPS', 'Grupos'], ['TOPICS', 'Temas']];
  const headerTitle = selected ? selected.title : '';
  const membersLine = selected
    ? selected.kind === 'GROUP'
      ? selected.members.map(m => (m.id === meId ? 'Eu' : m.name)).join(', ')
      : 'Conversa direta'
    : '';

  return (
    <div className="flex h-[calc(100vh-150px)] min-h-[560px] bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* ===================== LISTA DE CONVERSAS ===================== */}
      <aside className={`${selected ? 'hidden lg:flex' : 'flex'} w-full lg:w-[380px] shrink-0 flex-col border-r border-slate-200 bg-white`}>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">Conversas</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNew({ topic: '' })} title="Criar tema" aria-label="Criar tema"
              className="px-2.5 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"># Tema</button>
            <button onClick={() => setShowNew({})} title="Nova conversa" aria-label="Nova conversa"
              className="w-9 h-9 rounded-full bg-brand-dark hover:bg-brand-deep text-white text-xl font-bold leading-none">+</button>
          </div>
        </div>

        <div className="px-4 pb-2">
          <input value={listSearch} onChange={e => setListSearch(e.target.value)} placeholder="Pesquisar ou começar uma conversa"
            className="w-full px-4 py-2 bg-slate-100 rounded-lg text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand" />
        </div>
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
          {FILTERS.map(([value, label]) => (
            <button key={value} onClick={() => setListFilter(value)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border ${listFilter === value ? 'bg-emerald-100 border-emerald-200 text-brand-dark' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>

        <ul className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <li className="p-6 text-sm text-slate-500">Ainda não tem conversas. Toque em + para escrever a um colega, a um prestador ou criar um grupo.</li>
          )}
          {conversations.length > 0 && visible.length === 0 && (
            <li className="p-6 text-sm text-slate-500">Nenhuma conversa corresponde à pesquisa.</li>
          )}
          {visible.map(c => {
            const mine = c.lastSenderId === meId;
            return (
              <li key={c.id}>
                <button onClick={() => setSelectedId(c.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${selectedId === c.id ? 'bg-slate-100' : ''}`}>
                  <Avatar title={c.title} kind={c.kind} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-[15px] text-slate-900 truncate">{c.title}</span>
                      <span className={`text-[11px] shrink-0 ${c.unread > 0 ? 'text-brand-dark font-bold' : 'text-slate-500'}`}>{listTime(c.lastAt ?? c.updatedAt)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="flex items-center gap-1 min-w-0 text-sm text-slate-500 truncate">
                        {mine && c.lastBody && <Ticks />}
                        <span className="truncate">{c.lastBody ?? 'Sem mensagens'}</span>
                      </span>
                      {c.unread > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand-dark text-white text-[11px] font-bold flex items-center justify-center shrink-0">{c.unread}</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* ===================== CONVERSA ===================== */}
      <section className={`${selected ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0 flex-col`}>
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-center p-8">
            <span className="w-20 h-20 rounded-full bg-emerald-100 text-brand-dark text-3xl flex items-center justify-center mb-4" aria-hidden="true">💬</span>
            <p className="text-lg font-semibold text-slate-800">Mensagens internas</p>
            <p className="text-sm text-slate-500 max-w-sm mt-1">Escolha uma conversa à esquerda, ou toque em + para começar uma nova.</p>
          </div>
        ) : (
          <>
            {/* Cabeçalho: nome da pessoa ou do grupo */}
            <header className="flex items-center gap-3 px-3 py-2.5 bg-slate-100 border-b border-slate-200">
              <button onClick={() => setSelectedId(null)} className="lg:hidden w-9 h-9 rounded-full hover:bg-slate-200 text-slate-700 text-lg" aria-label="Voltar">←</button>
              <Avatar title={headerTitle} kind={selected.kind} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] text-slate-900 truncate">{headerTitle}</p>
                <p className="text-xs text-slate-500 truncate">{membersLine}</p>
              </div>
              <button onClick={() => setShowTopics(v => !v)} aria-pressed={showTopics}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${showTopics ? 'bg-emerald-100 border-emerald-200 text-brand-dark' : 'bg-white border-slate-300 text-slate-700'}`}>
                Filtros
              </button>
              {canManage && (
                <button onClick={() => setShowMembers(true)} className="px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-300 bg-white text-slate-700">Membros</button>
              )}
            </header>

            {showTopics && (
              <div className="p-3 bg-white border-b border-slate-200 space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-600">Tema:</span>
                  <button onClick={() => setTopic('')} className={`px-2.5 py-1 rounded-full font-semibold border ${!selected.topic ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white border-slate-300 text-slate-700'}`}>Sem tema</button>
                  {topics.map(t => (
                    <button key={t} onClick={() => setTopic(t)} className={`px-2.5 py-1 rounded-full font-semibold border ${selected.topic === t ? 'bg-brand-dark text-white border-brand-dark' : 'bg-white border-slate-300 text-slate-700'}`}>{t}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={topicDraft} onChange={e => setTopicDraft(e.target.value)} maxLength={60} placeholder="Novo tema"
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand" />
                  <button onClick={() => setTopic(topicDraft)} disabled={topicDraft.trim().length < 2} className="px-3 py-1.5 bg-brand-dark text-white rounded-lg font-semibold disabled:opacity-40">Definir</button>
                </div>
                {topicError && <p className="text-rose-600 font-medium">{topicError}</p>}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 pt-2 border-t border-slate-200">
                  <label className="space-y-1"><span className="font-bold text-slate-600">De</span>
                    <input type="date" value={filter.from ?? ''} max={filter.to || undefined} onChange={e => setFilter(f => ({ ...f, from: e.target.value }))} className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg" /></label>
                  <label className="space-y-1"><span className="font-bold text-slate-600">Até</span>
                    <input type="date" value={filter.to ?? ''} min={filter.from || undefined} onChange={e => setFilter(f => ({ ...f, to: e.target.value }))} className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg" /></label>
                  <label className="space-y-1"><span className="font-bold text-slate-600">Texto</span>
                    <input value={filter.text ?? ''} onChange={e => setFilter(f => ({ ...f, text: e.target.value }))} placeholder="Palavra" className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg" /></label>
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-1.5 font-semibold text-slate-700 py-1">
                      <input type="checkbox" checked={!!filter.important} onChange={e => setFilter(f => ({ ...f, important: e.target.checked }))} className="accent-brand-dark" />★ Importantes
                    </label>
                    <button onClick={() => setFilter(EMPTY_FILTER)} disabled={!filterActive} className="ml-auto px-2 py-1 border border-slate-300 rounded-lg font-semibold bg-white disabled:opacity-40">Limpar</button>
                  </div>
                </div>
              </div>
            )}

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto px-4 md:px-[7%] py-3 bg-[#efeae2]">
              {messages.length === 0 && (
                <p className="text-xs text-slate-600 text-center mt-8">
                  {filterActive ? 'Nenhuma mensagem corresponde aos filtros.' : 'Ainda não há mensagens. Escreva a primeira.'}
                </p>
              )}
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const mine = m.senderId === meId;
                const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt);
                const sameSender = !!prev && !newDay && prev.senderId === m.senderId;
                const isGroup = selected.kind === 'GROUP';
                return (
                  <React.Fragment key={m.id}>
                    {newDay && (
                      <div className="flex justify-center my-3">
                        <span className="text-[11px] font-medium text-slate-600 bg-white/90 px-3 py-1 rounded-lg shadow-sm">{dayLabel(m.createdAt)}</span>
                      </div>
                    )}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${sameSender ? 'mt-0.5' : 'mt-2'}`}>
                      <div className={`relative max-w-[85%] md:max-w-[65%] px-2.5 pt-1.5 pb-1 rounded-lg shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${
                        mine ? 'bg-emerald-100 text-slate-900 rounded-tr-none' : 'bg-white text-slate-900 rounded-tl-none'}`}>
                        {!mine && isGroup && !sameSender && (
                          <p className={`text-[12.5px] font-semibold mb-0.5 ${senderColor(m.senderId)}`}>{m.senderName}</p>
                        )}
                        {m.important && <p className="text-[11px] font-bold text-amber-700 mb-0.5">★ Importante</p>}
                        {m.attachmentPath && <AttachmentCard name={m.attachmentName ?? 'documento'} size={m.attachmentSize} path={m.attachmentPath} mine={mine} />}
                        {m.body && !(m.attachmentPath && m.body.startsWith('📎')) && (
                          <p className="text-[14.5px] leading-[1.35] whitespace-pre-wrap break-words pr-16">{m.body}</p>
                        )}
                        <p className="absolute right-2 bottom-1 flex items-center gap-1 text-[11px] text-slate-500 leading-none">
                          {timeOf(m.createdAt)}
                          {mine && <Ticks />}
                        </p>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={endRef} />
            </div>

            {/* Caixa de envio */}
            <form onSubmit={send} className="bg-slate-100 px-3 py-2.5 space-y-2">
              {pendingFile && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white rounded-xl text-xs">
                  <span className="truncate">📄 {pendingFile.name} <span className="text-slate-500">({(pendingFile.size / 1024).toFixed(0)} KB)</span></span>
                  <button type="button" onClick={() => { setPendingFile(null); setDupWarning(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-rose-600 font-bold shrink-0">Remover</button>
                </div>
              )}
              {dupWarning && <p className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 font-medium">⚠ {dupWarning}</p>}
              {error && <p className="text-xs text-rose-600 font-medium px-1">{error}</p>}
              <div className="flex items-end gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Anexar documento"
                  className="w-10 h-10 shrink-0 rounded-full text-slate-600 hover:bg-slate-200 text-xl">＋</button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={e => onPickFile(e.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => setImportant(v => !v)} aria-pressed={important} aria-label="Marcar como importante"
                  className={`w-10 h-10 shrink-0 rounded-full text-lg ${important ? 'bg-amber-100 text-amber-700' : 'text-slate-600 hover:bg-slate-200'}`}>★</button>
                <div className="flex-1 min-w-0 bg-white rounded-3xl px-4 py-2.5">
                  <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1} maxLength={MAX_BODY}
                    placeholder="Escreva uma mensagem"
                    className="w-full bg-transparent text-[15px] resize-none focus:outline-none max-h-32" />
                </div>
                <button type="submit" disabled={sending || (!draft.trim() && !pendingFile)} aria-label="Enviar"
                  className="w-11 h-11 shrink-0 rounded-full bg-brand-dark hover:bg-brand-deep text-white flex items-center justify-center disabled:opacity-40">➤</button>
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
          ? <SearchableSelect ariaLabel="Destinatário" placeholder="Escolher colega ou prestador…" value={memberIds[0] ?? ''}
              onChange={v => setMemberIds(v ? [v] : [])}
              options={recipients.filter(r => r.id !== meId).map(r => ({ value: r.id, label: r.name, hint: r.providerId ? 'Prestador' : r.department }))} />
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

const AttachmentCard: React.FC<{ name: string; size?: number; path: string; mine: boolean }> = ({ name, size, path, mine }) => {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    const url = await getAttachmentUrl(path);
    setBusy(false);
    if (url) window.open(url, '_blank', 'noopener');
    else window.alert('Não foi possível abrir o documento.');
  };
  return (
    <button type="button" onClick={open} className={`w-full flex items-center gap-2 text-left rounded-md px-2 py-2 mb-1 ${mine ? 'bg-emerald-200/60 hover:bg-emerald-200' : 'bg-slate-100 hover:bg-slate-200'}`}>
      <span className="text-lg" aria-hidden="true">📄</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold truncate">{name}</span>
        <span className={`block text-[10px] ${mine ? 'text-emerald-100' : 'text-slate-500'}`}>
          {size ? `${(size / 1024).toFixed(0)} KB · ` : ''}{busy ? 'a abrir…' : 'tocar para abrir'}
        </span>
      </span>
    </button>
  );
};

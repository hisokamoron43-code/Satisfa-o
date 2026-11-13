import React, { useEffect, useRef, useState } from 'react';

export interface SelectOption { value: string; label: string; hint?: string }

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Permite criar uma opção nova a partir do texto escrito (ex.: um departamento que ainda não existe). */
  allowCreate?: boolean;
  createLabel?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Lista de opções com filtro por escrita. Mantém as opções pré-definidas e aceita texto livre quando permitido. */
export const SearchableSelect: React.FC<Props> = ({ options, value, onChange, placeholder = 'Escolher…', allowCreate = false, createLabel = 'Criar', disabled, ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);
  const free = value && !selected ? value : '';
  const q = query.trim().toLowerCase();
  const filtered = options.filter(o => !q || o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q));
  const exists = options.some(o => o.label.toLowerCase() === q);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (v: string) => { onChange(v); setQuery(''); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="w-full min-h-[42px] flex items-center justify-between gap-2 px-3 py-2 border border-slate-300 rounded-xl bg-white text-left text-sm disabled:opacity-50">
        <span className={`truncate ${selected || free ? 'text-slate-900' : 'text-slate-400'}`}>{selected?.label ?? (free || placeholder)}</span>
        <span className="text-slate-500 shrink-0" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-white border border-slate-200 rounded-xl shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Escreva para filtrar…"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filtered.length === 1) pick(filtered[0].value);
                  else if (allowCreate && q && !exists) pick(query.trim());
                }
              }}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.map(o => (
              <li key={o.value}>
                <button type="button" onClick={() => pick(o.value)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-slate-50 ${o.value === value ? 'font-bold text-brand-dark' : 'text-slate-800'}`}>
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="text-[10px] text-slate-500 shrink-0">{o.hint}</span>}
                </button>
              </li>
            ))}
            {filtered.length === 0 && !(allowCreate && q) && (
              <li className="px-3 py-2 text-xs text-slate-500">Nenhum resultado{q ? ` para "${query}"` : ''}.</li>
            )}
            {allowCreate && q && !exists && (
              <li>
                <button type="button" onClick={() => pick(query.trim())} className="w-full text-left px-3 py-2 text-sm font-bold text-brand-dark hover:bg-emerald-50">
                  {createLabel} “{query.trim()}”
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

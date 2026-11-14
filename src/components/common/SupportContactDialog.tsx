import React, { useEffect, useRef, useState } from 'react';
import { Headphones, Phone, X } from 'lucide-react';

/** Contacto oficial de suporte da AETERNU (formato internacional para o link de chamada). */
export const SUPPORT_PHONE_DISPLAY = '927 924 699';
export const SUPPORT_PHONE_TEL = '+244927924699';

interface Props {
  /** Texto do botão que abre o quadro informativo. */
  label?: string;
  className?: string;
}

/**
 * Botão "Suporte Técnico" que abre primeiro um quadro informativo e só inicia
 * a chamada (aplicação de telefone do dispositivo) depois da confirmação do utilizador.
 */
export const SupportContactDialog: React.FC<Props> = ({ label = 'Suporte Técnico HST', className }) => {
  const [open, setOpen] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const startCall = () => {
    setOpen(false);
    window.location.href = `tel:${SUPPORT_PHONE_TEL}`;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? 'flex items-center gap-1.5 hover:text-white transition-colors'}
        aria-haspopup="dialog"
      >
        <Headphones className="w-3.5 h-3.5 text-brand" />
        <span>{label}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-dialog-title"
            aria-describedby="support-dialog-desc"
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-white text-slate-900 rounded-2xl border border-black shadow-2xl p-6"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="absolute top-3 right-3 p-1 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-700 flex items-center justify-center">
                <Headphones className="w-5 h-5 text-emerald-800" />
              </span>
              <h2 id="support-dialog-title" className="text-base font-black leading-tight">
                Contacto de Suporte Técnico
              </h2>
            </div>

            <div id="support-dialog-desc" className="space-y-3 text-sm text-slate-700 leading-relaxed">
              <p>
                O número <strong className="text-slate-950 whitespace-nowrap">{SUPPORT_PHONE_DISPLAY}</strong> pertence
                à empresa <strong className="text-slate-950">AETERNU</strong>. Para qualquer dúvida ou esclarecimento,
                a nossa equipa está disponível através deste contacto.
              </p>
              <p className="font-bold text-slate-950">Pretende ligar para este contacto?</p>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-black text-sm font-bold text-slate-800 hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={startCall}
                style={{ backgroundColor: '#8CBF26' }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-black text-sm font-black text-black hover:opacity-95 transition flex items-center justify-center gap-1.5"
              >
                <Phone className="w-4 h-4" /> Sim, ligar
              </button>
            </div>

            <p className="mt-3 text-[11px] text-slate-500 text-center">
              Poderão ser aplicados os custos da sua operadora.
            </p>
          </div>
        </div>
      )}
    </>
  );
};

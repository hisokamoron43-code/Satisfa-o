import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/** Chave em sessionStorage usada só para mostrar o aviso no ecrã de login (não guarda dados do sistema). */
export const IDLE_LOGOUT_FLAG = 'sicsc_idle_logout';

const readMinutes = (raw: unknown, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Configurável por variável de ambiente (minutos). Por omissão: 30 min de inatividade, aviso 1 min antes.
const IDLE_MS = readMinutes((import.meta as any).env?.VITE_IDLE_TIMEOUT_MINUTES, 30) * 60_000;
const WARNING_MS = Math.min(60_000, Math.floor(IDLE_MS / 2));
const CHECK_EVERY_MS = 1_000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

/**
 * Termina a sessão após um período sem interação. Mostra um aviso com contagem decrescente
 * e permite continuar. O tempo é medido pelo relógio (Date.now), por isso não se atrasa
 * quando o separador fica em segundo plano.
 */
export const IdleSessionGuard: React.FC = () => {
  const { logout } = useApp();
  const lastActivity = useRef<number>(Date.now());
  const loggingOut = useRef(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const touch = useCallback(() => {
    // Com o aviso aberto, só o botão "Continuar" conta como atividade.
    if (loggingOut.current) return;
    if (Date.now() - lastActivity.current < IDLE_MS - WARNING_MS) {
      lastActivity.current = Date.now();
    }
  }, []);

  useEffect(() => {
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_MS) {
        if (!loggingOut.current) {
          loggingOut.current = true;
          try { window.sessionStorage.setItem(IDLE_LOGOUT_FLAG, '1'); } catch { /* ignorar */ }
          void logout();
        }
        return;
      }
      setSecondsLeft(idle >= IDLE_MS - WARNING_MS ? Math.ceil((IDLE_MS - idle) / 1000) : null);
    }, CHECK_EVERY_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(timer);
    };
  }, [logout, touch]);

  if (secondsLeft === null) return null;

  return (
    <div data-no-escape role="alertdialog" aria-modal="true" aria-labelledby="idle-title"
      className="modal-overlay fixed inset-0 z-[100] bg-slate-950/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl">
        <Clock className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <h2 id="idle-title" className="text-base font-black text-slate-900">Sessão prestes a terminar</h2>
        <p className="text-sm text-slate-600 mt-2">
          Por inatividade, a sua sessão termina em <strong>{secondsLeft}s</strong>.
        </p>
        <button type="button" autoFocus
          onClick={() => { lastActivity.current = Date.now(); setSecondsLeft(null); }}
          className="mt-4 px-4 py-2 bg-brand-dark text-white rounded-xl text-xs font-bold cursor-pointer">
          Continuar sessão
        </button>
      </div>
    </div>
  );
};

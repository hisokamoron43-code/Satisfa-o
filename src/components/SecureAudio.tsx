import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseService';

const AUDIO_BUCKET = 'evaluation-audio';

/**
 * Converte o valor guardado numa referência ao bucket privado.
 * Valores novos são caminhos internos (submissions/...). URLs públicos antigos são convertidos.
 */
export function audioStoragePath(stored: string): string | null {
  if (!stored) return null;
  if (!/^https?:\/\//i.test(stored)) return stored;
  const marker = `/object/public/${AUDIO_BUCKET}/`;
  const idx = stored.indexOf(marker);
  if (idx >= 0) return decodeURIComponent(stored.slice(idx + marker.length).split('?')[0]);
  return null;
}

/** Reproduz um áudio privado através de URL assinado de curta duração (5 minutos). */
export const SecureAudio: React.FC<{ stored: string; className?: string; autoPlay?: boolean }> = ({ stored, className, autoPlay }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSrc(null);
    setError(null);
    const path = audioStoragePath(stored);
    if (!path) {
      setError('Referência de áudio inválida.');
      return;
    }
    supabase.storage.from(AUDIO_BUCKET).createSignedUrl(path, 300).then(({ data, error: err }) => {
      if (!active) return;
      if (err || !data?.signedUrl) setError('Não foi possível carregar o áudio.');
      else setSrc(data.signedUrl);
    });
    return () => { active = false; };
  }, [stored]);

  if (error) return <span className="text-xs text-rose-600">{error}</span>;
  if (!src) return <span className="text-xs text-slate-500">A carregar áudio…</span>;
  return <audio controls autoPlay={autoPlay} src={src} className={className} />;
};

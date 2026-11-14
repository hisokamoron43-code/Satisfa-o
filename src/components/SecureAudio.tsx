import { traduzirErro } from '../services/mensagensErro';
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

/**
 * Reproduz um áudio guardado. Caminhos do bucket privado são reproduzidos por URL assinado (validade de 5 minutos).
 * Se o URL expirar, o erro ou a falha de reprodução mostram um botão para tentar de novo, que gera um URL novo.
 */
export const SecureAudio: React.FC<{ stored: string; className?: string; autoPlay?: boolean }> = ({ stored, className, autoPlay }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setSrc(null);
    setError(null);
    if (!stored) {
      setError('Sem gravação de áudio.');
      return;
    }
    // Gravação ainda local (data: ou blob:): reproduz diretamente
    if (/^(data:|blob:)/i.test(stored)) {
      setSrc(stored);
      return;
    }
    const path = audioStoragePath(stored);
    if (!path) {
      setError('Referência de áudio inválida.');
      return;
    }
    supabase.storage.from(AUDIO_BUCKET).createSignedUrl(path, 300).then(({ data, error: err }) => {
      if (!active) return;
      if (err || !data?.signedUrl) setError(`Não foi possível carregar o áudio${err?.message ? ` (${traduzirErro(err)})` : ''}.`);
      else setSrc(data.signedUrl);
    }, (err: unknown) => {
      if (active) setError(`Não foi possível carregar o áudio${err instanceof Error ? ` (${traduzirErro(err)})` : ''}.`);
    });
    return () => { active = false; };
  }, [stored, attempt]);

  if (error) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-rose-600">
        {error}
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="underline font-bold text-slate-800">tentar novamente</button>
      </span>
    );
  }
  if (!src) return <span className="text-xs text-slate-500">A carregar áudio…</span>;
  return (
    <audio
      controls
      preload="metadata"
      autoPlay={autoPlay}
      src={src}
      className={className}
      onError={() => setError('O navegador não consegue reproduzir este ficheiro.')}
    />
  );
};

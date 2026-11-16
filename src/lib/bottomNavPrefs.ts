/**
 * Barra de acesso rápido do telemóvel: cada pessoa escolhe os atalhos, mas só entre as páginas a que tem acesso.
 * Lógica pura (sem React): fácil de testar e reutilizar.
 */

/** Máximo de atalhos (o botão «Mais» fica sempre). */
export const MAX_SHORTCUTS = 4;

/** Atalhos propostos enquanto a pessoa não personaliza (3 primeiros a que tem acesso). */
export const DEFAULT_SHORTCUTS = ['dashboard', 'evaluations', 'my_team', 'messages', 'clients', 'calendar', 'hr', 'employees', 'reports'];
const DEFAULT_COUNT = 3;

export const bottomNavStorageKey = (userId: string) => `sicsc.bottomnav.v1.${userId}`;

/** Páginas que a pessoa pode ver, pela ordem do catálogo. Administradores veem todas. */
export function pagesAvailable(catalogKeys: string[], allowedPages: string[], isAdmin: boolean): string[] {
  return catalogKeys.filter(k => isAdmin || allowedPages.includes(k));
}

/**
 * Atalhos a mostrar. `saved` = escolha guardada (null = nunca personalizou).
 * Páginas que a pessoa deixou de poder ver, repetidas ou desconhecidas são retiradas, e respeita-se o máximo.
 */
export function resolveShortcuts(available: string[], saved: string[] | null): string[] {
  if (saved === null) return DEFAULT_SHORTCUTS.filter(k => available.includes(k)).slice(0, DEFAULT_COUNT);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const k of saved) {
    if (available.includes(k) && !seen.has(k)) { seen.add(k); result.push(k); }
  }
  return result.slice(0, MAX_SHORTCUTS);
}

export function loadShortcuts(userId: string | undefined): string[] | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(bottomNavStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(x => typeof x === 'string') ? parsed : null;
  } catch {
    return null;
  }
}

export function saveShortcuts(userId: string | undefined, keys: string[] | null): void {
  if (!userId) return;
  try {
    if (keys === null) localStorage.removeItem(bottomNavStorageKey(userId));
    else localStorage.setItem(bottomNavStorageKey(userId), JSON.stringify(keys.slice(0, MAX_SHORTCUTS)));
  } catch { /* armazenamento indisponível (modo privado): a escolha vale só nesta sessão */ }
}

/** Move o item para cima (-1) ou para baixo (+1). */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
interface ThemeContextValue { theme: Theme; toggleTheme: () => void; }

const STORAGE_KEY = 'sicsc-theme';
const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', toggleTheme: () => {} });

const readInitial = (): Theme => {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* sem armazenamento */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** Preferência de aparência (não contém dados sensíveis). Aplica a classe "dark" ao documento. */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignorar */ }
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

/** Botão flutuante para alternar entre modo claro e escuro, visível em todos os ecrãs. */
export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={dark ? 'Modo claro' : 'Modo escuro'}
      className="fixed bottom-4 right-4 z-[100] px-3 py-2 rounded-full shadow-lg border border-slate-300 bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600 text-xs font-bold cursor-pointer"
    >
      {dark ? '☀ Modo claro' : '☾ Modo escuro'}
    </button>
  );
};

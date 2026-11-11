import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'theme';

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

interface ThemeCtx {
  pref: ThemePref;
  /** What is actually shown after resolving "system". */
  resolved: 'light' | 'dark';
  setPref: (p: ThemePref) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [systemDark, setSystemDark] = useState(() => media().matches);
  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;

  useEffect(() => {
    const m = media();
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains('dark') === (resolved === 'dark')) return;
    // Cross-fade colours only while switching, so normal hovers stay snappy.
    root.classList.add('theme-transition');
    root.classList.toggle('dark', resolved === 'dark');
    const t = window.setTimeout(() => root.classList.remove('theme-transition'), 250);
    return () => window.clearTimeout(t);
  }, [resolved]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      if (p === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, p);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toggle = useCallback(() => setPref(resolved === 'dark' ? 'light' : 'dark'), [resolved, setPref]);

  return <Ctx.Provider value={{ pref, resolved, setPref, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme must be used inside ThemeProvider');
  return c;
}

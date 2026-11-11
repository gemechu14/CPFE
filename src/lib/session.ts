import type { TokenPair } from '@/types/api';

export interface Session {
  tokens: TokenPair;
  permissions: string[];
  isFirstTimeLoggedIn: boolean;
  username: string;
}

const KEY = 'coopayroll.session';
type Listener = (s: Session | null, reason?: 'expired' | 'logout') => void;
const listeners = new Set<Listener>();

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

let cache: Session | null = read();

export const session = {
  get: () => cache,
  set(next: Session) {
    cache = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable – session lives in memory only */
    }
    listeners.forEach((l) => l(next));
  },
  clear(reason: 'expired' | 'logout' = 'logout') {
    cache = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l(null, reason));
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

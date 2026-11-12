import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { session, type Session } from '@/lib/session';

export const PERMS = {
  manageSettings: 'manage_payroll_settings',
  viewEmployee: 'view_employee',
  createEmployee: 'create_employee',
  updateEmployee: 'update_employee',
  // Phases 5, 7, 8, 9 setup screens
  viewSystem: 'view_system_setting',
  createSystem: 'create_system_setting',
  updateSystem: 'update_system_setting',
  deleteSystem: 'delete_system_setting',
  // Phase 9
  viewPayrollApproval: 'view_payroll_approval',
  createPayrollApproval: 'create_payroll_approval',
  readPayment: 'read_payment',
  // Phase 10
  simulatePayroll: 'simulate_payroll',
} as const;

interface AuthValue {
  session: Session | null;
  isAuthenticated: boolean;
  permissions: string[];
  can: (perm: string) => boolean;
  login: (username: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  markPasswordChanged: () => void;
  expired: boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Session | null>(session.get());
  const [expired, setExpired] = useState(false);
  const qc = useQueryClient();

  useEffect(
    () =>
      session.subscribe((s, reason) => {
        setCurrent(s);
        if (!s) {
          setExpired(reason === 'expired');
          qc.clear();
        }
      }),
    [qc],
  );

  const login = useCallback(async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    const next: Session = { tokens: res.tokens, permissions: res.permissions, isFirstTimeLoggedIn: res.isFirstTimeLoggedIn, username };
    setExpired(false);
    session.set(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    const refresh = session.get()?.tokens.refresh.token;
    session.clear('logout');
    if (refresh) await authApi.logout(refresh).catch(() => undefined);
  }, []);

  const markPasswordChanged = useCallback(() => {
    const s = session.get();
    if (s) session.set({ ...s, isFirstTimeLoggedIn: false });
  }, []);

  const value = useMemo<AuthValue>(() => {
    const permissions = current?.permissions ?? [];
    return {
      session: current,
      isAuthenticated: !!current,
      permissions,
      can: (perm) => permissions.includes(perm),
      login,
      logout,
      markPasswordChanged,
      expired,
    };
  }, [current, login, logout, markPasswordChanged, expired]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

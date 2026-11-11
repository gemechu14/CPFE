import { useQuery } from '@tanstack/react-query';
import { companyApi, definitionsApi,employeesApi, hrSyncApi, payrollApi, settingsApi } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import type { AdjustmentStatus } from '@/types/api';

export const qk = {
  me: ['me'] as const,
  company: ['company', 'profile'] as const,
  settings: ['payroll-settings'] as const,
  syncRuns: ['hr-sync', 'runs'] as const,
  syncRun: (id: string) => ['hr-sync', 'runs', id] as const,
  snapshot: (employeeId: string, period: string) => ['hr-sync', 'snapshot', employeeId, period] as const,
  employees: ['employees'] as const,
  employee: (id: string) => ['employees', id] as const,
  definitions: ['payroll-definitions'] as const,
  schedule: (id: string) => ['payroll-definitions', id, 'schedule'] as const,
  currentMonth: ['payroll-definitions', 'current-month'] as const,
  notYetRun: (definitionId: string) => ['payroll', 'not-yet-run', definitionId] as const,
  monthRows: (kind: string) => ['payroll', 'month', kind] as const,
  adjustments: (p: { payrollDefinitionId?: string; status?: AdjustmentStatus }) => ['payroll', 'adjustments', p] as const,
};

/** Loaded once after login and kept in app state (Phase 0.2). */
export function useSettings() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: qk.settings, queryFn: settingsApi.get, enabled: isAuthenticated, staleTime: 5 * 60_000 });
}

export function useCompany() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: qk.company, queryFn: companyApi.profile, enabled: isAuthenticated, staleTime: 10 * 60_000 });
}

export function useIsHrSync() {
  return useSettings().data?.employeeSource === 'HR_SYNC';
}

export function useSyncRuns() {
  return useQuery({
    queryKey: qk.syncRuns,
    queryFn: hrSyncApi.runs,
    // Poll every 4 s while any run is RUNNING.
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === 'RUNNING') ? 4000 : false),
  });
}

export function useEmployees() {
  return useQuery({ queryKey: qk.employees, queryFn: () => employeesApi.list() });
}

export function useActiveEmployees() {
  return useQuery({ queryKey: [...qk.employees, 'active'], queryFn: () => employeesApi.list('active') });
}

/** The definition covering today (or the next/most recent one), with processed counts. */
export function useCurrentPayroll() {
  return useQuery({ queryKey: qk.currentMonth, queryFn: definitionsApi.currentMonth });
}

export function useDefinitions() {
  return useQuery({ queryKey: qk.definitions, queryFn: definitionsApi.list });
}

export function useSchedule(id: string | undefined) {
  return useQuery({ queryKey: qk.schedule(id ?? ''), queryFn: () => definitionsApi.schedule(id!), enabled: !!id });
}

export function useAdjustments(p: { payrollDefinitionId?: string; status?: AdjustmentStatus }, enabled = true) {
  return useQuery({ queryKey: qk.adjustments(p), queryFn: () => payrollApi.adjustments(p), enabled });
}

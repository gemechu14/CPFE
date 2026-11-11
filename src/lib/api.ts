import { http } from './http';
import type {
  ApiEnvelope,
  CalculatedPayroll,
  Company,
  CompanyUpdate,
  Employee,
  HrConnectionInput,
  HrConnectionTestResult,
  HrSnapshot,
  HrSyncRun,
  LoginResponse,
  PayrollAdjustment,
  AdjustmentStatus,
  PayrollDefinition,
  PayrollDefinitionInput,
  PayrollDefinitionUpdate,
  CurrentPayroll,
  PayrollRow,
  PayrollSchedule,
  PayrollSettingUpdate,
  PayrollSettingView,
  RegisterCompanyInput,
  RunPayrollResponse,
  ScheduleUpdate,
} from '@/types/api';

/**
 * List endpoints that pre-date this guide aren't documented, so accept the
 * common shapes: a bare array, { data: [] }, or { data: { rows|items|results: [] } }.
 */
export function unwrapList<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if ('data' in b) return unwrapList<T>(b.data);
    for (const k of ['rows', 'items', 'results', 'employees', 'payrolls', 'payrollDefinitions']) {
      if (Array.isArray(b[k])) return b[k] as T[];
    }
  }
  return [];
}

const data = <T>(p: Promise<{ data: ApiEnvelope<T> }>) => p.then((r) => r.data.data);

// ── Phase 0: auth ───────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    http.post<LoginResponse>('/auth/login', { username, password }).then((r) => r.data),
  me: () => data(http.get<ApiEnvelope<Employee>>('/auth/me')),
  logout: (refreshToken: string) => http.post('/auth/logout', { refreshToken }),
  forgotPassword: (username: string) =>
    http.post<{ message: string }>('/auth/forgotPassword', { username }).then((r) => r.data),
  resetPassword: (token: string, password: string) =>
    http.post<{ message: string }>('/auth/resetPassword', { password }, { params: { token } }).then((r) => r.data),
  changePassword: (currentPassword: string, newPassword: string) =>
    http.post('/employees/change-password', { currentPassword, newPassword }).then((r) => r.data),
};

// ── Phase 1: company & settings ─────────────────────────────
export const companyApi = {
  register: (input: RegisterCompanyInput) =>
    http.post<ApiEnvelope<Company>>('/company/register', input).then((r) => r.data),
  profile: () => data(http.get<ApiEnvelope<Company>>('/company/profile')),
  update: (patch: CompanyUpdate) => data(http.post<ApiEnvelope<Company>>('/company/update', patch)),
  uploadImage: (file: File, type: 'logo' | 'banner') => {
    const form = new FormData();
    form.append('type', type);
    form.append('file', file);
    return data(http.post<ApiEnvelope<Company>>('/company/upload/logo', form));
  },
};

export const settingsApi = {
  get: () => data(http.get<ApiEnvelope<PayrollSettingView>>('/payroll-settings')),
  update: (patch: PayrollSettingUpdate) => data(http.put<ApiEnvelope<PayrollSettingView>>('/payroll-settings', patch)),
  saveHrConnection: (input: HrConnectionInput) =>
    data(http.put<ApiEnvelope<PayrollSettingView>>('/payroll-settings/hr-connection', input)),
  testHrConnection: () =>
    data(http.post<ApiEnvelope<HrConnectionTestResult>>('/payroll-settings/hr-connection/test')),
  removeHrConnection: () => data(http.delete<ApiEnvelope<PayrollSettingView>>('/payroll-settings/hr-connection')),
};

// ── Phase 2: HR sync & employees ────────────────────────────
export const hrSyncApi = {
  run: (period?: string) =>
    http
      .post<ApiEnvelope<{ jobId: string; period: string }>>('/hr-sync/run', null, { params: period ? { period } : undefined })
      .then((r) => r.data),
  runs: () => data(http.get<ApiEnvelope<HrSyncRun[]>>('/hr-sync/runs')),
  runById: (id: string) => data(http.get<ApiEnvelope<HrSyncRun>>(`/hr-sync/runs/${id}`)),
  snapshot: (employeeId: string, period: string) =>
    data(http.get<ApiEnvelope<HrSnapshot>>(`/hr-sync/employees/${employeeId}/snapshot`, { params: { period } })),
};

export const employeesApi = {
  /** filterType: all | active | terminated. No limit = every employee. */
  list: (filterType?: 'all' | 'active' | 'terminated') =>
    http.get('/employees', { params: filterType ? { filterType } : undefined }).then((r) => unwrapList<Employee>(r.data)),
  get: (id: string) => data(http.get<ApiEnvelope<Employee>>(`/employees/${id}`)),
  generatePassword: (employeeId: string, email: string) =>
    data(http.post<ApiEnvelope<{ temporaryPassword: string }>>('/employees/generate-password', { employeeId, email })),
};

// ── Phase 3: definitions & schedule ─────────────────────────
export const definitionsApi = {
  list: () => http.get('/payroll-definitions').then((r) => unwrapList<PayrollDefinition>(r.data)),
  create: (input: PayrollDefinitionInput) =>
    data(http.post<ApiEnvelope<PayrollDefinition>>('/payroll-definitions', input)),
  createBulk: (inputs: PayrollDefinitionInput[]) =>
    data(http.post<ApiEnvelope<{ count: number }>>('/payroll-definitions/bulk', inputs)),
  get: (id: string) => data(http.get<ApiEnvelope<PayrollDefinition>>(`/payroll-definitions/${id}`)),
  update: (id: string, patch: PayrollDefinitionUpdate) =>
    data(http.post<ApiEnvelope<PayrollDefinition>>(`/payroll-definitions/${id}`, patch)),
  remove: (id: string) => http.post(`/payroll-definitions/remove/${id}`).then((r) => r.data),
  currentMonth: () => data(http.get<ApiEnvelope<CurrentPayroll>>('/payroll-definitions/current-month')),
  schedule: (id: string) => data(http.get<ApiEnvelope<PayrollSchedule>>(`/payroll-definitions/${id}/schedule`)),
  updateSchedule: (id: string, patch: ScheduleUpdate) =>
    data(http.post<ApiEnvelope<PayrollSchedule>>(`/payroll-definitions/${id}/schedule`, patch)),
  close: (id: string) => data(http.post<ApiEnvelope<PayrollDefinition>>(`/payroll/definitions/${id}/close`)),
};

// ── Phase 4: payroll & adjustments ──────────────────────────
export const payrollApi = {
  /** Current-month rows (Phase 9.1). There is no list-by-period endpoint. */
  published: () => http.get('/payroll/published').then((r) => unwrapList<PayrollRow>(r.data)),
  approved: () => http.get('/payroll/approved').then((r) => unwrapList<PayrollRow>(r.data)),
  paid: () => http.get('/payroll/paid').then((r) => unwrapList<PayrollRow>(r.data)),
  /** Phase 9.1: unsaved estimates for ACTIVE employees with no payroll row for this definition yet (HR-synced included). */
  notYetRun: (payrollDefinitionId: string) =>
    http.get(`/payroll/definition/${payrollDefinitionId}`).then((r) => unwrapList<CalculatedPayroll>(r.data)),
  run: (payrollDefinitionId: string, employeeIds: string[]) =>
    data(http.post<ApiEnvelope<RunPayrollResponse>>('/payroll', { payrollDefinitionId, employeeIds })),
  adjustments: (params: { payrollDefinitionId?: string; status?: AdjustmentStatus } = {}) =>
    http
      .get<{ data: PayrollAdjustment[]; count: number }>('/payroll/adjustments', { params })
      .then((r) => r.data),
};

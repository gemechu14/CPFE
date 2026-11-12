import { http } from '@/lib/http';
import type { ApiEnvelope, EmployeeSource } from '@/types/api';

// ── Phase 10: payroll simulation (what-if, nothing is saved) ────────────

export const AMOUNT_KEYS = [
  'basicSalary',
  'totalAllowance',
  'grossSalary',
  'taxableIncome',
  'incomeTax',
  'employeePensionAmount',
  'employerPensionAmount',
  'employeeProvidentFundAmount',
  'employerProvidentFundAmount',
  'totalDeduction',
  'netSalary',
] as const;
export type AmountKey = (typeof AMOUNT_KEYS)[number];
/** Plain numbers, rounded to 2 dp. */
export type Amounts = Record<AmountKey, number>;

export type MonthBasis = 'ACTUAL' | 'HR_DATA' | 'PROJECTED' | 'GRADE_SETUP' | 'NOT_EMPLOYED' | 'NO_DATA';
export type SimulationStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface SimulationParams {
  fromPeriod: string;
  toPeriod: string;
  employeeIds?: string[];
  useActuals: boolean;
  includeAdjustments: boolean;
}

export interface SimMonthSummary {
  period: string;
  /** null = no definition for that month, simulated on the calendar month. */
  payrollDefinitionId: string | null;
  payrollName: string;
  startDate: string;
  endDate: string;
  employees: number;
  basis: Partial<Record<MonthBasis, number>>;
  totals: Amounts;
}

export interface SkippedEmployee {
  employeeId: string;
  name: string;
  reason: string;
}

export interface Simulation {
  id: string;
  status: SimulationStatus;
  params: SimulationParams;
  progress: { processedEmployees: number; totalEmployees: number; percent: number };
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  expiresAt: string;
  error: string | null;
  result: null | {
    totals: Amounts;
    months: SimMonthSummary[];
    employees: { total: number; withWarnings: number; skipped: number };
    skipped: SkippedEmployee[];
  };
}

export interface PayrollLine {
  name: string;
  amount: number;
  type: string;
  taxable?: boolean;
}
export interface PayrollLines {
  earnings: PayrollLine[];
  deductions: PayrollLine[];
}

export interface SimEmployeeMonth extends Amounts {
  period: string;
  basis: MonthBasis;
  /** + arrears / − recovery included this month. */
  arrears?: number;
  /** Only from the single-employee endpoint. null for old ACTUAL months; absent for NOT_EMPLOYED / NO_DATA. */
  lines?: PayrollLines | null;
}

export interface SimEmployeeRow {
  employeeId: string;
  name: string;
  employeeIdNumber: string | null;
  source: EmployeeSource;
  totals: Amounts;
  /** Same order as result.months. */
  months: SimEmployeeMonth[];
  warnings: string[];
}

export interface SimEmployeePage {
  simulationId: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  rows: SimEmployeeRow[];
}

export interface SimEmployeeDetail extends SimEmployeeRow {
  simulationId: string;
  params: SimulationParams;
}

/** Send either `year`, or `fromPeriod` (+ optional `toPeriod`). Leave `employeeIds` out for everyone. */
export type SimulationInput = (
  | { year: number; fromPeriod?: never; toPeriod?: never }
  | { fromPeriod: string; toPeriod?: string; year?: never }
) & {
  employeeIds?: string[];
  useActuals?: boolean;
  includeAdjustments?: boolean;
};

export interface EmployeeQuery {
  page: number;
  limit: number;
  search?: string;
  warningsOnly?: boolean;
}

export const simulationApi = {
  /** 200 when it finished in the request, 202 while it keeps running. Same `Simulation` shape either way. */
  start: (input: SimulationInput) =>
    http
      .post<ApiEnvelope<Simulation>>('/payroll/simulations', input, { timeout: 180_000 })
      .then((r) => r.data.data),
  get: (id: string) => http.get<ApiEnvelope<Simulation>>(`/payroll/simulations/${id}`).then((r) => r.data.data),
  employees: (id: string, q: EmployeeQuery) =>
    http
      .get<ApiEnvelope<SimEmployeePage>>(`/payroll/simulations/${id}/employees`, {
        params: {
          page: q.page,
          limit: q.limit,
          search: q.search || undefined,
          warningsOnly: q.warningsOnly ? 'true' : undefined,
        },
      })
      .then((r) => r.data.data),
  employee: (id: string, employeeId: string) =>
    http.get<ApiEnvelope<SimEmployeeDetail>>(`/payroll/simulations/${id}/employees/${employeeId}`).then((r) => r.data.data),
};

export const simKeys = {
  all: ['payroll-simulation'] as const,
  one: (id: string) => ['payroll-simulation', id] as const,
  employees: (id: string, q: EmployeeQuery) => ['payroll-simulation', id, 'employees', q] as const,
  employee: (id: string, employeeId: string) => ['payroll-simulation', id, 'employee', employeeId] as const,
};

/** Employer cost = gross + employer pension + employer PF. */
export const employerCost = (a: Pick<Amounts, 'grossSalary' | 'employerPensionAmount' | 'employerProvidentFundAmount'>) =>
  a.grossSalary + a.employerPensionAmount + a.employerProvidentFundAmount;

// Types mirror frontend-integration/*.md. Decimal fields arrive as strings.

export type Decimal = string;

export interface ApiEnvelope<T> {
  data: T;
  message?: string;
}

export interface ApiErrorBody {
  code?: number;
  message: string;
  details?: { message: string; path: string }[];
}

// ── Phase 0: auth ───────────────────────────────────────────
export interface TokenPair {
  access: { token: string; expires: string };
  refresh: { token: string; expires: string };
}

export interface LoginResponse {
  isFirstTimeLoggedIn: boolean;
  tokens: TokenPair;
  permissions: string[];
}

// ── Phase 1: company & settings ─────────────────────────────
export interface RegisterCompanyInput {
  organizationName: string;
  companyCode: string;
  phoneNumber: string;
  email?: string;
  notes?: string;
}

export interface Company {
  id: string;
  organizationName: string;
  companyCode: string;
  adminUsername?: string;
  phoneNumber?: string;
  email?: string | null;
  status?: 'pending' | 'active' | 'inactive' | string;
  notes?: string | null;
  /** Server-relative path, e.g. uploads/company/<id>/logo/x.png. Use assetUrl(). */
  logo?: string | null;
  banner?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanyUpdate {
  organizationName?: string;
  phoneNumber?: string;
  email?: string;
  notes?: string;
}

export type EmployeeSource = 'MANUAL' | 'HR_SYNC';
export type ProrationBasis = 'CALENDAR' | 'WORKING';

export interface PayrollSettingView {
  id: string;
  companyId: string;
  employeeSource: EmployeeSource;
  syncEnabled: boolean;
  syncIntervalHours: number;
  cutoffDay: number;
  payDay: number;
  openDaysBefore: number;
  syncUntilDay: number | null;
  prorationBasis: ProrationBasis;
  overtimeRates: Record<string, number> | null;
  hrCostCenter: string | null;
  hrRegion: string | null;
  hrZone: string | null;
  hrCity: string | null;
  hrWoreda: string | null;
  lastSyncedAt: string | null;
  hrBaseUrl: string | null;
  hrApiKey: string | null;
  hrCompanyName: string | null;
  hrConnectionConfigured: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PayrollSettingUpdate = Partial<
  Pick<
    PayrollSettingView,
    | 'employeeSource'
    | 'syncEnabled'
    | 'syncIntervalHours'
    | 'cutoffDay'
    | 'payDay'
    | 'openDaysBefore'
    | 'syncUntilDay'
    | 'prorationBasis'
    | 'overtimeRates'
    | 'hrCostCenter'
    | 'hrRegion'
    | 'hrZone'
    | 'hrCity'
    | 'hrWoreda'
  >
>;

export interface HrConnectionInput {
  baseUrl: string;
  apiKey: string;
  apiSecret?: string;
  companyName: string;
}

export type HrConnectionTestResult =
  | { ok: true; period: string; hasRecords: boolean; hrCompany: string | null; companyNameMatches: boolean; message: string }
  | { ok: false; period: string; message: string };

// ── Phase 2: HR sync ────────────────────────────────────────
export type SyncStatus = 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface HrSyncRun {
  id: string;
  companyId: string;
  period: string;
  status: SyncStatus;
  trigger: 'SCHEDULED' | 'MANUAL';
  startedAt: string;
  finishedAt: string | null;
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  adjustmentsGenerated: number;
  errors: { employeeRecord?: string; employeeId?: string; message: string }[] | null;
}

export interface HistoryRow {
  id?: string;
  fromDate: string;
  toDate: string | null;
  position?: { id: string; name?: string; title?: string } | null;
  grade?: { id: string; name?: string } | null;
  department?: { id: string; name?: string; departmentName?: string } | null;
  [key: string]: unknown;
}

export interface Employee {
  id: string;
  name: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  employeeIdNumber?: string | null;
  username?: string;
  email?: string | null;
  phoneNumber?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  hireDate?: string | null;
  tinNumber?: string | null;
  status?: string;
  source: EmployeeSource;
  lastSyncedAt: string | null;
  hrEmployeeRecord?: string | null;
  payrollInfo?: {
    basicSalary?: number;
    accountNumber?: string | null;
    costCenterId?: string | null;
    [key: string]: unknown;
  } | null;
  positionHistory?: HistoryRow[];
  gradeHistory?: HistoryRow[];
  departmentHistory?: HistoryRow[];
  roles?: { id: string; name: string }[];
  [key: string]: unknown;
}

export interface HrPlacementSegment {
  from: string;
  to: string;
  position?: { name?: string } | null;
  job_grade?: { name?: string } | null;
  organization_unit?: { name?: string } | null;
  salary_amount?: number | null;
  hr_event?: string | null;
  movement_reason?: string | null;
  is_acting?: boolean;
}

export interface HrAttendanceDay {
  date: string;
  day_type: string | null;
  status: string | null;
  working_hours: number | null;
  normal_hours: number | null;
  overtime_hours: number | null;
  leave_type: string | null;
  holiday: string | null;
}

export interface HrLeaveRequest {
  leave_request: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  effective_to_date: string | null;
  is_lwop: boolean;
  days_in_period: number;
}

export interface HrEmployeeRecord {
  placement_history?: HrPlacementSegment[];
  salary?: { salary_amount?: number; salary_scale?: { name?: string }; step?: string | number } | null;
  benefits?: { items?: { benefit_type: string; amount: number; unit?: string }[] } | null;
  attendance?: {
    summary?: {
      calendar_days?: number;
      working_days?: number;
      present_days?: number;
      absent_days?: number;
      half_days?: number;
      on_leave_days?: number;
      holiday_days?: number;
      unrecorded_days?: number;
      normal_hours?: number;
      overtime_hours?: number;
      overtime_by_category?: Record<string, number>;
      overtime_by_cost_center?: Record<string, number>;
    } | null;
    days?: HrAttendanceDay[];
  } | null;
  leave?: {
    summary?: { total_days?: number; paid_leave_days?: number; lwop_days?: number; by_type?: Record<string, number> } | null;
    requests?: HrLeaveRequest[];
    balances?: unknown[];
  } | null;
  identifiers?: { tin?: string | null; fan?: string | null; pension_number?: string | null } | null;
  bank?: { net_pay_account?: string | null; [k: string]: unknown } | null;
  [key: string]: unknown;
}

export interface HrSnapshot {
  id: string;
  employeeId: string;
  period: string;
  hash: string;
  syncedAt: string;
  payload: { from_date: string; to_date: string; record: HrEmployeeRecord };
}

// ── Phase 3: schedule ───────────────────────────────────────
export type DefinitionState = 'NOT_OPEN' | 'OPEN' | 'CLOSED_SYNCING' | 'LOCKED';

export interface PayrollDefinition {
  id: string;
  payrollName: string;
  startDate: string;
  endDate: string;
  payPeriod: string;
  payDate: string;
  hrPeriod?: string | null;
  openDate?: string | null;
  cutoffDate?: string | null;
  syncUntilDate?: string | null;
  closedAt?: string | null;
  status?: "created" | "ordered" | "pending" | "approved" | "active" | "paid";
  createdAt?: string;
  [key: string]: unknown;
}

export interface CurrentPayroll {
  payrollDefinition: PayrollDefinition | null;
  status: "active" | "upcoming" | "expired" | "none";
  totalEmployees: number;
  processedEmployees: number;
  unprocessedEmployees: number;
}

export type PayrollDefinitionUpdate = Partial<Pick<PayrollDefinitionInput, "payrollName" | "startDate" | "endDate">>;

export interface PayrollDefinitionInput {
  payrollName: string;
  startDate: string;
  endDate: string;
  payPeriod: string;
  payDate: string;
  hrPeriod?: string;
  openDate?: string;
  cutoffDate?: string;
  syncUntilDate?: string;
}

export interface PayrollSchedule {
  payrollDefinitionId: string;
  payrollName: string;
  startDate: string;
  endDate: string;
  payDate: string;
  hrPeriod: string;
  openDate: string;
  cutoffDate: string;
  syncUntilDate: string;
  explicit: { hrPeriod: boolean; openDate: boolean; cutoffDate: boolean; syncUntilDate: boolean };
  closedAt: string | null;
  state: DefinitionState;
}

export type ScheduleUpdate = Partial<Record<'hrPeriod' | 'openDate' | 'cutoffDate' | 'syncUntilDate', string | null>>;

// ── Phase 4: payroll & adjustments ──────────────────────────
export interface Segment {
  from: string;
  to: string;
  days: number;
  divisor: number;
  monthlySalary: number;
  amount: number;
  actingAmount: number;
  assumed: boolean;
}

export type AdjustmentStatus = 'PENDING' | 'APPLIED' | 'CANCELLED';
export type AdjustmentComponent = 'BASIC' | 'ACTING' | 'ALLOWANCE' | 'OVERTIME' | 'LWOP';

export interface PayrollAdjustment {
  id: string;
  employeeId: string;
  sourcePayrollDefinitionId: string;
  targetPayrollDefinitionId: string | null;
  component: AdjustmentComponent;
  amount: Decimal;
  isTaxable: boolean;
  status: AdjustmentStatus;
  reason: string | null;
  needsReview: boolean;
  details: {
    paid: number;
    final: number;
    alreadyApplied: number;
    snapshotHash: string;
    finalSegments: Segment[];
  } | null;
  appliedAt: string | null;
  createdAt: string;
  employee: { id: string; name: string; employeeIdNumber: string | null; status: string };
  sourcePeriod: { id: string; payrollName: string; startDate: string };
  targetPeriod: { id: string; payrollName: string; startDate: string } | null;
}

export interface CalculationBasis {
  source: 'HR_SYNC';
  mode: 'PROVISIONAL' | 'FINAL';
  cutoffDate: string;
  period: string;
  snapshotHash: string;
  components: { basic: number; acting: number; allowance: number; overtime: number; lwop: number };
  detail: {
    allowances: { name: string; amount: number }[];
    overtimeByCategory: Record<string, { hours: number; rate: number; amount: number }>;
    lwopDays: number;
    absentDays: number;
    segments: Segment[];
    monthlySalary: number;
  };
  appliedAdjustmentIds: string[];
  calculatedAt: string;
}

/** Payroll row. Only the fields this UI reads are typed; the rest pass through. */
export interface PayrollRow {
  id: string;
  employeeId: string;
  payrollDefinitionId?: string;
  employee?: { id: string; name: string; employeeIdNumber?: string | null };
  payrollDefinition?: { id: string; payrollName: string };
  basicSalary?: Decimal | number;
  grossSalary?: Decimal | number;
  taxableIncome?: Decimal | number;
  incomeTax?: Decimal | number;
  employeePensionAmount?: Decimal | number;
  employerPensionAmount?: Decimal | number;
  employeeProvidentFundAmount?: Decimal;
  employerProvidentFundAmount?: Decimal;
  totalDeduction?: Decimal | number;
  netSalary?: Decimal | number;
  status?: "CREATED" | "PENDING" | "APPROVED" | "FAILED" | string;
  paymentStatus?: "UNPAID" | "PENDING" | "PAID" | "FAILED" | string;
  totalAllowance?: Decimal | number;
  calculationBasis: CalculationBasis | null;
  createdAt?: string;
  [key: string]: unknown;
}

export interface RunPayrollResponse {
  payroll: {
    message: string;
    attendanceBasedCalculation: boolean;
    summary: { total: number; hrSynced: number; attendanceBased: number; standard: number; skipped?: number };
    skipped?: { employeeId: string; name: string; reason: string }[];
    payrolls: { id: string; employeeId: string }[];
  };
}

/** GET /payroll/definition/:id: unsaved estimate for an employee not yet run. Amounts are plain numbers. */
export interface CalculatedPayroll {
  employeeId: string;
  payrollDefinitionId: string;
  grossSalary: number;
  basicSalary: number;
  taxableIncome: number;
  incomeTax: number;
  totalDeduction: number;
  totalAllowance: number;
  netSalary: number;
  employeePensionAmount: number;
  employerPensionAmount: number;
  employeeProvidentFundAmount?: number;
  employerProvidentFundAmount?: number;
  calculationBasis?: CalculationBasis | null;
  status: 'CALCULATED';
  employee: {
    id: string;
    name: string;
    payrollInfo: { employmentType: string | null; basicSalary: number | null; tinNumber: string | null } | null;
    gradeHistory: { grade: { name: string } }[];
  };
}

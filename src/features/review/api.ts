import { http } from '@/lib/http';
import type { CalculationBasis } from '@/types/api';

// Phase 9 payroll rows. Decimal fields arrive as strings.
export type PayrollStatus = 'CREATED' | 'PENDING' | 'APPROVED' | 'FAILED';
export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED';

export interface PayrollEmployeeSummary {
  id: string;
  name: string;
  payrollInfo: { employmentType: string | null; basicSalary: number | null; tinNumber: string | null } | null;
  gradeHistory: { grade: { name: string } }[];
}

export interface Payroll9 {
  id: string;
  employeeId: string;
  payrollDefinitionId: string;
  grossSalary: string;
  basicSalary: string;
  taxableIncome: string;
  incomeTax: string;
  totalDeduction: string;
  totalAllowance: string;
  netSalary: string;
  employeePensionAmount: string;
  employerPensionAmount: string;
  employeeProvidentFundAmount: string;
  employerProvidentFundAmount: string;
  status: PayrollStatus;
  paymentStatus: PaymentStatus;
  calculationBasis: CalculationBasis | null;
  createdAt: string;
  updatedAt: string;
  employee: PayrollEmployeeSummary;
}

export type MonthList = 'published' | 'approved' | 'paid';

export interface PaymentResult {
  payrollId: string;
  employeeId: string;
  employeeName?: string;
  success: boolean;
  amount?: number;
  orderId?: string;
  error?: string;
}

export interface PaymentResponse {
  success: boolean;
  message: string;
  error?: string;
  data?: {
    totalRequested: number;
    totalValidPayrolls?: number;
    totalInvalidPayrolls?: number;
    successfulPayments?: number;
    failedPayments?: number;
    totalSuccessfulAmount?: number;
    results?: PaymentResult[];
    invalidPayrollsSummary?: { payrollId: string; employeeId?: string; employeeName?: string; reason: string }[];
    // "No valid payrolls" shape
    validPayrolls?: number;
    invalidPayrolls?: number;
    invalidReasons?: unknown;
  };
}

export type TxStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface TransactionHistory {
  id: string;
  transactionBatchId: string;
  transactionId: string;
  employeeId: string;
  payrollDefinitionId: string;
  payrollId: string;
  creditAccountNumber: string;
  orderId: string;
  amount: number;
  status: TxStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionBatch {
  id: string;
  batchId: string;
  idempotencyKey: string;
  debitAccount: string;
  totalAmount: number;
  status: TxStatus;
  createdAt: string;
  updatedAt: string;
  transactions: TransactionHistory[];
}

export const reviewApi = {
  list: (which: MonthList) => http.get<{ data: Payroll9[] }>(`/payroll/${which}`).then((r) => r.data.data ?? []),
  isValidDate: (definitionId?: string) =>
    http
      .get<{ success: boolean; data: { isValid: boolean } }>(definitionId ? `/payroll/isvalid-date/${definitionId}` : '/payroll/isvalid-date')
      .then((r) => r.data.data?.isValid ?? false),
  pay: (payrollIds: string[]) =>
    // Each employee is a separate bank call, so allow plenty of time.
    http.post<PaymentResponse>('/payment', { payrollIds }, { timeout: 600_000 }).then((r) => r.data),
  history: (limit: number, offset: number) =>
    http.get<{ success: boolean; data: TransactionBatch[] }>('/payment/history', { params: { limit, offset } }).then((r) => r.data.data ?? []),
};

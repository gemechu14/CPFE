import { http } from '@/lib/http';
import { downloadFile } from '@/lib/download';

export type ReportFormat = 'excel' | 'csv';

export interface PayslipReportRow {
  fullName: string;
  employeeType: string;
  grade: string;
  department: string;
  position: string;
  basicSalary: number;
  totalAllowance: number;
  totalDeduction: number;
  incomeTax: number;
  taxableIncome: number;
  grossSalary: number;
  netSalary: number;
  paymentStatus: string;
}

export interface LeaveTypeOption {
  id: string;
  name: string;
  shortName?: string | null;
}

export interface DepartmentOption {
  id: string;
  deptName: string;
}

const ext = (f: ReportFormat) => (f === 'excel' ? 'xlsx' : 'csv');

export const reportsApi = {
  bulk: (definitionId: string, page: number, limit: number) =>
    http
      .get<{ data: PayslipReportRow[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
        `/reports/payslip/bulk/${definitionId}`,
        { params: { page, limit } },
      )
      .then((r) => r.data),
  individual: (employeeId: string, payrollDefinitionId?: string) =>
    http
      .get<{ data: PayslipReportRow[] }>(`/reports/payslip/individual/${employeeId}`, { params: payrollDefinitionId ? { payrollDefinitionId } : undefined })
      .then((r) => r.data.data ?? []),
  leaveTypes: () => http.get<{ data: LeaveTypeOption[] }>('/leave-types').then((r) => r.data.data ?? []),
  departments: () => http.get<{ data: DepartmentOption[] }>('/departments').then((r) => r.data.data ?? []),

  downloadBulk: (definitionId: string, format: ReportFormat) =>
    downloadFile(`/reports/payslip/bulk/${definitionId}/download`, { format }, `payslip-report.${ext(format)}`),
  downloadIndividual: (employeeId: string, format: ReportFormat, payrollDefinitionId?: string) =>
    downloadFile(`/reports/payslip/individual/${employeeId}/download`, { format, payrollDefinitionId }, `payslip.${ext(format)}`),
  downloadLeave: (leaveTypeId: string, format: ReportFormat, departmentId?: string) =>
    downloadFile('/reports/leave/annual/download', { leaveTypeId, format, departmentId }, `leave-report.${ext(format)}`),
};

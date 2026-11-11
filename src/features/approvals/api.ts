import { http } from '@/lib/http';

export type RequestType = 'ATTENDANCE' | 'LEAVE' | 'PAYROLL' | 'PROGRAM';
export type ApprovalAction = 'APPROVED' | 'REJECTED';
export type ApprovalRules =
  | { type: 'all'; required?: number }
  | { type: 'anyN'; required: number }
  | { type: 'weighted'; threshold: number; weights: Record<string, number> };

export interface PendingPayrollApproval {
  id: string;
  grossSalary: string;
  basicSalary: string;
  netSalary: string;
  taxableIncome: string;
  incomeTax: string;
  totalAllowance: string;
  totalDeduction: string;
  employeePensionAmount: string;
  employerPensionAmount: string;
  employee: { name: string; grade: string | null } | null;
  approvalInstanceId: string | null;
  stageIds: string[];
}

export interface ActionItem {
  instanceId: string;
  stageId: string;
  action: ApprovalAction;
  comment?: string;
}

export interface Stage {
  id: string;
  workflowId: string;
  isParallel: boolean;
  order: number;
  approvalRules: { type: 'all' | 'anyN' | 'weighted'; required?: number; threshold?: number; weights?: Record<string, number> };
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalInstanceDetails {
  id: string;
  requestId: string;
  workflowId: string;
  activeStageIds: string[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  version: number;
  parentInstanceId: string | null;
  resubmissionReason: string | null;
  createdAt: string;
  updatedAt: string;
  workflow: {
    id: string;
    name: string;
    requestType: RequestType;
    stages: (Stage & { stageEmployees: { id: string; stageId: string; employeeId: string; weight: number | null }[] })[];
  };
  stageStatuses: {
    id: string;
    instanceId: string;
    stageId: string;
    approvedBy: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELEGATED';
    comments: string | null;
    approvedAt: string | null;
  }[];
  ApprovalComment: { id: string; instanceId: string; authorId: string; comment: string; createdAt: string }[];
  ApprovalAuditLog: AuditLog[];
}

export interface AuditLog {
  id: string;
  instanceId: string;
  action: string;
  performedBy: string;
  details: string | null;
  createdAt: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  requestType: RequestType;
}

export interface WorkflowWithStages {
  id: string;
  requestType: string;
  stages: (Stage & { stageEmployees: { employee: { name: string } }[] })[];
}

export interface CreateWorkflowInput {
  name: string;
  requestType: RequestType;
  isFullyParallel: boolean;
  departmentId?: string;
  stages: { order: number; isParallel: boolean; approvalRules: ApprovalRules; employeeIds: string[] }[];
}

export interface BankCustomerInfo {
  FULLNAME: string;
  ACCOUNTNUMBER: string;
  PHONENUMBER?: string;
  BIRTHDATE?: string;
  CATEGORY?: string;
}

export const approvalsApi = {
  queue: () => http.get<{ data: PendingPayrollApproval[] }>('/payroll/approvals/instance').then((r) => r.data.data ?? []),
  act: (item: ActionItem) => http.post('/approvals/action', item).then((r) => r.data),
  bulk: (items: ActionItem[]) => http.post<{ count: number }>('/approvals/approve', items).then((r) => r.data),
  instance: (id: string) => http.get<{ data: ApprovalInstanceDetails | null }>(`/approvals/instance/${id}`).then((r) => r.data.data),
  auditLog: (instanceId: string) => http.get<{ data: AuditLog[] }>('/approvals/audit-log', { params: { instanceId } }).then((r) => r.data.data ?? []),
  resubmit: (instanceId: string, reason?: string) => http.post(`/approvals/resubmit/${instanceId}`, reason ? { reason } : {}).then((r) => r.data),

  workflows: () => http.get<{ data: WorkflowSummary[] }>('/approvals/workflows').then((r) => r.data.data ?? []),
  stages: (workflowId: string) =>
    http.get<{ data: WorkflowWithStages[] }>(`/approvals/workflows/${workflowId}/stages`).then((r) => r.data.data?.[0] ?? null),
  createWorkflow: (input: CreateWorkflowInput) => http.post('/approvals/createWorkflow', input).then((r) => r.data),

  verifyAccount: (accountNumber: string) =>
    http
      .post<{ message: string; data?: { exists?: { customerInfo?: BankCustomerInfo } } }>('/accounts/verify', { accountNumber })
      .then((r) => r.data),
  setVerified: (payrollInfoId: string, isVerified: boolean) =>
    http.post(`/accounts/verification-status/${payrollInfoId}`, { isVerified }).then((r) => r.data),
};

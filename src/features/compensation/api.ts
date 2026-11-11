import { http } from '@/lib/http';

// ── Types (Phase 7) ─────────────────────────────────────────
export interface AllowanceDefinition {
  id: string;
  name: string;
  isTaxable: boolean;
  isExempted: boolean;
  exemptedAmount: string;
  startingAmount: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AllowanceDefinitionInput {
  name?: string;
  isTaxable?: boolean;
  isExempted?: boolean;
  exemptedAmount?: number | null;
  startingAmount?: number | null;
}

export interface DeductionDefinition {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

/** Grade allowance or grade deduction (amount is a Float number). */
export interface GradeItem {
  id: string;
  amount: number;
  gradeId: string;
  allowanceDefinitionId?: string;
  deductionDefinitionId?: string;
}

export type CatalogueType = 'AMOUNT' | 'PERCENT';

export interface ExtraDefinition {
  id: string;
  name: string;
  type: CatalogueType;
  isActive: boolean;
  createdAt: string;
}

export interface AdditionalPay {
  id: string;
  amount: string;
  additionalPayDefinitionId: string;
  employeeId: string;
  createdAt: string;
}

export interface AdditionalDeduction {
  id: string;
  amount: string;
  additionalDeductionDefinitionId: string;
  employeeId: string;
  createdAt: string;
}

export interface Grade {
  id: string;
  name: string;
  minSalary: number;
  maxSalary: number;
  externalId: string | null;
}

type Env<T> = { data: T };
const d = <T>(p: Promise<{ data: Env<T> }>) => p.then((r) => r.data.data);

export const ck = {
  allowanceDefs: ['compensation', 'allowance-definitions'] as const,
  deductionDefs: ['compensation', 'deduction-definitions'] as const,
  allowances: ['compensation', 'allowances'] as const,
  deductions: ['compensation', 'deductions'] as const,
  grades: ['compensation', 'grades'] as const,
  payDefs: ['compensation', 'additional-pay-definitions'] as const,
  dedDefs: ['compensation', 'additional-deduction-definitions'] as const,
  pay: ['compensation', 'additional-pay'] as const,
  ded: ['compensation', 'additional-deduction'] as const,
};

export const compensationApi = {
  grades: () => d(http.get<Env<Grade[]>>('/grades')),

  allowanceDefs: () => d(http.get<Env<AllowanceDefinition[]>>('/allowance-definitions')),
  createAllowanceDef: (b: AllowanceDefinitionInput) => d(http.post<Env<AllowanceDefinition>>('/allowance-definitions', b)),
  updateAllowanceDef: (id: string, b: AllowanceDefinitionInput) => d(http.post<Env<AllowanceDefinition>>(`/allowance-definitions/${id}`, b)),
  removeAllowanceDef: (id: string) => d(http.post<Env<AllowanceDefinition>>(`/allowance-definitions/remove/${id}`)),

  deductionDefs: () => d(http.get<Env<DeductionDefinition[]>>('/deduction-definitions')),
  createDeductionDef: (name: string) => d(http.post<Env<DeductionDefinition>>('/deduction-definitions', { name })),
  updateDeductionDef: (id: string, name: string) => d(http.post<Env<DeductionDefinition>>(`/deduction-definitions/${id}`, { name })),
  removeDeductionDef: (id: string) => d(http.post<Env<DeductionDefinition>>(`/deduction-definitions/remove/${id}`)),

  allowances: () => d(http.get<Env<GradeItem[]>>('/allowances')),
  createAllowance: (b: { amount: number; allowanceDefinitionId: string; gradeId: string }) => d(http.post<Env<GradeItem>>('/allowances', b)),
  updateAllowance: (id: string, amount: number) => d(http.post<Env<GradeItem>>(`/allowances/${id}`, { amount })),
  removeAllowance: (id: string) => d(http.post<Env<GradeItem>>(`/allowances/remove/${id}`)),

  deductions: () => d(http.get<Env<GradeItem[]>>('/deductions')),
  createDeduction: (b: { amount: number; deductionDefinitionId: string; gradeId: string }) => d(http.post<Env<GradeItem>>('/deductions', b)),
  updateDeduction: (id: string, amount: number) => d(http.post<Env<GradeItem>>(`/deductions/${id}`, { amount })),
  removeDeduction: (id: string) => d(http.post<Env<GradeItem>>(`/deductions/remove/${id}`)),

  payDefs: () => d(http.get<Env<ExtraDefinition[]>>('/additional-pay-definitions')),
  createPayDef: (b: { name: string; type: CatalogueType }) => d(http.post<Env<ExtraDefinition>>('/additional-pay-definitions', b)),
  updatePayDef: (id: string, b: { name?: string; type?: CatalogueType }) => d(http.post<Env<ExtraDefinition>>(`/additional-pay-definitions/${id}`, b)),
  removePayDef: (id: string) => d(http.post<Env<ExtraDefinition>>(`/additional-pay-definitions/delete/${id}`)),

  dedDefs: () => d(http.get<Env<ExtraDefinition[]>>('/additional-deduction-definitions')),
  createDedDef: (b: { name: string; type: CatalogueType }) => d(http.post<Env<ExtraDefinition>>('/additional-deduction-definitions', b)),
  updateDedDef: (id: string, b: { name?: string; type?: CatalogueType }) => d(http.post<Env<ExtraDefinition>>(`/additional-deduction-definitions/${id}`, b)),
  removeDedDef: (id: string) => d(http.post<Env<ExtraDefinition>>(`/additional-deduction-definitions/delete/${id}`)),

  pay: () => d(http.get<Env<AdditionalPay[]>>('/additional-pay')),
  createPay: (b: { amount: number; employeeId: string; additionalPayDefinitionId: string }) => d(http.post<Env<AdditionalPay>>('/additional-pay', b)),
  updatePay: (id: string, amount: number) => d(http.post<Env<AdditionalPay>>(`/additional-pay/${id}`, { amount })),
  removePay: (id: string) => d(http.post<Env<AdditionalPay>>(`/additional-pay/remove/${id}`)),

  ded: () => d(http.get<Env<AdditionalDeduction[]>>('/additional-deduction')),
  createDed: (b: { amount: number; employeeId: string; additionalDeductionDefinitionId: string }) => d(http.post<Env<AdditionalDeduction>>('/additional-deduction', b)),
  updateDed: (id: string, amount: number) => d(http.post<Env<AdditionalDeduction>>(`/additional-deduction/${id}`, { amount })),
  removeDed: (id: string) => d(http.post<Env<AdditionalDeduction>>(`/additional-deduction/remove/${id}`)),
};

/** Taxable part of an allowance under the exemption rule (same for MANUAL and HR_SYNC). */
export function taxablePart(amount: number, def: { isExempted: boolean; exemptedAmount: number; startingAmount: number | null }) {
  if (!def.isExempted) return amount;
  if (def.startingAmount !== null && amount > def.startingAmount) return Math.max(0, amount - def.exemptedAmount);
  return amount;
}

import { http } from '@/lib/http';

// Phase 5 rule types. Rates and incomes are JSON numbers (Float), rates in percent.

export type TaxSlabType = 'INCOME_TAX' | 'EXEMPTION';

export interface TaxSlab {
  id: string;
  name: string | null;
  description: string | null;
  type: TaxSlabType;
  rate: number | null;
  deductible: number | null;
  incomeTaxPayable: number | null;
  minIncome: number;
  maxIncome: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Row from GET /taxslab: TaxSlab id, no name/deductible. */
export interface TaxSlabListItem {
  id: string;
  minIncome: number;
  maxIncome: number;
  description: string | null;
  type: TaxSlabType;
  rate: number | null;
}

export interface TaxSlabInput {
  name?: string;
  description?: string;
  type?: TaxSlabType;
  rate?: number;
  deductible?: number;
  minIncome: number;
  maxIncome: number;
}

/** Active company rule from GET /pension or GET /provident-fund. `id` is the company rule id. */
export interface ContributionRule {
  id: string;
  employeeContribution: number;
  employerContribution: number;
}

export interface ContributionDefault {
  id: string;
  employeeContribution: number;
  employerContribution: number;
  isDefault: boolean;
}

export interface ContributionInput {
  employeeContribution: number;
  employerContribution: number;
}

const d = <T>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

export const rulesKeys = {
  tax: ['rules', 'tax'] as const,
  taxOne: (id: string) => ['rules', 'tax', id] as const,
  taxDefault: ['rules', 'tax', 'default'] as const,
  pension: ['rules', 'pension'] as const,
  pensionDefault: ['rules', 'pension', 'default'] as const,
  pf: ['rules', 'pf'] as const,
  pfDefault: ['rules', 'pf', 'default'] as const,
};

export const taxApi = {
  list: () => d<TaxSlabListItem[]>(http.get('/taxslab')),
  defaults: () => d<TaxSlab[]>(http.get('/taxslab/default')),
  get: (id: string) => d<TaxSlab>(http.get(`/taxslab/${id}`)),
  add: (input: TaxSlabInput) => d<unknown>(http.post('/taxslab', input)),
  reset: () => d<TaxSlab[]>(http.post('/taxslab/tax/reset')),
};

function contributionApi(base: string, resetPath: string) {
  return {
    list: () => d<ContributionRule[]>(http.get(base)),
    defaults: () => d<ContributionDefault[]>(http.get(`${base}/default`)),
    add: (input: ContributionInput) => d<unknown>(http.post(base, input)),
    update: (ruleId: string, input: ContributionInput) => d<unknown>(http.post(`${base}/rules/update/${ruleId}`, input)),
    remove: (ruleId: string) => d<unknown>(http.post(`${base}/${ruleId}`)),
    reset: () => d<ContributionDefault[]>(http.post(`${base}${resetPath}`)),
    assignDefault: () => d<ContributionDefault[]>(http.post(`${base}/assign/default`)),
  };
}

export const pensionApi = contributionApi('/pension', '/rules/reset');
export const pfApi = contributionApi('/provident-fund', '/restore/reset');

/** tax = taxable × rate/100 − deductible, never below 0. Brackets are inclusive on both ends. */
export function computeTax(taxable: number, brackets: { minIncome: number; maxIncome: number; rate: number | null; deductible: number | null }[]) {
  const b = brackets.find((x) => x.minIncome <= taxable && taxable <= x.maxIncome);
  if (!b) return { tax: 0, bracket: undefined };
  return { tax: Math.max(0, (taxable * (b.rate ?? 0)) / 100 - (b.deductible ?? 0)), bracket: b };
}

/** Overlaps and gaps between consecutive brackets (sorted by minIncome). Shared boundaries are fine. */
export function bracketIssues(sorted: { minIncome: number; maxIncome: number }[]) {
  const issues: { kind: 'overlap' | 'gap'; from: number; to: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.minIncome < prev.maxIncome) issues.push({ kind: 'overlap', from: cur.minIncome, to: Math.min(prev.maxIncome, cur.maxIncome) });
    else if (cur.minIncome > prev.maxIncome) issues.push({ kind: 'gap', from: prev.maxIncome, to: cur.minIncome });
  }
  return issues;
}

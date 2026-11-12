import { simulationApi, employerCost, type Amounts, type SimEmployeeRow, type Simulation } from './api';
import { BASIS_META } from './basis';

export type ExportShape = 'summary' | 'monthly';

const AMOUNT_COLUMNS: [keyof Amounts, string][] = [
  ['basicSalary', 'Basic salary'],
  ['totalAllowance', 'Allowances'],
  ['grossSalary', 'Gross salary'],
  ['taxableIncome', 'Taxable income'],
  ['incomeTax', 'Income tax'],
  ['employeePensionAmount', 'Employee pension'],
  ['employerPensionAmount', 'Employer pension'],
  ['employeeProvidentFundAmount', 'Employee PF'],
  ['employerProvidentFundAmount', 'Employer PF'],
  ['totalDeduction', 'Total deductions'],
  ['netSalary', 'Net salary'],
];

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : typeof v === 'number' ? v.toFixed(2) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const amounts = (a: Amounts) => [...AMOUNT_COLUMNS.map(([k]) => a[k]), employerCost(a)];

/** Every employee row of a finished simulation, 200 at a time. */
async function fetchAllRows(id: string, onProgress?: (done: number, total: number) => void) {
  const rows: SimEmployeeRow[] = [];
  for (let page = 1; ; page++) {
    const res = await simulationApi.employees(id, { page, limit: 200 });
    rows.push(...res.rows);
    onProgress?.(rows.length, res.total);
    if (page >= res.totalPages || res.rows.length === 0) return rows;
  }
}

/**
 * summary: one row per employee, net pay per month plus totals.
 * monthly: one row per employee per month with every amount.
 */
export async function exportSimulationCsv(sim: Simulation, shape: ExportShape, onProgress?: (done: number, total: number) => void) {
  const months = sim.result?.months ?? [];
  const rows = await fetchAllRows(sim.id, onProgress);
  const amountHeads = [...AMOUNT_COLUMNS.map(([, h]) => h), 'Employer cost'];
  const lines: unknown[][] = [];

  if (shape === 'summary') {
    lines.push(['Employee', 'Employee ID', 'Source', ...months.map((m) => `${m.period} net`), ...amountHeads.map((h) => `Total ${h.toLowerCase()}`), 'Warnings']);
    for (const r of rows) {
      lines.push([r.name, r.employeeIdNumber, r.source, ...months.map((_, i) => r.months[i]?.netSalary ?? 0), ...amounts(r.totals), r.warnings.join('; ')]);
    }
    const t = sim.result?.totals;
    if (t) lines.push(['TOTAL', '', '', ...months.map((m) => m.totals.netSalary), ...amounts(t), '']);
  } else {
    lines.push(['Employee', 'Employee ID', 'Source', 'Period', 'Basis', ...amountHeads, 'Arrears / recovery']);
    for (const r of rows) {
      for (const m of r.months) {
        lines.push([r.name, r.employeeIdNumber, r.source, m.period, BASIS_META[m.basis]?.label ?? m.basis, ...amounts(m), m.arrears ?? 0]);
      }
    }
  }

  // BOM so Excel opens it as UTF-8 (Amharic names etc.).
  const csv = '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n');
  const { fromPeriod, toPeriod } = sim.params;
  const name = `payroll-simulation-${fromPeriod}${toPeriod !== fromPeriod ? `_${toPeriod}` : ''}${shape === 'monthly' ? '-by-month' : ''}.csv`;
  const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return { name, count: rows.length };
}

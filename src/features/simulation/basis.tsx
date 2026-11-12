import { cn } from '@/lib/cn';
import type { MonthBasis } from './api';

export const BASIS_ORDER: MonthBasis[] = ['ACTUAL', 'HR_DATA', 'PROJECTED', 'GRADE_SETUP', 'NOT_EMPLOYED', 'NO_DATA'];

export const BASIS_META: Record<MonthBasis, { label: string; help: string; dot: string; chip: string }> = {
  ACTUAL: {
    label: 'Actual',
    help: 'Payroll was already run for this month: the saved amounts.',
    dot: 'bg-primary-800',
    chip: 'bg-primary-100 text-primary-900 ring-primary-300',
  },
  HR_DATA: {
    label: 'HR data',
    help: 'Calculated from the HR data synced for this month.',
    dot: 'bg-primary-400',
    chip: 'bg-primary-50 text-primary-800 ring-primary-200',
  },
  PROJECTED: {
    label: 'Projected',
    help: "No HR data yet: the employee's current salary, allowances and placement for the full month, with no overtime and no unpaid leave.",
    dot: 'bg-accent-500',
    chip: 'bg-accent-50 text-accent-800 ring-accent-200',
  },
  GRADE_SETUP: {
    label: 'Grade setup',
    help: 'Manual employee: current basic salary plus the grade allowances and deductions.',
    dot: 'bg-accent-300',
    chip: 'bg-surface text-accent-800 ring-accent-200',
  },
  NOT_EMPLOYED: {
    label: 'Not employed',
    help: 'The month ends before the hire date, so it is zero.',
    dot: 'bg-slate-300',
    chip: 'bg-slate-100 text-slate-600 ring-slate-200',
  },
  NO_DATA: {
    label: 'No data',
    help: 'Nothing to calculate from, so it is zero. See the warnings.',
    dot: 'bg-slate-500',
    chip: 'bg-surface text-slate-700 ring-slate-300',
  },
};

export function BasisDot({ basis, className }: { basis: MonthBasis; className?: string }) {
  return <span title={BASIS_META[basis].label} className={cn('inline-block size-2 shrink-0 rounded-full', BASIS_META[basis].dot, className)} />;
}

export function BasisChip({ basis, count }: { basis: MonthBasis; count?: number }) {
  const m = BASIS_META[basis];
  return (
    <span
      title={m.help}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset', m.chip)}
    >
      <span className={cn('size-1.5 rounded-full', m.dot)} />
      {m.label}
      {count !== undefined && <span className="num opacity-70">{count}</span>}
    </span>
  );
}

/** How a month's employees split across bases: one slim stacked bar, plus labels when it's mixed. */
export function BasisMix({ basis }: { basis: Partial<Record<MonthBasis, number>> }) {
  const parts = BASIS_ORDER.filter((b) => basis[b]).map((b) => ({ b, n: basis[b]! }));
  const sum = parts.reduce((s, p) => s + p.n, 0) || 1;
  if (parts.length === 1) return <BasisChip basis={parts[0]!.b} />;
  return (
    <div className="w-44 space-y-1.5" title={parts.map((p) => `${BASIS_META[p.b].label}: ${p.n.toLocaleString()}`).join('\n')}>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {parts.map((p) => (
          <span key={p.b} className={BASIS_META[p.b].dot} style={{ width: `${(p.n / sum) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
        {parts.map((p) => (
          <span key={p.b} className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className={cn('size-1.5 rounded-full', BASIS_META[p.b].dot)} />
            {BASIS_META[p.b].label}
            <span className="num text-slate-400">{p.n.toLocaleString()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Legend explaining what each basis means; `only` limits it to the bases that actually appear. */
export function BasisLegend({ only }: { only?: Set<MonthBasis> }) {
  const items = BASIS_ORDER.filter((b) => !only || only.has(b));
  return (
    <ul className="grid gap-x-6 gap-y-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((b) => (
        <li key={b} className="flex gap-2">
          <BasisDot basis={b} className="mt-1" />
          <span>
            <span className="font-medium text-slate-800">{BASIS_META[b].label}:</span> {BASIS_META[b].help}
          </span>
        </li>
      ))}
    </ul>
  );
}

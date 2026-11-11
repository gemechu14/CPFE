import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight, Check, Wallet } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatInt, formatMoney, toNumber } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { DefinitionStateBadge } from '@/components/domain';
import type { DefinitionState } from '@/types/api';
import { reviewApi, type MonthList, type Payroll9 } from '../review/api';

const LISTS: MonthList[] = ['published', 'approved', 'paid'];

interface Metrics {
  run: number;
  people: number;
  notRun: number;
  gross: number;
  net: number;
  tax: number;
  pension: number;
  other: number;
  employerCost: number;
  approved: number;
  approvedNet: number;
  paid: number;
  paidNet: number;
}

/** This period's payroll at a glance: the money on the left, the run → approve → pay flow on the right. */
export function MonthSummaryCard({
  periodName,
  state,
  notRun,
  loadingPeriod,
}: {
  periodName?: string;
  state?: DefinitionState;
  notRun: number;
  loadingPeriod: boolean;
}) {
  // Same cache keys as the "This month" page, so both stay in sync.
  const lists = useQueries({
    queries: LISTS.map((w) => ({ queryKey: ['payroll', 'month', w], queryFn: () => reviewApi.list(w) })),
  });
  const loading = loadingPeriod || lists.some((l) => l.isLoading);

  const m = useMemo<Metrics>(() => {
    const seen = new Map<string, Payroll9>();
    lists.forEach((l) => l.data?.forEach((r) => seen.set(r.id, r)));
    const rows = [...seen.values()];
    let gross = 0, net = 0, tax = 0, pension = 0, erCost = 0;
    let approved = 0, approvedNet = 0, paid = 0, paidNet = 0;
    for (const r of rows) {
      const n = toNumber(r.netSalary);
      gross += toNumber(r.grossSalary);
      net += n;
      tax += toNumber(r.incomeTax);
      pension += toNumber(r.employeePensionAmount) + toNumber(r.employeeProvidentFundAmount);
      erCost += toNumber(r.employerPensionAmount) + toNumber(r.employerProvidentFundAmount);
      if (r.status === 'APPROVED' || r.paymentStatus === 'PAID') {
        approved += 1;
        approvedNet += n;
      }
      if (r.paymentStatus === 'PAID') {
        paid += 1;
        paidNet += n;
      }
    }
    return {
      run: rows.length,
      people: rows.length + notRun,
      notRun,
      gross,
      net,
      tax,
      pension,
      other: Math.max(0, gross - net - tax - pension),
      employerCost: gross + erCost,
      approved,
      approvedNet,
      paid,
      paidNet,
    };
  }, [lists, notRun]);

  const empty = <EmptyState icon={<Wallet className="size-6" />} title="No payroll for this period yet" description="Run payroll to see totals here." className="py-10" />;

  return (
    <>
      <Card>
        <CardHeader title="Net payroll" description={periodName ? `${periodName} totals` : 'Current period totals'} />
        {loading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : m.people === 0 ? (
          empty
        ) : (
          <MoneyPanel m={m} />
        )}
      </Card>

      <Card>
        <CardHeader
          title="Payroll flow"
          description={`${formatInt(m.paid)} of ${formatInt(m.people)} employees paid`}
          actions={
            <>
              {state && <DefinitionStateBadge state={state} />}
              <Link to="/payroll/month" className="text-sm font-medium text-primary-700 hover:underline">Details</Link>
            </>
          }
        />
        {loading ? (
          <div className="space-y-4 p-5">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : m.people === 0 ? (
          empty
        ) : (
          <FlowPanel m={m} />
        )}
      </Card>
    </>
  );
}

/* ── Left: the money ─────────────────────────────────────────── */

const SPLIT = [
  { key: 'net', label: 'Net pay', stroke: 'stroke-primary-500', dot: 'bg-primary-500' },
  { key: 'tax', label: 'Income tax', stroke: 'stroke-accent-500', dot: 'bg-accent-500' },
  { key: 'pension', label: 'Pension & PF', stroke: 'stroke-violet-500', dot: 'bg-violet-500' },
  { key: 'other', label: 'Other deductions', stroke: 'stroke-slate-400', dot: 'bg-slate-400' },
] as const;

function MoneyPanel({ m }: { m: Metrics }) {
  const parts = SPLIT.map((s) => ({ ...s, value: m[s.key] })).filter((p) => p.value > 0);
  return (
    <div className="p-5">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Net payroll</div>
      <div className="num mt-1 text-3xl font-semibold tracking-tight text-slate-900">
        {formatMoney(m.net)} <span className="text-base font-medium text-slate-400">ETB</span>
      </div>
      <div className="mt-0.5 text-sm text-slate-500">
        {formatInt(m.run)} employee{m.run === 1 ? '' : 's'} run so far
      </div>

      {m.gross > 0 && (
        <div className="mt-5 flex items-center gap-5">
          <Donut parts={parts} total={m.gross} />
          <ul className="min-w-0 flex-1 space-y-2">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-2 text-sm">
                <span className={cn('size-2 shrink-0 rounded-full', p.dot)} />
                <span className="truncate text-slate-600">{p.label}</span>
                <span className="num ml-auto font-medium text-slate-900">{Math.round((p.value / m.gross) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="mt-5 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Gross pay</dt>
          <dd className="num font-medium text-slate-900">{formatMoney(m.gross)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Income tax</dt>
          <dd className="num font-medium text-slate-900">{formatMoney(m.tax)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Employer cost</dt>
          <dd className="num font-semibold text-slate-900">{formatMoney(m.employerCost)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Donut({ parts, total }: { parts: { key: string; value: number; stroke: string; label: string }[]; total: number }) {
  // Circumference 100, so dash lengths are percentages.
  const R = 15.9155;
  let offset = 25; // start at 12 o'clock
  return (
    <svg viewBox="0 0 36 36" className="size-28 shrink-0" role="img" aria-label="Gross pay split">
      <circle cx="18" cy="18" r={R} fill="none" strokeWidth="4" className="stroke-slate-100" />
      {parts.map((p) => {
        const pct = (p.value / total) * 100;
        const len = Math.max(0, pct - 0.6);
        const seg = (
          <circle
            key={p.key}
            cx="18"
            cy="18"
            r={R}
            fill="none"
            strokeWidth="4"
            className={cn(p.stroke, 'transition-all duration-700')}
            strokeDasharray={`${len} ${100 - len}`}
            strokeDashoffset={offset}
          >
            <title>{`${p.label}: ${formatMoney(p.value)}`}</title>
          </circle>
        );
        offset -= pct;
        return seg;
      })}
      <text x="18" y="17" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 3.2 }}>Gross</text>
      <text x="18" y="21.5" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 4.2, fontWeight: 600 }}>
        {compact(total)}
      </text>
    </svg>
  );
}

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return formatInt(n);
}

/* ── Right: run → approve → pay ──────────────────────────────── */

function FlowPanel({ m }: { m: Metrics }) {
  const steps = [
    {
      title: 'Run payroll',
      done: m.run,
      total: m.people,
      detail: m.notRun > 0 ? `${formatInt(m.notRun)} employee${m.notRun === 1 ? '' : 's'} not run yet` : 'Everyone has been run',
      amount: m.net,
      cta: { to: '/payroll/run', label: m.notRun > 0 ? `Run remaining ${formatInt(m.notRun)}` : 'Open' },
    },
    {
      title: 'Approve',
      done: m.approved,
      total: m.run,
      detail: m.run - m.approved > 0 ? `${formatInt(m.run - m.approved)} awaiting approval` : m.run ? 'All approved' : 'Nothing to approve yet',
      amount: m.approvedNet,
      cta: { to: '/payroll/approvals', label: 'Review approvals' },
    },
    {
      title: 'Pay',
      done: m.paid,
      total: m.run,
      detail: m.approved - m.paid > 0 ? `${formatInt(m.approved - m.paid)} ready to pay` : m.paid && m.paid === m.run ? 'All paid' : 'Waiting for approval',
      amount: m.paidNet,
      cta: { to: '/payments', label: 'Pay salaries' },
    },
  ];
  const isComplete = (s: (typeof steps)[number]) => s.total > 0 && s.done >= s.total;
  const currentIdx = steps.findIndex((s) => !isComplete(s));

  return (
    <div className="p-5">
      <ol>
        {steps.map((s, i) => {
          const complete = isComplete(s);
          const current = i === currentIdx;
          const pct = s.total > 0 ? Math.min(100, (s.done / s.total) * 100) : 0;
          return (
            <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
              {i < steps.length - 1 && (
                <span className={cn('absolute top-8 bottom-1 left-[15px] w-px', complete ? 'bg-emerald-300' : 'bg-slate-200')} aria-hidden />
              )}
              <span
                className={cn(
                  'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  complete && 'bg-emerald-500 text-white',
                  current && 'bg-primary-600 text-white ring-4 ring-primary-100',
                  !complete && !current && 'border border-slate-200 bg-surface text-slate-400',
                )}
              >
                {complete ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className={cn('text-sm font-semibold', current || complete ? 'text-slate-900' : 'text-slate-500')}>{s.title}</span>
                  <span className="num text-sm text-slate-500">
                    <span className="font-semibold text-slate-900">{formatInt(s.done)}</span> / {formatInt(s.total)}
                    {s.amount > 0 && <span className="ml-2 text-slate-400">· {formatMoney(s.amount)}</span>}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn('h-full rounded-full transition-all duration-700', complete ? 'bg-emerald-500' : 'bg-primary-500')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">{s.detail}</span>
                  {current && (
                    <Link to={s.cta.to} className="group inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800">
                      {s.cta.label}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

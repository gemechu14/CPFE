import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatMoney, formatPeriod } from '@/lib/format';
import { Alert, ErrorState, Spinner } from '@/components/ui/Feedback';
import { Drawer } from '@/components/ui/Overlay';
import { SourceBadge } from '@/components/domain';
import { Line, Section } from '../payroll/PayslipDrawer';
import { employerCost, simKeys, simulationApi, type SimEmployeeMonth, type SimEmployeeRow, type SimMonthSummary } from './api';
import { BASIS_META, BasisChip } from './basis';

/** One employee's simulated months. Opens instantly from the table row, then loads the named earnings/deductions (10.4). */
export function SimEmployeeDrawer({
  simulationId,
  row,
  months,
  onClose,
}: {
  simulationId: string;
  row: SimEmployeeRow | null;
  months: SimMonthSummary[];
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: simKeys.employee(simulationId, row?.employeeId ?? ''),
    queryFn: () => simulationApi.employee(simulationId, row!.employeeId),
    enabled: !!row,
    staleTime: Infinity, // the stored simulation never changes
  });

  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!row) return;
    // Short simulations open every month; longer ones open the first month with pay.
    const paid = row.months.filter((m) => m.netSalary !== 0 || m.grossSalary !== 0);
    setOpen(new Set(row.months.length <= 3 ? row.months.map((m) => m.period) : paid.slice(0, 1).map((m) => m.period)));
  }, [row]);

  if (!row) return null;
  const data = detail.data ?? row;
  const nameOf = new Map(months.map((m) => [m.period, m.payrollDefinitionId ? m.payrollName : formatPeriod(m.period)]));
  const t = data.totals;

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      title={data.name}
      description={
        <span className="flex flex-wrap items-center gap-2">
          {data.employeeIdNumber && <span className="font-mono text-xs">{data.employeeIdNumber}</span>}
          <SourceBadge source={data.source} />
          <span>
            · {months.length === 1 ? formatPeriod(months[0]!.period) : `${formatPeriod(months[0]?.period)} – ${formatPeriod(months.at(-1)?.period)}`} simulation
          </span>
        </span>
      }
    >
      <div className="space-y-6">
        <Alert tone="info">What-if only. Nothing here is saved, and no approvals or arrears are touched.</Alert>

        {data.warnings.length > 0 && (
          <Alert tone="warning" title="Warnings">
            <ul className="list-disc space-y-0.5 pl-4">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Gross" value={t.grossSalary} />
          <Mini label="Income tax" value={t.incomeTax} />
          <Mini label="Net pay" value={t.netSalary} strong />
          <Mini label="Employer cost" value={employerCost(t)} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Month by month</h3>
            {detail.isFetching && (
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <Spinner className="size-3.5" /> Loading line items…
              </span>
            )}
            {data.months.length > 1 && (
              <button
                type="button"
                className="text-xs font-medium text-primary-700 hover:underline"
                onClick={() => setOpen((o) => (o.size === data.months.length ? new Set() : new Set(data.months.map((m) => m.period))))}
              >
                {open.size === data.months.length ? 'Collapse all' : 'Expand all'}
              </button>
            )}
          </div>
          {detail.error && <ErrorState error={detail.error} onRetry={() => detail.refetch()} />}
          <div className="space-y-2">
            {data.months.map((m) => (
              <MonthCard
                key={m.period}
                month={m}
                name={nameOf.get(m.period) ?? formatPeriod(m.period)}
                linesLoaded={!!detail.data}
                open={open.has(m.period)}
                onToggle={() =>
                  setOpen((o) => {
                    const n = new Set(o);
                    if (n.has(m.period)) n.delete(m.period);
                    else n.add(m.period);
                    return n;
                  })
                }
              />
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}

function Mini({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn('rounded-lg px-3 py-2.5', strong ? 'bg-brand-800 text-white' : 'bg-slate-50')}>
      <div className={cn('text-xs', strong ? 'text-white/75' : 'text-slate-500')}>{label}</div>
      <div className={cn('num mt-0.5 truncate text-sm font-semibold', !strong && 'text-slate-900')}>{formatMoney(value)}</div>
    </div>
  );
}

function MonthCard({
  month: m,
  name,
  linesLoaded,
  open,
  onToggle,
}: {
  month: SimEmployeeMonth;
  name: string;
  linesLoaded: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const empty = m.basis === 'NOT_EMPLOYED' || m.basis === 'NO_DATA';
  const arrears = m.arrears ?? 0;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50">
        <ChevronDown className={cn('size-4 shrink-0 text-slate-400 transition-transform', !open && '-rotate-90')} />
        <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{name}</span>
        {arrears !== 0 && (
          <span className={cn('num hidden text-xs sm:inline', arrears > 0 ? 'text-primary-700' : 'text-accent-700')}>
            {arrears > 0 ? 'arrears' : 'recovery'} {formatMoney(arrears, { sign: true })}
          </span>
        )}
        <BasisChip basis={m.basis} />
        <span className={cn('num w-28 text-right font-semibold', empty ? 'text-slate-400' : m.netSalary <= 0 ? 'text-accent-700' : 'text-slate-900')}>
          {formatMoney(m.netSalary)}
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/40 px-4 py-3">
          <p className="text-xs text-slate-500">{BASIS_META[m.basis].help}</p>
          {empty ? null : m.lines ? (
            <>
              <Section title="Earnings">
                {m.lines.earnings.map((l, i) => (
                  <Line key={`${l.name}-${i}`} label={l.name} value={l.amount} />
                ))}
                <Line label="Gross salary" value={m.grossSalary} strong />
              </Section>
              <Section title="Deductions">
                {m.lines.deductions.map((l, i) => (
                  <Line key={`${l.name}-${i}`} label={l.name} value={-l.amount} />
                ))}
                <Line label="Total deductions" value={-m.totalDeduction} strong />
              </Section>
            </>
          ) : (
            <>
              {linesLoaded && (
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <Info className="size-3.5" /> Itemised lines aren&apos;t available for this month (it was run before line items existed).
                </p>
              )}
              <Section title="Earnings">
                <Line label="Basic salary" value={m.basicSalary} />
                <Line label="Allowances" value={m.totalAllowance} />
                {arrears !== 0 && <Line label={arrears > 0 ? 'Arrears' : 'Recovery'} value={arrears} />}
                <Line label="Gross salary" value={m.grossSalary} strong />
              </Section>
              <Section title="Deductions">
                <Line label="Income tax" value={-m.incomeTax} />
                <Line label="Employee pension" value={-m.employeePensionAmount} />
                {m.employeeProvidentFundAmount !== 0 && <Line label="Employee provident fund" value={-m.employeeProvidentFundAmount} />}
                <Line label="Total deductions" value={-m.totalDeduction} strong />
              </Section>
            </>
          )}
          {!empty && (
            <>
              <div className="flex items-center justify-between rounded-lg bg-brand-800 px-4 py-2.5 text-white">
                <span className="text-sm font-medium">Net pay</span>
                <span className="num text-base font-semibold">{formatMoney(m.netSalary, { currency: true })}</span>
              </div>
              <Section title="Employer cost">
                <Line label="Employer pension" value={m.employerPensionAmount} muted />
                {m.employerProvidentFundAmount !== 0 && <Line label="Employer provident fund" value={m.employerProvidentFundAmount} muted />}
                <Line label="Total employer cost" value={employerCost(m)} muted />
              </Section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

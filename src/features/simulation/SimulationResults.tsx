import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, ChevronLeft, ChevronRight, Download, Search, TriangleAlert, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { errorMessage, toApiError } from '@/lib/http';
import { formatDate, formatInt, formatMoney, formatPeriod } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { employerCost, simKeys, simulationApi, type Amounts, type MonthBasis, type SimEmployeeRow, type Simulation } from './api';
import { BasisDot, BasisLegend, BasisMix } from './basis';
import { exportSimulationCsv, type ExportShape } from './export';
import { SimEmployeeDrawer } from './SimEmployeeDrawer';

type Metric = 'netSalary' | 'grossSalary' | 'incomeTax' | 'employerCost';
const METRICS: { value: Metric; label: string }[] = [
  { value: 'netSalary', label: 'Net' },
  { value: 'grossSalary', label: 'Gross' },
  { value: 'incomeTax', label: 'Tax' },
  { value: 'employerCost', label: 'Employer cost' },
];
const metricOf = (a: Amounts, m: Metric) => (m === 'employerCost' ? employerCost(a) : a[m]);
const PAGE_SIZE = 50;

export function SimulationResults({ sim }: { sim: Simulation & { result: NonNullable<Simulation['result']> } }) {
  const { result } = sim;
  const t = result.totals;
  const hasPf = t.employeeProvidentFundAmount !== 0 || t.employerProvidentFundAmount !== 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Total label="Gross pay" value={t.grossSalary} hint={`Basic ${formatMoney(t.basicSalary)}`} />
        <Total label="Income tax" value={t.incomeTax} hint={`Taxable ${formatMoney(t.taxableIncome)}`} />
        <Total
          label="Pension"
          value={t.employeePensionAmount + t.employerPensionAmount}
          hint={`Employee ${formatMoney(t.employeePensionAmount)} · Employer ${formatMoney(t.employerPensionAmount)}`}
        />
        <Total
          label="Provident fund"
          value={t.employeeProvidentFundAmount + t.employerProvidentFundAmount}
          hint={hasPf ? `Employee ${formatMoney(t.employeeProvidentFundAmount)} · Employer ${formatMoney(t.employerProvidentFundAmount)}` : 'Not used'}
        />
        <Total label="Net pay" value={t.netSalary} hint={`Deductions ${formatMoney(t.totalDeduction)}`} strong />
        <Total label="Employer cost" value={employerCost(t)} hint="Gross + employer pension + PF" />
      </div>

      {result.skipped.length > 0 && <SkippedNotice skipped={result.skipped} />}

      <MonthsTable sim={sim} hasPf={hasPf} />
      <EmployeesTable sim={sim} />
    </div>
  );
}

function Total({ label, value, hint, strong }: { label: string; value: number; hint?: string; strong?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-xl border p-4 shadow-card', strong ? 'border-brand-800 bg-brand-800 text-white' : 'border-slate-200 bg-surface')}>
      <div className={cn('text-xs font-medium', strong ? 'text-white/75' : 'text-slate-500')}>{label}</div>
      <div className={cn('num mt-1 truncate text-lg font-semibold tracking-tight', !strong && 'text-slate-900')} title={formatMoney(value, { currency: true })}>
        {formatMoney(value)}
      </div>
      {hint && <div className={cn('mt-0.5 truncate text-[11px]', strong ? 'text-white/70' : 'text-slate-500')} title={hint}>{hint}</div>}
    </div>
  );
}

function SkippedNotice({ skipped }: { skipped: { employeeId: string; name: string; reason: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Alert
      tone="warning"
      title={`${formatInt(skipped.length)} selected employee${skipped.length === 1 ? ' was' : 's were'} not simulated`}
      action={
        <button type="button" className="text-xs font-medium underline" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'}
        </button>
      }
    >
      {open && (
        <ul className="mt-1 space-y-0.5">
          {skipped.map((s) => (
            <li key={s.employeeId}>
              <span className="font-medium">{s.name}</span>: {s.reason}
            </li>
          ))}
        </ul>
      )}
    </Alert>
  );
}

function MonthsTable({ sim, hasPf }: { sim: Simulation & { result: NonNullable<Simulation['result']> }; hasPf: boolean }) {
  const { months, totals } = sim.result;
  const present = useMemo(() => {
    const s = new Set<MonthBasis>();
    months.forEach((m) => Object.entries(m.basis).forEach(([b, n]) => n && s.add(b as MonthBasis)));
    return s;
  }, [months]);
  const [legend, setLegend] = useState(false);
  const calendarOnly = months.filter((m) => !m.payrollDefinitionId).length;
  const maxNet = Math.max(1, ...months.map((m) => m.totals.netSalary));
  const num = 'num text-right whitespace-nowrap';

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Month by month"
        description={
          calendarOnly === 0
            ? 'Company totals for each simulated month.'
            : calendarOnly === months.length
              ? 'Company totals for each simulated month. No payroll periods exist for these months yet, so calendar months are used.'
              : `Company totals for each simulated month. ${calendarOnly} month${calendarOnly === 1 ? ' has' : 's have'} no payroll period yet and use${calendarOnly === 1 ? 's' : ''} the calendar month.`
        }
        actions={
          <button type="button" onClick={() => setLegend((l) => !l)} className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline" aria-expanded={legend}>
            How is each month calculated? <ChevronDown className={cn('size-3.5 transition-transform', legend && 'rotate-180')} />
          </button>
        }
      />
      {legend && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3">
          <BasisLegend only={present.size ? present : undefined} />
        </div>
      )}
      <Table>
        <THead>
          <tr>
            <TH>Month</TH>
            <TH>Calculated from</TH>
            <TH align="right">Employees</TH>
            <TH align="right">Gross</TH>
            <TH align="right">Income tax</TH>
            <TH align="right">Pension</TH>
            {hasPf && <TH align="right">PF</TH>}
            <TH align="right">Deductions</TH>
            <TH align="right" className="bg-primary-50/70 text-primary-800">Net pay</TH>
            <TH align="right">Employer cost</TH>
          </tr>
        </THead>
        <TBody>
          {months.map((m) => (
            <tr key={m.period} className="transition-colors hover:bg-slate-50/70">
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 flex-col items-center justify-center rounded-lg bg-primary-50 leading-none text-primary-800">
                    <span className="text-[10px] font-semibold uppercase">{formatPeriod(m.period).split(' ')[0]}</span>
                    <span className="num mt-0.5 text-[10px] text-primary-700">{m.period.slice(2, 4)}</span>
                  </span>
                  <div>
                    <div className="font-medium text-slate-900">{m.payrollDefinitionId ? m.payrollName : formatPeriod(m.period)}</div>
                    <div className="text-xs text-slate-500">
                      {formatDate(m.startDate, { day: 'numeric', month: 'short' })} – {formatDate(m.endDate, { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <BasisMix basis={m.basis} />
              </td>
              <td className={cn(num, 'px-4 py-3 text-slate-500')}>{formatInt(m.employees)}</td>
              <td className={cn(num, 'px-4 py-3 text-slate-700')}>{formatMoney(m.totals.grossSalary)}</td>
              <td className={cn(num, 'px-4 py-3 text-slate-700')}>{formatMoney(m.totals.incomeTax)}</td>
              <td className={cn(num, 'px-4 py-3 text-slate-700')}>{formatMoney(m.totals.employeePensionAmount)}</td>
              {hasPf && <td className={cn(num, 'px-4 py-3 text-slate-700')}>{formatMoney(m.totals.employeeProvidentFundAmount)}</td>}
              <td className={cn(num, 'px-4 py-3 text-slate-700')}>{formatMoney(m.totals.totalDeduction)}</td>
              <td className={cn(num, 'bg-primary-50/40 px-4 py-2.5')}>
                <div className="font-semibold text-primary-900">{formatMoney(m.totals.netSalary)}</div>
                <div className="mt-1 ml-auto h-1 w-24 overflow-hidden rounded-full bg-primary-100" aria-hidden>
                  <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.max(0, (m.totals.netSalary / maxNet) * 100)}%` }} />
                </div>
              </td>
              <td className={cn(num, 'px-4 py-3 text-slate-700')}>{formatMoney(employerCost(m.totals))}</td>
            </tr>
          ))}
        </TBody>
        {months.length > 1 && (
          <tfoot className="border-t border-slate-200 bg-slate-50">
            <tr className="font-semibold text-slate-900">
              <td className="px-4 py-3.5">
                Total <span className="font-normal text-slate-500">· {months.length} months</span>
              </td>
              <td />
              <td className={cn(num, 'px-4 py-3.5 font-normal text-slate-500')} title="Distinct employees simulated">{formatInt(sim.result.employees.total)}</td>
              <td className={cn(num, 'px-4 py-3.5')}>{formatMoney(totals.grossSalary)}</td>
              <td className={cn(num, 'px-4 py-3.5')}>{formatMoney(totals.incomeTax)}</td>
              <td className={cn(num, 'px-4 py-3.5')}>{formatMoney(totals.employeePensionAmount)}</td>
              {hasPf && <td className={cn(num, 'px-4 py-3.5')}>{formatMoney(totals.employeeProvidentFundAmount)}</td>}
              <td className={cn(num, 'px-4 py-3.5')}>{formatMoney(totals.totalDeduction)}</td>
              <td className={cn(num, 'bg-primary-100/60 px-4 py-3.5 text-primary-900')}>{formatMoney(totals.netSalary)}</td>
              <td className={cn(num, 'px-4 py-3.5')}>{formatMoney(employerCost(totals))}</td>
            </tr>
          </tfoot>
        )}
      </Table>
    </Card>
  );
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function EmployeesTable({ sim }: { sim: Simulation & { result: NonNullable<Simulation['result']> } }) {
  const { months, employees: counts } = sim.result;
  const [search, setSearch] = useState('');
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [metric, setMetric] = useState<Metric>('netSalary');
  const [selected, setSelected] = useState<SimEmployeeRow | null>(null);
  const q = useDebounced(search.trim());

  useEffect(() => setPage(1), [q, warningsOnly, sim.id]);

  const query = { page, limit: PAGE_SIZE, search: q || undefined, warningsOnly };
  const rows = useQuery({
    queryKey: simKeys.employees(sim.id, query),
    queryFn: () => simulationApi.employees(sim.id, query),
    placeholderData: keepPreviousData,
    staleTime: Infinity, // stored results never change; paging never recalculates
    retry: (n, err) => toApiError(err).status !== 404 && n < 2,
  });
  const data = rows.data;

  return (
    <Card>
      <CardHeader
        title="Employees"
        description={
          <>
            {formatInt(counts.total)} employees simulated
            {counts.withWarnings > 0 && <> · {formatInt(counts.withWarnings)} with warnings</>}. Click a row for the month-by-month payslip.
          </>
        }
        actions={<ExportMenu sim={sim} />}
      />
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className="w-full sm:w-72">
          <Input
            placeholder="Search name or employee ID"
            aria-label="Search employees"
            leading={<Search className="size-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {counts.withWarnings > 0 && (
          <Segmented<'all' | 'warnings'>
            value={warningsOnly ? 'warnings' : 'all'}
            onChange={(v) => setWarningsOnly(v === 'warnings')}
            items={[
              { value: 'all', label: <>All <span className="num text-slate-400">{formatInt(counts.total)}</span></> },
              { value: 'warnings', label: <>With warnings <span className="num text-slate-400">{formatInt(counts.withWarnings)}</span></> },
            ]}
          />
        )}
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="text-xs text-slate-500">Show</span>
          <Segmented<Metric> value={metric} onChange={setMetric} items={METRICS} />
        </div>
      </div>

      {rows.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : rows.error ? (
        <ErrorState error={rows.error} onRetry={() => rows.refetch()} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={<Users className="size-6" />} title={q || warningsOnly ? 'No employees match' : 'No employees in this simulation'} />
      ) : (
        <div className={cn('transition-opacity', rows.isPlaceholderData && 'opacity-60')}>
          <Table>
            <THead>
              <tr>
                <TH className="sticky left-0 z-10 bg-slate-50">Employee</TH>
                {months.map((m) => (
                  <TH key={m.period} align="right" title={m.payrollDefinitionId ? m.payrollName : formatPeriod(m.period)}>
                    {months.length > 1 ? formatPeriod(m.period) : METRICS.find((x) => x.value === metric)!.label}
                  </TH>
                ))}
                {months.length > 1 && <TH align="right">Total</TH>}
              </tr>
            </THead>
            <TBody>
              {data.rows.map((r) => (
                <TR key={r.employeeId} onClick={() => setSelected(r)} title="Show month-by-month details" className={cn(selected?.employeeId === r.employeeId && 'bg-slate-50')}>
                  <TD className="sticky left-0 z-10 bg-surface whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-slate-900">{r.name}</span>
                      {r.warnings.length > 0 && (
                        <span title={r.warnings.join('\n')} className="text-accent-500">
                          <TriangleAlert className="size-3.5" aria-label={`${r.warnings.length} warnings`} />
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-slate-500">{r.employeeIdNumber ?? '—'}</div>
                  </TD>
                  {months.map((m, i) => {
                    const cell = r.months[i];
                    if (!cell) return <TD key={m.period} align="right" className="text-slate-300">—</TD>;
                    const v = metricOf(cell, metric);
                    const zero = cell.basis === 'NOT_EMPLOYED' || cell.basis === 'NO_DATA';
                    return (
                      <TD key={m.period} align="right" className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <BasisDot basis={cell.basis} />
                          <span className={cn(zero ? 'text-slate-400' : metric === 'netSalary' && v <= 0 ? 'font-medium text-accent-700' : 'text-slate-700')}>
                            {zero ? '—' : formatMoney(v)}
                          </span>
                        </span>
                      </TD>
                    );
                  })}
                  {months.length > 1 && (
                    <TD align="right" className="font-semibold whitespace-nowrap text-slate-900">{formatMoney(metricOf(r.totals, metric))}</TD>
                  )}
                </TR>
              ))}
            </TBody>
            {!q && !warningsOnly && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/80">
                <tr>
                  <TD className="sticky left-0 z-10 bg-slate-50 font-semibold text-slate-900">All employees</TD>
                  {months.map((m) => (
                    <TD key={m.period} align="right" className="font-semibold whitespace-nowrap text-slate-900">{formatMoney(metricOf(m.totals, metric))}</TD>
                  ))}
                  {months.length > 1 && (
                    <TD align="right" className="font-semibold whitespace-nowrap text-slate-900">{formatMoney(metricOf(sim.result.totals, metric))}</TD>
                  )}
                </tr>
              </tfoot>
            )}
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            <span>
              Showing{' '}
              <span className="num font-medium text-slate-700">
                {formatInt((data.page - 1) * data.limit + 1)}–{formatInt((data.page - 1) * data.limit + data.rows.length)}
              </span>{' '}
              of <span className="num font-medium text-slate-700">{formatInt(data.total)}</span> · the footer is the whole company
            </span>
            {data.totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="num px-1">
                  {data.page} / {data.totalPages}
                </span>
                <Button variant="ghost" size="icon" aria-label="Next page" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <SimEmployeeDrawer simulationId={sim.id} row={selected} months={months} onClose={() => setSelected(null)} />
    </Card>
  );
}

function ExportMenu({ sim }: { sim: Simulation }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = async (shape: ExportShape) => {
    setOpen(false);
    setBusy('Preparing…');
    try {
      const { name, count } = await exportSimulationCsv(sim, shape, (done, total) => setBusy(`${formatInt(done)} / ${formatInt(total)}`));
      toast.success(`Exported ${formatInt(count)} employees`, { description: name });
    } catch (err) {
      toast.error('Export failed', { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" icon={<Download className="size-3.5" />} loading={!!busy} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        {busy ?? 'Export CSV'}
        {!busy && <ChevronDown className="size-3.5" />}
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-surface py-1 shadow-lg">
          <MenuItem title="Summary" hint="One row per employee: net per month and totals" onClick={() => run('summary')} />
          <MenuItem title="By month" hint="One row per employee per month, every amount" onClick={() => run('monthly')} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ title, hint, onClick }: { title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="block w-full px-3 py-2 text-left hover:bg-slate-50">
      <span className="block text-sm font-medium text-slate-800">{title}</span>
      <span className="block text-xs text-slate-500">{hint}</span>
    </button>
  );
}

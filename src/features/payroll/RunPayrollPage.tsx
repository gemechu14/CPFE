import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, PlayCircle, Search, Users } from 'lucide-react';
import { qk, useActiveEmployees, useAdjustments, useCurrentPayroll, useDefinitions, useIsHrSync, useSchedule } from '@/hooks/queries';
import { payrollApi } from '@/lib/api';
import { toApiError } from '@/lib/http';
import { cn } from '@/lib/cn';
import { formatDate, formatInt, formatMoney, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader, Skeleton } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Overlay';
import { PageHeader, StatStrip } from '@/components/ui/Page';
import { Segmented } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { STATE_LABEL } from '@/components/domain';
import type { CalculatedPayroll, RunPayrollResponse } from '@/types/api';
import { SyncNowButton } from '../hr-sync/SyncNowButton';
import { AdjustmentsTable } from './AdjustmentsTable';
import { EstimateDrawer } from './EstimateDrawer';

type View = 'all' | 'selected' | 'excluded';
type Row = CalculatedPayroll & { idNumber?: string | null; grade?: string };
const PAGE_SIZE = 50;

export function RunPayrollPage() {
  const [params, setParams] = useSearchParams();
  const defs = useDefinitions();
  const employees = useActiveEmployees(); // only for employee ID numbers, which the estimate rows don't carry
  const current = useCurrentPayroll();
  const isHrSync = useIsHrSync();
  const qc = useQueryClient();

  const sortedDefs = useMemo(() => [...(defs.data ?? [])].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()), [defs.data]);
  const defId = params.get('period') ?? '';
  useEffect(() => {
    if (defId || !sortedDefs.length || current.isLoading) return;
    // Preselect the period the backend considers current (active, else upcoming, else latest).
    const pick = current.data?.payrollDefinition?.id ?? sortedDefs[0]!.id;
    setParams({ period: pick }, { replace: true });
  }, [defId, sortedDefs, current.isLoading, current.data, setParams]);

  const def = sortedDefs.find((d) => d.id === defId);
  const schedule = useSchedule(defId || undefined);
  const pending = useAdjustments({ status: 'PENDING' });

  // GET /payroll/definition/:id → everyone ACTIVE without a payroll row for this period, with estimated amounts.
  const estimates = useQuery({
    queryKey: qk.notYetRun(defId),
    queryFn: () => payrollApi.notYetRun(defId),
    enabled: !!defId,
  });

  const idNumbers = useMemo(() => new Map((employees.data ?? []).map((e) => [e.id, e.employeeIdNumber])), [employees.data]);
  const rows = useMemo<Row[]>(
    () =>
      (estimates.data ?? [])
        .map((r) => ({ ...r, idNumber: idNumbers.get(r.employeeId), grade: r.employee?.gradeHistory?.[0]?.grade?.name }))
        .sort((a, b) => a.employee.name.localeCompare(b.employee.name)),
    [estimates.data, idNumbers],
  );

  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('all');
  const [page, setPage] = useState(0);
  const [showPending, setShowPending] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<RunPayrollResponse['payroll'] | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // A new period starts with everyone included again.
  useEffect(() => setExcluded(new Set()), [defId]);

  const isIn = (id: string) => !excluded.has(id);
  const included = useMemo(() => rows.filter((r) => !excluded.has(r.employeeId)), [rows, excluded]);
  const employeeIds = included.map((r) => r.employeeId);
  const selectedSet = useMemo(() => new Set(employeeIds), [employeeIds]);
  const totals = useMemo(
    () =>
      included.reduce(
        (t, r) => ({
          gross: t.gross + toNumber(r.grossSalary),
          tax: t.tax + toNumber(r.incomeTax),
          net: t.net + toNumber(r.netSalary),
        }),
        { gross: 0, tax: 0, net: 0 },
      ),
    [included],
  );
  const hasPf = rows.some((r) => toNumber(r.employeeProvidentFundAmount) !== 0);

  const pendingRows = pending.data?.data ?? [];
  const pendingByEmp = useMemo(() => {
    const m = new Map<string, number>();
    pendingRows.filter((a) => !a.needsReview).forEach((a) => m.set(a.employeeId, (m.get(a.employeeId) ?? 0) + toNumber(a.amount)));
    return m;
  }, [pendingRows]);
  const pendingForRun = pendingRows.filter((a) => !a.needsReview && selectedSet.has(a.employeeId));
  const pendingNet = pendingForRun.reduce((s, a) => s + toNumber(a.amount), 0);

  const run = useMutation({
    mutationFn: () => payrollApi.run(defId, employeeIds),
    onSuccess: (d) => {
      setResult(d.payroll);
      setRunError(null);
      setConfirm(false);
      setExcluded(new Set());
      toast.success('Payroll created');
      qc.invalidateQueries({ queryKey: ['payroll'] }); // also refreshes the not-yet-run list
      qc.invalidateQueries({ queryKey: qk.currentMonth });
    },
    onError: (err) => {
      setRunError(toApiError(err).message);
      setConfirm(false);
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (view === 'all' || (view === 'selected' ? !excluded.has(r.employeeId) : excluded.has(r.employeeId))) &&
        (!s || r.employee.name.toLowerCase().includes(s) || r.idNumber?.toLowerCase().includes(s) || r.grade?.toLowerCase().includes(s)),
    );
  }, [rows, search, view, excluded]);

  useEffect(() => setPage(0), [search, view, defId]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Header checkbox acts on every row matching the current search/filter, not just this page.
  const allFilteredIn = filtered.length > 0 && filtered.every((r) => isIn(r.employeeId));
  const someFilteredIn = filtered.some((r) => isIn(r.employeeId));
  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = someFilteredIn && !allFilteredIn;
  }, [someFilteredIn, allFilteredIn]);

  const setMany = (ids: string[], include: boolean) =>
    setExcluded((prev) => {
      const n = new Set(prev);
      ids.forEach((id) => (include ? n.delete(id) : n.add(id)));
      return n;
    });

  const needsSync = runError && /Run HR sync first/i.test(runError);
  const s = schedule.data;
  const processedHere = current.data && current.data.payrollDefinition?.id === defId ? current.data : null;

  if (defs.isLoading) return <PageLoader />;
  if (defs.error) return <ErrorState error={defs.error} onRetry={() => defs.refetch()} />;

  return (
    <div>
      <PageHeader
        title="Run payroll"
        description="Employees not yet paid for this period, with estimated pay. Everyone is included unless you untick them."
        actions={
          sortedDefs.length > 0 && (
            <>
              <Select
                aria-label="Payroll period"
                value={defId}
                onChange={(e) => {
                  setParams({ period: e.target.value });
                  setResult(null);
                  setRunError(null);
                }}
                className="w-44"
              >
                {sortedDefs.map((d) => (
                  <option key={d.id} value={d.id}>{d.payrollName}</option>
                ))}
              </Select>
              {isHrSync && (
                <SyncNowButton variant="outline" askPeriod={false} period={s?.hrPeriod}>
                  Sync HR first
                </SyncNowButton>
              )}
              <Button
                loading={run.isPending}
                disabled={!defId || employeeIds.length === 0}
                onClick={() => setConfirm(true)}
              >
                Run {def?.payrollName ?? 'payroll'}
              </Button>
            </>
          )
        }
      />

      {!sortedDefs.length ? (
        <Card>
          <EmptyState
            icon={<PlayCircle className="size-6" />}
            title="No payroll periods"
            description="Create a payroll period first."
            action={<Link to="/payroll/periods"><Button>Go to periods</Button></Link>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Period facts, then the run's totals */}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            {s && <span className="font-medium text-slate-700">{STATE_LABEL[s.state]}</span>}
            <Fact label="Period" value={def ? `${formatDate(def.startDate, { day: '2-digit', month: 'short' })} – ${formatDate(def.endDate)}` : '—'} />
            <Fact label="Cutoff" value={s ? formatDate(s.cutoffDate) : '—'} />
            <Fact label="Pay day" value={def ? formatDate(def.payDate) : '—'} />
            {processedHere && <Fact label="Already run" value={`${formatInt(processedHere.processedEmployees)} of ${formatInt(processedHere.totalEmployees)}`} />}
          </p>

          <StatStrip
            loading={!defId || estimates.isLoading}
            items={[
              { label: 'Employees', value: `${formatInt(employeeIds.length)} of ${formatInt(rows.length)}` },
              { label: 'Gross pay (est.)', value: formatMoney(totals.gross) },
              { label: 'Income tax (est.)', value: formatMoney(totals.tax) },
              {
                label: 'Net pay (est.)',
                value: formatMoney(totals.net),
                hint: pendingForRun.length ? `${formatInt(pendingForRun.length)} adjustments · ${formatMoney(pendingNet, { sign: true })}` : undefined,
              },
            ]}
          />
          {s && (s.state === 'OPEN' || s.state === 'NOT_OPEN') && (
            <p className="-mt-2 text-xs text-slate-500">Provisional: days after the cutoff are assumed worked.</p>
          )}

          {runError && (
            <Alert tone="danger" title="Payroll was not created" action={needsSync && <SyncNowButton size="sm" askPeriod={false} period={s?.hrPeriod} />}>
              {runError}
              {/workflow/i.test(runError) && <div className="mt-1 text-xs">Check the payroll approval workflow setup.</div>}
              {/None of the selected employees can be paid/i.test(runError) && (
                <div className="mt-1 text-xs">Everyone selected was skipped, e.g. only system or admin accounts were included.</div>
              )}
            </Alert>
          )}
          {result && (
            <Alert tone="success" title="Payroll created">
              <p>
                {result.message} HR-synced {formatInt(result.summary.hrSynced)} · attendance-based {formatInt(result.summary.attendanceBased)} · standard{' '}
                {formatInt(result.summary.standard)}
                {!!result.summary.skipped && <> · skipped {formatInt(result.summary.skipped)}</>}.
              </p>
              {!!result.skipped?.length && (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {result.skipped.map((k) => (
                    <li key={k.employeeId}>
                      <span className="font-medium">{k.name}</span>: {k.reason}
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/payroll/month" className="mt-2 inline-flex items-center gap-1 font-medium underline">
                Review this month&apos;s payroll <ArrowRight className="size-3.5" />
              </Link>
            </Alert>
          )}

          {/* Pending adjustments: a notice, expandable */}
          {pendingRows.length > 0 && (
            <Card className="overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPending((v) => !v)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50"
                aria-expanded={showPending}
              >
                <span className="flex-1">
                  <span className="font-medium text-slate-900">{formatInt(pendingRows.length)} pending arrears and recoveries</span>
                  <span className="text-slate-500"> are added automatically for the employees they belong to.</span>
                </span>
                <span className="text-xs font-medium text-primary-700">{showPending ? 'Hide' : 'View'}</span>
                <ChevronDown className={cn('size-4 text-slate-400 transition-transform', showPending && 'rotate-180')} />
              </button>
              {showPending && (
                <div className="border-t border-slate-100">
                  <AdjustmentsTable rows={pendingRows} showStatus={false} />
                </div>
              )}
            </Card>
          )}

          {/* Employees not yet run: the main job of this page */}
          <Card>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
              <div className="w-full sm:w-72">
                <Input
                  placeholder="Search name, ID or grade"
                  aria-label="Search employees"
                  leading={<Search className="size-4" />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Segmented<View>
                value={view}
                onChange={setView}
                items={[
                  { value: 'all', label: <>All <span className="num text-slate-400">{formatInt(rows.length)}</span></> },
                  { value: 'selected', label: <>Included <span className="num text-slate-400">{formatInt(employeeIds.length)}</span></> },
                  { value: 'excluded', label: <>Left out <span className="num text-slate-400">{formatInt(rows.length - employeeIds.length)}</span></> },
                ]}
              />
              <div className="ml-auto flex items-center gap-1 text-xs">
                <button className="rounded-md px-2 py-1 font-medium text-primary-700 hover:bg-primary-50" onClick={() => setExcluded(new Set())}>
                  Select all
                </button>
                <button className="rounded-md px-2 py-1 font-medium text-slate-600 hover:bg-slate-100" onClick={() => setExcluded(new Set(rows.map((r) => r.employeeId)))}>
                  Clear
                </button>
              </div>
            </div>

            {!defId || estimates.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : estimates.error ? (
              <ErrorState error={estimates.error} onRetry={() => estimates.refetch()} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Users className="size-6" />}
                title={processedHere?.processedEmployees ? `Everyone has been run for ${def?.payrollName ?? 'this period'}` : 'No employees to run'}
                description={
                  isHrSync
                    ? 'Only active employees with synced HR data for this month and no payroll yet are listed. Sync HR if someone is missing.'
                    : 'Only active employees with a salary, a current grade and no payroll yet for this period are listed.'
                }
                action={
                  processedHere?.processedEmployees ? (
                    <Link to="/payroll/month"><Button variant="outline">Review this month&apos;s payroll</Button></Link>
                  ) : undefined
                }
              />
            ) : filtered.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-slate-500">No employees match.</p>
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <TH className="w-10">
                        <input
                          ref={headerBox}
                          type="checkbox"
                          aria-label="Select all matching employees"
                          className="size-4 accent-primary-600"
                          checked={allFilteredIn}
                          onChange={(e) => setMany(filtered.map((x) => x.employeeId), e.target.checked)}
                        />
                      </TH>
                      <TH>Employee</TH>
                      <TH>Employee ID</TH>
                      <TH align="right">Basic</TH>
                      <TH align="right">Allowances</TH>
                      <TH align="right">Gross</TH>
                      <TH align="right">Income tax</TH>
                      <TH align="right">Pension</TH>
                      {hasPf && <TH align="right">PF</TH>}
                      <TH align="right">Net (est.)</TH>
                      <TH align="right">Pending adj.</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {pageRows.map((r) => {
                      const on = isIn(r.employeeId);
                      const adj = pendingByEmp.get(r.employeeId);
                      const mode = r.calculationBasis?.mode;
                      return (
                        <TR
                          key={r.employeeId}
                          onClick={() => setDetailId(r.employeeId)}
                          title="Show details"
                          className={cn(!on && 'bg-slate-50/60 text-slate-400', detailId === r.employeeId && 'bg-slate-50')}
                        >
                          <TD onClick={(ev) => ev.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Include ${r.employee.name}`}
                              className="size-4 accent-primary-600"
                              checked={on}
                              onChange={(ev) => setMany([r.employeeId], ev.target.checked)}
                            />
                          </TD>
                          <TD className="whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'font-medium underline-offset-2 hover:text-primary-700 hover:underline',
                                  on ? 'text-slate-900' : 'text-slate-400 line-through decoration-slate-300',
                                )}
                              >
                                {r.employee.name}
                              </span>
                            </div>
                            {(r.grade || (mode && mode !== 'FINAL')) && (
                              <div className="text-xs text-slate-500">
                                {[r.grade && `Grade ${r.grade}`, mode && mode !== 'FINAL' && 'provisional'].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </TD>
                          <TD className="font-mono text-xs">{r.idNumber ?? '—'}</TD>
                          <TD align="right">{formatMoney(r.basicSalary)}</TD>
                          <TD align="right">{formatMoney(r.totalAllowance)}</TD>
                          <TD align="right">{formatMoney(r.grossSalary)}</TD>
                          <TD align="right">{formatMoney(r.incomeTax)}</TD>
                          <TD align="right">{formatMoney(r.employeePensionAmount)}</TD>
                          {hasPf && <TD align="right">{formatMoney(r.employeeProvidentFundAmount ?? 0)}</TD>}
                          <TD align="right">
                            <span className={cn('font-semibold', on ? 'text-slate-900' : 'text-slate-400', toNumber(r.netSalary) <= 0 && 'text-red-600')}>
                              {formatMoney(r.netSalary)}
                            </span>
                          </TD>
                          <TD align="right">
                            {adj !== undefined ? (
                              <span className="text-slate-700">{formatMoney(adj, { sign: true })}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                  <span>
                    Showing <span className="num font-medium text-slate-700">{formatInt(page * PAGE_SIZE + 1)}–{formatInt(page * PAGE_SIZE + pageRows.length)}</span> of{' '}
                    <span className="num font-medium text-slate-700">{formatInt(filtered.length)}</span> · estimates, not saved until you run
                  </span>
                  {pages > 1 && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="num px-1">
                        {page + 1} / {pages}
                      </span>
                      <Button variant="ghost" size="icon" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      <EstimateDrawer
        row={rows.find((r) => r.employeeId === detailId) ?? null}
        idNumber={rows.find((r) => r.employeeId === detailId)?.idNumber}
        periodName={def?.payrollName}
        pending={pendingRows}
        included={!!detailId && isIn(detailId)}
        onToggle={() => detailId && setMany([detailId], !isIn(detailId))}
        onClose={() => setDetailId(null)}
      />

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => run.mutate()}
        loading={run.isPending}
        title={`Run ${def?.payrollName ?? ''} payroll?`}
        confirmLabel={run.isPending ? 'Running…' : 'Run payroll'}
      >
        <p>
          Payroll is created for <strong>{formatInt(employeeIds.length)}</strong> employees
          {rows.length > employeeIds.length && <> ({formatInt(rows.length - employeeIds.length)} left out)</>}, estimated net{' '}
          <strong>{formatMoney(totals.net, { currency: true })}</strong>, including <strong>{formatInt(pendingForRun.length)}</strong> pending arrears and recoveries.
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <CheckCircle2 className="size-3.5" /> The run is atomic: if anything fails, nothing is created.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-slate-500">{label} </span>
      <span className="num font-medium text-slate-900">{value}</span>
    </span>
  );
}

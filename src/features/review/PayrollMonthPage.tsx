import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { FileText, Search } from 'lucide-react';
import { formatInt, formatMoney, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { PageHeader, StatStrip } from '@/components/ui/Page';
import { Tabs } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { PayslipDrawer } from '@/features/payroll/PayslipDrawer';
import type { PayrollRow } from '@/types/api';
import { reviewApi, type MonthList, type Payroll9 } from './api';
import { cn } from '@/lib/cn';

const TABS: { value: MonthList; label: string }[] = [
  { value: 'published', label: 'Not yet paid' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
];

export function PayrollMonthPage() {
  const [tab, setTab] = useState<MonthList>('published');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim().toLowerCase());
  const [open, setOpen] = useState<Payroll9 | null>(null);

  const lists = useQueries({
    queries: TABS.map((t) => ({ queryKey: ['payroll', 'month', t.value], queryFn: () => reviewApi.list(t.value) })),
  });
  const current = lists[TABS.findIndex((t) => t.value === tab)]!;
  const payDateClose = useQuery({ queryKey: ['payroll', 'isvalid-date'], queryFn: () => reviewApi.isValidDate(), retry: false });

  const rows = useMemo(
    () =>
      (current.data ?? []).filter(
        (r) => !q || r.employee?.name?.toLowerCase().includes(q) || r.employee?.payrollInfo?.tinNumber?.toLowerCase().includes(q),
      ),
    [current.data, q],
  );

  const totals = useMemo(() => {
    const all = current.data ?? [];
    return {
      gross: all.reduce((s, r) => s + toNumber(r.grossSalary), 0),
      net: all.reduce((s, r) => s + toNumber(r.netSalary), 0),
      tax: all.reduce((s, r) => s + toNumber(r.incomeTax), 0),
      count: all.length,
    };
  }, [current.data]);

  const hasHr = rows.some((r) => r.calculationBasis);

  return (
    <>
      <PageHeader
        eyebrow="Payroll"
        title="This month's payroll"
        description="Review the current period's payroll as it moves from approval to payment."
        actions={
          <>
            <Link to="/payroll/approvals">
              <Button variant="outline">Approvals</Button>
            </Link>
            <Link to="/payments">
              <Button>Pay salaries</Button>
            </Link>
          </>
        }
      />

      {payDateClose.data && (
        <Alert tone="info" className="mb-6" title="Pay date is close">
          This period ends within 5 days. Make sure payroll is approved and paid in time.
        </Alert>
      )}

      <StatStrip
        className="mb-6"
        loading={current.isLoading}
        items={[
          { label: "Employees", value: formatInt(totals.count) },
          { label: "Gross pay", value: formatMoney(totals.gross) },
          { label: "Income tax", value: formatMoney(totals.tax) },
          { label: "Net pay", value: formatMoney(totals.net) },
        ]}
      />

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-2">
          <Tabs items={TABS.map((t, i) => ({ ...t, count: lists[i]?.data?.length }))} value={tab} onChange={setTab} className="border-b-0" />
          <div className="w-full max-w-xs pb-2">
            <Input aria-label="Search employees" placeholder="Search employee or TIN" leading={<Search className="size-4" />} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="border-t border-slate-100" />
        {current.isLoading ? (
          <PageLoader />
        ) : current.error ? (
          <ErrorState error={current.error} onRetry={() => current.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-6" />}
            title={current.data?.length ? 'No employees match your search' : 'Nothing here yet'}
            description={!current.data?.length ? (tab === 'published' ? 'Run payroll for the current period to see rows here.' : undefined) : undefined}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH>Grade</TH>
                <TH align="right">Gross</TH>
                <TH align="right">Tax</TH>
                <TH align="right">Pension</TH>
                {hasHr && <TH align="right">PF</TH>}
                <TH align="right">Net</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id} onClick={() => setOpen(r)}>
                  <TD>
                    <div className="font-medium text-slate-900">{r.employee?.name ?? '—'}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      {r.employee?.payrollInfo?.employmentType?.toLowerCase() ?? ''}
                      {r.calculationBasis && r.calculationBasis.mode !== 'FINAL' && <span>· provisional</span>}
                    </div>
                  </TD>
                  <TD>{r.employee?.gradeHistory?.[0]?.grade?.name ?? '—'}</TD>
                  <TD align="right">{formatMoney(r.grossSalary)}</TD>
                  <TD align="right">{formatMoney(r.incomeTax)}</TD>
                  <TD align="right">{formatMoney(r.employeePensionAmount)}</TD>
                  {hasHr && <TD align="right">{formatMoney(r.employeeProvidentFundAmount)}</TD>}
                  <TD align="right" className="font-semibold text-slate-900">{formatMoney(r.netSalary)}</TD>
                  <TD className="whitespace-nowrap"><RowStatus row={r} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <PayslipDrawer
        row={open as unknown as PayrollRow | null}
        employeeName={open?.employee?.name}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

/** One plain status per row: payment state once it exists, otherwise approval state. */
function RowStatus({ row }: { row: Payroll9 }) {
  const [label, tone] = ((): [string, 'done' | 'active' | 'muted' | 'bad'] => {
    if (row.paymentStatus === 'PAID') return ['Paid', 'done'];
    if (row.paymentStatus === 'PENDING') return ['Sent to bank', 'active'];
    if (row.paymentStatus === 'FAILED') return ['Payment failed', 'bad'];
    if (row.status === 'APPROVED') return ['Approved', 'active'];
    if (row.status === 'FAILED') return ['Failed', 'bad'];
    if (row.status === 'PENDING') return ['Pending', 'muted'];
    return ['Awaiting approval', 'muted'];
  })();
  return (
    <span
      className={cn('text-sm', {
        done: 'text-slate-900',
        active: 'font-medium text-primary-700',
        muted: 'text-slate-500',
        bad: 'font-medium text-red-600',
      }[tone])}
    >
      {label}
    </span>
  );
}

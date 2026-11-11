import { Fragment, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, History, Landmark, Search, Wallet, XCircle } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { toApiError } from '@/lib/http';
import { cn } from '@/lib/cn';
import { formatDateTime, formatInt, formatMoney, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader, Spinner } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Overlay';
import { PageHeader } from '@/components/ui/Page';
import { Tabs } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { reviewApi, type PaymentResponse } from './api';
import { PaymentStatusBadge } from './badges';

type Tab = 'pay' | 'history';

export function PaymentsPage() {
  const { can } = useAuth();
  const canHistory = can(PERMS.readPayment);
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'history' && canHistory ? 'history' : 'pay';
  const setTab = (t: Tab) => setParams(t === 'pay' ? {} : { tab: t }, { replace: true });

  return (
    <>
      <PageHeader
        eyebrow="Payments"
        title="Payments"
        description="Send approved salaries to the bank and follow each transfer."
      />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[{ value: 'pay', label: 'Pay salaries' }, ...(canHistory ? [{ value: 'history' as const, label: 'Transaction history' }] : [])]}
      />
      {tab === 'pay' ? <PayTab /> : <HistoryTab />}
    </>
  );
}

function PayTab() {
  const qc = useQueryClient();
  const approved = useQuery({ queryKey: ['payroll', 'month', 'approved'], queryFn: () => reviewApi.list('approved') });
  const unpaid = useMemo(() => (approved.data ?? []).filter((r) => r.paymentStatus === 'UNPAID'), [approved.data]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<PaymentResponse | null>(null);

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return unpaid.filter((r) => !s || r.employee?.name?.toLowerCase().includes(s));
  }, [unpaid, search]);

  const selectedRows = unpaid.filter((r) => selected.has(r.id));
  const selectedNet = selectedRows.reduce((s, r) => s + toNumber(r.netSalary), 0);
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  const pay = useMutation({
    mutationFn: () => reviewApi.pay([...selected]),
    onSuccess: (res) => {
      setResult(res);
      setConfirm(false);
      setSelected(new Set());
      if (res.success) toast.success(res.message);
      else toast.error(res.message);
      qc.invalidateQueries({ queryKey: ['payroll', 'month'] });
      qc.invalidateQueries({ queryKey: ['payment', 'history'] });
    },
    onError: (err) => {
      setConfirm(false);
      setResult({ success: false, message: toApiError(err).message });
    },
  });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((r) => next.delete(r.id));
      else visible.forEach((r) => next.add(r.id));
      return next;
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {pay.isPending && (
          <Alert tone="info" title="Sending payments to the bank…">
            Each employee is a separate bank transfer, so this can take a few minutes. Keep this page open.
          </Alert>
        )}
        {result && <PaymentResultPanel result={result} onDismiss={() => setResult(null)} />}

        <Card>
          <CardHeader
            title="Approved and unpaid"
            description="Only rows that finished approval and haven't been sent to the bank yet."
            actions={
              <div className="w-56">
                <Input aria-label="Search" placeholder="Search employee" leading={<Search className="size-4" />} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            }
          />
          {approved.isLoading ? (
            <PageLoader />
          ) : approved.error ? (
            <ErrorState error={approved.error} onRetry={() => approved.refetch()} />
          ) : unpaid.length === 0 ? (
            <EmptyState icon={<Wallet className="size-6" />} title="Nothing to pay" description="Approved payroll rows that are still unpaid appear here." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH className="w-10">
                    <input type="checkbox" aria-label="Select all" className="size-4 accent-primary-600" checked={allVisibleSelected} onChange={toggleAll} />
                  </TH>
                  <TH>Employee</TH>
                  <TH>Grade</TH>
                  <TH align="right">Gross</TH>
                  <TH align="right">Net pay</TH>
                  <TH>Payment</TH>
                </tr>
              </THead>
              <TBody>
                {visible.map((r) => (
                  <TR
                    key={r.id}
                    onClick={() =>
                      setSelected((p) => {
                        const n = new Set(p);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                    className={selected.has(r.id) ? 'bg-primary-50/60' : ''}
                  >
                    <TD>
                      <input type="checkbox" aria-label={`Select ${r.employee?.name}`} className="size-4 accent-primary-600" checked={selected.has(r.id)} readOnly />
                    </TD>
                    <TD className="font-medium text-slate-900">{r.employee?.name ?? '—'}</TD>
                    <TD>{r.employee?.gradeHistory?.[0]?.grade?.name ?? '—'}</TD>
                    <TD align="right">{formatMoney(r.grossSalary)}</TD>
                    <TD align="right" className="font-semibold text-slate-900">{formatMoney(r.netSalary)}</TD>
                    <TD><PaymentStatusBadge status={r.paymentStatus} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Card className="overflow-hidden">
          <div className="bg-brand-800 px-5 py-4 text-white">
            <div className="text-xs font-medium tracking-wide text-primary-200 uppercase">Selected for payment</div>
            <div className="num mt-1 text-2xl font-semibold">{formatMoney(selectedNet, { currency: true })}</div>
            <div className="mt-0.5 text-sm text-primary-100">{formatInt(selectedRows.length)} of {formatInt(unpaid.length)} employees</div>
          </div>
          <CardBody className="space-y-3">
            <Button variant="accent" size="lg" className="w-full" icon={<Landmark className="size-4" />} disabled={!selected.size} loading={pay.isPending} onClick={() => setConfirm(true)}>
              Pay {selected.size ? formatInt(selected.size) : ''} selected
            </Button>
            <ul className="space-y-1.5 text-xs text-slate-500">
              <li>• Payment works only while today is inside the payroll period's dates.</li>
              <li>• Employees need a bank-verified account; others are skipped with a reason.</li>
              <li>• Status moves to <em>Sent to bank</em>, then <em>Paid</em> when the bank confirms.</li>
            </ul>
          </CardBody>
        </Card>
      </aside>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => pay.mutate()}
        loading={pay.isPending}
        tone="accent"
        title="Send salaries to the bank?"
        confirmLabel={pay.isPending ? 'Sending…' : 'Send payment'}
      >
        <p>
          <strong>{formatInt(selected.size)}</strong> transfers totalling <strong>{formatMoney(selectedNet, { currency: true })}</strong> will be sent from the company's master account.
        </p>
        <p className="mt-2 text-xs text-slate-500">A failed transfer can't be retried from here yet.</p>
      </ConfirmDialog>
    </div>
  );
}

function PaymentResultPanel({ result, onDismiss }: { result: PaymentResponse; onDismiss: () => void }) {
  const d = result.data;
  return (
    <Card className={cn('border-2', result.success ? 'border-emerald-200' : 'border-red-200')}>
      <CardHeader
        icon={result.success ? <CheckCircle2 className="size-4.5 text-emerald-600" /> : <XCircle className="size-4.5 text-red-600" />}
        title={result.message}
        description={result.error}
        actions={<Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>}
      />
      {d && (
        <CardBody className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Requested" value={formatInt(d.totalRequested)} />
            <Mini label="Accepted by bank" value={formatInt(d.successfulPayments ?? 0)} tone="good" />
            <Mini label="Failed" value={formatInt(d.failedPayments ?? 0)} tone={d.failedPayments ? 'bad' : undefined} />
            <Mini label="Skipped" value={formatInt(d.totalInvalidPayrolls ?? d.invalidPayrolls ?? 0)} tone={(d.totalInvalidPayrolls ?? d.invalidPayrolls) ? 'warn' : undefined} />
          </div>
          {d.totalSuccessfulAmount !== undefined && (
            <p className="text-sm text-slate-600">
              Amount accepted: <span className="num font-semibold text-slate-900">{formatMoney(d.totalSuccessfulAmount, { currency: true })}</span>
            </p>
          )}
          {!!d.results?.length && (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <Table>
                <THead>
                  <tr>
                    <TH>Employee</TH>
                    <TH align="right">Amount</TH>
                    <TH>Result</TH>
                  </tr>
                </THead>
                <TBody>
                  {d.results.map((r) => (
                    <TR key={r.payrollId} className={r.success ? 'bg-emerald-50/40' : 'bg-red-50/50'}>
                      <TD className="font-medium text-slate-900">{r.employeeName ?? r.employeeId}</TD>
                      <TD align="right">{r.amount !== undefined ? formatMoney(r.amount) : '—'}</TD>
                      <TD>
                        {r.success ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="size-4" /> Sent{r.orderId && <span className="text-xs text-slate-500">· {r.orderId}</span>}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-red-600"><XCircle className="size-4" /> {r.error ?? 'Failed'}</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
          {!!d.invalidPayrollsSummary?.length && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-900">Skipped</h4>
              <ul className="divide-y divide-slate-100 rounded-lg border border-amber-200 bg-amber-50/40 text-sm">
                {d.invalidPayrollsSummary.map((s) => (
                  <li key={s.payrollId} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                    <span className="font-medium text-slate-800">{s.employeeName ?? s.employeeId ?? s.payrollId}</span>
                    <span className="text-amber-800">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      )}
    </Card>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn('num mt-0.5 text-lg font-semibold', tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-slate-900')}>{value}</div>
    </div>
  );
}

const PAGE = 25;

function HistoryTab() {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['payment', 'history', page], queryFn: () => reviewApi.history(PAGE, page * PAGE) });

  return (
    <Card>
      <CardHeader icon={<History className="size-4.5" />} title="Transaction history" description="Newest first. Each payroll is sent as its own batch." />
      {q.isLoading ? (
        <PageLoader />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={<History className="size-6" />} title={page ? 'No more transactions' : 'No payments yet'} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH className="w-8" />
              <TH>Date</TH>
              <TH>Batch</TH>
              <TH>Debit account</TH>
              <TH align="right">Amount</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {q.data.map((b) => (
              <Fragment key={b.id}>
                <TR onClick={() => setExpanded(expanded === b.id ? null : b.id)}>
                  <TD><ChevronDown className={cn('size-4 text-slate-400 transition', expanded === b.id && 'rotate-180')} /></TD>
                  <TD className="whitespace-nowrap">{formatDateTime(b.createdAt)}</TD>
                  <TD className="font-mono text-xs">{b.batchId}</TD>
                  <TD className="font-mono text-xs">{b.debitAccount}</TD>
                  <TD align="right" className="font-semibold text-slate-900">{formatMoney(b.totalAmount)}</TD>
                  <TD><PaymentStatusBadge status={b.status} /></TD>
                </TR>
                {expanded === b.id && (
                  <tr>
                    <td colSpan={6} className="bg-slate-50 px-6 py-3">
                      <ul className="space-y-2 text-sm">
                        {b.transactions.map((t) => (
                          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2 ring-1 ring-slate-200">
                            <span className="text-slate-600">
                              To <span className="font-mono text-slate-900">{t.creditAccountNumber}</span>
                              <span className="ml-2 text-xs text-slate-500">Order {t.orderId}</span>
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="text-xs text-slate-500">{t.transactionId ? `Txn ${t.transactionId}` : 'Awaiting bank confirmation'}</span>
                              <span className="num font-medium">{formatMoney(t.amount)}</span>
                              <PaymentStatusBadge status={t.status} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </TBody>
        </Table>
      )}
      <div className="flex items-center justify-end gap-1 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
        {q.isFetching && <Spinner className="mr-2 size-4" />}
        <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2">Page {page + 1}</span>
        <Button variant="ghost" size="icon" aria-label="Next page" disabled={(q.data?.length ?? 0) < PAGE} onClick={() => setPage(page + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

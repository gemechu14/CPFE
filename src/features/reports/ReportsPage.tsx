import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Plane, Search, User } from 'lucide-react';
import { useDefinitions, useEmployees } from '@/hooks/queries';
import { toApiError } from '@/lib/http';
import { formatInt, formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader, Spinner } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Page';
import { Tabs } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { reportsApi, type PayslipReportRow, type ReportFormat } from './api';

type Tab = 'payslips' | 'employee' | 'leave';
const LIMIT = 25;

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('tab');
  const tab: Tab = q === 'employee' || q === 'leave' ? q : 'payslips';
  const setTab = (t: Tab) => setParams(t === 'payslips' ? {} : { tab: t }, { replace: true });
  return (
    <>
      <PageHeader eyebrow="Reports" title="Reports" description="Payslip tables and downloads for a period or an employee, and the annual leave report." />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'payslips', label: 'Payslips by period' },
          { value: 'employee', label: 'Employee payslips' },
          { value: 'leave', label: 'Leave report' },
        ]}
      />
      {tab === 'payslips' && <PeriodReport />}
      {tab === 'employee' && <EmployeeReport />}
      {tab === 'leave' && <LeaveReport />}
    </>
  );
}

function useSortedDefinitions() {
  const defs = useDefinitions();
  const sorted = useMemo(() => [...(defs.data ?? [])].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()), [defs.data]);
  return { ...defs, sorted };
}

function DownloadButtons({ onDownload, disabled }: { onDownload: (f: ReportFormat) => Promise<unknown>; disabled?: boolean }) {
  const [busy, setBusy] = useState<ReportFormat | null>(null);
  const run = async (f: ReportFormat) => {
    setBusy(f);
    try {
      const name = await onDownload(f);
      toast.success(`Downloaded ${typeof name === 'string' ? name : 'report'}`);
    } catch (err) {
      toast.error(toApiError(err).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" icon={<FileSpreadsheet className="size-4" />} loading={busy === 'excel'} disabled={disabled || !!busy} onClick={() => run('excel')}>
        Excel
      </Button>
      <Button variant="outline" size="sm" icon={<Download className="size-4" />} loading={busy === 'csv'} disabled={disabled || !!busy} onClick={() => run('csv')}>
        CSV
      </Button>
    </div>
  );
}

const LIMITATION = 'This report has no pension, provident fund, or arrears columns. For full HR-synced payslips, open the row in "This month\'s payroll".';

function PeriodReport() {
  const defs = useSortedDefinitions();
  const [defId, setDefId] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (!defId && defs.sorted.length) setDefId(defs.sorted[0]!.id);
  }, [defId, defs.sorted]);

  const q = useQuery({
    queryKey: ['reports', 'bulk', defId, page],
    queryFn: () => reportsApi.bulk(defId, page, LIMIT),
    enabled: !!defId,
    placeholderData: (prev) => prev,
  });
  const p = q.data?.pagination;

  return (
    <Card>
      <CardHeader
        icon={<FileText className="size-4.5" />}
        title="Payslip report"
        description={p ? `${formatInt(p.total)} employees` : undefined}
        actions={
          <>
            <Select aria-label="Payroll period" className="h-9 w-48" value={defId} onChange={(e) => { setDefId(e.target.value); setPage(1); }}>
              {defs.sorted.map((d) => <option key={d.id} value={d.id}>{d.payrollName}</option>)}
            </Select>
            <DownloadButtons disabled={!defId} onDownload={(f) => reportsApi.downloadBulk(defId, f)} />
          </>
        }
      />
      <div className="px-5 pt-4"><Alert tone="info">{LIMITATION}</Alert></div>
      {defs.isLoading || (q.isLoading && !q.data) ? (
        <PageLoader />
      ) : !defs.sorted.length ? (
        <EmptyState title="No payroll periods" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.data.length ? (
        <EmptyState icon={<FileText className="size-6" />} title="No payslips for this period" description="Payroll hasn't been run for it yet." />
      ) : (
        <>
          <PayslipTable rows={q.data.data} />
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            <span className="flex items-center gap-2">{q.isFetching && <Spinner className="size-4" />} Page {p?.page} of {p?.totalPages || 1}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Next page" disabled={!p || page >= p.totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function PayslipTable({ rows, showName = true }: { rows: PayslipReportRow[]; showName?: boolean }) {
  return (
    <Table>
      <THead>
        <tr>
          {showName && <TH>Employee</TH>}
          <TH>Grade · Position</TH>
          <TH>Department</TH>
          <TH align="right">Basic</TH>
          <TH align="right">Allowance</TH>
          <TH align="right">Gross</TH>
          <TH align="right">Tax</TH>
          <TH align="right">Deduction</TH>
          <TH align="right">Net</TH>
          <TH>Payment</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((r, i) => (
          <TR key={`${r.fullName}-${i}`}>
            {showName && (
              <TD>
                <div className="font-medium text-slate-900">{r.fullName}</div>
                <div className="text-xs text-slate-500">{r.employeeType}</div>
              </TD>
            )}
            <TD className="text-xs">{r.grade}<div className="text-slate-500">{r.position}</div></TD>
            <TD className="text-xs">{r.department}</TD>
            <TD align="right">{formatMoney(r.basicSalary)}</TD>
            <TD align="right">{formatMoney(r.totalAllowance)}</TD>
            <TD align="right">{formatMoney(r.grossSalary)}</TD>
            <TD align="right">{formatMoney(r.incomeTax)}</TD>
            <TD align="right">{formatMoney(r.totalDeduction)}</TD>
            <TD align="right" className="font-semibold text-slate-900">{formatMoney(r.netSalary)}</TD>
            <TD><Badge tone={r.paymentStatus === 'PAID' ? 'success' : r.paymentStatus === 'FAILED' ? 'danger' : 'neutral'}>{r.paymentStatus}</Badge></TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function EmployeeReport() {
  const employees = useEmployees();
  const defs = useSortedDefinitions();
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [defId, setDefId] = useState('');
  const matches = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return [];
    return (employees.data ?? []).filter((e) => e.name.toLowerCase().includes(s) || e.employeeIdNumber?.toLowerCase().includes(s)).slice(0, 8);
  }, [employees.data, search]);
  const chosen = employees.data?.find((e) => e.id === employeeId);

  const q = useQuery({
    queryKey: ['reports', 'individual', employeeId, defId],
    queryFn: () => reportsApi.individual(employeeId, defId || undefined),
    enabled: !!employeeId,
    retry: false,
  });
  const notFound = q.error && toApiError(q.error).status === 404;

  return (
    <Card>
      <CardHeader
        icon={<User className="size-4.5" />}
        title={chosen ? chosen.name : 'Employee payslips'}
        description={chosen ? (defId ? 'One period' : 'Every month, newest first') : 'Pick an employee to see their payslip history.'}
        actions={
          chosen && <DownloadButtons onDownload={(f) => reportsApi.downloadIndividual(employeeId, f, defId || undefined)} />
        }
      />
      <CardBody className="grid gap-4 border-b border-slate-100 sm:grid-cols-2">
        <div className="relative">
          <Field label="Employee">
            {(id) => <Input id={id} placeholder="Search by name or ID" leading={<Search className="size-4" />} value={search} onChange={(e) => setSearch(e.target.value)} />}
          </Field>
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-surface shadow-lg">
              {matches.map((e) => (
                <li key={e.id}>
                  <button
                    className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-primary-50"
                    onClick={() => {
                      setEmployeeId(e.id);
                      setSearch('');
                    }}
                  >
                    {e.name}
                    <span className="font-mono text-xs text-slate-500">{e.employeeIdNumber}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Field label="Period">
          {(id) => (
            <Select id={id} value={defId} onChange={(e) => setDefId(e.target.value)}>
              <option value="">All periods</option>
              {defs.sorted.map((d) => <option key={d.id} value={d.id}>{d.payrollName}</option>)}
            </Select>
          )}
        </Field>
      </CardBody>
      {!employeeId ? (
        <EmptyState icon={<User className="size-6" />} title="No employee selected" />
      ) : q.isLoading ? (
        <PageLoader />
      ) : notFound ? (
        <EmptyState icon={<FileText className="size-6" />} title="No payslips found" description="This employee has no payroll for the selected period." />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={<FileText className="size-6" />} title="No payslips found" />
      ) : (
        <PayslipTable rows={q.data} showName={false} />
      )}
    </Card>
  );
}

function LeaveReport() {
  const types = useQuery({ queryKey: ['reports', 'leave-types'], queryFn: reportsApi.leaveTypes });
  const depts = useQuery({ queryKey: ['reports', 'departments'], queryFn: reportsApi.departments, retry: false });
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [format, setFormat] = useState<ReportFormat>('excel');
  useEffect(() => {
    if (!leaveTypeId && types.data?.length) setLeaveTypeId((types.data.find((t) => t.shortName === 'AL') ?? types.data[0]!).id);
  }, [leaveTypeId, types.data]);
  const chosen = types.data?.find((t) => t.id === leaveTypeId);

  const download = useMutation({
    mutationFn: () => reportsApi.downloadLeave(leaveTypeId, format, departmentId || undefined),
    onSuccess: (name) => toast.success(`Downloaded ${name}`),
    onError: (err) => toast.error(toApiError(err).message),
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader icon={<Plane className="size-4.5" />} title="Annual leave report" description="Leave taken and balance per employee, as a spreadsheet." />
      <CardBody className="space-y-5">
        {types.error && <Alert tone="danger">{toApiError(types.error).message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Leave type" required>
            {(id) => (
              <Select id={id} value={leaveTypeId} disabled={types.isLoading} onChange={(e) => setLeaveTypeId(e.target.value)}>
                {types.isLoading && <option>Loading…</option>}
                {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.shortName ? ` (${t.shortName})` : ''}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Department" hint={depts.error ? "Departments couldn't be loaded" : undefined}>
            {(id) => (
              <Select id={id} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">All departments</option>
                {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.deptName}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Format">
            {(id) => (
              <Select id={id} value={format} onChange={(e) => setFormat(e.target.value as ReportFormat)}>
                <option value="excel">Excel (.xlsx)</option>
                <option value="csv">CSV</option>
              </Select>
            )}
          </Field>
        </div>
        {chosen?.shortName === 'AL' && (
          <p className="text-xs text-slate-500">Annual leave uses the AL template, which adds monthly leave days, total annual leave months and AL allocation.</p>
        )}
        <Button variant="accent" icon={<Download className="size-4" />} loading={download.isPending} disabled={!leaveTypeId} onClick={() => download.mutate()}>
          Download report
        </Button>
      </CardBody>
    </Card>
  );
}

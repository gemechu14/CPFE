import { useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BadgeCheck, Briefcase, CreditCard, KeyRound, Landmark, Lock, ShieldAlert, User } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { qk } from '@/hooks/queries';
import { employeesApi } from '@/lib/api';
import { toApiError } from '@/lib/http';
import { formatDate, formatDateTime, formatMoney, initials } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Alert, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Dialog } from '@/components/ui/Overlay';
import { CopyButton, DescList } from '@/components/ui/Page';
import { Tabs } from '@/components/ui/Tabs';
import { SourceBadge } from '@/components/domain';
import { Badge } from '@/components/ui/Badge';
import { BankVerifyDialog } from '@/features/approvals/BankVerifyDialog';
import type { Employee, HistoryRow } from '@/types/api';
import { StatusBadge } from './EmployeesPage';
import { HrSnapshotTab } from './HrSnapshotTab';
import { AttendanceLeaveTab } from './AttendanceLeaveTab';

type Tab = 'overview' | 'attendance' | 'hr' | 'access';

const openRow = (rows?: HistoryRow[]) => rows?.find((r) => r.toDate === null) ?? rows?.[rows.length - 1];
const nameOf = (o: unknown) => {
  if (!o || typeof o !== 'object') return undefined;
  const r = o as Record<string, unknown>;
  return (r.name ?? r.title ?? r.departmentName ?? r.positionName ?? r.gradeName) as string | undefined;
};

export function EmployeeDetailPage() {
  const { employeeId = '' } = useParams();
  const { can } = useAuth();
  // The active tab lives in the URL so it can be linked to and survives a reload.
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'overview';
  const setTab = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true });
  const [issueOpen, setIssueOpen] = useState(false);
  const q = useQuery({ queryKey: qk.employee(employeeId), queryFn: () => employeesApi.get(employeeId) });

  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const e = q.data;
  const synced = e.source === 'HR_SYNC';
  const noAccount = synced && !e.payrollInfo?.accountNumber;

  const tabs = [
    { value: 'overview' as const, label: 'Overview' },
    ...(synced && can(PERMS.viewEmployee)
      ? [
          { value: 'attendance' as const, label: 'Attendance & leave' },
          { value: 'hr' as const, label: 'HR data' },
        ]
      : []),
    { value: 'access' as const, label: 'Login & access' },
  ];

  return (
    <>
      <Link to="/employees" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-700">
        <ArrowLeft className="size-4" /> Employees
      </Link>

      <Card className="mb-6 overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-brand-800 via-brand-700 to-primary-600" />
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-6 pb-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="-mt-10 flex size-20 shrink-0 items-center justify-center rounded-2xl border-4 border-surface bg-primary-100 text-2xl font-semibold text-primary-800 shadow-md">
              {initials(e.name)}
            </span>
            <div className="min-w-0 pt-3">
              <h1 className="truncate text-xl leading-tight font-semibold text-slate-900">{e.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                {e.employeeIdNumber && <span className="font-mono text-xs text-slate-600">{e.employeeIdNumber}</span>}
                <StatusBadge status={e.status} />
                <SourceBadge source={e.source} lastSyncedAt={e.lastSyncedAt} />
              </div>
            </div>
          </div>
          {can(PERMS.updateEmployee) && (
            <Button variant="accent" className="mt-3" icon={<KeyRound className="size-4" />} onClick={() => setIssueOpen(true)}>
              {synced ? 'Send login' : 'Issue login'}
            </Button>
          )}
        </div>
        <div className="border-t border-slate-100 px-6">
          <Tabs items={tabs} value={tab} onChange={setTab} className="border-b-0" />
        </div>
      </Card>

      {noAccount && (
        <Alert tone="warning" className="mb-6" title="No salary account">
          HR has no net-pay account for this employee, so they can't be paid by bank transfer. Fix it in HR.
        </Alert>
      )}

      {tab === 'overview' && <Overview e={e} />}
      {tab === 'attendance' && <AttendanceLeaveTab employeeId={e.id} />}
      {tab === 'hr' && <HrSnapshotTab employeeId={e.id} />}
      {tab === 'access' && <Access e={e} onIssue={() => setIssueOpen(true)} canIssue={can(PERMS.updateEmployee)} />}

      <IssueLoginDialog open={issueOpen} onClose={() => setIssueOpen(false)} employee={e} />
    </>
  );
}

function Locked({ synced, children }: { synced: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      {synced && <Lock className="size-3 text-slate-400" aria-label="Managed by HR" />}
    </span>
  );
}

function Overview({ e }: { e: Employee }) {
  const { can } = useAuth();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const verified = (e.payrollInfo as { isVerified?: boolean } | null | undefined)?.isVerified;
  const synced = e.source === 'HR_SYNC';
  const L = (label: string) => <Locked synced={synced}>{label}</Locked>;
  const pos = openRow(e.positionHistory);
  const grade = openRow(e.gradeHistory);
  const dept = openRow(e.departmentHistory);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {synced && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500 lg:col-span-2">
          <Lock className="size-3" /> Fields with a lock come from HR and are read-only. The next sync overwrites any local change.
        </p>
      )}
      <Card>
        <CardHeader icon={<User className="size-4.5" />} title="Personal" />
        <CardBody>
          <DescList
            items={[
              { label: L('Full name'), value: e.name },
              { label: L('Gender'), value: e.gender },
              { label: L('Date of birth'), value: formatDate(e.dateOfBirth) },
              { label: L('Phone'), value: e.phoneNumber },
              { label: L('Email'), value: e.email },
              { label: L('TIN'), value: e.tinNumber },
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={<Briefcase className="size-4.5" />} title="Job" />
        <CardBody>
          <DescList
            items={[
              { label: L('Position'), value: nameOf(pos?.position) ?? nameOf(pos), hint: pos?.fromDate && `since ${formatDate(pos.fromDate)}` },
              { label: L('Grade'), value: nameOf(grade?.grade) ?? nameOf(grade), hint: grade?.fromDate && `since ${formatDate(grade.fromDate)}` },
              { label: L('Department'), value: nameOf(dept?.department) ?? nameOf(dept), hint: dept?.fromDate && `since ${formatDate(dept.fromDate)}` },
              { label: L('Hire date'), value: formatDate(e.hireDate) },
              ...(synced ? [{ label: 'HR record', value: <code className="text-xs">{e.hrEmployeeRecord ?? '—'}</code> }] : []),
            ]}
          />
        </CardBody>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader
          icon={<CreditCard className="size-4.5" />}
          title="Payroll"
          actions={
            <>
              {verified === true && <Badge tone="success" icon={<BadgeCheck className="size-3" />}>Account verified</Badge>}
              {verified === false && <Badge tone="warning">Account not verified</Badge>}
              {can(PERMS.createEmployee) && e.payrollInfo?.accountNumber && (
                <Button variant="outline" size="sm" icon={<Landmark className="size-3.5" />} onClick={() => setVerifyOpen(true)}>
                  Verify with bank
                </Button>
              )}
            </>
          }
        />
        <CardBody>
          <DescList
            cols={3}
            items={[
              { label: L('Basic salary'), value: e.payrollInfo?.basicSalary !== undefined ? <span className="num">{formatMoney(e.payrollInfo.basicSalary, { currency: true })}</span> : '—' },
              {
                label: L('Account number'),
                value: e.payrollInfo?.accountNumber ? <span className="font-mono">{e.payrollInfo.accountNumber}</span> : <span className="text-amber-700">Missing</span>,
              },
              { label: 'Cost center', value: e.payrollInfo?.costCenterId ?? '—' },
            ]}
          />
          {verified === false && <p className="mt-4 text-xs text-amber-700">Payments skip employees whose bank account isn't verified.</p>}
        </CardBody>
      </Card>
      <BankVerifyDialog
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        employee={{ id: e.id, name: e.name, payrollInfo: e.payrollInfo as { id?: string; accountNumber?: string | null; isVerified?: boolean } | null }}
      />
    </div>
  );
}

function Access({ e, onIssue, canIssue }: { e: Employee; onIssue: () => void; canIssue: boolean }) {
  const roles = e.roles ?? [];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader icon={<KeyRound className="size-4.5" />} title="Login" />
        <CardBody className="space-y-4">
          <DescList cols={1} items={[{ label: 'Username', value: e.username ? <code>{e.username}</code> : '—' }, { label: 'Email', value: e.email }]} />
          {e.source === 'HR_SYNC' && (
            <p className="text-sm text-slate-500">Employees synced from HR can't sign in until an admin issues them a temporary password.</p>
          )}
          {canIssue && (
            <Button variant="secondary" onClick={onIssue}>
              Generate temporary password
            </Button>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader icon={<ShieldAlert className="size-4.5" />} title="Roles" />
        <CardBody>
          {roles.length ? (
            <ul className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <li key={r.id} className="rounded-full bg-primary-50 px-3 py-1 text-sm text-primary-800">
                  {r.name}
                </li>
              ))}
            </ul>
          ) : (
            <Alert tone="warning">No role assigned. This employee can sign in but won't have access to anything until a role is assigned in the role screens.</Alert>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function IssueLoginDialog({ open, onClose, employee }: { open: boolean; onClose: () => void; employee: Employee }) {
  const [email, setEmail] = useState(employee.email ?? '');
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gen = useMutation({
    mutationFn: () => employeesApi.generatePassword(employee.id, email.trim()),
    onSuccess: (d) => setPassword(d.temporaryPassword),
    onError: (err) => setError(toApiError(err).message),
  });

  const close = () => {
    if (password) toast.success('Temporary password issued');
    setPassword(null);
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={password ? 'Temporary password' : `Issue login for ${employee.name}`}
      description={password ? 'Shown only once. Copy it now and pass it to the employee securely.' : 'A temporary password is generated. The employee must change it on first sign-in.'}
      size="sm"
      footer={
        password ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button variant="accent" loading={gen.isPending} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onClick={() => gen.mutate()}>
              Generate password
            </Button>
          </>
        )
      }
    >
      {password ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-dashed border-accent-300 bg-accent-50 px-4 py-3">
            <code className="text-lg font-semibold tracking-wide break-all text-slate-900">{password}</code>
            <CopyButton value={password} />
          </div>
          <dl className="text-sm text-slate-600">
            <div className="flex justify-between">
              <dt>Username</dt>
              <dd className="font-mono">{employee.username ?? '—'}</dd>
            </div>
          </dl>
          <p className="text-xs text-slate-500">Generated {formatDateTime(new Date().toISOString())}. It isn't sent automatically.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Email" hint={employee.source === 'HR_SYNC' ? 'Use the email from HR. It is saved on the employee.' : 'Saved on the employee.'}>
            {(id) => <Input id={id} type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} />}
          </Field>
        </div>
      )}
    </Dialog>
  );
}

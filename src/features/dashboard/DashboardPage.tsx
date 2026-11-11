import { Link } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, Banknote, CalendarClock, ClipboardList, CloudDownload, FileBarChart, PlayCircle, Users } from 'lucide-react';
import { useAdjustments, useCurrentPayroll, useEmployees, useSchedule, useSettings, useSyncRuns } from '@/hooks/queries';
import { formatDate, formatInt, formatMoney, formatPeriod, formatRelative, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

import { PageHeader, StatTile } from '@/components/ui/Page';
import { SyncStatusBadge } from '@/components/domain';
import { MonthSummaryCard } from './MonthSummaryCard';
import { SyncNowButton } from '../hr-sync/SyncNowButton';

const DAY = 86_400_000;

/** One-screen overview: four key numbers, this period's payroll, and shortcuts to the next steps. */
export function DashboardPage() {
  const settings = useSettings();
  const isHr = settings.data?.employeeSource === 'HR_SYNC';
  const employees = useEmployees();
  const runs = useSyncRuns();
  const pending = useAdjustments({ status: 'PENDING' });

  // The backend picks the current period: active, else upcoming, else the latest past one.
  const currentPayroll = useCurrentPayroll();
  const current = currentPayroll.data?.payrollDefinition ?? undefined;
  const schedule = useSchedule(current?.id);

  const fromHr = employees.data?.filter((e) => e.source === 'HR_SYNC').length ?? 0;
  const pendingRows = pending.data?.data ?? [];
  const pendingNet = pendingRows.reduce((s, a) => s + toNumber(a.amount), 0);
  const review = pendingRows.filter((a) => a.needsReview).length;

  const cutoffIn = schedule.data ? Math.ceil((new Date(schedule.data.cutoffDate).getTime() - Date.now()) / DAY) : null;
  const notRun = currentPayroll.data?.unprocessedEmployees ?? 0;


  const actions = [
    { to: '/payroll/run', icon: PlayCircle, label: 'Run payroll', text: 'Pick employees and create payroll' },
    { to: '/payroll/month', icon: ClipboardList, label: 'This month', text: 'Review, approve and track' },
    { to: '/payments', icon: Banknote, label: 'Pay salaries', text: 'Send approved salaries to the bank' },
    { to: '/payroll/adjustments', icon: ArrowLeftRight, label: 'Arrears & recoveries', text: `${formatInt(pendingRows.length)} pending` },
    { to: '/reports', icon: FileBarChart, label: 'Reports', text: 'Payslips and leave report' },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={isHr ? `Employees sync from HR · last synced ${formatRelative(settings.data?.lastSyncedAt)}` : 'Employees are managed manually.'}
        actions={
          <>
            {isHr && <SyncNowButton variant="outline" />}
            <Link to="/payroll/run">
              <Button icon={<PlayCircle className="size-4" />}>Run payroll</Button>
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Employees"
          loading={employees.isLoading}
          value={formatInt(employees.data?.length)}
          hint={isHr ? `${formatInt(fromHr)} synced from HR` : 'managed manually'}
          icon={<Users className="size-4.5" />}
        />
        <StatTile
          label={currentPayroll.data?.status === 'upcoming' ? 'Upcoming period' : currentPayroll.data?.status === 'expired' ? 'Latest period' : 'Current period'}
          loading={currentPayroll.isLoading || schedule.isLoading}
          value={current?.payrollName ?? '—'}
          hint={
            schedule.data &&
            (cutoffIn !== null && cutoffIn >= 0 ? `Cutoff in ${cutoffIn} day${cutoffIn === 1 ? '' : 's'} · ${formatDate(schedule.data.cutoffDate)}` : `Cutoff ${formatDate(schedule.data.cutoffDate)}`)
          }
          icon={<CalendarClock className="size-4.5" />}
          tone="accent"
        />
        <StatTile
          label="Pending arrears / recoveries"
          loading={pending.isLoading}
          value={<span className={pendingNet < 0 ? 'text-red-600' : undefined}>{formatMoney(pendingNet, { sign: true })}</span>}
          hint={`${formatInt(pendingRows.length)} items${review ? ` · ${review} need review` : ''}`}
          icon={<ArrowLeftRight className="size-4.5" />}
          tone="warning"
        />
        <StatTile
          label="Last HR sync"
          loading={runs.isLoading}
          value={runs.data?.[0] ? <SyncStatusBadge status={runs.data[0].status} /> : isHr ? 'No runs' : 'Off'}
          hint={runs.data?.[0] ? `${formatPeriod(runs.data[0].period)} · ${formatRelative(runs.data[0].startedAt)}` : isHr ? 'Run a sync to get started' : 'Manual employee source'}
          icon={<CloudDownload className="size-4.5" />}
          tone="success"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <MonthSummaryCard periodName={current?.payrollName} state={schedule.data?.state} notRun={notRun} loadingPeriod={currentPayroll.isLoading} />

        {/* Quick actions */}
        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader title="Quick actions" />
          <CardBody className="space-y-2">
            {actions.map((a) => (
              <Link key={a.to} to={a.to} className="group flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 transition hover:border-primary-300 hover:bg-primary-50/50">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary-500 text-white shadow-sm shadow-primary-500/30 transition-colors group-hover:bg-primary-600">
                  <a.icon className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{a.label}</span>
                  <span className="block truncate text-xs text-slate-500">{a.text}</span>
                </span>
                <ArrowRight className="size-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-500" />
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

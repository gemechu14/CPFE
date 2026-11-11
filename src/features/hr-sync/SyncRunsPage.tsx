import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CloudDownload, History, Users } from 'lucide-react';
import { useSettings, useSyncRuns, qk } from '@/hooks/queries';
import { hrSyncApi } from '@/lib/api';
import { formatDateTime, formatDuration, formatInt, formatPeriod, formatRelative } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { Alert, EmptyState, ErrorState, PageLoader, Spinner } from '@/components/ui/Feedback';
import { Drawer } from '@/components/ui/Overlay';
import { PageHeader, StatTile } from '@/components/ui/Page';
import { Segmented } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { SyncStatusBadge } from '@/components/domain';
import type { HrSyncRun, SyncStatus } from '@/types/api';
import { SyncNowButton } from './SyncNowButton';

type Filter = 'ALL' | SyncStatus;

export function SyncRunsPage() {
  const settings = useSettings();
  const runs = useSyncRuns();
  const [params, setParams] = useSearchParams();
  const selected = params.get('run');
  const [filter, setFilter] = useState<Filter>('ALL');

  const list = useMemo(() => (runs.data ?? []).filter((r) => filter === 'ALL' || r.status === filter), [runs.data, filter]);
  const latest = runs.data?.[0];
  const running = runs.data?.some((r) => r.status === 'RUNNING');

  if (settings.data && settings.data.employeeSource !== 'HR_SYNC') {
    return (
      <>
        <PageHeader title="HR sync" />
        <Alert tone="info" title="HR sync is not enabled">
          Your company manages employees manually. Switch the employee source in <Link to="/settings/payroll" className="font-medium underline">Payroll settings</Link>.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="HR sync"
        description={
          <>
            Last synced <span className="font-medium text-slate-700">{formatRelative(settings.data?.lastSyncedAt)}</span>
            {settings.data?.syncEnabled ? ` · runs every ${settings.data.syncIntervalHours} hours` : ' · scheduled sync is off'}
          </>
        }
        actions={<SyncNowButton />}
      />

      {settings.data && !settings.data.hrConnectionConfigured && (
        <Alert tone="warning" className="mb-6" title="HR connection not configured">
          Syncs will fail until the HR connection is saved. <Link to="/settings/hr-connection" className="font-medium underline">Set it up</Link>
        </Alert>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Latest run" loading={runs.isLoading} value={latest ? <SyncStatusBadge status={latest.status} /> : '—'} hint={latest ? `${formatPeriod(latest.period)} · ${formatRelative(latest.startedAt)}` : 'No runs yet'} icon={<History className="size-4.5" />} />
        <StatTile label="Records fetched" loading={runs.isLoading} value={formatInt(latest?.fetched)} hint="in the latest run" icon={<Users className="size-4.5" />} />
        <StatTile label="Created / updated" loading={runs.isLoading} value={`${formatInt(latest?.created)} / ${formatInt(latest?.updated)}`} hint={`${formatInt(latest?.unchanged)} unchanged`} icon={<CloudDownload className="size-4.5" />} tone="accent" />
        <StatTile label="Arrears generated" loading={runs.isLoading} value={formatInt(latest?.adjustmentsGenerated)} hint="adjustments from late HR changes" icon={<CalendarClock className="size-4.5" />} tone="warning" />
      </div>

      <Card>
        <CardHeader
          title="Sync runs"
          description="Latest 50 runs, newest first."
          actions={
            <div className="flex items-center gap-3">
              {running && (
                <span className="flex items-center gap-2 text-xs text-primary-700">
                  <Spinner className="size-3.5" /> Refreshing while a run is in progress
                </span>
              )}
              <Segmented<Filter>
                value={filter}
                onChange={setFilter}
                items={[
                  { value: 'ALL', label: 'All' },
                  { value: 'RUNNING', label: 'Running' },
                  { value: 'PARTIAL', label: 'Partial' },
                  { value: 'FAILED', label: 'Failed' },
                ]}
              />
            </div>
          }
        />
        {runs.isLoading ? (
          <PageLoader />
        ) : runs.error ? (
          <ErrorState error={runs.error} onRetry={() => runs.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={<CloudDownload className="size-6" />} title={filter === 'ALL' ? 'No sync runs yet' : 'No runs match this filter'} description="Start a sync to pull employees from HR." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Status</TH>
                <TH>Period</TH>
                <TH>Trigger</TH>
                <TH>Started</TH>
                <TH>Duration</TH>
                <TH align="right">Fetched</TH>
                <TH align="right">Created</TH>
                <TH align="right">Updated</TH>
                <TH align="right">Skipped</TH>
                <TH align="right">Failed</TH>
                <TH align="right">Arrears</TH>
              </tr>
            </THead>
            <TBody>
              {list.map((r) => (
                <TR key={r.id} onClick={() => setParams({ run: r.id })}>
                  <TD><SyncStatusBadge status={r.status} /></TD>
                  <TD className="font-medium text-slate-900">{formatPeriod(r.period)}</TD>
                  <TD><Badge tone={r.trigger === 'MANUAL' ? 'accent' : 'neutral'}>{r.trigger === 'MANUAL' ? 'Manual' : 'Scheduled'}</Badge></TD>
                  <TD className="whitespace-nowrap">{formatDateTime(r.startedAt)}</TD>
                  <TD className="num">{formatDuration(r.startedAt, r.finishedAt)}</TD>
                  <TD align="right">{formatInt(r.fetched)}</TD>
                  <TD align="right">{formatInt(r.created)}</TD>
                  <TD align="right">{formatInt(r.updated)}</TD>
                  <TD align="right" className={r.skipped ? 'text-amber-700' : ''}>{formatInt(r.skipped)}</TD>
                  <TD align="right" className={r.failed ? 'font-medium text-red-600' : ''}>{formatInt(r.failed)}</TD>
                  <TD align="right">{formatInt(r.adjustmentsGenerated)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <RunDrawer
        id={selected}
        initial={runs.data?.find((r) => r.id === selected)}
        onClose={() => {
          params.delete('run');
          setParams(params);
        }}
      />
    </>
  );
}

function RunDrawer({ id, initial, onClose }: { id: string | null; initial?: HrSyncRun; onClose: () => void }) {
  const q = useQuery({
    queryKey: qk.syncRun(id ?? ''),
    queryFn: () => hrSyncApi.runById(id!),
    enabled: !!id,
    initialData: initial,
    refetchInterval: (query) => (query.state.data?.status === 'RUNNING' ? 4000 : false),
  });
  const run = q.data;

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={run ? `Sync · ${formatPeriod(run.period)}` : 'Sync run'}
      description={run && <span className="flex items-center gap-2"><SyncStatusBadge status={run.status} /> {run.trigger === 'MANUAL' ? 'Manual' : 'Scheduled'} · {formatDateTime(run.startedAt)}</span>}
    >
      {!run ? (
        q.error ? <ErrorState error={q.error} /> : <PageLoader />
      ) : (
        <div className="space-y-6">
          {run.status === 'FAILED' && run.errors?.[0] && <Alert tone="danger" title="The run stopped">{run.errors[0].message}</Alert>}
          {run.status === 'PARTIAL' && <Alert tone="warning" title="Some records were skipped or failed">Review the errors below. HR data may need fixing.</Alert>}

          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ['Fetched', run.fetched],
                ['Created', run.created],
                ['Updated', run.updated],
                ['Unchanged', run.unchanged],
                ['Skipped', run.skipped],
                ['Failed', run.failed],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="rounded-lg border border-slate-200 px-3 py-2.5">
                <div className="text-xs text-slate-500">{label}</div>
                <div className="num mt-0.5 text-lg font-semibold text-slate-900">{formatInt(v)}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-accent-50 px-4 py-3 text-sm">
            <span className="text-accent-900">Arrears / recoveries generated</span>
            <span className="num font-semibold text-accent-900">{formatInt(run.adjustmentsGenerated)}</span>
          </div>
          <div className="text-xs text-slate-500">
            Duration {formatDuration(run.startedAt, run.finishedAt)}
            {run.finishedAt ? ` · finished ${formatDateTime(run.finishedAt)}` : ' · still running'}
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <AlertTriangle className="size-4 text-amber-500" /> Errors {run.errors?.length ? `(${run.errors.length})` : ''}
            </h3>
            {!run.errors?.length ? (
              <p className="text-sm text-slate-500">No errors.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {run.errors.map((e, i) => (
                  <li key={i} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      {e.employeeRecord && <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{e.employeeRecord}</code>}
                      {e.employeeId && (
                        <Link to={`/employees/${e.employeeId}`} className="text-xs font-medium text-primary-700 hover:underline">
                          View employee
                        </Link>
                      )}
                    </div>
                    <p className="mt-1 break-words text-slate-700">{e.message}</p>
                    {/P2002/.test(e.message) && <p className="mt-1 text-xs text-slate-500">Another employee already has this account number or email. Fix it in HR.</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

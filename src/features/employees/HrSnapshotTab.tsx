import { useState } from 'react';
import { Coins, FileSearch, Gift, IdCard, Landmark, MapPin } from 'lucide-react';
import { toApiError } from '@/lib/http';
import { currentPeriod, formatDate, formatDateTime, formatMoney, formatPeriod } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { DescList } from '@/components/ui/Page';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { MonthStepper, useSnapshot } from './snapshot';

export function HrSnapshotTab({ employeeId }: { employeeId: string }) {
  const [period, setPeriod] = useState(currentPeriod());
  const q = useSnapshot(employeeId, period);

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-slate-500">
        Exactly what HR returned for {formatPeriod(period)}
        {q.data && <> · synced {formatDateTime(q.data.syncedAt)}</>}
      </div>
      <MonthStepper value={period} onChange={setPeriod} />
    </div>
  );

  if (q.isLoading) return <>{header}<PageLoader /></>;
  if (q.error) {
    if (toApiError(q.error).status === 404) {
      return (
        <>
          {header}
          <Card>
            <EmptyState icon={<FileSearch className="size-6" />} title="No HR snapshot for this period" description="Pick another month, or run an HR sync for it." />
          </Card>
        </>
      );
    }
    return <>{header}<Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card></>;
  }
  const r = q.data!.payload.record;
  const placements = r.placement_history ?? [];

  return (
    <>
      {header}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader icon={<MapPin className="size-4.5" />} title="Placement history" description="Segments within the month. The latest segment is the current placement." />
          {placements.length === 0 ? (
            <CardBody className="text-sm text-slate-500">No placement segments.</CardBody>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>From – to</TH>
                  <TH>Position</TH>
                  <TH>Grade</TH>
                  <TH>Unit</TH>
                  <TH>Event</TH>
                  <TH align="right">Salary</TH>
                </tr>
              </THead>
              <TBody>
                {placements.map((p, i) => (
                  <TR key={i} className={i === placements.length - 1 ? 'bg-primary-50/40' : ''}>
                    <TD className="whitespace-nowrap">{formatDate(p.from)} – {formatDate(p.to)}</TD>
                    <TD>
                      <span className="font-medium text-slate-900">{p.position?.name ?? '—'}</span>
                      {p.is_acting && <Badge tone="accent" className="ml-2">Acting</Badge>}
                    </TD>
                    <TD>{p.job_grade?.name ?? '—'}</TD>
                    <TD>{p.organization_unit?.name ?? '—'}</TD>
                    <TD className="text-xs">
                      {p.hr_event ?? '—'}
                      {p.movement_reason && <div className="text-slate-500">{p.movement_reason}</div>}
                    </TD>
                    <TD align="right">{p.salary_amount != null ? formatMoney(p.salary_amount) : '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader icon={<Coins className="size-4.5" />} title="Salary" />
          <CardBody>
            <DescList
              items={[
                { label: 'Amount', value: r.salary?.salary_amount != null ? <span className="num">{formatMoney(r.salary.salary_amount, { currency: true })}</span> : '—' },
                { label: 'Scale', value: r.salary?.salary_scale?.name },
                { label: 'Step', value: r.salary?.step?.toString() },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Gift className="size-4.5" />} title="Benefits" />
          <CardBody>
            {r.benefits?.items?.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {r.benefits.items.map((b, i) => (
                  <li key={i} className="flex justify-between py-2">
                    <span className="text-slate-700">{b.benefit_type}</span>
                    <span className="num font-medium text-slate-900">
                      {formatMoney(b.amount)} {b.unit && <span className="text-xs font-normal text-slate-500">{b.unit}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No benefits.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<IdCard className="size-4.5" />} title="Identifiers" />
          <CardBody>
            <DescList
              cols={3}
              items={[
                { label: 'TIN', value: r.identifiers?.tin },
                { label: 'FAN', value: r.identifiers?.fan },
                { label: 'Pension no.', value: r.identifiers?.pension_number },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Landmark className="size-4.5" />} title="Bank" />
          <CardBody>
            {r.bank?.net_pay_account ? (
              <DescList cols={1} items={[{ label: 'Net-pay account', value: <span className="font-mono">{r.bank.net_pay_account}</span> }]} />
            ) : (
              <Alert tone="warning" title="No net-pay account">The employee can't be paid by transfer until HR adds one.</Alert>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Feedback';
import { Drawer } from '@/components/ui/Overlay';
import { DescList } from '@/components/ui/Page';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { AdjustmentStatusBadge, COMPONENT_LABEL, SignedAmount } from '@/components/domain';
import type { PayrollAdjustment, Segment } from '@/types/api';

export function AdjustmentsTable({ rows, showStatus = true }: { rows: PayrollAdjustment[]; showStatus?: boolean }) {
  const [open, setOpen] = useState<PayrollAdjustment | null>(null);
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>Employee</TH>
            <TH>From month</TH>
            <TH>Component</TH>
            <TH align="right">Amount</TH>
            <TH>Reason</TH>
            {showStatus && <TH>Status</TH>}
          </tr>
        </THead>
        <TBody>
          {rows.map((a) => (
            <TR key={a.id} onClick={() => setOpen(a)} className={cn(a.needsReview && 'bg-amber-50/70 hover:bg-amber-50')}>
              <TD>
                <div className="flex items-center gap-2">
                  {a.needsReview && <AlertTriangle className="size-4 shrink-0 text-amber-500" aria-label="Needs review" />}
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">{a.employee.name}</div>
                    <div className="text-xs text-slate-500">
                      {a.employee.employeeIdNumber ?? '—'}
                      {a.needsReview && <span className="ml-1.5 text-amber-700">· {a.employee.status.toLowerCase()}, settle by hand</span>}
                    </div>
                  </div>
                </div>
              </TD>
              <TD className="whitespace-nowrap">{a.sourcePeriod.payrollName}</TD>
              <TD>
                <Badge tone={a.component === 'LWOP' ? 'warning' : 'neutral'}>{COMPONENT_LABEL[a.component]}</Badge>
                {!a.isTaxable && <span className="ml-1.5 text-xs text-slate-400">non-taxable</span>}
              </TD>
              <TD align="right"><SignedAmount value={a.amount} /></TD>
              <TD className="max-w-xs truncate text-xs text-slate-500" title={a.reason ?? ''}>{a.reason ?? '—'}</TD>
              {showStatus && <TD><AdjustmentStatusBadge status={a.status} /></TD>}
            </TR>
          ))}
        </TBody>
      </Table>
      <AdjustmentDrawer adjustment={open} onClose={() => setOpen(null)} />
    </>
  );
}

function AdjustmentDrawer({ adjustment: a, onClose }: { adjustment: PayrollAdjustment | null; onClose: () => void }) {
  if (!a) return null;
  const n = Number(a.amount);
  return (
    <Drawer
      open
      onClose={onClose}
      title={`${n >= 0 ? 'Arrears' : 'Recovery'} · ${COMPONENT_LABEL[a.component]}`}
      description={
        <span className="flex items-center gap-2">
          <AdjustmentStatusBadge status={a.status} />
          <Link to={`/employees/${a.employee.id}`} className="font-medium text-primary-700 hover:underline">{a.employee.name}</Link>
        </span>
      }
    >
      <div className="space-y-6">
        {a.needsReview && (
          <Alert tone="warning" title="Needs review">
            This employee is no longer active ({a.employee.status.toLowerCase()}), so it won't be picked up by the next payroll automatically. Settle it by hand.
          </Alert>
        )}
        {a.status === 'PENDING' && <Alert tone="info">Pending amounts are recalculated on every HR sync until they are paid. Only applied amounts are final.</Alert>}

        <div className={cn('rounded-xl p-5 text-center', n >= 0 ? 'bg-emerald-50' : 'bg-red-50')}>
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{n >= 0 ? 'Owed to employee' : 'To recover'}</div>
          <SignedAmount value={a.amount} className="mt-1 block text-3xl font-semibold" />
          <div className="mt-1 text-xs text-slate-500">{a.isTaxable ? 'Taxed in the month it is paid' : 'Not taxable'}</div>
        </div>

        {a.details && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-4">
            <Figure label="Paid" value={a.details.paid} />
            <ArrowRight className="size-4 text-slate-400" />
            <Figure label="Should have been" value={a.details.final} />
            {a.details.alreadyApplied !== 0 && (
              <>
                <span className="text-slate-400">−</span>
                <Figure label="Already corrected" value={a.details.alreadyApplied} />
              </>
            )}
          </div>
        )}

        <DescList
          items={[
            { label: 'Corrects', value: a.sourcePeriod.payrollName },
            { label: 'Paid in', value: a.targetPeriod?.payrollName ?? 'Next payroll run' },
            { label: 'Created', value: formatDateTime(a.createdAt) },
            { label: 'Applied', value: a.appliedAt ? formatDateTime(a.appliedAt) : '—' },
          ]}
        />
        {a.reason && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{a.reason}</p>}

        {a.details?.finalSegments?.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Final calculation segments</h3>
            <SegmentsTable segments={a.details.finalSegments} />
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="num text-sm font-semibold text-slate-900">{formatMoney(value)}</div>
    </div>
  );
}

export function SegmentsTable({ segments }: { segments: Segment[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <Table>
        <THead>
          <tr>
            <TH>Dates</TH>
            <TH align="right">Days</TH>
            <TH align="right">Monthly</TH>
            <TH align="right">Amount</TH>
          </tr>
        </THead>
        <TBody>
          {segments.map((s, i) => (
            <TR key={i} className={s.assumed ? 'bg-amber-50/50' : ''}>
              <TD className="text-xs whitespace-nowrap">
                {formatDate(s.from, { day: '2-digit', month: 'short' })} – {formatDate(s.to, { day: '2-digit', month: 'short' })}
                {s.assumed && <div className="text-amber-700">assumed after cutoff</div>}
              </TD>
              <TD align="right" className="text-xs">{s.days}/{s.divisor}</TD>
              <TD align="right" className="text-xs">{formatMoney(s.monthlySalary)}</TD>
              <TD align="right" className="text-xs font-medium">
                {formatMoney(s.amount)}
                {s.actingAmount ? <div className="font-normal text-slate-500">+{formatMoney(s.actingAmount)} acting</div> : null}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { useAdjustments } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import { formatDate, formatMoney, formatPeriod, toNumber } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Feedback';
import { Drawer } from '@/components/ui/Overlay';
import { COMPONENT_LABEL } from '@/components/domain';
import type { PayrollRow } from '@/types/api';
import { SegmentsTable } from './AdjustmentsTable';

export function PayslipDrawer({ row, employeeName, onClose }: { row: PayrollRow | null; employeeName?: string; onClose: () => void }) {
  const defId = row?.payrollDefinitionId ?? row?.payrollDefinition?.id;
  const adj = useAdjustments({ payrollDefinitionId: defId, status: 'APPLIED' }, !!row?.calculationBasis?.appliedAdjustmentIds.length);
  if (!row) return null;

  const cb = row.calculationBasis;
  const applied = cb ? (adj.data?.data ?? []).filter((a) => cb.appliedAdjustmentIds.includes(a.id)) : [];
  const otEntries = cb ? Object.entries(cb.detail.overtimeByCategory ?? {}) : [];

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      title={`Payslip · ${employeeName ?? row.employee?.name ?? 'Employee'}`}
      description={
        <span className="flex flex-wrap items-center gap-2">
          {row.payrollDefinition?.payrollName ?? (cb && formatPeriod(cb.period))}
          {cb && <Badge tone={cb.mode === 'FINAL' ? 'success' : 'accent'}>{cb.mode === 'FINAL' ? 'Final' : 'Provisional'}</Badge>}
        </span>
      }
    >
      <div className="space-y-6">
        {cb?.mode === 'PROVISIONAL' && (
          <Alert tone="info" title={`Calculated at cutoff (${formatDate(cb.cutoffDate, { day: 'numeric', month: 'short' })})`}>
            Later changes settle next month as arrears or recoveries.
          </Alert>
        )}

        {cb ? (
          <>
            <Section title="Earnings">
              <Line label="Basic (prorated)" value={cb.components.basic} />
              {cb.components.acting ? <Line label="Acting allowance" value={cb.components.acting} /> : null}
              {cb.detail.allowances.map((a) => (
                <Line key={a.name} label={a.name} value={a.amount} />
              ))}
              {otEntries.map(([cat, o]) => (
                <Line key={cat} label={`Overtime · ${cat}`} sub={`${o.hours} h × ${o.rate}`} value={o.amount} />
              ))}
              {cb.components.lwop ? (
                <Line label="Unpaid leave / absence" sub={`${cb.detail.lwopDays} LWOP days · ${cb.detail.absentDays} absent`} value={-Math.abs(cb.components.lwop)} />
              ) : null}
            </Section>

            {cb.detail.segments.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Basic salary by placement</h3>
                <SegmentsTable segments={cb.detail.segments} />
              </div>
            )}

            {cb.appliedAdjustmentIds.length > 0 && (
              <Section title="Arrears & recoveries">
                {adj.isLoading && <p className="py-2 text-sm text-slate-500">Loading…</p>}
                {applied.map((a) => (
                  <Line key={a.id} label={`${toNumber(a.amount) >= 0 ? 'Arrears' : 'Recovery'} ${a.sourcePeriod.payrollName} – ${COMPONENT_LABEL[a.component]}`} value={a.amount} signed />
                ))}
              </Section>
            )}
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Info className="size-4" /> Calculated with the standard (manual) method.
          </p>
        )}

        <Section title="Summary">
          <Line label="Gross salary" value={row.grossSalary} strong />
          <Line label="Taxable income" value={row.taxableIncome} muted />
          <Line label="Income tax" value={-toNumber(row.incomeTax)} />
          <Line label="Employee pension" value={-toNumber(row.employeePensionAmount)} />
          <Line label="Employee provident fund" value={-toNumber(row.employeeProvidentFundAmount)} />
          <div className="mt-2 flex items-center justify-between rounded-lg bg-brand-800 px-4 py-3 text-white">
            <span className="text-sm font-medium">Net pay</span>
            <span className="num text-xl font-semibold">{formatMoney(row.netSalary, { currency: true })}</span>
          </div>
        </Section>

        <Section title="Employer cost">
          <Line label="Employer pension" value={row.employerPensionAmount} muted />
          <Line label="Employer provident fund" value={row.employerProvidentFundAmount} muted />
        </Section>
      </div>
    </Drawer>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

export function Line({ label, sub, value, strong, muted, signed }: { label: ReactNode; sub?: ReactNode; value: unknown; strong?: boolean; muted?: boolean; signed?: boolean }) {
  const n = toNumber(value as string | number | undefined);
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className={cn(muted ? 'text-slate-500' : 'text-slate-700', strong && 'font-semibold text-slate-900')}>
        {label}
        {sub && <span className="block text-xs text-slate-400">{sub}</span>}
      </span>
      <span className={cn('num', strong && 'font-semibold text-slate-900', signed && (n >= 0 ? 'text-emerald-700' : 'text-red-600'), !signed && n < 0 && 'text-slate-600')}>
        {formatMoney(n, { sign: signed })}
      </span>
    </div>
  );
}

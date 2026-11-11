import { Info } from 'lucide-react';
import { formatDate, formatMoney, formatPeriod, toNumber } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Drawer } from '@/components/ui/Overlay';
import { COMPONENT_LABEL } from '@/components/domain';
import type { CalculatedPayroll, PayrollAdjustment } from '@/types/api';
import { SegmentsTable } from './AdjustmentsTable';
import { Line, Section } from './PayslipDrawer';

/** Breakdown of one not-yet-run estimate (GET /payroll/definition/:id), laid out like the payslip. */
export function EstimateDrawer({
  row,
  idNumber,
  periodName,
  pending,
  included,
  onToggle,
  onClose,
}: {
  row: CalculatedPayroll | null;
  idNumber?: string | null;
  periodName?: string;
  pending: PayrollAdjustment[];
  included: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  if (!row) return null;

  const cb = row.calculationBasis;
  const allowances = cb?.detail.allowances ?? [];
  const allowanceSum = allowances.reduce((s, a) => s + toNumber(a.amount), 0) + toNumber(cb?.components.acting);
  const otEntries = cb ? Object.entries(cb.detail.overtimeByCategory ?? {}) : [];
  const grade = row.employee.gradeHistory?.[0]?.grade?.name;
  const mine = pending.filter((a) => a.employeeId === row.employeeId);
  const pendingNet = mine.filter((a) => !a.needsReview).reduce((s, a) => s + toNumber(a.amount), 0);

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      title={row.employee.name}
      description={
        <span className="flex flex-wrap items-center gap-2">
          {idNumber && <span className="font-mono text-xs">{idNumber}</span>}
          {grade && <span>Grade {grade}</span>}
          <span>· {periodName ?? (cb && formatPeriod(cb.period))} estimate</span>
          {cb && <Badge tone={cb.mode === 'FINAL' ? 'success' : 'accent'}>{cb.mode === 'FINAL' ? 'Final' : 'Provisional'}</Badge>}
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant={included ? 'outline' : 'primary'} onClick={onToggle}>
            {included ? 'Leave out of this run' : 'Include in this run'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Alert tone="info">
          Not saved yet. These are the amounts the run would create
          {cb?.mode === 'PROVISIONAL' && <>, calculated at cutoff ({formatDate(cb.cutoffDate, { day: 'numeric', month: 'short' })}); later changes settle next month</>}.
        </Alert>

        <Section title="Earnings">
          <Line label={cb ? 'Basic (prorated)' : 'Basic salary'} value={cb ? cb.components.basic : row.basicSalary} />
          {cb ? (
            <>
              {cb.components.acting ? <Line label="Acting allowance" value={cb.components.acting} /> : null}
              {allowances.map((a, i) => (
                <Line key={`${a.name}-${i}`} label={a.name} value={a.amount} />
              ))}
              {otEntries.map(([cat, o]) => (
                <Line key={cat} label={`Overtime · ${cat}`} sub={`${o.hours} h × ${o.rate}`} value={o.amount} />
              ))}
              {cb.components.lwop ? (
                <Line label="Unpaid leave / absence" sub={`${cb.detail.lwopDays} LWOP days · ${cb.detail.absentDays} absent`} value={-Math.abs(cb.components.lwop)} />
              ) : null}
            </>
          ) : (
            <Line label="Allowances (total)" value={row.totalAllowance} />
          )}
          <Line label="Gross salary" value={row.grossSalary} strong />
        </Section>

        {cb && (
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 text-sm">
            <span className="text-slate-600">
              {allowances.length + (cb.components.acting ? 1 : 0)} allowance{allowances.length + (cb.components.acting ? 1 : 0) === 1 ? '' : 's'}
            </span>
            <span className="num font-semibold text-slate-900">{formatMoney(allowanceSum)}</span>
          </div>
        )}
        {cb && allowances.length === 0 && !cb.components.acting && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Info className="size-4" /> HR returned no allowances for this employee this month.
          </p>
        )}
        {!cb && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Info className="size-4" /> Manual employee: calculated from grade, so allowances are only available as a total.
          </p>
        )}

        {cb && cb.detail.segments.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Basic salary by placement</h3>
            <SegmentsTable segments={cb.detail.segments} />
          </div>
        )}

        <Section title="Deductions">
          <Line label="Taxable income" value={row.taxableIncome} muted />
          <Line label="Income tax" value={-toNumber(row.incomeTax)} />
          <Line label="Employee pension" value={-toNumber(row.employeePensionAmount)} />
          {row.employeeProvidentFundAmount !== undefined && <Line label="Employee provident fund" value={-toNumber(row.employeeProvidentFundAmount)} />}
          <Line label="Total deductions" value={-toNumber(row.totalDeduction)} strong />
        </Section>

        <div className="flex items-center justify-between rounded-lg bg-brand-800 px-4 py-3 text-white">
          <span className="text-sm font-medium">Net pay (estimate)</span>
          <span className="num text-xl font-semibold">{formatMoney(row.netSalary, { currency: true })}</span>
        </div>

        {mine.length > 0 && (
          <Section title="Pending arrears & recoveries (added by the run)">
            {mine.map((a) => (
              <Line
                key={a.id}
                label={`${toNumber(a.amount) >= 0 ? 'Arrears' : 'Recovery'} ${a.sourcePeriod.payrollName} – ${COMPONENT_LABEL[a.component]}`}
                sub={a.needsReview ? 'Needs review: not picked up automatically' : a.reason ?? undefined}
                value={a.amount}
                signed
              />
            ))}
            <Line label="Net adjustments" value={pendingNet} signed strong />
          </Section>
        )}

        <Section title="Employer cost">
          <Line label="Employer pension" value={row.employerPensionAmount} muted />
          {row.employerProvidentFundAmount !== undefined && <Line label="Employer provident fund" value={row.employerProvidentFundAmount} muted />}
        </Section>
      </div>
    </Drawer>
  );
}

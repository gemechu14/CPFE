import { useMemo, useState, type ReactNode } from 'react';
import { CalendarCheck2, CalendarX2, Clock, FileSearch, Palmtree, Plane, Timer, TrendingUp } from 'lucide-react';
import { useSettings } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import { toApiError } from '@/lib/http';
import { currentPeriod, formatDate, formatDateTime, formatPeriod } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import type { HrAttendanceDay, HrEmployeeRecord, HrLeaveRequest } from '@/types/api';
import { MonthStepper, useSnapshot } from './snapshot';

// ── Day classification ──────────────────────────────────────

type DayKind = 'present' | 'half' | 'leave' | 'lwop' | 'absent' | 'holiday' | 'off' | 'unrecorded';

/** Each kind has a fill, an ink colour, a short code and a label, so colour is never the only cue. */
const KIND: Record<DayKind, { label: string; code: string; cell: string; swatch: string }> = {
  present: { label: 'Present', code: 'P', cell: 'bg-emerald-50 text-emerald-800 ring-emerald-200', swatch: 'bg-emerald-500' },
  half: { label: 'Half day', code: '½', cell: 'bg-teal-50 text-teal-800 ring-teal-200', swatch: 'bg-teal-400' },
  leave: { label: 'Paid leave', code: 'L', cell: 'bg-primary-50 text-primary-800 ring-primary-200', swatch: 'bg-primary-500' },
  lwop: { label: 'Unpaid leave', code: 'LW', cell: 'bg-rose-50 text-rose-800 ring-rose-200', swatch: 'bg-rose-400' },
  absent: { label: 'Absent', code: 'A', cell: 'bg-red-100 text-red-800 ring-red-300', swatch: 'bg-red-600' },
  holiday: { label: 'Holiday', code: 'H', cell: 'bg-violet-50 text-violet-800 ring-violet-200', swatch: 'bg-violet-500' },
  off: { label: 'Rest day', code: '—', cell: 'bg-slate-100 text-slate-500 ring-slate-200', swatch: 'bg-slate-300' },
  unrecorded: { label: 'No record', code: '?', cell: 'bg-surface text-slate-400 ring-transparent border border-dashed border-slate-300', swatch: 'bg-surface ring-1 ring-inset ring-slate-300' },
};

const ORDER: DayKind[] = ['present', 'half', 'leave', 'lwop', 'absent', 'unrecorded', 'holiday', 'off'];

function inRange(date: string, r: HrLeaveRequest) {
  const d = date.slice(0, 10);
  return d >= r.from_date.slice(0, 10) && d <= (r.effective_to_date ?? r.to_date).slice(0, 10);
}

function classify(day: HrAttendanceDay, requests: HrLeaveRequest[]): DayKind {
  const status = (day.status ?? '').toLowerCase();
  const type = (day.day_type ?? '').toLowerCase();
  if (day.holiday || type.includes('holiday')) return 'holiday';
  if (status.includes('leave') || day.leave_type) {
    const req = requests.find((r) => inRange(day.date, r));
    return req?.is_lwop || /without pay|lwop/i.test(day.leave_type ?? '') ? 'lwop' : 'leave';
  }
  if (status.includes('half')) return 'half';
  if (status.includes('absent')) return 'absent';
  if (status.includes('present') || status.includes('work from home') || status.includes('wfh')) return 'present';
  if (/off|rest|weekend/.test(type)) return 'off';
  return 'unrecorded';
}

// ── Tab ─────────────────────────────────────────────────────

export function AttendanceLeaveTab({ employeeId }: { employeeId: string }) {
  const [period, setPeriod] = useState(currentPeriod());
  const q = useSnapshot(employeeId, period);

  const header = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Attendance &amp; leave</h2>
        <p className="text-sm text-slate-500">
          From HR for {formatPeriod(period)}
          {q.data && <> · synced {formatDateTime(q.data.syncedAt)}</>}
        </p>
      </div>
      <MonthStepper value={period} onChange={setPeriod} />
    </div>
  );

  if (q.isLoading) return <>{header}<PageLoader /></>;
  if (q.error) {
    return (
      <>
        {header}
        <Card>
          {toApiError(q.error).status === 404 ? (
            <EmptyState icon={<FileSearch className="size-6" />} title={`No HR data for ${formatPeriod(period)}`} description="Pick another month, or run an HR sync for it." />
          ) : (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          )}
        </Card>
      </>
    );
  }
  return (
    <>
      {header}
      <AttendanceLeaveView record={q.data!.payload.record} period={period} />
    </>
  );
}

function AttendanceLeaveView({ record, period }: { record: HrEmployeeRecord; period: string }) {
  const days = useMemo(() => [...(record.attendance?.days ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [record]);
  const requests = record.leave?.requests ?? [];
  const classified = useMemo(() => days.map((d) => ({ day: d, kind: classify(d, requests) })), [days, requests]);

  // Prefer HR's summary; fall back to counting the daily records.
  const counts = useMemo(() => {
    const c = Object.fromEntries(ORDER.map((k) => [k, 0])) as Record<DayKind, number>;
    classified.forEach(({ kind }) => c[kind]++);
    return c;
  }, [classified]);
  const s = record.attendance?.summary;
  const working = s?.working_days ?? counts.present + counts.half + counts.leave + counts.lwop + counts.absent + counts.unrecorded;
  const present = s?.present_days ?? counts.present;
  const half = s?.half_days ?? counts.half;
  const absent = s?.absent_days ?? counts.absent;
  const onLeave = s?.on_leave_days ?? counts.leave + counts.lwop;
  const unrecorded = s?.unrecorded_days ?? counts.unrecorded;
  const overtime = s?.overtime_hours ?? days.reduce((t, d) => t + (d.overtime_hours ?? 0), 0);
  const rate = working ? Math.round(((present + half * 0.5) / working) * 100) : null;

  const lwopDays = record.leave?.summary?.lwop_days ?? 0;
  const paidLeave = record.leave?.summary?.paid_leave_days ?? 0;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={<TrendingUp className="size-4.5" />} tone="primary" label="Attendance rate" value={rate === null ? '—' : `${rate}%`} hint={`${present + half * 0.5} of ${working} working days`} />
        <Kpi icon={<CalendarCheck2 className="size-4.5" />} tone="success" label="Present" value={present} hint={half ? `+ ${half} half day${half > 1 ? 's' : ''}` : 'full days'} />
        <Kpi icon={<CalendarX2 className="size-4.5" />} tone="danger" label="Absent" value={absent} hint={unrecorded ? `${unrecorded} day${unrecorded > 1 ? 's' : ''} with no record` : 'no gaps in records'} />
        <Kpi icon={<Plane className="size-4.5" />} tone="primary" label="On leave" value={onLeave} hint={lwopDays ? `${lwopDays} unpaid (deducted)` : 'all paid'} />
        <Kpi icon={<Timer className="size-4.5" />} tone="accent" label="Overtime" value={`${fmtHours(overtime)} h`} hint={s?.normal_hours != null ? `${fmtHours(s.normal_hours)} h normal` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        {/* Calendar */}
        <Card>
          <CardHeader
            title="Daily attendance"
            description={days.length ? 'Click a day for details.' : undefined}
            icon={<CalendarCheck2 className="size-4.5" />}
          />
          <CardBody className="space-y-5">
            <Breakdown
              total={working}
              parts={[
                { kind: 'present', value: present },
                { kind: 'half', value: half },
                { kind: 'leave', value: Math.max(0, onLeave - lwopDays) },
                { kind: 'lwop', value: lwopDays },
                { kind: 'absent', value: absent },
                { kind: 'unrecorded', value: unrecorded },
              ]}
            />
            {days.length ? (
              <MonthCalendar period={period} days={classified} requests={requests} />
            ) : (
              <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">HR sent a summary only, with no day-by-day records for this month.</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
              {ORDER.map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={cn('size-3 rounded', KIND[k].swatch)} /> {KIND[k].label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="rounded bg-accent-100 px-1 text-[10px] font-semibold text-accent-800">+2h</span> Overtime
              </span>
            </div>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <OvertimeCard record={record} />
          <LeaveCard record={record} paidLeave={paidLeave} lwopDays={lwopDays} />
        </div>
      </div>

      <LeaveRequests requests={requests} />
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────

function fmtHours(h: number) {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

function Kpi({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; tone: 'primary' | 'success' | 'danger' | 'accent' }) {
  const t = { primary: 'bg-primary-50 text-primary-600', success: 'bg-emerald-50 text-emerald-600', danger: 'bg-red-50 text-red-600', accent: 'bg-accent-50 text-accent-600' }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className={cn('flex size-9 items-center justify-center rounded-lg', t)}>{icon}</span>
        <span className="text-sm font-medium text-slate-500">{label}</span>
      </div>
      <div className="num mt-3 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** One horizontal bar: how the working days were spent. */
function Breakdown({ total, parts }: { total: number; parts: { kind: DayKind; value: number }[] }) {
  const shown = parts.filter((p) => p.value > 0);
  if (!total) return null;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-xs text-slate-500">
        <span className="font-medium text-slate-700">Working days</span>
        <span className="num">{total} days</span>
      </div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100">
        {shown.map((p) => (
          <div key={p.kind} className={cn('h-full first:rounded-l-full last:rounded-r-full', KIND[p.kind].swatch)} style={{ width: `${(p.value / total) * 100}%` }} title={`${KIND[p.kind].label}: ${p.value}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {shown.map((p) => (
          <span key={p.kind} className="text-slate-600">
            {KIND[p.kind].label} <span className="num font-semibold text-slate-900">{p.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MonthCalendar({ period, days, requests }: { period: string; days: { day: HrAttendanceDay; kind: DayKind }[]; requests: HrLeaveRequest[] }) {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const byDate = new Map(days.map((d) => [d.day.date.slice(0, 10), d]));
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const count = new Date(y, m, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const [selected, setSelected] = useState<string | null>(null);
  const sel = selected ? byDate.get(selected) : undefined;
  const selReq = sel ? requests.find((r) => inRange(sel.day.date, r)) : undefined;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium tracking-wide text-slate-500 uppercase">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, i) => <div key={`pad${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const date = `${period}-${String(i + 1).padStart(2, '0')}`;
          const rec = byDate.get(date);
          const k = rec ? KIND[rec.kind] : null;
          const ot = rec?.day.overtime_hours ?? 0;
          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelected(selected === date ? null : date)}
              title={rec ? `${formatDate(date)} · ${KIND[rec.kind].label}${ot ? ` · ${ot}h overtime` : ''}` : formatDate(date)}
              className={cn(
                'relative flex h-12 flex-col items-start justify-between rounded-lg p-1.5 text-left ring-1 transition sm:h-16',
                k ? k.cell : 'bg-surface text-slate-300 ring-slate-100',
                rec && 'hover:-translate-y-px hover:shadow-sm',
                selected === date && 'ring-2 ring-primary-500',
                date === today && 'outline-2 outline-offset-1 outline-accent-500',
              )}
            >
              <span className="num text-xs font-semibold">{i + 1}</span>
              <span className="flex w-full items-end justify-between gap-0.5">
                {k && <span className="text-[10px] font-bold opacity-80">{k.code}</span>}
                {ot > 0 && <span className="rounded bg-accent-100 px-1 text-[9px] font-semibold text-accent-800">+{fmtHours(ot)}h</span>}
              </span>
            </button>
          );
        })}
      </div>

      {sel && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">{formatDate(sel.day.date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium ring-1', KIND[sel.kind].cell)}>{KIND[sel.kind].label}</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Fact label="Status" value={sel.day.status ?? '—'} />
            <Fact label="Day type" value={sel.day.day_type ?? '—'} />
            <Fact label="Hours worked" value={sel.day.working_hours != null ? `${fmtHours(sel.day.working_hours)} h` : '—'} />
            <Fact label="Overtime" value={sel.day.overtime_hours ? `${fmtHours(sel.day.overtime_hours)} h` : '—'} />
            {sel.day.holiday && <Fact label="Holiday" value={sel.day.holiday} />}
            {(sel.day.leave_type || selReq) && <Fact label="Leave" value={`${sel.day.leave_type ?? selReq?.leave_type}${selReq?.is_lwop ? ' (unpaid)' : ''}`} />}
          </dl>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function OvertimeCard({ record }: { record: HrEmployeeRecord }) {
  const settings = useSettings();
  const rates = settings.data?.overtimeRates ?? {};
  const byCat = Object.entries(record.attendance?.summary?.overtime_by_category ?? {}).filter(([, h]) => h > 0);
  const byCc = Object.entries(record.attendance?.summary?.overtime_by_cost_center ?? {}).filter(([, h]) => h > 0);
  const max = Math.max(1, ...byCat.map(([, h]) => h));
  const total = byCat.reduce((t, [, h]) => t + h, 0);
  const weighted = byCat.reduce((t, [c, h]) => t + h * (rates[c] ?? 1), 0);

  return (
    <Card>
      <CardHeader icon={<Clock className="size-4.5" />} title="Overtime" description={total ? `${fmtHours(total)} hours this month` : undefined} />
      <CardBody>
        {byCat.length === 0 ? (
          <p className="text-sm text-slate-500">No overtime this month.</p>
        ) : (
          <div className="space-y-3">
            {byCat.map(([cat, h]) => (
              <div key={cat}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-slate-700">
                    {cat}
                    {rates[cat] && <span className="ml-1.5 text-xs text-slate-400">× {rates[cat]}</span>}
                  </span>
                  <span className="num font-semibold text-slate-900">{fmtHours(h)} h</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-accent-500" style={{ width: `${(h / max) * 100}%` }} />
                </div>
              </div>
            ))}
            {Object.keys(rates).length > 0 && (
              <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
                Paid as <span className="num font-semibold text-slate-700">{fmtHours(weighted)}</span> rate-weighted hours using your overtime rates.
              </p>
            )}
            {byCc.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {byCc.map(([cc, h]) => (
                  <Badge key={cc} tone="neutral">{cc}: {fmtHours(h)} h</Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function LeaveCard({ record, paidLeave, lwopDays }: { record: HrEmployeeRecord; paidLeave: number; lwopDays: number }) {
  const byType = Object.entries(record.leave?.summary?.by_type ?? {}).filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1]);
  const total = record.leave?.summary?.total_days ?? paidLeave + lwopDays;
  const max = Math.max(1, ...byType.map(([, d]) => d));
  return (
    <Card>
      <CardHeader icon={<Palmtree className="size-4.5" />} title="Leave this month" />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-lg border border-slate-200 text-center">
          <Mini label="Total" value={total} />
          <Mini label="Paid" value={paidLeave} />
          <Mini label="Unpaid" value={lwopDays} danger={lwopDays > 0} />
        </div>
        {lwopDays > 0 && <p className="text-xs text-rose-700">Unpaid leave (LWOP) is deducted from basic salary.</p>}
        {byType.length > 0 ? (
          <div className="space-y-2.5">
            {byType.map(([type, d]) => (
              <div key={type} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate text-slate-700" title={type}>{type}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-primary-500" style={{ width: `${(d / max) * 100}%` }} />
                </div>
                <span className="num w-10 text-right font-semibold text-slate-900">{d}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No leave taken this month.</p>
        )}
      </CardBody>
    </Card>
  );
}

function Mini({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="px-2 py-3">
      <div className={cn('num text-xl font-semibold', danger ? 'text-rose-600' : 'text-slate-900')}>{value}</div>
      <div className="text-xs text-slate-500">{label} days</div>
    </div>
  );
}

function LeaveRequests({ requests }: { requests: HrLeaveRequest[] }) {
  if (!requests.length) return null;
  const sorted = [...requests].sort((a, b) => a.from_date.localeCompare(b.from_date));
  return (
    <Card>
      <CardHeader icon={<Plane className="size-4.5" />} title="Leave requests" description="Approved leave touching this month, from HR." />
      <CardBody>
        <ol className="relative space-y-4 border-l-2 border-slate-100 pl-6">
          {sorted.map((r) => {
            const end = r.effective_to_date ?? r.to_date;
            const nights = Math.round((new Date(end).getTime() - new Date(r.from_date).getTime()) / 86_400_000) + 1;
            return (
              <li key={r.leave_request} className="relative">
                <span className={cn('absolute top-1.5 -left-[31px] size-3.5 rounded-full ring-4 ring-white', r.is_lwop ? 'bg-rose-400' : 'bg-primary-500')} />
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{r.leave_type}</span>
                      {r.is_lwop ? <Badge tone="danger">Unpaid</Badge> : <Badge tone="success">Paid</Badge>}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {formatDate(r.from_date, { day: 'numeric', month: 'short' })} – {formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}
                      <span className="text-slate-400"> · {nights} day{nights > 1 ? 's' : ''} in total</span>
                    </div>
                    {r.effective_to_date && r.effective_to_date !== r.to_date && (
                      <div className="mt-1 text-xs text-amber-700">Planned until {formatDate(r.to_date)}, ended early on {formatDate(r.effective_to_date)}.</div>
                    )}
                    <code className="mt-1.5 block text-[11px] text-slate-400">{r.leave_request}</code>
                  </div>
                  <div className="text-right">
                    <div className="num text-2xl font-semibold text-slate-900">{r.days_in_period}</div>
                    <div className="text-xs text-slate-500">days this month</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}

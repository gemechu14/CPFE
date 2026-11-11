import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarDays, CloudDownload, Filter, PencilLine, Plus, Settings2, Timer, Trash2 } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { qk, useSettings } from '@/hooks/queries';
import { settingsApi } from '@/lib/api';
import { toApiError } from '@/lib/http';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Alert, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Overlay';
import { PageHeader } from '@/components/ui/Page';
import { Switch } from '@/components/ui/Switch';
import type { EmployeeSource, PayrollSettingUpdate, PayrollSettingView } from '@/types/api';

type Draft = Required<PayrollSettingUpdate>;
type OtRow = { key: string; name: string; rate: string };

const EDITABLE: (keyof Draft)[] = [
  'employeeSource', 'syncEnabled', 'syncIntervalHours', 'cutoffDay', 'payDay', 'openDaysBefore', 'syncUntilDay',
  'prorationBasis', 'overtimeRates', 'hrCostCenter', 'hrRegion', 'hrZone', 'hrCity', 'hrWoreda',
];

const DEFAULT_OT: Record<string, number> = { 'Normal Day': 1.5, Night: 1.75, 'Weekly Rest': 2, 'Public Holiday': 2.5 };

function toDraft(s: PayrollSettingView): Draft {
  return Object.fromEntries(EDITABLE.map((k) => [k, s[k]])) as Draft;
}

let rowSeq = 0;
const toRows = (r: Record<string, number> | null): OtRow[] => Object.entries(r ?? {}).map(([name, rate]) => ({ key: `r${rowSeq++}`, name, rate: String(rate) }));

export function PayrollSettingsPage() {
  const settings = useSettings();
  const { can } = useAuth();
  const canEdit = can(PERMS.manageSettings);
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [otRows, setOtRows] = useState<OtRow[]>([]);
  const [confirmSource, setConfirmSource] = useState<EmployeeSource | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings.data) {
      setDraft(toDraft(settings.data));
      setOtRows(toRows(settings.data.overtimeRates));
    }
  }, [settings.data]);

  const otValue = useMemo<Record<string, number> | null>(() => {
    const rows = otRows.filter((r) => r.name.trim());
    if (!rows.length) return null;
    return Object.fromEntries(rows.map((r) => [r.name.trim(), Number(r.rate)]));
  }, [otRows]);

  const patch = useMemo<PayrollSettingUpdate>(() => {
    if (!draft || !settings.data) return {};
    const out: Record<string, unknown> = {};
    for (const k of EDITABLE) {
      const next = k === 'overtimeRates' ? otValue : draft[k];
      if (JSON.stringify(next ?? null) !== JSON.stringify(settings.data[k] ?? null)) out[k] = next;
    }
    return out as PayrollSettingUpdate;
  }, [draft, otValue, settings.data]);

  const dirty = Object.keys(patch).length > 0;

  const save = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: (data) => {
      qc.setQueryData(qk.settings, data);
      setErrors({});
      toast.success('Payroll settings updated');
    },
    onError: (err) => {
      const e = toApiError(err);
      setErrors(Object.fromEntries(e.details.map((d) => [d.path.replace(/^body\./, ''), d.message])));
      toast.error(e.message);
    },
  });

  if (settings.isLoading || (!draft && !settings.error)) return <PageLoader />;
  if (settings.error || !settings.data || !draft) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;

  const s = settings.data;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const num = (k: keyof Draft) => (e: { target: { value: string } }) => set(k, (e.target.value === '' ? null : Number(e.target.value)) as never);
  const str = (k: keyof Draft) => (e: { target: { value: string } }) => set(k, (e.target.value.trim() === '' ? null : e.target.value) as never);
  const isHr = draft.employeeSource === 'HR_SYNC';

  function validate() {
    const e: Record<string, string> = {};
    const range = (k: keyof Draft, min: number, max: number, nullable = false) => {
      const v = draft![k] as number | null;
      if (v === null && nullable) return;
      if (v === null || !Number.isInteger(v) || v < min || v > max) e[k] = `Must be a whole number from ${min} to ${max}`;
    };
    range('syncIntervalHours', 1, 24);
    range('cutoffDay', 1, 28);
    range('payDay', 1, 31);
    range('openDaysBefore', 0, 60);
    range('syncUntilDay', 1, 31, true);
    otRows.forEach((r) => {
      const n = Number(r.rate);
      if (r.name.trim() && (r.rate === '' || Number.isNaN(n) || n < 0 || n > 10)) e.overtimeRates = 'Each rate must be between 0 and 10';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  return (
    <div className="pb-24">
      <PageHeader
        title="Payroll settings"
        description="Where employees come from, when each month closes, and how pay is calculated."
      />

      {!canEdit && (
        <Alert tone="info" className="mb-6">
          You can view these settings. Changing them needs the <code className="font-mono text-xs">manage_payroll_settings</code> permission.
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Employee source */}
          <Card>
            <CardHeader icon={<Settings2 className="size-4.5" />} title="Employee source" description="Each company gets employees from exactly one place." />
            <CardBody className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  { v: 'MANUAL', icon: PencilLine, title: 'Manual', text: 'Create and import employees in the payroll app.' },
                  { v: 'HR_SYNC', icon: CloudDownload, title: 'HR sync', text: "Employees come only from your HR system. HR-owned fields are read-only." },
                ] as const
              ).map((o) => {
                const active = draft.employeeSource === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => !active && (o.v === 'HR_SYNC' ? setConfirmSource('HR_SYNC') : set('employeeSource', 'MANUAL'))}
                    className={cn(
                      'flex gap-3 rounded-xl border p-4 text-left transition',
                      active ? 'border-primary-600 bg-primary-50/60 ring-1 ring-primary-600' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                      !canEdit && 'cursor-default',
                    )}
                  >
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', active ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-500')}>
                      <o.icon className="size-4.5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{o.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{o.text}</span>
                    </span>
                  </button>
                );
              })}
            </CardBody>
          </Card>

          {/* Sync */}
          {isHr && (
            <Card>
              <CardHeader
                icon={<CloudDownload className="size-4.5" />}
                title="HR sync"
                description={`Last synced ${formatRelative(s.lastSyncedAt)}`}
                actions={
                  can(PERMS.manageSettings) && (
                    <Link to="/settings/hr-connection">
                      <Button variant="outline" size="sm">HR connection</Button>
                    </Link>
                  )
                }
              />
              <CardBody className="space-y-5">
                {!s.hrConnectionConfigured && (
                  <Alert tone="warning" title="No HR connection yet">
                    Register and test the HR connection before turning on sync.{' '}
                    <Link to="/settings/hr-connection" className="font-medium underline">Set it up</Link>
                  </Alert>
                )}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">Scheduled sync</div>
                    <div className="text-xs text-slate-500">Pull new hires, changes, attendance and leave automatically.</div>
                  </div>
                  <Switch
                    label="Scheduled sync"
                    checked={draft.syncEnabled}
                    disabled={!canEdit || !s.hrConnectionConfigured}
                    onChange={(v) => set('syncEnabled', v)}
                  />
                </div>
                <Field label="Sync every (hours)" error={errors.syncIntervalHours} hint="1–24 hours. Default 4." className="max-w-xs">
                  {(id) => <Input id={id} type="number" min={1} max={24} disabled={!canEdit} value={draft.syncIntervalHours ?? ''} onChange={num('syncIntervalHours')} />}
                </Field>
              </CardBody>
            </Card>
          )}

          {/* Calendar */}
          <Card>
            <CardHeader icon={<CalendarDays className="size-4.5" />} title="Payroll calendar" description="Defaults for every payroll period's schedule. Each period can override them." />
            <CardBody className="grid gap-5 sm:grid-cols-2">
              <Field label="Cutoff day" error={errors.cutoffDay} hint="Payroll closes on this day of the month (1–28).">
                {(id) => <Input id={id} type="number" min={1} max={28} disabled={!canEdit} value={draft.cutoffDay ?? ''} onChange={num('cutoffDay')} />}
              </Field>
              <Field label="Pay day" error={errors.payDay} hint="Day of the month salaries are paid (1–31).">
                {(id) => <Input id={id} type="number" min={1} max={31} disabled={!canEdit} value={draft.payDay ?? ''} onChange={num('payDay')} />}
              </Field>
              <Field label="Open days before" error={errors.openDaysBefore} hint="Start syncing a month this many days before it starts (0–60).">
                {(id) => <Input id={id} type="number" min={0} max={60} disabled={!canEdit} value={draft.openDaysBefore ?? ''} onChange={num('openDaysBefore')} />}
              </Field>
              <Field label="Sync until day (next month)" error={errors.syncUntilDay} hint="Late HR changes are picked up until this day. Empty = same as cutoff day.">
                {(id) => (
                  <Input id={id} type="number" min={1} max={31} placeholder={`Same as cutoff (${draft.cutoffDay ?? 18})`} disabled={!canEdit} value={draft.syncUntilDay ?? ''} onChange={num('syncUntilDay')} />
                )}
              </Field>
              <Field label="Proration basis" hint="How a month's salary is split across days.">
                {(id) => (
                  <Select id={id} disabled={!canEdit} value={draft.prorationBasis} onChange={(e) => set('prorationBasis', e.target.value as Draft['prorationBasis'])}>
                    <option value="CALENDAR">Calendar days</option>
                    <option value="WORKING">Working days</option>
                  </Select>
                )}
              </Field>
            </CardBody>
          </Card>

          {/* Overtime */}
          <Card>
            <CardHeader
              icon={<Timer className="size-4.5" />}
              title="Overtime rates"
              description="Multiplier of the hourly rate per overtime category (0–10)."
              actions={
                canEdit &&
                otRows.length === 0 && (
                  <Button variant="secondary" size="sm" onClick={() => setOtRows(toRows(DEFAULT_OT))}>
                    Use Ethiopian defaults
                  </Button>
                )
              }
            />
            <CardBody className="space-y-3">
              {otRows.length === 0 && <p className="text-sm text-slate-500">No overtime rates set.</p>}
              {otRows.map((r, i) => (
                <div key={r.key} className="flex items-center gap-3">
                  <Input
                    aria-label="Category"
                    placeholder="Category, e.g. Night"
                    disabled={!canEdit}
                    value={r.name}
                    onChange={(e) => setOtRows((rows) => rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <div className="relative w-32 shrink-0">
                    <Input
                      aria-label="Rate"
                      type="number"
                      step="0.05"
                      min={0}
                      max={10}
                      disabled={!canEdit}
                      value={r.rate}
                      onChange={(e) => setOtRows((rows) => rows.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))}
                      className="pr-7"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">×</span>
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="icon" aria-label="Remove rate" onClick={() => setOtRows((rows) => rows.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
              {errors.overtimeRates && <p className="text-xs text-red-600">{errors.overtimeRates}</p>}
              {canEdit && (
                <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setOtRows((rows) => [...rows, { key: `r${rowSeq++}`, name: '', rate: '1.5' }])}>
                  Add category
                </Button>
              )}
            </CardBody>
          </Card>

          {/* Filters */}
          {isHr && (
            <Card>
              <CardHeader icon={<Filter className="size-4.5" />} title="HR feed filters" description="Optional. Only pull employees that match these values." />
              <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ['hrCostCenter', 'Cost center'],
                    ['hrRegion', 'Region'],
                    ['hrZone', 'Zone'],
                    ['hrCity', 'City'],
                    ['hrWoreda', 'Woreda'],
                  ] as const
                ).map(([k, label]) => (
                  <Field key={k} label={label}>
                    {(id) => <Input id={id} disabled={!canEdit} placeholder="Any" value={(draft[k] as string | null) ?? ''} onChange={str(k)} />}
                  </Field>
                ))}
              </CardBody>
            </Card>
          )}
        </div>

        {/* Summary rail */}
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card className="overflow-hidden">
            <div className="bg-brand-800 px-5 py-4 text-white">
              <div className="text-xs font-medium tracking-wide text-primary-200 uppercase">Each month</div>
              <div className="mt-3 space-y-3 text-sm">
                <RailRow label="Opens for HR sync" value={draft.openDaysBefore ? `${draft.openDaysBefore} days before the 1st` : 'On the 1st'} />
                <RailRow label="Cutoff" value={`Day ${draft.cutoffDay ?? '—'}`} accent />
                <RailRow label="Pay day" value={`Day ${draft.payDay ?? '—'}`} />
                <RailRow label="Late changes until" value={`Day ${draft.syncUntilDay ?? draft.cutoffDay ?? '—'} of next month`} />
              </div>
            </div>
            <CardBody className="text-xs leading-relaxed text-slate-500">
              After the cutoff, employees are assumed to work the rest of the month in their cutoff-day position. HR changes that arrive later become arrears or recoveries in the next payroll.
            </CardBody>
          </Card>
        </aside>
      </div>

      {/* Save bar */}
      {canEdit && dirty && (
        <div className="animate-slide-up fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-surface/95 backdrop-blur lg:left-64">
          <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-900">{Object.keys(patch).length}</span> unsaved change{Object.keys(patch).length > 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDraft(toDraft(s));
                  setOtRows(toRows(s.overtimeRates));
                  setErrors({});
                }}
              >
                Discard
              </Button>
              <Button variant="accent" loading={save.isPending} onClick={() => validate() && save.mutate(patch)}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmSource === 'HR_SYNC'}
        onClose={() => setConfirmSource(null)}
        onConfirm={() => {
          set('employeeSource', 'HR_SYNC');
          setConfirmSource(null);
        }}
        title="Switch to HR sync?"
        confirmLabel="Switch to HR sync"
      >
        <p>Once saved, employees can only come from your HR system:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Adding, importing and reassigning employees is blocked.</li>
          <li>HR-owned fields become read-only and are overwritten on every sync.</li>
        </ul>
      </ConfirmDialog>
    </div>
  );
}

function RailRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-primary-100">
        <span className={cn('size-2 rounded-full', accent ? 'bg-accent-400' : 'bg-primary-300')} />
        {label}
      </span>
      <span className="num font-medium">{value}</span>
    </div>
  );
}

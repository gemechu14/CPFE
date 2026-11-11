import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarPlus, CalendarRange, CalendarDays, Lock, MoreHorizontal, PencilLine, RotateCcw, Settings2, Trash2 } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { qk, useDefinitions, useSettings } from '@/hooks/queries';
import { definitionsApi } from '@/lib/api';
import { toApiError } from '@/lib/http';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatPeriod, toDateInput } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader, Skeleton } from '@/components/ui/Feedback';
import { ConfirmDialog, Drawer } from '@/components/ui/Overlay';
import { DescList, PageHeader } from '@/components/ui/Page';
import { Segmented } from '@/components/ui/Tabs';
import { STATE_LABEL } from '@/components/domain';
import type { DefinitionState, PayrollDefinition, PayrollSchedule, ScheduleUpdate } from '@/types/api';
import { ScheduleTimeline } from './ScheduleTimeline';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { CreateDefinitionDialog } from './CreateDefinitionDialog';
import { DeleteDefinitionDialog, EditDefinitionDialog, canEditDefinition } from './EditDefinitionDialog';

type Filter = 'all' | 'active' | 'locked';

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** Whole calendar days from today to `date` (negative = past). */
const daysFromToday = (date: string) => Math.round((startOfDay(new Date(date)) - startOfDay(new Date())) / DAY);
const relDays = (date: string) => {
  const n = daysFromToday(date);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
};

export function PeriodsPage() {
  const defs = useDefinitions();
  const { can } = useAuth();
  const canManage = can(PERMS.manageSettings);
  const [editing, setEditing] = useState<PayrollSchedule | null>(null);
  const [closing, setClosing] = useState<PayrollSchedule | null>(null);
  const [creating, setCreating] = useState(false);
  const [editDef, setEditDef] = useState<PayrollDefinition | null>(null);
  const [deleteDef, setDeleteDef] = useState<PayrollDefinition | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const qc = useQueryClient();

  const sorted = useMemo(
    () => [...(defs.data ?? [])].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()),
    [defs.data],
  );

  const schedules = useQueries({
    queries: sorted.map((d) => ({ queryKey: qk.schedule(d.id), queryFn: () => definitionsApi.schedule(d.id), staleTime: 60_000 })),
  });

  const rows = sorted.map((d, i) => ({ def: d, schedule: schedules[i]?.data, loading: schedules[i]?.isLoading }));
  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.schedule?.state !== 'LOCKED').length,
    locked: rows.filter((r) => r.schedule?.state === 'LOCKED').length,
  };
  const visible = rows.filter((r) => filter === 'all' || (filter === 'locked' ? r.schedule?.state === 'LOCKED' : r.schedule?.state !== 'LOCKED'));

  // The period people care about right now: open, else the latest one still taking late changes, else the next to open.
  const loaded = rows.map((r) => r.schedule).filter((s): s is PayrollSchedule => !!s);
  const current =
    loaded.find((s) => s.state === 'OPEN') ??
    loaded.find((s) => s.state === 'CLOSED_SYNCING') ??
    [...loaded].reverse().find((s) => s.state === 'NOT_OPEN');

  const close = useMutation({
    mutationFn: (id: string) => definitionsApi.close(id),
    onSuccess: (_d, id) => {
      toast.success('Payroll period closed');
      setClosing(null);
      qc.invalidateQueries({ queryKey: qk.schedule(id) });
      qc.invalidateQueries({ queryKey: qk.definitions });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const canClose = (s: PayrollSchedule) => canManage && !s.closedAt && s.state !== 'NOT_OPEN';

  return (
    <>
      <PageHeader
        title="Payroll periods"
        description="Each period opens for HR sync, closes at cutoff, and keeps receiving late HR changes until its sync-until date."
        actions={
          <Button icon={<CalendarPlus className="size-4" />} onClick={() => setCreating(true)}>
            New period
          </Button>
        }
      />

      {current && (
        <CurrentPeriod
          s={current}
          canClose={canClose(current)}
          onSchedule={() => setEditing(current)}
          onClose={() => setClosing(current)}
        />
      )}

      <Card>
        <CardHeader
          title="All periods"
          description={`${sorted.length} payroll period${sorted.length === 1 ? '' : 's'}, newest first`}
          actions={
            sorted.length > 0 && (
              <Segmented
                value={filter}
                onChange={setFilter}
                items={[
                  { value: 'all', label: <>All <Count n={counts.all} /></> },
                  { value: 'active', label: <>Active <Count n={counts.active} /></> },
                  { value: 'locked', label: <>Locked <Count n={counts.locked} /></> },
                ]}
              />
            )
          }
        />
        {defs.isLoading ? (
          <PageLoader />
        ) : defs.error ? (
          <ErrorState error={defs.error} onRetry={() => defs.refetch()} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<CalendarRange className="size-6" />}
            title="No payroll periods yet"
            description="Create a period for each month you run payroll."
            action={<Button onClick={() => setCreating(true)}>New period</Button>}
          />
        ) : visible.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-500">No {filter} periods.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Period</TH>
                <TH>Open</TH>
                <TH>Cutoff</TH>
                <TH>Pay date</TH>
                <TH>Sync until</TH>
                <TH>Status</TH>
                <TH align="right">
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
            {visible.map((r) => (
              <PeriodRow
                key={r.def.id}
                def={r.def}
                schedule={r.schedule}
                loading={r.loading}
                isCurrent={!!current && r.schedule?.payrollDefinitionId === current.payrollDefinitionId}
                canManage={canManage}
                canClose={!!r.schedule && canClose(r.schedule)}
                onEdit={setEditing}
                onClose={setClosing}
                onEditDef={setEditDef}
                onDeleteDef={setDeleteDef}
              />
            ))}
            </TBody>
          </Table>
        )}
      </Card>

      <ScheduleDrawer schedule={editing} onClose={() => setEditing(null)} />
      <CreateDefinitionDialog open={creating} onClose={() => setCreating(false)} />
      <EditDefinitionDialog def={editDef} onClose={() => setEditDef(null)} />
      <DeleteDefinitionDialog def={deleteDef} onClose={() => setDeleteDef(null)} />
      <ConfirmDialog
        open={!!closing}
        onClose={() => setClosing(null)}
        onConfirm={() => closing && close.mutate(closing.payrollDefinitionId)}
        loading={close.isPending}
        title={`Close ${closing?.payrollName}?`}
        confirmLabel="Close period"
        tone="primary"
      >
        Payroll closes now instead of on the cutoff date. Days after today are assumed worked at the current placement, and later HR changes become arrears next month. Periods also close automatically when their cutoff passes.
      </ConfirmDialog>
    </>
  );
}

/** Plain status label: blue dot while open, grey otherwise. */
function Status({ state }: { state: DefinitionState }) {
  const label = state === 'CLOSED_SYNCING' ? 'Closed · syncing' : STATE_LABEL[state];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', state === 'OPEN' ? 'font-medium text-primary-700' : 'text-slate-500')}>
      <span className={cn('size-1.5 rounded-full', state === 'OPEN' ? 'bg-primary-500' : 'bg-slate-400')} />
      {label}
    </span>
  );
}

function Count({ n }: { n: number }) {
  return <span className="num ml-1 text-slate-400">{n}</span>;
}

/* ── Current period spotlight ───────────────────────────────── */

function CurrentPeriod({ s, canClose, onSchedule, onClose }: { s: PayrollSchedule; canClose: boolean; onSchedule: () => void; onClose: () => void }) {
  const closed = !!s.closedAt || daysFromToday(s.cutoffDate) < 0;

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-slate-900">{s.payrollName}</h2>
            <Status state={s.state} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {formatDate(s.startDate, { day: '2-digit', month: 'short' })} – {formatDate(s.endDate)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onSchedule}>
            Edit schedule
          </Button>
          {canClose && (
            <Button size="sm" onClick={onClose}>
              Close now
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-slate-100 border-t border-slate-100 sm:grid-cols-4 sm:divide-x">
        <KeyDate label="Opens" date={s.openDate} />
        <KeyDate label={closed ? 'Closed' : 'Cutoff'} date={s.closedAt ?? s.cutoffDate} highlight={!closed} />
        <KeyDate label="Pay day" date={s.payDate} />
        <KeyDate label="Sync until" date={s.syncUntilDate} />
      </div>
    </Card>
  );
}

function KeyDate({ label, date, highlight }: { label: string; date: string; highlight?: boolean }) {
  return (
    <div className="min-w-0 px-5 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="num text-sm font-semibold text-slate-900">{formatDate(date)}</div>
      <div className={cn('text-xs first-letter:uppercase', highlight ? 'text-primary-700' : 'text-slate-400')}>{relDays(date)}</div>
    </div>
  );
}

/* ── List row ───────────────────────────────────────────────── */

function PeriodRow({
  def,
  schedule: s,
  loading,
  isCurrent,
  canManage,
  canClose,
  onEdit,
  onClose,
  onEditDef,
  onDeleteDef,
}: {
  def: PayrollDefinition;
  schedule?: PayrollSchedule;
  loading?: boolean;
  isCurrent: boolean;
  canManage: boolean;
  canClose: boolean;
  onEdit: (s: PayrollSchedule) => void;
  onClose: (s: PayrollSchedule) => void;
  onEditDef: (d: PayrollDefinition) => void;
  onDeleteDef: (d: PayrollDefinition) => void;
}) {
  const editable = canEditDefinition(def);
  const locked = s?.state === 'LOCKED';

  const date = (v: string | null | undefined) =>
    v ? (
      <span className="num whitespace-nowrap">{formatDate(v)}</span>
    ) : loading ? (
      <Skeleton className="h-4 w-20" />
    ) : (
      <span className="text-slate-300">—</span>
    );

  return (
    <TR className={cn(isCurrent ? 'bg-slate-50' : 'hover:bg-slate-50/70', locked ? 'text-slate-500' : 'text-slate-800')}>
      <TD className="whitespace-nowrap">
        <div className={cn('font-medium', locked ? 'text-slate-500' : 'text-slate-900')}>{def.payrollName}</div>
        <div className="num text-xs text-slate-500">
          {formatDate(def.startDate, { day: '2-digit', month: 'short' })} – {formatDate(def.endDate, { day: '2-digit', month: 'short' })}
        </div>
      </TD>
      <TD>{date(s?.openDate ?? def.openDate)}</TD>
      <TD>{date(s?.cutoffDate ?? def.cutoffDate)}</TD>
      <TD>{date(def.payDate)}</TD>
      <TD>{date(s?.syncUntilDate ?? def.syncUntilDate)}</TD>
      <TD className="whitespace-nowrap">{s ? <Status state={s.state} /> : loading ? <Skeleton className="h-4 w-16" /> : '—'}</TD>
      <TD align="right">
        <div className="flex items-center justify-end">
          <RowMenu
            label={def.payrollName}
            items={[
              ...(s && canClose ? [{ label: 'Close now', icon: <Lock className="size-4" />, onClick: () => onClose(s) }] : []),
              ...(s ? [{ label: 'Edit schedule', icon: <PencilLine className="size-4" />, onClick: () => onEdit(s) }] : []),
              ...(canManage
                ? [
                    {
                      label: 'Edit name & dates',
                      icon: <Settings2 className="size-4" />,
                      disabled: !editable,
                      hint: editable ? undefined : 'Pay date has passed',
                      onClick: () => onEditDef(def),
                    },
                    { label: 'Delete period', icon: <Trash2 className="size-4" />, danger: true, onClick: () => onDeleteDef(def) },
                  ]
                : []),
            ]}
          />
        </div>
      </TD>
    </TR>
  );
}

type MenuItem = { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; hint?: string };

/** Kebab menu. Rendered in a portal at a fixed position so the table's horizontal scroll never clips it. */
function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = !!pos;

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDoc = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (!items.length) return null;

  const toggle = () => {
    if (open) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 180;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, right: window.innerWidth - r.right, up });
  };

  return (
    <>
      <Button ref={btn} variant="ghost" size="icon" aria-label={`More actions for ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <MoreHorizontal className="size-4" />
      </Button>
      {pos &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            style={{ top: pos.top, right: pos.right }}
            className={cn('animate-page-in fixed z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-surface py-1 text-left shadow-lg', pos.up && '-translate-y-full')}
          >
            {items.map((i) => (
              <button
                key={i.label}
                role="menuitem"
                type="button"
                disabled={i.disabled}
                onClick={() => {
                  setPos(null);
                  i.onClick();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  i.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50',
                )}
              >
                <span className={i.danger ? 'text-red-500' : 'text-slate-400'}>{i.icon}</span>
                <span className="min-w-0">
                  <span className="block">{i.label}</span>
                  {i.hint && <span className="block text-xs text-slate-400">{i.hint}</span>}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

type DateKey = 'openDate' | 'cutoffDate' | 'syncUntilDate';
const DATE_FIELDS: { key: DateKey; label: string; hint: string }[] = [
  { key: 'openDate', label: 'Open date', hint: 'HR sync starts pulling this month.' },
  { key: 'cutoffDate', label: 'Cutoff date', hint: 'Payroll closes. Later days are assumed worked.' },
  { key: 'syncUntilDate', label: 'Sync until', hint: 'Late HR changes stop becoming arrears after this.' },
];

function ScheduleDrawer({ schedule, onClose }: { schedule: PayrollSchedule | null; onClose: () => void }) {
  const { can } = useAuth();
  const canManage = can(PERMS.manageSettings);
  const settings = useSettings();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<ScheduleUpdate>({});
  const [error, setError] = useState<{ msg: string; path?: string } | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);

  if (schedule && schedule.payrollDefinitionId !== lastId) {
    setLastId(schedule.payrollDefinitionId);
    setDraft({});
    setError(null);
  }

  const save = useMutation({
    mutationFn: (patch: ScheduleUpdate) => definitionsApi.updateSchedule(schedule!.payrollDefinitionId, patch),
    onSuccess: (data) => {
      qc.setQueryData(qk.schedule(data.payrollDefinitionId), data);
      qc.invalidateQueries({ queryKey: qk.definitions });
      toast.success('Schedule updated');
      onClose();
    },
    onError: (err) => {
      const e = toApiError(err);
      setError({ msg: e.message, path: e.details[0]?.path });
    },
  });

  if (!schedule) return <Drawer open={false} onClose={onClose} title="" />;
  const s = schedule;

  const valueOf = (k: DateKey | 'hrPeriod') => (k in draft ? draft[k] : undefined);
  const effective = (k: DateKey) => {
    const v = valueOf(k);
    return v === undefined ? toDateInput(s[k]) : v === null ? null : v;
  };

  function submit() {
    const o = effective('openDate');
    const c = effective('cutoffDate');
    const u = effective('syncUntilDate');
    if (o && c && o > c) return setError({ msg: 'Dates must be in order: open ≤ cutoff ≤ sync until', path: 'cutoffDate' });
    if (c && u && c > u) return setError({ msg: 'Dates must be in order: open ≤ cutoff ≤ sync until', path: 'syncUntilDate' });
    if (!Object.keys(draft).length) return setError({ msg: 'Nothing to update' });
    setError(null);
    save.mutate(draft);
  }

  const reopening = draft.cutoffDate && new Date(draft.cutoffDate) > new Date() && s.closedAt;

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${s.payrollName} schedule`}
      description={<Status state={s.state} />}
      footer={
        canManage && (
          <>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button loading={save.isPending} disabled={!Object.keys(draft).length} onClick={submit}>
              Save schedule
            </Button>
          </>
        )
      }
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 p-4">
          <ScheduleTimeline s={s} />
          <p className="text-xs text-slate-500">{STATE_LABEL[s.state]}{s.closedAt && ` · closed ${formatDateTime(s.closedAt)}`}</p>
        </div>

        <DescList
          items={[
            { label: 'Period', value: `${formatDate(s.startDate)} – ${formatDate(s.endDate)}` },
            { label: 'Pay date', value: formatDate(s.payDate) },
          ]}
        />

        {error && <Alert tone="danger">{error.msg}</Alert>}
        {reopening && <Alert tone="info">Moving the cutoff into the future reopens this period.</Alert>}
        {!canManage && <Alert tone="info">Editing the schedule needs the manage_payroll_settings permission.</Alert>}

        <div className="space-y-5">
          <Field
            label="HR period"
            error={error?.path === 'hrPeriod' ? error.msg : undefined}
            hint={<>The HR month this period maps to. {!s.explicit.hrPeriod && '(default)'} Locked once payroll has run.</>}
            trailing={canManage && s.explicit.hrPeriod && <ResetLink onClick={() => setDraft((d) => ({ ...d, hrPeriod: null }))} />}
          >
            {(id) => (
              <Input
                id={id}
                type="month"
                disabled={!canManage}
                value={(valueOf('hrPeriod') === undefined ? s.hrPeriod : valueOf('hrPeriod')) ?? ''}
                placeholder={formatPeriod(s.hrPeriod)}
                onChange={(e) => setDraft((d) => ({ ...d, hrPeriod: e.target.value || null }))}
              />
            )}
          </Field>
          {DATE_FIELDS.map((f) => {
            const v = valueOf(f.key);
            const isDefault = v === null || (v === undefined && !s.explicit[f.key]);
            return (
              <Field
                key={f.key}
                label={
                  <span className="flex items-center gap-2">
                    {f.label}
                    {isDefault && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 uppercase">default</span>}
                  </span>
                }
                hint={v === null ? 'Will reset to the default from payroll settings.' : f.hint}
                error={error?.path === f.key ? error.msg : undefined}
                trailing={canManage && !isDefault && <ResetLink onClick={() => setDraft((d) => ({ ...d, [f.key]: null }))} />}
              >
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    disabled={!canManage}
                    value={v === null ? '' : v ?? toDateInput(s[f.key])}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value || null }))}
                  />
                )}
              </Field>
            );
          })}
        </div>

        {settings.data && (
          <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <CalendarDays className="mt-0.5 size-3.5 shrink-0" />
            Defaults: open {settings.data.openDaysBefore} days before the start, cutoff on day {settings.data.cutoffDay}, sync until day {settings.data.syncUntilDay ?? settings.data.cutoffDay} of the next month.
          </p>
        )}
      </div>
    </Drawer>
  );
}

function ResetLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline">
      <RotateCcw className="size-3" /> Reset to default
    </button>
  );
}

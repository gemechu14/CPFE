import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';
import { qk, useDefinitions, useSettings } from '@/hooks/queries';
import { definitionsApi } from '@/lib/api';
import { toApiError } from '@/lib/http';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { Dialog } from '@/components/ui/Overlay';
import { Segmented } from '@/components/ui/Tabs';
import type { PayrollDefinitionInput } from '@/types/api';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();
const monthName = (y: number, m: number) => new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

function monthDefinition(y: number, m: number, payDay: number): PayrollDefinitionInput {
  return {
    payrollName: monthName(y, m),
    startDate: iso(y, m, 1),
    endDate: iso(y, m, lastDay(y, m)),
    payPeriod: 'Monthly',
    payDate: iso(y, m, Math.min(payDay, lastDay(y, m))),
  };
}

type Mode = 'single' | 'year';

export function CreateDefinitionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings();
  const payDay = settings.data?.payDay ?? 20;
  const existing = useDefinitions();
  const taken = new Set((existing.data ?? []).map((d) => d.payrollName.trim().toLowerCase()));
  const qc = useQueryClient();
  const now = new Date();
  const [mode, setMode] = useState<Mode>('single');
  const [form, setForm] = useState<PayrollDefinitionInput>(() => monthDefinition(now.getFullYear(), now.getMonth() + 1, payDay));
  const [showSchedule, setShowSchedule] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [fromMonth, setFromMonth] = useState(now.getMonth() + 1);
  const [error, setError] = useState<{ msg: string; path?: string } | null>(null);

  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: qk.definitions });
    toast.success(msg);
    setError(null);
    onClose();
  };

  const createOne = useMutation({
    mutationFn: definitionsApi.create,
    onSuccess: () => done('Payroll period created'),
    onError: (err) => {
      const e = toApiError(err);
      setError({ msg: e.message, path: e.details[0]?.path });
    },
  });
  const createMany = useMutation({
    mutationFn: definitionsApi.createBulk,
    onSuccess: (d) => done(`${d.count} payroll periods created`),
    onError: (err) => setError({ msg: toApiError(err).message }),
  });

  const set = (k: keyof PayrollDefinitionInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submitSingle() {
    const { openDate, cutoffDate, syncUntilDate } = form;
    if (openDate && cutoffDate && openDate > cutoffDate) return setError({ msg: 'Open date must be on or before the cutoff date', path: 'cutoffDate' });
    if (cutoffDate && syncUntilDate && cutoffDate > syncUntilDate) return setError({ msg: 'Cutoff date must be on or before sync until', path: 'syncUntilDate' });
    if (form.startDate > form.endDate) return setError({ msg: 'End date must be on or after the start date', path: 'endDate' });
    if (taken.has(form.payrollName.trim().toLowerCase())) return setError({ msg: 'A period with this name already exists', path: 'payrollName' });
    // Leave optional schedule fields out entirely so the backend uses the defaults.
    const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== '' && v !== undefined)) as unknown as PayrollDefinitionInput;
    createOne.mutate(payload);
  }

  const bulk = Array.from({ length: 13 - fromMonth }, (_, i) => monthDefinition(year, fromMonth + i, payDay));
  const bulkNew = bulk.filter((b) => !taken.has(b.payrollName.toLowerCase()));
  const bulkSkipped = bulk.length - bulkNew.length;
  const errFor = (p: string) => (error?.path === p ? error.msg : undefined);
  const pending = createOne.isPending || createMany.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New payroll period"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {mode === 'single' ? (
            <Button loading={pending} onClick={submitSingle} disabled={!form.payrollName || !form.startDate || !form.endDate || !form.payDate}>
              Create period
            </Button>
          ) : (
            <Button loading={pending} disabled={bulkNew.length === 0} onClick={() => createMany.mutate(bulkNew)}>
              Create {bulkNew.length} period{bulkNew.length === 1 ? '' : 's'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <Segmented<Mode> value={mode} onChange={setMode} items={[{ value: 'single', label: 'Single month' }, { value: 'year', label: 'Rest of a year' }]} />
        {error && !error.path && <Alert tone="danger">{error.msg}</Alert>}

        {mode === 'single' ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required className="sm:col-span-2" error={errFor('payrollName')}>
                {(id) => <Input id={id} value={form.payrollName} onChange={set('payrollName')} />}
              </Field>
              <Field label="Start date" required error={errFor('startDate')}>
                {(id) => <Input id={id} type="date" value={form.startDate} onChange={set('startDate')} />}
              </Field>
              <Field label="End date" required error={errFor('endDate')}>
                {(id) => <Input id={id} type="date" value={form.endDate} onChange={set('endDate')} />}
              </Field>
              <Field label="Pay period">
                {(id) => (
                  <Select id={id} value={form.payPeriod} onChange={set('payPeriod')}>
                    <option>Monthly</option>
                  </Select>
                )}
              </Field>
              <Field label="Pay date" required error={errFor('payDate')}>
                {(id) => <Input id={id} type="date" value={form.payDate} onChange={set('payDate')} />}
              </Field>
            </div>

            <div className="rounded-xl border border-slate-200">
              <button type="button" onClick={() => setShowSchedule((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <span>
                  <span className="block text-sm font-medium text-slate-900">Schedule overrides</span>
                  <span className="block text-xs text-slate-500">Optional. Leave empty to use the defaults from payroll settings.</span>
                </span>
                <ChevronDown className={`size-4 text-slate-400 transition ${showSchedule ? 'rotate-180' : ''}`} />
              </button>
              {showSchedule && (
                <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
                  <Field label="HR period" error={errFor('hrPeriod')}>
                    {(id) => <Input id={id} type="month" value={form.hrPeriod ?? ''} onChange={set('hrPeriod')} />}
                  </Field>
                  <Field label="Open date" error={errFor('openDate')}>
                    {(id) => <Input id={id} type="date" value={form.openDate ?? ''} onChange={set('openDate')} />}
                  </Field>
                  <Field label="Cutoff date" error={errFor('cutoffDate')}>
                    {(id) => <Input id={id} type="date" value={form.cutoffDate ?? ''} onChange={set('cutoffDate')} />}
                  </Field>
                  <Field label="Sync until" error={errFor('syncUntilDate')}>
                    {(id) => <Input id={id} type="date" value={form.syncUntilDate ?? ''} onChange={set('syncUntilDate')} />}
                  </Field>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Year">
                {(id) => <Input id={id} type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} />}
              </Field>
              <Field label="From month">
                {(id) => (
                  <Select id={id} value={fromMonth} onChange={(e) => setFromMonth(Number(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i + 1}>{new Date(2000, i, 1).toLocaleDateString('en-GB', { month: 'long' })}</option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="mb-2 text-xs text-slate-500">Monthly periods paid on day {payDay}, using default schedules:</p>
              <div className="flex flex-wrap gap-1.5">
                {bulk.map((b) => {
                  const exists = taken.has(b.payrollName.toLowerCase());
                  return (
                    <span
                      key={b.startDate}
                      title={exists ? 'Already exists, will be skipped' : undefined}
                      className={exists ? 'rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-400 line-through' : 'rounded-md bg-surface px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200'}
                    >
                      {b.payrollName}
                    </span>
                  );
                })}
              </div>
              {bulkSkipped > 0 && <p className="mt-2 text-xs text-slate-500">{bulkSkipped} month{bulkSkipped > 1 ? 's' : ''} already exist and will be skipped.</p>}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

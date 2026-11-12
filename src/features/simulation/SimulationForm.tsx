import { useId, useState, type ReactNode } from 'react';
import { FlaskConical, Users } from 'lucide-react';
import { currentPeriod, formatInt, formatPeriod } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardFooter } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { Switch } from '@/components/ui/Switch';
import { Segmented } from '@/components/ui/Tabs';
import type { SimulationInput, SimulationParams } from './api';
import { EmployeePicker } from './EmployeePicker';

export const MAX_MONTHS = 24;

export interface SimForm {
  mode: 'month' | 'range' | 'year';
  from: string;
  to: string;
  year: number;
  scope: 'all' | 'selected';
  employeeIds: string[];
  useActuals: boolean;
  includeAdjustments: boolean;
}

export function defaultForm(): SimForm {
  const now = currentPeriod();
  return {
    mode: 'year',
    from: now,
    to: now,
    year: new Date().getFullYear(),
    scope: 'all',
    employeeIds: [],
    useActuals: true,
    includeAdjustments: true,
  };
}

/** Rebuild the form from a stored simulation's params (e.g. after a page refresh). */
export function formFromParams(p: SimulationParams): SimForm {
  const base = defaultForm();
  const [fy, fm] = p.fromPeriod.split('-');
  const [ty, tm] = p.toPeriod.split('-');
  const mode: SimForm['mode'] = fy === ty && fm === '01' && tm === '12' ? 'year' : p.fromPeriod === p.toPeriod ? 'month' : 'range';
  return {
    ...base,
    mode,
    from: p.fromPeriod,
    to: p.toPeriod,
    year: Number(fy) || base.year,
    scope: p.employeeIds?.length ? 'selected' : 'all',
    employeeIds: p.employeeIds ?? [],
    useActuals: p.useActuals,
    includeAdjustments: p.includeAdjustments,
  };
}

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty! - fy!) * 12 + (tm! - fm!) + 1;
};

export function validateForm(f: SimForm): string | null {
  if (f.mode !== 'year') {
    if (!PERIOD_RE.test(f.from)) return 'Pick a month.';
    if (f.mode === 'range') {
      if (!PERIOD_RE.test(f.to)) return 'Pick the last month.';
      const n = monthsBetween(f.from, f.to);
      if (n < 1) return 'The last month must be on or after the first.';
      if (n > MAX_MONTHS) return `A simulation can cover at most ${MAX_MONTHS} months (this range is ${n}).`;
    }
  }
  if (f.scope === 'selected' && f.employeeIds.length === 0) return 'Choose at least one employee.';
  return null;
}

export function toInput(f: SimForm): SimulationInput {
  const opts = {
    // "Everyone" leaves employeeIds out rather than sending thousands of ids.
    employeeIds: f.scope === 'selected' ? f.employeeIds : undefined,
    useActuals: f.useActuals,
    includeAdjustments: f.includeAdjustments,
  };
  if (f.mode === 'year') return { year: f.year, ...opts };
  if (f.mode === 'month') return { fromPeriod: f.from, ...opts };
  return { fromPeriod: f.from, toPeriod: f.to, ...opts };
}

export function SimulationForm({
  value,
  onChange,
  onRun,
  running,
  blockedReason,
}: {
  value: SimForm;
  onChange: (f: SimForm) => void;
  onRun: () => void;
  running: boolean;
  /** Why Run is disabled besides validation, e.g. a simulation still running. */
  blockedReason?: string | null;
}) {
  const [picker, setPicker] = useState(false);
  const set = (patch: Partial<SimForm>) => onChange({ ...value, ...patch });
  const error = validateForm(value);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => thisYear - 2 + i);
  const monthCount = value.mode === 'year' ? 12 : value.mode === 'month' ? 1 : PERIOD_RE.test(value.to) ? monthsBetween(value.from, value.to) : 0;

  const summary =
    value.mode === 'year'
      ? `Jan – Dec ${value.year}`
      : value.mode === 'month'
        ? formatPeriod(value.from)
        : `${formatPeriod(value.from)} – ${formatPeriod(value.to)}${monthCount > 0 ? ` (${monthCount} months)` : ''}`;

  return (
    <Card>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!error && !blockedReason) onRun();
        }}
      >
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
          <Group title="Period">
            <Segmented<SimForm['mode']>
              value={value.mode}
              onChange={(mode) => set({ mode })}
              items={[
                { value: 'month', label: 'One month' },
                { value: 'range', label: 'Range' },
                { value: 'year', label: 'Whole year' },
              ]}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {value.mode === 'year' ? (
                <Select aria-label="Year" value={value.year} onChange={(e) => set({ year: Number(e.target.value) })} className="w-32">
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </Select>
              ) : (
                <>
                  <Input type="month" aria-label={value.mode === 'range' ? 'First month' : 'Month'} value={value.from} onChange={(e) => set({ from: e.target.value })} className="w-44" required />
                  {value.mode === 'range' && (
                    <>
                      <span className="text-sm text-slate-400">to</span>
                      <Input type="month" aria-label="Last month" value={value.to} min={value.from} onChange={(e) => set({ to: e.target.value })} className="w-44" required />
                    </>
                  )}
                </>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">Up to {MAX_MONTHS} months per simulation.</p>
          </Group>

          <Group title="Employees">
            <Segmented<SimForm['scope']>
              value={value.scope}
              onChange={(scope) => {
                set({ scope });
                if (scope === 'selected' && value.employeeIds.length === 0) setPicker(true);
              }}
              items={[
                { value: 'all', label: 'All active' },
                { value: 'selected', label: 'Selected' },
              ]}
            />
            <div className="mt-3">
              {value.scope === 'all' ? (
                <p className="text-sm text-slate-500">Every active employee is included.</p>
              ) : (
                <Button variant="outline" icon={<Users className="size-4" />} onClick={() => setPicker(true)}>
                  {value.employeeIds.length ? `${formatInt(value.employeeIds.length)} selected · change` : 'Choose employees'}
                </Button>
              )}
            </div>
          </Group>

          <Group title="Options">
            <div className="space-y-3">
              <Toggle
                checked={value.useActuals}
                onChange={(useActuals) => set({ useActuals })}
                label="Use real amounts for months already run"
                hint="Months with saved payroll show what was actually paid."
              />
              <Toggle
                checked={value.includeAdjustments}
                onChange={(includeAdjustments) => set({ includeAdjustments })}
                label="Include pending arrears / recoveries"
                hint="Added once, in the first simulated month after the month they correct."
              />
            </div>
          </Group>
        </div>
        <CardFooter className="flex-wrap justify-between">
          <p className="text-sm text-slate-500">
            {blockedReason ?? error ?? (
              <>
                <span className="font-medium text-slate-800">{summary}</span> ·{' '}
                {value.scope === 'all' ? 'all active employees' : `${formatInt(value.employeeIds.length)} employee${value.employeeIds.length === 1 ? '' : 's'}`} · nothing is saved
              </>
            )}
          </p>
          <Button type="submit" loading={running} disabled={!!error || !!blockedReason} icon={<FlaskConical className="size-4" />}>
            {running ? 'Simulating…' : 'Run simulation'}
          </Button>
        </CardFooter>
      </form>

      <EmployeePicker open={picker} value={value.employeeIds} onClose={() => setPicker(false)} onChange={(employeeIds) => set({ employeeIds, scope: 'selected' })} />
    </Card>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onChange={onChange} />
      <label htmlFor={id} className="cursor-pointer text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </label>
    </div>
  );
}

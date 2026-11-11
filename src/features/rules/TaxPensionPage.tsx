import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calculator, Landmark, Percent, PiggyBank, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { toApiError } from '@/lib/http';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader, Skeleton } from '@/components/ui/Feedback';
import { ConfirmDialog, Dialog } from '@/components/ui/Overlay';
import { PageHeader } from '@/components/ui/Page';
import { Switch } from '@/components/ui/Switch';
import { Tabs } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import {
  bracketIssues,
  computeTax,
  pensionApi,
  pfApi,
  rulesKeys,
  taxApi,
  type ContributionInput,
  type ContributionRule,
  type TaxSlabInput,
  type TaxSlabType,
} from './api';

type Tab = 'tax' | 'pension' | 'pf';
const MAX_SENTINEL = 999_999_999;

const fmtIncome = (n: number) => (n >= MAX_SENTINEL ? '∞' : formatMoney(n).replace(/\.00$/, ''));

export function TaxPensionPage() {
  const [tab, setTab] = useState<Tab>('tax');
  return (
    <>
      <PageHeader
        title="Tax, pension & provident fund"
        description="The company's active rules. Payroll loads them every time it runs."
      />
      <Tabs<Tab>
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'tax', label: 'Income tax' },
          { value: 'pension', label: 'Pension' },
          { value: 'pf', label: 'Provident fund' },
        ]}
      />
      {tab === 'tax' && <TaxTab />}
      {tab === 'pension' && <ContributionTab kind="pension" />}
      {tab === 'pf' && <ContributionTab kind="pf" />}
    </>
  );
}

// ── Income tax ──────────────────────────────────────────────

function TaxTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: rulesKeys.tax, queryFn: taxApi.list });
  const sortedIds = useMemo(() => [...(list.data ?? [])].sort((a, b) => a.minIncome - b.minIncome), [list.data]);
  // The list has no name/deductible, so load each bracket.
  const details = useQueries({ queries: sortedIds.map((b) => ({ queryKey: rulesKeys.taxOne(b.id), queryFn: () => taxApi.get(b.id), staleTime: 5 * 60_000 })) });
  const rows = sortedIds.map((b, i) => ({ ...b, name: details[i]?.data?.name ?? null, deductible: details[i]?.data?.deductible ?? null, loading: details[i]?.isLoading }));
  const detailsReady = rows.every((r) => !r.loading);
  const issues = bracketIssues(rows);

  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [example, setExample] = useState('12000');

  const reset = useMutation({
    mutationFn: taxApi.reset,
    onSuccess: () => {
      toast.success('Tax brackets reset to default');
      setResetting(false);
      qc.invalidateQueries({ queryKey: ['rules', 'tax'] });
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const exampleNum = Number(example);
  const calc = detailsReady && example !== '' && !Number.isNaN(exampleNum) ? computeTax(exampleNum, rows) : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader
          icon={<Percent className="size-4.5" />}
          title="Income tax brackets"
          description="Monthly taxable income in ETB. Tax = income × rate − deductible."
          actions={
            <>
              {can(PERMS.updateSystem) && (
                <Button variant="outline" size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => setResetting(true)}>
                  Reset to default
                </Button>
              )}
              {can(PERMS.createSystem) && (
                <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
                  Add bracket
                </Button>
              )}
            </>
          }
        />
        {list.isLoading ? (
          <PageLoader />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Percent className="size-6" />} title="No active tax brackets" description="No income tax is deducted. Reset to the Ethiopian defaults to start." />
        ) : (
          <>
            {issues.length > 0 && (
              <div className="space-y-2 px-5 pt-4">
                {issues.map((i, k) => (
                  <Alert key={k} tone="warning">
                    {i.kind === 'overlap'
                      ? `Brackets overlap between ${fmtIncome(i.from)} and ${fmtIncome(i.to)}. Payroll may pick either one.`
                      : `Gap between ${fmtIncome(i.from)} and ${fmtIncome(i.to)}. Income in this range is taxed at 0.`}
                  </Alert>
                ))}
              </div>
            )}
            <Table>
              <THead>
                <tr>
                  <TH>Bracket</TH>
                  <TH align="right">Monthly income</TH>
                  <TH align="right">Rate</TH>
                  <TH align="right">Deductible</TH>
                  <TH align="right">Tax at top</TH>
                  {can(PERMS.deleteSystem) && <TH />}
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const active = calc?.bracket && calc.bracket.minIncome === r.minIncome && calc.bracket.maxIncome === r.maxIncome;
                  return (
                    <TR key={r.id} className={cn(active && 'bg-accent-50/60')}>
                      <TD>
                        <div className="font-medium text-slate-900">{r.loading ? <Skeleton className="h-4 w-32" /> : r.name ?? 'Bracket'}</div>
                        {r.type === 'EXEMPTION' && <Badge tone="neutral" className="mt-1">Exemption</Badge>}
                      </TD>
                      <TD align="right" className="whitespace-nowrap">
                        {fmtIncome(r.minIncome)} – {fmtIncome(r.maxIncome)}
                      </TD>
                      <TD align="right" className="font-semibold text-slate-900">{r.rate ?? 0}%</TD>
                      <TD align="right">{r.loading ? '…' : formatMoney(r.deductible ?? 0)}</TD>
                      <TD align="right" className="text-slate-500">
                        {r.maxIncome >= MAX_SENTINEL || r.loading ? '—' : formatMoney(Math.max(0, (r.maxIncome * (r.rate ?? 0)) / 100 - (r.deductible ?? 0)))}
                      </TD>
                      {can(PERMS.deleteSystem) && (
                        <TD align="right">
                          <span title="Remove needs the company rule id, which the bracket list doesn't return yet (backend). Use Reset to default instead.">
                            <Button variant="ghost" size="icon" disabled aria-label="Remove bracket (unavailable)">
                              <Trash2 className="size-4" />
                            </Button>
                          </span>
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {can(PERMS.deleteSystem) && (
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                Removing a single bracket isn't available yet: the bracket list doesn't include the company rule id the remove endpoint needs. Use <strong>Reset to default</strong> to restore the standard brackets.
              </p>
            )}
          </>
        )}
      </Card>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <Card>
          <CardHeader icon={<Calculator className="size-4.5" />} title="Try it" description="Tax on a monthly taxable income." />
          <CardBody className="space-y-4">
            <Field label="Taxable income (ETB)">
              {(id) => <Input id={id} type="number" min={0} value={example} onChange={(e) => setExample(e.target.value)} />}
            </Field>
            {!detailsReady ? (
              <Skeleton className="h-16 w-full" />
            ) : calc ? (
              <div className="rounded-xl bg-primary-50 p-4">
                <div className="text-xs text-primary-800">At {formatMoney(exampleNum)}</div>
                <div className="num mt-0.5 text-2xl font-semibold text-primary-900">{formatMoney(calc.tax)}</div>
                <div className="mt-1 text-xs text-slate-600">
                  {calc.bracket
                    ? `${formatMoney(exampleNum)} × ${calc.bracket.rate ?? 0}% − ${formatMoney(calc.bracket.deductible ?? 0)}`
                    : 'No bracket matches, so tax is 0.'}
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </aside>

      <AddBracketDialog open={adding} onClose={() => setAdding(false)} existing={rows} />
      <ResetTaxDialog open={resetting} onClose={() => setResetting(false)} onConfirm={() => reset.mutate()} loading={reset.isPending} />
    </div>
  );
}

function ResetTaxDialog({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; loading: boolean }) {
  const defaults = useQuery({ queryKey: rulesKeys.taxDefault, queryFn: taxApi.defaults, enabled: open });
  const rows = [...(defaults.data ?? [])].sort((a, b) => a.minIncome - b.minIncome);
  return (
    <ConfirmDialog open={open} onClose={onClose} onConfirm={onConfirm} loading={loading} title="Reset tax brackets to default?" confirmLabel="Reset to default" tone="accent">
      <p>All of the company's brackets are deactivated and these defaults become active:</p>
      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
        {defaults.isLoading ? (
          <div className="p-4"><Skeleton className="h-20 w-full" /></div>
        ) : rows.length === 0 ? (
          <p className="p-3 text-xs text-red-600">No default brackets were found. Reset will fail.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="num px-3 py-1.5 text-slate-600">{fmtIncome(r.minIncome)} – {fmtIncome(r.maxIncome)}</td>
                  <td className="num px-3 py-1.5 text-right font-medium text-slate-900">{r.rate ?? 0}%</td>
                  <td className="num px-3 py-1.5 text-right text-slate-600">−{formatMoney(r.deductible ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </ConfirmDialog>
  );
}

function AddBracketDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: { minIncome: number; maxIncome: number }[] }) {
  const qc = useQueryClient();
  const empty = { name: '', description: '', type: 'INCOME_TAX' as TaxSlabType, rate: '', deductible: '', minIncome: '', maxIncome: '' };
  const [f, setF] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const add = useMutation({
    mutationFn: (input: TaxSlabInput) => taxApi.add(input),
    onSuccess: () => {
      toast.success('Bracket added');
      qc.invalidateQueries({ queryKey: ['rules', 'tax'] });
      setF(empty);
      setErrors({});
      onClose();
    },
    onError: (e) => {
      const err = toApiError(e);
      setErrors({ ...Object.fromEntries(err.details.map((x) => [x.path.replace(/^body\./, ''), x.message])), form: err.message });
    },
  });

  function submit() {
    const e: Record<string, string> = {};
    const min = Number(f.minIncome);
    const max = Number(f.maxIncome);
    if (!(min > 0)) e.minIncome = 'Must be greater than 0';
    if (!(max > 0)) e.maxIncome = 'Must be greater than 0';
    else if (max <= min) e.maxIncome = 'Must be greater than the minimum';
    for (const k of ['rate', 'deductible'] as const) if (f[k] !== '' && !(Number(f[k]) > 0)) e[k] = 'Must be greater than 0, or leave empty';
    if (!e.minIncome && !e.maxIncome && existing.some((b) => min < b.maxIncome && max > b.minIncome)) e.minIncome = 'This range overlaps an existing bracket';
    setErrors(e);
    if (Object.keys(e).length) return;
    add.mutate({
      minIncome: min,
      maxIncome: max,
      type: f.type,
      ...(f.name.trim() ? { name: f.name.trim() } : {}),
      ...(f.description.trim() ? { description: f.description.trim() } : {}),
      ...(f.rate !== '' ? { rate: Number(f.rate) } : {}),
      ...(f.deductible !== '' ? { deductible: Number(f.deductible) } : {}),
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add tax bracket"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={add.isPending} onClick={submit}>Add bracket</Button>
        </>
      }
    >
      <div className="space-y-4">
        {errors.form && <Alert tone="danger">{errors.form}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            {(id) => <Input id={id} placeholder="e.g. Over 20,000" value={f.name} onChange={set('name')} />}
          </Field>
          <Field label="Minimum income" required error={errors.minIncome}>
            {(id) => <Input id={id} type="number" value={f.minIncome} invalid={!!errors.minIncome} onChange={set('minIncome')} />}
          </Field>
          <Field label="Maximum income" required error={errors.maxIncome} hint="Use 999999999 for no upper limit.">
            {(id) => <Input id={id} type="number" value={f.maxIncome} invalid={!!errors.maxIncome} onChange={set('maxIncome')} />}
          </Field>
          <Field label="Rate (%)" error={errors.rate}>
            {(id) => <Input id={id} type="number" step="0.5" value={f.rate} invalid={!!errors.rate} onChange={set('rate')} />}
          </Field>
          <Field label="Deductible (ETB)" error={errors.deductible}>
            {(id) => <Input id={id} type="number" value={f.deductible} invalid={!!errors.deductible} onChange={set('deductible')} />}
          </Field>
          <Field label="Type">
            {(id) => (
              <Select id={id} value={f.type} onChange={(e) => setF((x) => ({ ...x, type: e.target.value as TaxSlabType }))}>
                <option value="INCOME_TAX">Income tax</option>
                <option value="EXEMPTION">Exemption</option>
              </Select>
            )}
          </Field>
          <Field label="Description" className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={2} value={f.description} onChange={set('description')} />}
          </Field>
        </div>
        <p className="text-xs text-slate-500">Values must be above 0, so a 0% bracket can't be added here. A range that was removed before can't be added again; use Reset to default.</p>
      </div>
    </Dialog>
  );
}

// ── Pension & provident fund ────────────────────────────────

const KIND = {
  pension: { api: pensionApi, key: rulesKeys.pension, defaultKey: rulesKeys.pensionDefault, title: 'Pension', icon: Landmark, name: 'pension' },
  pf: { api: pfApi, key: rulesKeys.pf, defaultKey: rulesKeys.pfDefault, title: 'Provident fund', icon: PiggyBank, name: 'provident fund' },
} as const;

function ContributionTab({ kind }: { kind: 'pension' | 'pf' }) {
  const k = KIND[kind];
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: k.key, queryFn: k.api.list });
  const defaults = useQuery({ queryKey: k.defaultKey, queryFn: k.api.defaults, staleTime: 10 * 60_000 });
  const [editing, setEditing] = useState<ContributionRule | 'new' | null>(null);
  const [confirm, setConfirm] = useState<'reset' | 'remove' | 'off' | null>(null);

  const refresh = (msg: string) => {
    toast.success(msg);
    setConfirm(null);
    qc.invalidateQueries({ queryKey: k.key });
  };
  const onError = (e: unknown) => toast.error(toApiError(e).message);

  const reset = useMutation({ mutationFn: k.api.reset, onSuccess: () => refresh(`${k.title} reset to default`), onError });
  const assign = useMutation({ mutationFn: k.api.assignDefault, onSuccess: () => refresh(`${k.title} turned on`), onError });
  const remove = useMutation({ mutationFn: (id: string) => k.api.remove(id), onSuccess: () => refresh(kind === 'pf' ? 'Provident fund turned off' : 'Pension rule removed'), onError });

  if (list.isLoading) return <PageLoader />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;

  const rules = list.data ?? [];
  const rule = rules[0];
  const def = defaults.data?.[0];
  const defLabel = def ? `${def.employeeContribution}% / ${def.employerContribution}%` : '7% / 11%';
  const Icon = k.icon;
  const on = rules.length > 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {rules.length > 1 && (
          <Alert
            tone="warning"
            title={`More than one ${k.name} rule is active`}
            action={can(PERMS.updateSystem) && <Button size="sm" variant="outline" onClick={() => setConfirm('reset')}>Reset</Button>}
          >
            Payroll will use only one of them, and which one isn't defined. Reset to keep a single rule.
          </Alert>
        )}

        <Card>
          <CardHeader
            icon={<Icon className="size-4.5" />}
            title={k.title}
            description={kind === 'pf' ? 'Deducted in addition to pension, on the same basic salary.' : 'Calculated on the earned basic salary.'}
            actions={
              kind === 'pf' &&
              can(PERMS.updateSystem) && (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700">{on ? 'On' : 'Off'}</span>
                  <Switch
                    label="Provident fund"
                    checked={on}
                    disabled={assign.isPending || remove.isPending || (on && !can(PERMS.deleteSystem))}
                    onChange={(v) => (v ? assign.mutate() : setConfirm('off'))}
                  />
                </div>
              )
            }
          />
          <CardBody>
            {!rule ? (
              <EmptyState
                icon={<Icon className="size-6" />}
                title={kind === 'pf' ? 'Provident fund is off' : 'No pension is deducted'}
                description={kind === 'pf' ? `Turn it on to deduct the default ${defLabel}, or add custom rates.` : 'Add a rule or reset to the default to deduct pension.'}
                className="py-8"
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    {can(PERMS.updateSystem) && (
                      <Button variant="secondary" onClick={() => (kind === 'pf' ? assign.mutate() : setConfirm('reset'))} loading={assign.isPending}>
                        {kind === 'pf' ? `Turn on (${defLabel})` : `Reset to default (${defLabel})`}
                      </Button>
                    )}
                    {can(PERMS.createSystem) && (
                      <Button variant="outline" onClick={() => setEditing('new')}>Custom rates</Button>
                    )}
                  </div>
                }
              />
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <RateTile label="Employee" sub="Deducted from net pay" value={rule.employeeContribution} />
                  <RateTile label="Employer" sub="Company cost" value={rule.employerContribution} accent />
                </div>
                <p className="text-sm text-slate-500">
                  Example on a basic of 10,000: employee {formatMoney((10000 * rule.employeeContribution) / 100)}, employer {formatMoney((10000 * rule.employerContribution) / 100)}.
                </p>
                <div className="flex flex-wrap gap-2">
                  {can(PERMS.updateSystem) && (
                    <Button variant="secondary" onClick={() => setEditing(rule)}>Edit rates</Button>
                  )}
                  {can(PERMS.updateSystem) && (
                    <Button variant="outline" icon={<RotateCcw className="size-4" />} onClick={() => setConfirm('reset')}>
                      Reset to default ({defLabel})
                    </Button>
                  )}
                  {kind === 'pension' && can(PERMS.deleteSystem) && (
                    <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<Trash2 className="size-4" />} onClick={() => setConfirm('remove')}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <aside>
        <Card>
          <CardBody className="space-y-2 text-xs leading-relaxed text-slate-500">
            <p className="text-sm font-medium text-slate-900">How it's calculated</p>
            <p>Employee amount = basic × employee % (deducted from net). Employer amount = basic × employer % (company cost).</p>
            <p>"Basic" is the earned basic after unpaid leave, plus basic-type arrears.</p>
            {kind === 'pf' && <p>New companies start with provident fund off, because it is deducted on top of pension.</p>}
          </CardBody>
        </Card>
      </aside>

      <RatesDialog
        kind={kind}
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={(msg) => {
          setEditing(null);
          refresh(msg);
        }}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        onClose={() => setConfirm(null)}
        onConfirm={() => reset.mutate()}
        loading={reset.isPending}
        tone="accent"
        title={`Reset ${k.name} to default?`}
        confirmLabel="Reset"
      >
        All of the company's {k.name} rules are deactivated and the default ({defLabel}) becomes the only active rule.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'remove' || confirm === 'off'}
        onClose={() => setConfirm(null)}
        onConfirm={() => rule && remove.mutate(rule.id)}
        loading={remove.isPending}
        tone="danger"
        title={kind === 'pf' ? 'Turn off provident fund?' : 'Remove the pension rule?'}
        confirmLabel={kind === 'pf' ? 'Turn off' : 'Remove'}
      >
        {kind === 'pf' ? 'No provident fund is deducted from the next payroll run.' : 'Without an active rule, payroll deducts no pension.'}
      </ConfirmDialog>
    </div>
  );
}

function RateTile({ label, sub, value, accent }: { label: string; sub: string; value: number; accent?: boolean }) {
  return (
    <div className={cn('rounded-xl border p-4', accent ? 'border-accent-200 bg-accent-50/50' : 'border-primary-200 bg-primary-50/50')}>
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="num mt-1 text-3xl font-semibold text-slate-900">{value}%</div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function RatesDialog({
  kind,
  target,
  onClose,
  onSaved,
}: {
  kind: 'pension' | 'pf';
  target: ContributionRule | 'new' | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const k = KIND[kind];
  const [emp, setEmp] = useState('');
  const [er, setEr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastTarget, setLastTarget] = useState<typeof target>(null);
  if (target !== lastTarget) {
    setLastTarget(target);
    setEmp(target && target !== 'new' ? String(target.employeeContribution) : '');
    setEr(target && target !== 'new' ? String(target.employerContribution) : '');
    setError(null);
  }

  const save = useMutation({
    mutationFn: (input: ContributionInput) => (target && target !== 'new' ? k.api.update(target.id, input) : k.api.add(input)),
    onSuccess: () => onSaved(`${k.title} rates saved`),
    onError: (e) => setError(toApiError(e).message),
  });

  function submit() {
    const a = Number(emp);
    const b = Number(er);
    if (!(a > 0) || !(b > 0) || a > 100 || b > 100) return setError('Both rates must be between 0 and 100 (and above 0).');
    save.mutate({ employeeContribution: a, employerContribution: b });
  }

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={target === 'new' ? `Add ${k.name} rule` : `Edit ${k.name} rates`}
      description={target !== 'new' ? 'The current rule is replaced by a new one with these rates.' : undefined}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={submit}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Employee %">
            {(id) => <Input id={id} type="number" step="0.5" value={emp} onChange={(e) => setEmp(e.target.value)} />}
          </Field>
          <Field label="Employer %">
            {(id) => <Input id={id} type="number" step="0.5" value={er} onChange={(e) => setEr(e.target.value)} />}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

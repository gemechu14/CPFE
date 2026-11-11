import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coins, Info, Layers, MinusCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { useIsHrSync } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import { formatMoney, toNumber } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { ConfirmDialog, Dialog } from '@/components/ui/Overlay';
import { PageHeader } from '@/components/ui/Page';
import { Switch } from '@/components/ui/Switch';
import { Tabs } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { ck, compensationApi, taxablePart, type AllowanceDefinition, type DeductionDefinition, type Grade, type GradeItem } from './api';
import { parseAmount, useAction } from './shared';

type Tab = 'allowances' | 'deductions' | 'matrix';

export function AllowancesDeductionsPage() {
  const [tab, setTab] = useState<Tab>('allowances');
  const allowanceDefs = useQuery({ queryKey: ck.allowanceDefs, queryFn: compensationApi.allowanceDefs });
  const deductionDefs = useQuery({ queryKey: ck.deductionDefs, queryFn: compensationApi.deductionDefs });

  return (
    <>
      <PageHeader
        title="Allowances & deductions"
        description="The catalogue of allowance and deduction types, their tax rules, and the amounts each grade receives."
      />
      <Tabs<Tab>
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'allowances', label: 'Allowance types', count: allowanceDefs.data?.length },
          { value: 'deductions', label: 'Deduction types', count: deductionDefs.data?.length },
          { value: 'matrix', label: 'Grade amounts' },
        ]}
      />
      {tab === 'allowances' && <AllowanceTypes q={allowanceDefs} />}
      {tab === 'deductions' && <DeductionTypes q={deductionDefs} />}
      {tab === 'matrix' && <GradeMatrix allowanceDefs={allowanceDefs.data ?? []} deductionDefs={deductionDefs.data ?? []} />}
    </>
  );
}

// ── Allowance types ─────────────────────────────────────────
function AllowanceTypes({ q }: { q: ReturnType<typeof useQuery<AllowanceDefinition[]>> }) {
  const { can } = useAuth();
  const [editing, setEditing] = useState<AllowanceDefinition | 'new' | null>(null);
  const [removing, setRemoving] = useState<AllowanceDefinition | null>(null);
  const remove = useAction((id: string) => compensationApi.removeAllowanceDef(id), [ck.allowanceDefs], 'Allowance type deactivated', () => setRemoving(null));

  return (
    <Card>
      <CardHeader
        icon={<Coins className="size-4.5" />}
        title="Allowance types"
        description="Exempt allowances are taxed only on the part above the exempted amount."
        actions={can(PERMS.createSystem) && <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>New type</Button>}
      />
      {q.isLoading ? (
        <PageLoader />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={<Coins className="size-6" />} title="No allowance types yet" description="Create types such as transport or housing allowance." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Tax treatment</TH>
              <TH align="right">Exempted amount</TH>
              <TH align="right">Starting amount</TH>
              <TH align="right" />
            </tr>
          </THead>
          <TBody>
            {q.data.map((a) => (
              <TR key={a.id}>
                <TD className="font-medium text-slate-900">{a.name}</TD>
                <TD>{a.isExempted ? <Badge tone="success">Partly exempt</Badge> : <Badge>Fully taxable</Badge>}</TD>
                <TD align="right">{a.isExempted ? formatMoney(a.exemptedAmount) : '—'}</TD>
                <TD align="right">{a.isExempted && a.startingAmount ? formatMoney(a.startingAmount) : '—'}</TD>
                <TD align="right">
                  <RowActions onEdit={can(PERMS.updateSystem) ? () => setEditing(a) : undefined} onRemove={can(PERMS.deleteSystem) ? () => setRemoving(a) : undefined} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {editing && <AllowanceTypeDialog def={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        tone="danger"
        title={`Deactivate ${removing?.name}?`}
        confirmLabel="Deactivate"
      >
        The type disappears from lists. Grade amounts already set for it are kept.
      </ConfirmDialog>
    </Card>
  );
}

function AllowanceTypeDialog({ def, onClose }: { def: AllowanceDefinition | null; onClose: () => void }) {
  const isHrSync = useIsHrSync();
  const [name, setName] = useState(def?.name ?? '');
  const [exempt, setExempt] = useState(def?.isExempted ?? false);
  const [exemptedAmount, setExemptedAmount] = useState(def?.isExempted ? String(toNumber(def.exemptedAmount)) : '');
  const [startingAmount, setStartingAmount] = useState(def?.startingAmount ? String(toNumber(def.startingAmount)) : '');
  const [example, setExample] = useState('2600');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const renameLocked = !!def && isHrSync;

  const save = useAction(
    () => {
      const body = exempt
        ? { isExempted: true, exemptedAmount: parseAmount(exemptedAmount)!, startingAmount: parseAmount(startingAmount)! }
        : { isExempted: false, ...(def ? {} : { exemptedAmount: null, startingAmount: null }) };
      return def
        ? compensationApi.updateAllowanceDef(def.id, { ...(renameLocked ? {} : { name: name.trim() }), ...body })
        : compensationApi.createAllowanceDef({ name: name.trim(), isTaxable: true, ...body });
    },
    [ck.allowanceDefs],
    def ? 'Allowance type updated' : 'Allowance type created',
    onClose,
  );

  function submit() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (exempt) {
      if (parseAmount(exemptedAmount) === null) e.exemptedAmount = 'Enter an amount above 0';
      if (parseAmount(startingAmount) === null) e.startingAmount = 'Enter an amount above 0';
    }
    setErrors(e);
    if (!Object.keys(e).length) save.mutate(undefined);
  }

  const ex = parseAmount(example) ?? 0;
  const taxable = taxablePart(ex, { isExempted: exempt, exemptedAmount: parseAmount(exemptedAmount) ?? 0, startingAmount: parseAmount(startingAmount) });

  return (
    <Dialog
      open
      onClose={onClose}
      title={def ? 'Edit allowance type' : 'New allowance type'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={submit}>{def ? 'Save changes' : 'Create type'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Name"
          required
          error={errors.name}
          hint={renameLocked ? 'Locked: HR sync matches benefits to allowance types by exact name. Renaming would break the match and the sync would recreate the original type.' : undefined}
        >
          {(id) => <Input id={id} autoFocus={!renameLocked} disabled={renameLocked} placeholder="Transport allowance" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
          <div>
            <div className="text-sm font-medium text-slate-900">Tax exempt</div>
            <div className="text-xs text-slate-500">Exemption applies only when the amount is above the starting amount.</div>
          </div>
          <Switch label="Tax exempt" checked={exempt} onChange={setExempt} />
        </div>
        {exempt && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Exempted amount" required error={errors.exemptedAmount} hint="Not taxed when the rule applies.">
                {(id) => <Input id={id} type="number" min={0} step="0.01" value={exemptedAmount} onChange={(e) => setExemptedAmount(e.target.value)} />}
              </Field>
              <Field label="Starting amount" required error={errors.startingAmount} hint="Exemption starts above this amount.">
                {(id) => <Input id={id} type="number" min={0} step="0.01" value={startingAmount} onChange={(e) => setStartingAmount(e.target.value)} />}
              </Field>
            </div>
            <div className="rounded-lg bg-primary-50 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-primary-900">
                <Info className="size-4" /> Example: an allowance of
                <Input aria-label="Example amount" type="number" value={example} onChange={(e) => setExample(e.target.value)} className="h-8 w-28 bg-surface" />
                has a taxable part of <span className="num font-semibold">{formatMoney(taxable)}</span>.
              </div>
            </div>
          </>
        )}
        {def && !exempt && def.isExempted && (
          <Alert tone="warning">The backend can't clear stored exemption amounts, but with exemption off the whole amount is taxed.</Alert>
        )}
      </div>
    </Dialog>
  );
}

// ── Deduction types ─────────────────────────────────────────
function DeductionTypes({ q }: { q: ReturnType<typeof useQuery<DeductionDefinition[]>> }) {
  const { can } = useAuth();
  const [editing, setEditing] = useState<DeductionDefinition | 'new' | null>(null);
  const [removing, setRemoving] = useState<DeductionDefinition | null>(null);
  const [name, setName] = useState('');
  const remove = useAction((id: string) => compensationApi.removeDeductionDef(id), [ck.deductionDefs], 'Deduction type deactivated', () => setRemoving(null));
  const save = useAction(
    () => (editing && editing !== 'new' ? compensationApi.updateDeductionDef(editing.id, name.trim()) : compensationApi.createDeductionDef(name.trim())),
    [ck.deductionDefs],
    editing === 'new' ? 'Deduction type created' : 'Deduction type updated',
    () => setEditing(null),
  );
  const open = (d: DeductionDefinition | 'new') => {
    setName(d === 'new' ? '' : d.name);
    setEditing(d);
  };

  return (
    <Card>
      <CardHeader
        icon={<MinusCircle className="size-4.5" />}
        title="Deduction types"
        description="Recurring deductions such as credit association contributions. Deducted after tax."
        actions={can(PERMS.createSystem) && <Button icon={<Plus className="size-4" />} onClick={() => open('new')}>New type</Button>}
      />
      {q.isLoading ? (
        <PageLoader />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={<MinusCircle className="size-6" />} title="No deduction types yet" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {q.data.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="text-sm font-medium text-slate-900">{d.name}</span>
              <RowActions onEdit={can(PERMS.updateSystem) ? () => open(d) : undefined} onRemove={can(PERMS.deleteSystem) ? () => setRemoving(d) : undefined} />
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New deduction type' : 'Edit deduction type'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate(undefined)}>Save</Button>
          </>
        }
      >
        <Field label="Name" required>
          {(id) => <Input id={id} autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        tone="danger"
        title={`Deactivate ${removing?.name}?`}
        confirmLabel="Deactivate"
      >
        The type disappears from lists. Grade amounts already set for it are kept.
      </ConfirmDialog>
    </Card>
  );
}

// ── Grade matrix ────────────────────────────────────────────
type Kind = 'allowance' | 'deduction';
interface CellTarget {
  kind: Kind;
  grade: Grade;
  typeId: string;
  typeName: string;
  existing?: GradeItem;
}

function GradeMatrix({ allowanceDefs, deductionDefs }: { allowanceDefs: AllowanceDefinition[]; deductionDefs: DeductionDefinition[] }) {
  const isHrSync = useIsHrSync();
  const grades = useQuery({ queryKey: ck.grades, queryFn: compensationApi.grades });
  const allowances = useQuery({ queryKey: ck.allowances, queryFn: compensationApi.allowances });
  const deductions = useQuery({ queryKey: ck.deductions, queryFn: compensationApi.deductions });
  const [cell, setCell] = useState<CellTarget | null>(null);

  if (grades.isLoading || allowances.isLoading || deductions.isLoading) return <PageLoader />;
  const err = grades.error || allowances.error || deductions.error;
  if (err) return <ErrorState error={err} onRetry={() => { grades.refetch(); allowances.refetch(); deductions.refetch(); }} />;

  const gradeList = grades.data ?? [];
  return (
    <div className="space-y-6">
      {isHrSync ? (
        <Alert tone="warning" title="Manual employees only">
          Grade allowances and deductions are ignored for HR-synced employees. Their allowances come from the HR feed's benefits.
        </Alert>
      ) : (
        <Alert tone="info">For manual employees, every amount set for their current grade is added (allowances) or deducted after tax (deductions) in each payroll run.</Alert>
      )}
      {!gradeList.length ? (
        <Card>
          <EmptyState icon={<Layers className="size-6" />} title="No grades yet" description="Create grades first, then set the amounts each grade receives." />
        </Card>
      ) : (
        <>
          <MatrixCard kind="allowance" title="Allowances per grade" grades={gradeList} types={allowanceDefs} items={allowances.data ?? []} onCell={setCell} />
          <MatrixCard kind="deduction" title="Deductions per grade" grades={gradeList} types={deductionDefs} items={deductions.data ?? []} onCell={setCell} />
        </>
      )}
      {cell && <CellDialog target={cell} onClose={() => setCell(null)} />}
    </div>
  );
}

function MatrixCard({
  kind,
  title,
  grades,
  types,
  items,
  onCell,
}: {
  kind: Kind;
  title: string;
  grades: Grade[];
  types: { id: string; name: string }[];
  items: GradeItem[];
  onCell: (t: CellTarget) => void;
}) {
  const { can } = useAuth();
  const editable = can(PERMS.createSystem) || can(PERMS.updateSystem);
  const byKey = useMemo(() => {
    const m = new Map<string, GradeItem[]>();
    for (const i of items) {
      const typeId = (kind === 'allowance' ? i.allowanceDefinitionId : i.deductionDefinitionId) ?? '';
      const k = `${i.gradeId}:${typeId}`;
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return m;
  }, [items, kind]);
  const sortedGrades = [...grades].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return (
    <Card>
      <CardHeader title={title} description={editable ? 'Click a cell to set, change or remove the amount.' : undefined} />
      {!types.length ? (
        <EmptyState title={`No ${kind} types yet`} description={`Create ${kind} types in the previous tab first.`} className="py-8" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH className="sticky left-0 z-10 bg-slate-50">Grade</TH>
              {types.map((t) => (
                <TH key={t.id} align="right">{t.name}</TH>
              ))}
              <TH align="right">Total</TH>
            </tr>
          </THead>
          <TBody>
            {sortedGrades.map((g) => {
              let total = 0;
              return (
                <TR key={g.id}>
                  <TD className="sticky left-0 z-10 bg-surface font-medium whitespace-nowrap text-slate-900">
                    {g.name}
                    {g.externalId && <Badge tone="primary" className="ml-2">HR</Badge>}
                  </TD>
                  {types.map((t) => {
                    const rows = byKey.get(`${g.id}:${t.id}`) ?? [];
                    const sum = rows.reduce((s, r) => s + toNumber(r.amount), 0);
                    total += sum;
                    return (
                      <TD key={t.id} align="right" className="p-1">
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => onCell({ kind, grade: g, typeId: t.id, typeName: t.name, existing: rows[0] })}
                          className={cn(
                            'num w-full rounded-md px-3 py-2 text-right transition',
                            editable && 'hover:bg-primary-50 hover:ring-1 hover:ring-primary-200',
                            rows.length ? 'font-medium text-slate-900' : 'text-slate-300',
                          )}
                          title={rows.length > 1 ? 'Duplicate rows: both are paid. Edit to keep one.' : undefined}
                        >
                          {rows.length ? formatMoney(sum) : editable ? '+' : '—'}
                          {rows.length > 1 && <span className="ml-1 text-amber-600">×{rows.length}</span>}
                        </button>
                      </TD>
                    );
                  })}
                  <TD align="right" className="font-semibold text-slate-900">{total ? formatMoney(total) : '—'}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function CellDialog({ target, onClose }: { target: CellTarget; onClose: () => void }) {
  const { can } = useAuth();
  const [amount, setAmount] = useState(target.existing ? String(target.existing.amount) : '');
  const keys = [target.kind === 'allowance' ? ck.allowances : ck.deductions, ck.grades];
  const isA = target.kind === 'allowance';

  const save = useAction(
    (n: number) => {
      if (target.existing) return isA ? compensationApi.updateAllowance(target.existing.id, n) : compensationApi.updateDeduction(target.existing.id, n);
      return isA
        ? compensationApi.createAllowance({ amount: n, allowanceDefinitionId: target.typeId, gradeId: target.grade.id })
        : compensationApi.createDeduction({ amount: n, deductionDefinitionId: target.typeId, gradeId: target.grade.id });
    },
    keys,
    'Amount saved',
    onClose,
  );
  const remove = useAction(
    (id: string) => (isA ? compensationApi.removeAllowance(id) : compensationApi.removeDeduction(id)),
    keys,
    'Amount removed',
    onClose,
  );
  const n = parseAmount(amount);
  const canSave = target.existing ? can(PERMS.updateSystem) : can(PERMS.createSystem);

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`${target.typeName} · ${target.grade.name}`}
      description={isA ? 'Monthly allowance for every manual employee in this grade.' : 'Monthly deduction (after tax) for every manual employee in this grade.'}
      footer={
        <>
          {target.existing && can(PERMS.deleteSystem) && (
            <Button
              variant="ghost"
              className="mr-auto text-red-600 hover:bg-red-50"
              icon={<Trash2 className="size-4" />}
              loading={remove.isPending}
              onClick={() => remove.mutate(target.existing!.id)}
            >
              Remove
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {canSave && (
            <Button loading={save.isPending} disabled={n === null} onClick={() => n !== null && save.mutate(n)}>
              Save
            </Button>
          )}
        </>
      }
    >
      <Field label="Amount (ETB per month)" error={amount && n === null ? 'Enter an amount above 0' : undefined}>
        {(id) => <Input id={id} autoFocus type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

function RowActions({ onEdit, onRemove }: { onEdit?: () => void; onRemove?: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      {onEdit && (
        <Button variant="ghost" size="icon" aria-label="Edit" onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
      )}
      {onRemove && (
        <Button variant="ghost" size="icon" aria-label="Deactivate" onClick={onRemove} className="hover:text-red-600">
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

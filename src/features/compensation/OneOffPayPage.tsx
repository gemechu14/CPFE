import { useDeferredValue, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeMinus, BadgePlus, Pencil, Plus, Repeat, Search, Tags, Trash2 } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { useEmployees } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import { formatInt, formatMoney, toNumber } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { ConfirmDialog, Dialog } from '@/components/ui/Overlay';
import { PageHeader, StatTile } from '@/components/ui/Page';
import { Tabs } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import type { Employee } from '@/types/api';
import { ck, compensationApi, type CatalogueType, type ExtraDefinition } from './api';
import { parseAmount, useAction } from './shared';

type Tab = 'pay' | 'deduction' | 'types';
type Kind = 'pay' | 'deduction';

/** Normalised row for both additional pay and additional deductions. */
interface Row {
  id: string;
  amount: string;
  employeeId: string;
  typeId: string;
}

export function OneOffPayPage() {
  const [tab, setTab] = useState<Tab>('pay');
  const pay = useQuery({ queryKey: ck.pay, queryFn: compensationApi.pay });
  const ded = useQuery({ queryKey: ck.ded, queryFn: compensationApi.ded });
  const payDefs = useQuery({ queryKey: ck.payDefs, queryFn: compensationApi.payDefs });
  const dedDefs = useQuery({ queryKey: ck.dedDefs, queryFn: compensationApi.dedDefs });

  const payRows: Row[] = useMemo(() => (pay.data ?? []).map((r) => ({ id: r.id, amount: r.amount, employeeId: r.employeeId, typeId: r.additionalPayDefinitionId })), [pay.data]);
  const dedRows: Row[] = useMemo(() => (ded.data ?? []).map((r) => ({ id: r.id, amount: r.amount, employeeId: r.employeeId, typeId: r.additionalDeductionDefinitionId })), [ded.data]);
  const sum = (rows: Row[]) => rows.reduce((s, r) => s + toNumber(r.amount), 0);

  return (
    <>
      <PageHeader
        eyebrow="Payroll"
        title="Additional pay & deductions"
        description="Bonuses, one-off payments, loan repayments and penalties for individual employees. Works for manual and HR-synced employees."
      />

      <Alert tone="warning" title="These repeat in every payroll run until removed" className="mb-6">
        Additional pay and deductions aren't tied to a month. A one-off bonus or penalty must be removed after the run, or it's paid or deducted again next month. Loan instalments can stay until the loan is repaid.
      </Alert>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Additional pay in next run" loading={pay.isLoading} value={formatMoney(sum(payRows))} hint={`${formatInt(payRows.length)} items · not taxed`} icon={<BadgePlus className="size-4.5" />} tone="success" />
        <StatTile label="Additional deductions in next run" loading={ded.isLoading} value={formatMoney(sum(dedRows))} hint={`${formatInt(dedRows.length)} items · after tax`} icon={<BadgeMinus className="size-4.5" />} tone="accent" />
        <StatTile label="Employees with pay" loading={pay.isLoading} value={formatInt(new Set(payRows.map((r) => r.employeeId)).size)} icon={<Repeat className="size-4.5" />} />
        <StatTile label="Employees with deductions" loading={ded.isLoading} value={formatInt(new Set(dedRows.map((r) => r.employeeId)).size)} icon={<Repeat className="size-4.5" />} tone="warning" />
      </div>

      <Tabs<Tab>
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'pay', label: 'Additional pay', count: payRows.length },
          { value: 'deduction', label: 'Additional deductions', count: dedRows.length },
          { value: 'types', label: 'Types' },
        ]}
      />

      {tab === 'pay' && <ItemsList kind="pay" q={pay} rows={payRows} types={payDefs.data ?? []} />}
      {tab === 'deduction' && <ItemsList kind="deduction" q={ded} rows={dedRows} types={dedDefs.data ?? []} />}
      {tab === 'types' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <TypeCatalogue kind="pay" q={payDefs} />
          <TypeCatalogue kind="deduction" q={dedDefs} />
        </div>
      )}
    </>
  );
}

// ── Employee items ──────────────────────────────────────────
function ItemsList({ kind, q, rows, types }: { kind: Kind; q: { isLoading: boolean; error: unknown; refetch: () => void }; rows: Row[]; types: ExtraDefinition[] }) {
  const { can } = useAuth();
  const employees = useEmployees();
  const [search, setSearch] = useState('');
  const s = useDeferredValue(search.trim().toLowerCase());
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const isPay = kind === 'pay';
  const keys = [isPay ? ck.pay : ck.ded];

  const empById = useMemo(() => new Map((employees.data ?? []).map((e) => [e.id, e])), [employees.data]);
  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const e = empById.get(r.employeeId);
      if (s && !(e?.name.toLowerCase().includes(s) || e?.employeeIdNumber?.toLowerCase().includes(s) || typeById.get(r.typeId)?.toLowerCase().includes(s))) continue;
      m.set(r.employeeId, [...(m.get(r.employeeId) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => (empById.get(a[0])?.name ?? '').localeCompare(empById.get(b[0])?.name ?? ''));
  }, [rows, s, empById, typeById]);

  const remove = useAction((id: string) => (isPay ? compensationApi.removePay(id) : compensationApi.removeDed(id)), keys, 'Removed', () => setRemoving(null));

  return (
    <Card>
      <CardHeader
        icon={isPay ? <BadgePlus className="size-4.5" /> : <BadgeMinus className="size-4.5" />}
        title={isPay ? 'Additional pay' : 'Additional deductions'}
        description={isPay ? 'Added to gross pay. Not taxed.' : 'Deducted after tax and included in total deductions.'}
        actions={
          <>
            <div className="w-64">
              <Input aria-label="Search" placeholder="Search employee or type" leading={<Search className="size-4" />} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {can(PERMS.createSystem) && (
              <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)} disabled={!types.length} title={!types.length ? 'Create a type first' : undefined}>
                Add
              </Button>
            )}
          </>
        }
      />
      {q.isLoading || employees.isLoading ? (
        <PageLoader />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !groups.length ? (
        <EmptyState
          icon={isPay ? <BadgePlus className="size-6" /> : <BadgeMinus className="size-6" />}
          title={rows.length ? 'Nothing matches your search' : isPay ? 'No additional pay' : 'No additional deductions'}
          description={!types.length ? 'Create a type in the Types tab first.' : undefined}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Employee</TH>
              <TH>Type</TH>
              <TH align="right">Amount</TH>
              <TH align="right" />
            </tr>
          </THead>
          <TBody>
            {groups.map(([employeeId, items]) => {
              const e = empById.get(employeeId);
              return items.map((r, i) => (
                <TR key={r.id} className={cn(i === 0 && 'border-t border-slate-200')}>
                  <TD className="align-top">
                    {i === 0 && (
                      <>
                        <div className="font-medium text-slate-900">{e?.name ?? 'Unknown employee'}</div>
                        <div className="text-xs text-slate-500">
                          {e?.employeeIdNumber ?? employeeId.slice(0, 8)}
                          {items.length > 1 && ` · ${items.length} items · ${formatMoney(items.reduce((x, y) => x + toNumber(y.amount), 0))}`}
                        </div>
                      </>
                    )}
                  </TD>
                  <TD>{typeById.get(r.typeId) ?? <span className="text-slate-400">Inactive type</span>}</TD>
                  <TD align="right">
                    <span className={cn('font-medium', isPay ? 'text-emerald-700' : 'text-red-600')}>
                      {isPay ? '+' : '−'}
                      {formatMoney(r.amount)}
                    </span>
                    {isPay && <Badge className="ml-2">Not taxed</Badge>}
                  </TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1">
                      {can(PERMS.updateSystem) && (
                        <Button variant="ghost" size="icon" aria-label="Edit amount" onClick={() => setEditing(r)}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                      {can(PERMS.deleteSystem) && (
                        <Button variant="ghost" size="icon" aria-label="Remove" className="hover:text-red-600" onClick={() => setRemoving(r)}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ));
            })}
          </TBody>
        </Table>
      )}

      {adding && <AddItemDialog kind={kind} types={types} employees={employees.data ?? []} onClose={() => setAdding(false)} />}
      {editing && <EditAmountDialog kind={kind} row={editing} label={`${empById.get(editing.employeeId)?.name ?? 'Employee'} · ${typeById.get(editing.typeId) ?? ''}`} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        tone="danger"
        title="Remove this item?"
        confirmLabel="Remove"
      >
        {removing && (
          <>
            {formatMoney(removing.amount)} {typeById.get(removing.typeId)} for {empById.get(removing.employeeId)?.name ?? 'this employee'} won't be included in future payroll runs. This is permanent.
          </>
        )}
      </ConfirmDialog>
    </Card>
  );
}

function AddItemDialog({ kind, types, employees, onClose }: { kind: Kind; types: ExtraDefinition[]; employees: Employee[]; onClose: () => void }) {
  const isPay = kind === 'pay';
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const n = parseAmount(amount);
  const matches = useMemo(() => {
    const s = search.trim().toLowerCase();
    return employees.filter((e) => !s || e.name.toLowerCase().includes(s) || e.employeeIdNumber?.toLowerCase().includes(s)).slice(0, 50);
  }, [employees, search]);
  const selected = employees.find((e) => e.id === employeeId);

  const save = useAction(
    () =>
      isPay
        ? compensationApi.createPay({ amount: n!, employeeId, additionalPayDefinitionId: typeId })
        : compensationApi.createDed({ amount: n!, employeeId, additionalDeductionDefinitionId: typeId }),
    [isPay ? ck.pay : ck.ded],
    isPay ? 'Additional pay added' : 'Additional deduction added',
    onClose,
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={isPay ? 'Add additional pay' : 'Add additional deduction'}
      description="Included in every payroll run until you remove it."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={!employeeId || !typeId || n === null} onClick={() => save.mutate(undefined)}>Add</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Employee" required>
          {(id) => (
            <div className="space-y-2">
              {selected ? (
                <div className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium text-slate-900">{selected.name}</span>
                    <span className="ml-2 font-mono text-xs text-slate-500">{selected.employeeIdNumber}</span>
                  </span>
                  <button type="button" className="text-xs font-medium text-primary-700 hover:underline" onClick={() => setEmployeeId('')}>Change</button>
                </div>
              ) : (
                <>
                  <Input id={id} autoFocus placeholder="Search by name or ID" leading={<Search className="size-4" />} value={search} onChange={(e) => setSearch(e.target.value)} />
                  <ul className="scroll-thin max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                    {matches.map((e) => (
                      <li key={e.id}>
                        <button type="button" onClick={() => setEmployeeId(e.id)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                          <span className="truncate text-slate-800">{e.name}</span>
                          <span className="font-mono text-xs text-slate-500">{e.employeeIdNumber}</span>
                        </button>
                      </li>
                    ))}
                    {!matches.length && <li className="px-3 py-2 text-sm text-slate-500">No employees found</li>}
                  </ul>
                </>
              )}
            </div>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" required>
            {(id) => (
              <Select id={id} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Amount (ETB)" required error={amount && n === null ? 'Enter an amount above 0' : undefined} hint={isPay ? 'Not taxed.' : 'Deducted after tax.'}>
            {(id) => <Input id={id} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}

function EditAmountDialog({ kind, row, label, onClose }: { kind: Kind; row: Row; label: string; onClose: () => void }) {
  const [amount, setAmount] = useState(String(toNumber(row.amount)));
  const n = parseAmount(amount);
  const save = useAction(
    () => (kind === 'pay' ? compensationApi.updatePay(row.id, n!) : compensationApi.updateDed(row.id, n!)),
    [kind === 'pay' ? ck.pay : ck.ded],
    'Amount updated',
    onClose,
  );
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title="Edit amount"
      description={`${label}. To change the employee or type, remove this item and add a new one.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} disabled={n === null} onClick={() => save.mutate(undefined)}>Save</Button>
        </>
      }
    >
      <Field label="Amount (ETB)" error={amount && n === null ? 'Enter an amount above 0' : undefined}>
        {(id) => <Input id={id} autoFocus type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

// ── Type catalogues ─────────────────────────────────────────
function TypeCatalogue({ kind, q }: { kind: Kind; q: { data?: ExtraDefinition[]; isLoading: boolean; error: unknown; refetch: () => void } }) {
  const { can } = useAuth();
  const isPay = kind === 'pay';
  const keys = [isPay ? ck.payDefs : ck.dedDefs];
  const [editing, setEditing] = useState<ExtraDefinition | 'new' | null>(null);
  const [removing, setRemoving] = useState<ExtraDefinition | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<CatalogueType>('AMOUNT');

  const save = useAction(
    () => {
      const body = { name: name.trim(), type };
      if (editing && editing !== 'new') return isPay ? compensationApi.updatePayDef(editing.id, body) : compensationApi.updateDedDef(editing.id, body);
      return isPay ? compensationApi.createPayDef(body) : compensationApi.createDedDef(body);
    },
    keys,
    editing === 'new' ? 'Type created' : 'Type updated',
    () => setEditing(null),
  );
  const remove = useAction((id: string) => (isPay ? compensationApi.removePayDef(id) : compensationApi.removeDedDef(id)), keys, 'Type deactivated', () => setRemoving(null));

  const open = (d: ExtraDefinition | 'new') => {
    setName(d === 'new' ? '' : d.name);
    setType(d === 'new' ? 'AMOUNT' : d.type);
    setEditing(d);
  };

  return (
    <Card>
      <CardHeader
        icon={<Tags className="size-4.5" />}
        title={isPay ? 'Additional pay types' : 'Additional deduction types'}
        description={isPay ? 'e.g. Performance bonus, one-off payment' : 'e.g. Loan repayment, penalty'}
        actions={can(PERMS.createSystem) && <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => open('new')}>New</Button>}
      />
      {q.isLoading ? (
        <PageLoader />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !q.data?.length ? (
        <EmptyState title="No types yet" className="py-8" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {q.data.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                {d.name}
                <Badge>{d.type === 'PERCENT' ? 'Percent' : 'Amount'}</Badge>
              </span>
              <div className="flex gap-1">
                {can(PERMS.updateSystem) && (
                  <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => open(d)}>
                    <Pencil className="size-4" />
                  </Button>
                )}
                {can(PERMS.deleteSystem) && (
                  <Button variant="ghost" size="icon" aria-label="Deactivate" className="hover:text-red-600" onClick={() => setRemoving(d)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        size="sm"
        title={editing === 'new' ? 'New type' : 'Edit type'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate(undefined)}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" required>
            {(id) => <Input id={id} autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Type" hint="Stored for reference only. Payroll always treats the amount as a fixed money amount.">
            {(id) => (
              <Select id={id} value={type} onChange={(e) => setType(e.target.value as CatalogueType)}>
                <option value="AMOUNT">Amount</option>
                <option value="PERCENT">Percent</option>
              </Select>
            )}
          </Field>
        </div>
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
        The type can no longer be picked. Existing employee items keep their amounts.
      </ConfirmDialog>
    </Card>
  );
}

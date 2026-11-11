import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Briefcase, ChevronRight, CloudDownload, GitBranch, Layers, MapPin, PencilLine, Plus, Search, Trash2, Users } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { useIsHrSync } from '@/hooks/queries';
import { toApiError } from '@/lib/http';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader, Spinner } from '@/components/ui/Feedback';
import { ConfirmDialog, Dialog } from '@/components/ui/Overlay';
import { PageHeader } from '@/components/ui/Page';
import { Tabs } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import {
  departmentsApi,
  gradesApi,
  positionsApi,
  structureKeys,
  type Department,
  type DepartmentTree,
  type GradeWithRules,
  type Position,
} from './api';

type Tab = 'grades' | 'positions' | 'departments';

function HrBadge() {
  return <Badge tone="primary" icon={<CloudDownload className="size-3" />}>HR</Badge>;
}

const fieldErrors = (e: unknown) => {
  const err = toApiError(e);
  return { ...Object.fromEntries(err.details.map((d) => [d.path.replace(/^body\./, ''), d.message])), form: err.message } as Record<string, string>;
};

export function StructurePage() {
  const [tab, setTab] = useState<Tab>('grades');
  const isHrSync = useIsHrSync();
  return (
    <>
      <PageHeader
        title="Grades, positions & departments"
        description="The company's salary structure and organisation. Grades decide which allowances and deductions apply to manual employees."
      />
      {isHrSync && (
        <Alert tone="info" className="mb-6" title="Some rows are managed by HR">
          Rows marked <strong>HR</strong> come from your HR system and are read-only here. Every sync re-applies their names and reactivates them. You can still add local rows.
        </Alert>
      )}
      <Tabs<Tab>
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'grades', label: 'Grades' },
          { value: 'positions', label: 'Positions' },
          { value: 'departments', label: 'Departments' },
        ]}
      />
      {tab === 'grades' && <GradesTab />}
      {tab === 'positions' && <PositionsTab />}
      {tab === 'departments' && <DepartmentsTab />}
    </>
  );
}

// ── Grades ──────────────────────────────────────────────────

function GradesTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: structureKeys.grades, queryFn: gradesApi.list });
  const [editing, setEditing] = useState<GradeWithRules | 'new' | null>(null);
  const [deleting, setDeleting] = useState<GradeWithRules | null>(null);
  const [search, setSearch] = useState('');

  const del = useMutation({
    mutationFn: (id: string) => gradesApi.remove(id),
    onSuccess: () => {
      toast.success('Grade deleted');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: structureKeys.grades });
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const rows = (q.data ?? []).filter((g) => !search || g.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Card>
      <CardHeader
        icon={<Layers className="size-4.5" />}
        title="Grades"
        description={q.data ? `${q.data.length} active grades` : undefined}
        actions={
          <>
            <div className="w-56">
              <Input aria-label="Search grades" placeholder="Search" leading={<Search className="size-4" />} value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
            </div>
            {can(PERMS.createSystem) && <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing('new')}>New grade</Button>}
          </>
        }
      />
      {q.isLoading ? (
        <PageLoader />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Layers className="size-6" />} title={q.data?.length ? 'No grades match' : 'No grades yet'} description="Create grades with a salary range for manual employees." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Grade</TH>
              <TH>Salary range</TH>
              <TH>Allowances</TH>
              <TH>Deductions</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map((g) => {
              const hr = g.externalId !== null;
              return (
                <TR key={g.id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{g.name}</span>
                      {hr && <HrBadge />}
                    </div>
                    {hr && <div className="mt-0.5 font-mono text-[11px] text-slate-400">{g.externalId}</div>}
                  </TD>
                  <TD className="num whitespace-nowrap">
                    {hr && !g.minSalary && !g.maxSalary ? <span className="text-slate-400">Set in HR</span> : `${formatMoney(g.minSalary)} – ${formatMoney(g.maxSalary)}`}
                  </TD>
                  <TD><RuleChips items={(g.allowances ?? []).map((a) => ({ name: a.allowanceDefinition?.name, amount: a.amount }))} tone="success" /></TD>
                  <TD><RuleChips items={(g.deductions ?? []).map((a) => ({ name: a.deductionDefinition?.name, amount: a.amount }))} tone="danger" /></TD>
                  <TD align="right">
                    {!hr && (
                      <RowActions
                        onEdit={can(PERMS.updateSystem) ? () => setEditing(g) : undefined}
                        onDelete={can(PERMS.deleteSystem) ? () => setDeleting(g) : undefined}
                      />
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <GradeDialog target={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        tone="danger"
        title={`Delete grade ${deleting?.name}?`}
        confirmLabel="Delete"
      >
        The grade is deactivated and its name freed for reuse. Employees already on this grade keep it.
      </ConfirmDialog>
    </Card>
  );
}

function RuleChips({ items, tone }: { items: { name?: string; amount: number }[]; tone: 'success' | 'danger' }) {
  if (!items.length) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex max-w-xs flex-wrap gap-1">
      {items.map((i, k) => (
        <span
          key={k}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ring-1 ring-inset',
            tone === 'success' ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200',
          )}
        >
          {i.name ?? 'Item'} <span className="num font-semibold">{formatMoney(i.amount)}</span>
        </span>
      ))}
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      {onEdit && (
        <Button variant="ghost" size="icon" aria-label="Edit" onClick={onEdit}>
          <PencilLine className="size-4" />
        </Button>
      )}
      {onDelete && (
        <Button variant="ghost" size="icon" aria-label="Delete" className="hover:bg-red-50 hover:text-red-600" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

function GradeDialog({ target, onClose }: { target: GradeWithRules | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', minSalary: '', maxSalary: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [last, setLast] = useState<typeof target>(null);
  if (target !== last) {
    setLast(target);
    setErrors({});
    setF(target && target !== 'new' ? { name: target.name, minSalary: String(target.minSalary), maxSalary: String(target.maxSalary) } : { name: '', minSalary: '', maxSalary: '' });
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name.trim(), minSalary: Number(f.minSalary), maxSalary: Number(f.maxSalary) };
      return target && target !== 'new' ? gradesApi.update(target.id, body) : gradesApi.create(body);
    },
    onSuccess: () => {
      toast.success(target === 'new' ? 'Grade created' : 'Grade updated');
      qc.invalidateQueries({ queryKey: structureKeys.grades });
      onClose();
    },
    onError: (e) => setErrors(fieldErrors(e)),
  });

  function submit() {
    const e: Record<string, string> = {};
    const min = Number(f.minSalary);
    const max = Number(f.maxSalary);
    if (!f.name.trim()) e.name = 'Name is required';
    if (!(min > 0)) e.minSalary = 'Must be greater than 0';
    if (!(max > 0)) e.maxSalary = 'Must be greater than 0';
    else if (max <= min) e.maxSalary = 'Must be greater than the minimum salary';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate();
  }

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={target === 'new' ? 'New grade' : 'Edit grade'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={submit}>{target === 'new' ? 'Create grade' : 'Save'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {errors.form && <Alert tone="danger">{errors.form}</Alert>}
        <Field label="Name" required error={errors.name}>
          {(id) => <Input id={id} placeholder="G-5" value={f.name} invalid={!!errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Minimum salary" required error={errors.minSalary}>
            {(id) => <Input id={id} type="number" value={f.minSalary} invalid={!!errors.minSalary} onChange={(e) => setF({ ...f, minSalary: e.target.value })} />}
          </Field>
          <Field label="Maximum salary" required error={errors.maxSalary}>
            {(id) => <Input id={id} type="number" value={f.maxSalary} invalid={!!errors.maxSalary} onChange={(e) => setF({ ...f, maxSalary: e.target.value })} />}
          </Field>
        </div>
        <p className="text-xs text-slate-500">The range is checked when a basic salary is assigned with this grade. Overlapping ranges between grades are allowed.</p>
      </div>
    </Dialog>
  );
}

// ── Positions ───────────────────────────────────────────────

function PositionsTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: structureKeys.positions, queryFn: positionsApi.list });
  const [editing, setEditing] = useState<Position | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Position | null>(null);
  const [search, setSearch] = useState('');

  const del = useMutation({
    mutationFn: (id: string) => positionsApi.remove(id),
    onSuccess: () => {
      toast.success('Position deactivated');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: structureKeys.positions });
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const s = search.toLowerCase();
  const rows = (q.data ?? []).filter((p) => !s || p.positionName.toLowerCase().includes(s) || p.description?.toLowerCase().includes(s));

  return (
    <Card>
      <CardHeader
        icon={<Briefcase className="size-4.5" />}
        title="Positions"
        description={q.data ? `${q.data.length} active positions` : undefined}
        actions={
          <>
            <div className="w-56">
              <Input aria-label="Search positions" placeholder="Search" leading={<Search className="size-4" />} value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
            </div>
            {can(PERMS.createSystem) && <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditing('new')}>New position</Button>}
          </>
        }
      />
      {q.isLoading ? (
        <PageLoader />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Briefcase className="size-6" />} title={q.data?.length ? 'No positions match' : 'No positions yet'} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Position</TH>
              <TH>Description</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {rows.map((p) => {
              const hr = p.externalId !== null;
              return (
                <TR key={p.id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{p.positionName}</span>
                      {hr && <HrBadge />}
                    </div>
                    {hr && <div className="mt-0.5 font-mono text-[11px] text-slate-400">{p.externalId}</div>}
                  </TD>
                  <TD className="max-w-md truncate text-slate-500">{p.description || '—'}</TD>
                  <TD align="right">
                    {!hr && (
                      <RowActions
                        onEdit={can(PERMS.updateSystem) ? () => setEditing(p) : undefined}
                        onDelete={can(PERMS.deleteSystem) ? () => setDeleting(p) : undefined}
                      />
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <PositionDialog target={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        tone="danger"
        title={`Deactivate ${deleting?.positionName}?`}
        confirmLabel="Deactivate"
      >
        The position no longer appears in lists. Employees already in this position keep it.
      </ConfirmDialog>
    </Card>
  );
}

function PositionDialog({ target, onClose }: { target: Position | 'new' | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ positionName: '', description: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [last, setLast] = useState<typeof target>(null);
  if (target !== last) {
    setLast(target);
    setErrors({});
    setF(target && target !== 'new' ? { positionName: target.positionName, description: target.description ?? '' } : { positionName: '', description: '' });
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { positionName: f.positionName.trim(), description: f.description.trim() };
      return target && target !== 'new' ? positionsApi.update(target.id, body) : positionsApi.create(body);
    },
    onSuccess: () => {
      toast.success(target === 'new' ? 'Position created' : 'Position updated');
      qc.invalidateQueries({ queryKey: structureKeys.positions });
      onClose();
    },
    onError: (e) => setErrors(fieldErrors(e)),
  });

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={target === 'new' ? 'New position' : 'Edit position'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={save.isPending}
            onClick={() => (f.positionName.trim() ? save.mutate() : setErrors({ positionName: 'Name is required' }))}
          >
            {target === 'new' ? 'Create position' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {errors.form && <Alert tone="danger">{errors.form}</Alert>}
        <Field label="Position name" required error={errors.positionName}>
          {(id) => <Input id={id} placeholder="Senior Accountant" value={f.positionName} invalid={!!errors.positionName} onChange={(e) => setF({ ...f, positionName: e.target.value })} />}
        </Field>
        <Field label="Description" error={errors.description}>
          {(id) => <Textarea id={id} rows={3} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  );
}

// ── Departments ─────────────────────────────────────────────

type DeptTarget = { mode: 'new' } | { mode: 'sub'; parent: Department } | { mode: 'edit'; dept: Department };

function DepartmentsTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: structureKeys.departments, queryFn: departmentsApi.list });
  const [target, setTarget] = useState<DeptTarget | null>(null);
  const [deleting, setDeleting] = useState<DepartmentTree | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => departmentsApi.remove(id),
    onSuccess: () => {
      toast.success('Department deactivated');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['structure', 'departments'] });
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  const activeChildren = deleting?.children?.filter((c) => c.isActive).length ?? 0;

  return (
    <Card>
      <CardHeader
        icon={<GitBranch className="size-4.5" />}
        title="Departments"
        description={q.data ? `${q.data.length} top-level departments` : undefined}
        actions={can(PERMS.createSystem) && <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setTarget({ mode: 'new' })}>New department</Button>}
      />
      {q.isLoading ? (
        <PageLoader />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={<GitBranch className="size-6" />} title="No departments yet" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {q.data.map((d) => (
            <DeptRoot key={d.id} dept={d} onAction={setTarget} onDelete={setDeleting} />
          ))}
        </ul>
      )}

      <DepartmentDialog target={target} onClose={() => setTarget(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        tone="danger"
        title={`Deactivate ${deleting?.deptName}?`}
        confirmLabel="Deactivate"
      >
        <p>Employees in this department keep their assignment.</p>
        {activeChildren > 0 ? (
          <Alert tone="warning" className="mt-3">
            Its {activeChildren} sub-department{activeChildren > 1 ? 's stay' : ' stays'} active. Deactivate them first if they should go too.
          </Alert>
        ) : (
          <p className="mt-2 text-xs text-slate-500">Sub-departments are not deactivated with their parent.</p>
        )}
      </ConfirmDialog>
    </Card>
  );
}

/** Top-level row: loads its full tree on first expand. */
function DeptRoot({ dept, onAction, onDelete }: { dept: Department; onAction: (t: DeptTarget) => void; onDelete: (d: DepartmentTree) => void }) {
  const [open, setOpen] = useState(false);
  const tree = useQuery({ queryKey: structureKeys.departmentTree(dept.id), queryFn: () => departmentsApi.tree(dept.id), enabled: open });
  const node: DepartmentTree = tree.data ?? dept;
  return (
    <li>
      <DeptRow node={node} depth={0} open={open} onToggle={() => setOpen((o) => !o)} loading={open && tree.isLoading} onAction={onAction} onDelete={onDelete} />
      {open && tree.data && <DeptChildren nodes={tree.data.children ?? []} depth={1} onAction={onAction} onDelete={onDelete} />}
      {open && tree.error && <p className="px-12 pb-3 text-xs text-red-600">{toApiError(tree.error).message}</p>}
    </li>
  );
}

function DeptChildren({ nodes, depth, onAction, onDelete }: { nodes: DepartmentTree[]; depth: number; onAction: (t: DeptTarget) => void; onDelete: (d: DepartmentTree) => void }) {
  const active = nodes.filter((n) => n.isActive);
  if (!active.length) return null;
  return (
    <ul>
      {active.map((n) => (
        <DeptNode key={n.id} node={n} depth={depth} onAction={onAction} onDelete={onDelete} />
      ))}
    </ul>
  );
}

function DeptNode({ node, depth, onAction, onDelete }: { node: DepartmentTree; depth: number; onAction: (t: DeptTarget) => void; onDelete: (d: DepartmentTree) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <DeptRow node={node} depth={depth} open={open} onToggle={() => setOpen((o) => !o)} onAction={onAction} onDelete={onDelete} />
      {open && <DeptChildren nodes={node.children ?? []} depth={depth + 1} onAction={onAction} onDelete={onDelete} />}
    </li>
  );
}

function DeptRow({
  node,
  depth,
  open,
  onToggle,
  loading,
  onAction,
  onDelete,
}: {
  node: DepartmentTree;
  depth: number;
  open: boolean;
  onToggle: () => void;
  loading?: boolean;
  onAction: (t: DeptTarget) => void;
  onDelete: (d: DepartmentTree) => void;
}) {
  const { can } = useAuth();
  const hr = node.externalId !== null;
  // Top-level rows don't know their children until loaded; nested rows do.
  const childCount = node.children?.filter((c) => c.isActive).length;
  const expandable = depth === 0 || (childCount ?? 0) > 0;
  const members = node.assignments?.filter((a) => a.toDate === null).length;

  return (
    <div className={cn('group flex items-center gap-3 py-2.5 pr-5 hover:bg-slate-50', depth > 0 && 'border-t border-slate-50')} style={{ paddingLeft: 20 + depth * 24 }}>
      <button
        type="button"
        onClick={onToggle}
        disabled={!expandable}
        aria-label={open ? 'Collapse' : 'Expand'}
        className={cn('flex size-6 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700', !expandable && 'invisible')}
      >
        {loading ? <Spinner className="size-3.5" /> : <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />}
      </button>
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold', depth === 0 ? 'bg-primary-50 text-primary-800' : 'bg-slate-100 text-slate-600')}>
        {(node.shorthandRepresentation || node.deptName).slice(0, 3).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-slate-900">{node.deptName}</span>
          {hr && <HrBadge />}
          {childCount !== undefined && childCount > 0 && <span className="text-xs text-slate-400">{childCount} sub</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {node.location && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" /> {node.location}
            </span>
          )}
          {members !== undefined && (
            <span className="flex items-center gap-1">
              <Users className="size-3" /> {members} member{members === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
      {!hr && (
        <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
          {can(PERMS.createSystem) && (
            <Button variant="ghost" size="sm" icon={<Plus className="size-3.5" />} onClick={() => onAction({ mode: 'sub', parent: node })}>
              Sub
            </Button>
          )}
          <RowActions
            onEdit={can(PERMS.updateSystem) ? () => onAction({ mode: 'edit', dept: node }) : undefined}
            onDelete={can(PERMS.deleteSystem) ? () => onDelete(node) : undefined}
          />
        </div>
      )}
    </div>
  );
}

function DepartmentDialog({ target, onClose }: { target: DeptTarget | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ deptName: '', shorthandRepresentation: '', location: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [last, setLast] = useState<DeptTarget | null>(null);
  if (target !== last) {
    setLast(target);
    setErrors({});
    setF(
      target?.mode === 'edit'
        ? { deptName: target.dept.deptName, shorthandRepresentation: target.dept.shorthandRepresentation ?? '', location: target.dept.location ?? '' }
        : { deptName: '', shorthandRepresentation: '', location: '' },
    );
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { deptName: f.deptName.trim(), shorthandRepresentation: f.shorthandRepresentation.trim(), location: f.location.trim() };
      if (target?.mode === 'edit') return departmentsApi.update(target.dept.id, body);
      if (target?.mode === 'sub') return departmentsApi.createSub({ ...body, parentDepartmentId: target.parent.id });
      return departmentsApi.create(body);
    },
    onSuccess: () => {
      toast.success(target?.mode === 'edit' ? 'Department updated' : 'Department created');
      qc.invalidateQueries({ queryKey: ['structure', 'departments'] });
      onClose();
    },
    onError: (e) => setErrors(fieldErrors(e)),
  });

  function submit() {
    const e: Record<string, string> = {};
    if (!f.deptName.trim()) e.deptName = 'Name is required';
    if (target?.mode === 'new' && !f.shorthandRepresentation.trim()) e.shorthandRepresentation = 'Short code is required';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate();
  }

  const title = target?.mode === 'edit' ? 'Edit department' : target?.mode === 'sub' ? `New sub-department of ${target.parent.deptName}` : 'New department';

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={submit}>{target?.mode === 'edit' ? 'Save' : 'Create'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {errors.form && <Alert tone="danger">{errors.form}</Alert>}
        <Field label="Name" required error={errors.deptName}>
          {(id) => <Input id={id} placeholder="Finance" value={f.deptName} invalid={!!errors.deptName} onChange={(e) => setF({ ...f, deptName: e.target.value })} />}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Short code" required={target?.mode === 'new'} error={errors.shorthandRepresentation}>
            {(id) => (
              <Input id={id} placeholder="FIN" value={f.shorthandRepresentation} invalid={!!errors.shorthandRepresentation} onChange={(e) => setF({ ...f, shorthandRepresentation: e.target.value })} />
            )}
          </Field>
          <Field label="Location" error={errors.location}>
            {(id) => <Input id={id} placeholder="Head office" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />}
          </Field>
        </div>
        {target?.mode === 'edit' && <p className="text-xs text-slate-500">The parent department can't be changed.</p>}
      </div>
    </Dialog>
  );
}

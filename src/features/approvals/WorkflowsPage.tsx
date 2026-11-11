import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GitBranch, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { useEmployees } from '@/hooks/queries';
import { toApiError } from '@/lib/http';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Dialog } from '@/components/ui/Overlay';
import { PageHeader } from '@/components/ui/Page';
import { approvalsApi, type ApprovalRules, type CreateWorkflowInput, type RequestType } from './api';
import { ruleLabel } from './ApprovalsPage';

const REQUEST_TYPES: RequestType[] = ['PAYROLL', 'LEAVE', 'ATTENDANCE', 'PROGRAM'];
const TYPE_LABEL: Record<RequestType, string> = { PAYROLL: 'Payroll', LEAVE: 'Leave', ATTENDANCE: 'Attendance', PROGRAM: 'Program' };

export function WorkflowsPage() {
  const { can } = useAuth();
  const list = useQuery({ queryKey: ['approvals', 'workflows'], queryFn: approvalsApi.workflows });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const current = selected ?? list.data?.[0]?.id ?? null;

  return (
    <>
      <PageHeader
        title="Approval workflows"
        description="Who approves each request type, in which order. Payroll runs start the first stage of the active payroll workflow."
        actions={can(PERMS.createSystem) && <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New workflow</Button>}
      />

      {list.isLoading ? (
        <PageLoader />
      ) : list.error ? (
        <Card><ErrorState error={list.error} onRetry={() => list.refetch()} /></Card>
      ) : !list.data?.length ? (
        <Card>
          <EmptyState
            icon={<GitBranch className="size-6" />}
            title="No approval workflows"
            description="Payroll can't be run until an active payroll workflow with approvers exists."
            action={can(PERMS.createSystem) && <Button onClick={() => setCreating(true)}>Create workflow</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <Card className="self-start">
            <CardHeader title="Active workflows" />
            <ul className="p-2">
              {list.data.map((w) => (
                <li key={w.id}>
                  <button
                    onClick={() => setSelected(w.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition',
                      current === w.id ? 'bg-primary-50 text-primary-900' : 'hover:bg-slate-50',
                    )}
                  >
                    <span className="truncate font-medium">{w.name}</span>
                    <Badge tone={w.requestType === 'PAYROLL' ? 'primary' : 'neutral'}>{TYPE_LABEL[w.requestType] ?? w.requestType}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {current && <WorkflowStages id={current} />}
        </div>
      )}

      <CreateWorkflowDialog open={creating} onClose={() => setCreating(false)} existing={list.data ?? []} />
    </>
  );
}

function WorkflowStages({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['approvals', 'stages', id], queryFn: () => approvalsApi.stages(id) });
  const stages = [...(q.data?.stages ?? [])].sort((a, b) => a.order - b.order);
  return (
    <Card>
      <CardHeader title="Stages" description="Stages run in order. When one is complete, the next starts." />
      <CardBody>
        {q.isLoading ? (
          <PageLoader />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !stages.length ? (
          <EmptyState title="No stages" />
        ) : (
          <ol className="space-y-3">
            {stages.map((s, i) => (
              <li key={s.id} className="flex gap-4 rounded-xl border border-slate-200 p-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-500 text-sm font-semibold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">Stage {i + 1}</span>
                    <Badge tone="accent">{ruleLabel(s.approvalRules)}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.stageEmployees.map((se, j) => (
                      <span key={j} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                        <Users className="size-3" /> {se.employee.name}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

interface DraftStage {
  key: number;
  ruleType: 'all' | 'anyN' | 'weighted';
  required: string;
  threshold: string;
  employeeIds: string[];
  weights: Record<string, string>;
}

let seq = 0;
const newStage = (): DraftStage => ({ key: seq++, ruleType: 'all', required: '1', threshold: '', employeeIds: [], weights: {} });

function CreateWorkflowDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: { requestType: RequestType; name: string }[] }) {
  const employees = useEmployees();
  const qc = useQueryClient();
  const [name, setName] = useState('Payroll approval');
  const [requestType, setRequestType] = useState<RequestType>('PAYROLL');
  const [stages, setStages] = useState<DraftStage[]>(() => [newStage()]);
  const [error, setError] = useState<string | null>(null);
  const nameById = useMemo(() => new Map((employees.data ?? []).map((e) => [e.id, e.name])), [employees.data]);
  const replaces = existing.find((w) => w.requestType === requestType);

  const create = useMutation({
    mutationFn: (input: CreateWorkflowInput) => approvalsApi.createWorkflow(input),
    onSuccess: () => {
      toast.success('Workflow created');
      qc.invalidateQueries({ queryKey: ['approvals'] });
      setStages([newStage()]);
      onClose();
    },
    onError: (err) => setError(toApiError(err).message),
  });

  const update = (key: number, patch: Partial<DraftStage>) => setStages((s) => s.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function submit() {
    if (!/^[A-Za-z0-9 .,_\-/]{1,100}$/.test(name.trim())) return setError('Name: 1–100 characters, letters, digits, spaces and . , _ - /');
    const out: CreateWorkflowInput['stages'] = [];
    for (const [i, s] of stages.entries()) {
      const label = `Stage ${i + 1}`;
      if (!s.employeeIds.length) return setError(`${label}: add at least one approver`);
      if (s.employeeIds.length > 100) return setError(`${label}: at most 100 approvers`);
      let rules: ApprovalRules;
      if (s.ruleType === 'anyN') {
        const n = Number(s.required);
        if (!Number.isInteger(n) || n < 1 || n > s.employeeIds.length) return setError(`${label}: required must be between 1 and ${s.employeeIds.length}`);
        rules = { type: 'anyN', required: n };
      } else if (s.ruleType === 'weighted') {
        const weights: Record<string, number> = {};
        for (const id of s.employeeIds) {
          const w = Number(s.weights[id]);
          if (!(w > 0)) return setError(`${label}: give every approver a weight above 0`);
          weights[id] = w;
        }
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);
        const t = Number(s.threshold);
        if (!(t > 0) || t > sum) return setError(`${label}: threshold must be above 0 and at most the total weight (${sum})`);
        rules = { type: 'weighted', threshold: t, weights };
      } else {
        rules = { type: 'all' };
      }
      out.push({ order: i + 1, isParallel: false, approvalRules: rules, employeeIds: s.employeeIds });
    }
    setError(null);
    create.mutate({ name: name.trim(), requestType, isFullyParallel: false, stages: out });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="New approval workflow"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} onClick={submit}>Create workflow</Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {replaces && (
          <Alert tone="warning" title={`Replaces "${replaces.name}"`}>
            Creating this deactivates the current {TYPE_LABEL[requestType].toLowerCase()} workflow. Workflows can't be edited, so a new one is how approvers change.
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            {(id) => <Input id={id} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Request type">
            {(id) => (
              <Select id={id} value={requestType} onChange={(e) => setRequestType(e.target.value as RequestType)}>
                {REQUEST_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          Stages run one after another. Payroll only ever starts the first stage, so stages are always sequential here.
        </p>

        <div className="space-y-4">
          {stages.map((s, i) => (
            <div key={s.key} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary-500 text-xs text-white">{i + 1}</span>
                  Stage {i + 1}
                </span>
                {stages.length > 1 && (
                  <Button variant="ghost" size="icon" aria-label="Remove stage" onClick={() => setStages((x) => x.filter((y) => y.key !== s.key))}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                <Field label="Approval rule">
                  {(id) => (
                    <Select id={id} value={s.ruleType} onChange={(e) => update(s.key, { ruleType: e.target.value as DraftStage['ruleType'] })}>
                      <option value="all">Every approver must approve</option>
                      <option value="anyN">Any N approvers</option>
                      <option value="weighted">Weighted votes</option>
                    </Select>
                  )}
                </Field>
                {s.ruleType === 'anyN' && (
                  <Field label="Required">
                    {(id) => <Input id={id} type="number" min={1} value={s.required} onChange={(e) => update(s.key, { required: e.target.value })} />}
                  </Field>
                )}
                {s.ruleType === 'weighted' && (
                  <Field label="Threshold">
                    {(id) => <Input id={id} type="number" min={1} value={s.threshold} onChange={(e) => update(s.key, { threshold: e.target.value })} />}
                  </Field>
                )}
              </div>
              <div className="mt-4">
                <div className="mb-1.5 text-sm font-medium text-slate-700">Approvers</div>
                <div className="flex flex-wrap gap-1.5">
                  {s.employeeIds.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 py-1 pr-1 pl-2.5 text-xs text-primary-900">
                      {nameById.get(id) ?? id}
                      {s.ruleType === 'weighted' && (
                        <input
                          aria-label="Weight"
                          type="number"
                          min={1}
                          placeholder="wt"
                          value={s.weights[id] ?? ''}
                          onChange={(e) => update(s.key, { weights: { ...s.weights, [id]: e.target.value } })}
                          className="w-12 rounded border border-primary-200 bg-surface px-1 py-0.5 text-xs"
                        />
                      )}
                      <button aria-label="Remove approver" onClick={() => update(s.key, { employeeIds: s.employeeIds.filter((x) => x !== id) })} className="rounded-full p-0.5 hover:bg-primary-100">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <EmployeePicker
                  exclude={s.employeeIds}
                  employees={employees.data ?? []}
                  onPick={(id) => update(s.key, { employeeIds: [...s.employeeIds, id] })}
                />
              </div>
            </div>
          ))}
          {stages.length < 50 && (
            <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setStages((x) => [...x, newStage()])}>
              Add stage
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function EmployeePicker({ employees, exclude, onPick }: { employees: { id: string; name: string; employeeIdNumber?: string | null }[]; exclude: string[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return employees.filter((e) => !exclude.includes(e.id) && (e.name.toLowerCase().includes(s) || e.employeeIdNumber?.toLowerCase().includes(s))).slice(0, 8);
  }, [employees, exclude, q]);
  return (
    <div className="relative mt-2">
      <Input aria-label="Add approver" placeholder="Search employees to add…" leading={<Search className="size-4" />} value={q} onChange={(e) => setQ(e.target.value)} />
      {matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-surface shadow-lg">
          {matches.map((e) => (
            <li key={e.id}>
              <button
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-primary-50"
                onClick={() => {
                  onPick(e.id);
                  setQ('');
                }}
              >
                <span>{e.name}</span>
                <span className="font-mono text-xs text-slate-500">{e.employeeIdNumber}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, Check, CheckCircle2, Circle, Clock, Eye, History, MessageSquare, RotateCcw, X, XCircle } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { useEmployees } from '@/hooks/queries';
import { toApiError } from '@/lib/http';
import { cn } from '@/lib/cn';
import { formatDateTime, formatInt, formatMoney, toNumber } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Textarea } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Dialog, Drawer } from '@/components/ui/Overlay';
import { PageHeader, StatTile } from '@/components/ui/Page';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { approvalsApi, type ActionItem, type ApprovalAction, type ApprovalInstanceDetails, type PendingPayrollApproval } from './api';

const QK = ['approvals', 'queue'] as const;

function toItem(r: PendingPayrollApproval, action: ApprovalAction, comment?: string): ActionItem | null {
  if (!r.approvalInstanceId || !r.stageIds[0]) return null;
  return { instanceId: r.approvalInstanceId, stageId: r.stageIds[0], action, ...(comment?.trim() ? { comment: comment.trim() } : {}) };
}

export function ApprovalsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const allowed = can(PERMS.createPayrollApproval);
  const queue = useQuery({ queryKey: QK, queryFn: approvalsApi.queue, enabled: allowed });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState<{ rows: PendingPayrollApproval[]; action: ApprovalAction } | null>(null);
  const [details, setDetails] = useState<string | null>(null);

  const rows = queue.data ?? [];
  const totals = useMemo(
    () => ({ gross: rows.reduce((s, r) => s + toNumber(r.grossSalary), 0), net: rows.reduce((s, r) => s + toNumber(r.netSalary), 0) }),
    [rows],
  );
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  if (!allowed) {
    return (
      <>
        <PageHeader eyebrow="Payroll" title="Approvals" />
        <Alert tone="info" title="You're not a payroll approver">
          Approving payroll needs the <code className="font-mono text-xs">create_payroll_approval</code> permission.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Payroll"
        title="My approval queue"
        description="Payroll rows waiting for your decision at the current approval stage."
        actions={
          selected.size > 0 && (
            <>
              <Button variant="outline" icon={<X className="size-4" />} onClick={() => setActing({ rows: rows.filter((r) => selected.has(r.id)), action: 'REJECTED' })}>
                Reject {selected.size}
              </Button>
              <Button icon={<Check className="size-4" />} onClick={() => setActing({ rows: rows.filter((r) => selected.has(r.id)), action: 'APPROVED' })}>
                Approve {selected.size}
              </Button>
            </>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Waiting for me" loading={queue.isLoading} value={formatInt(rows.length)} icon={<BadgeCheck className="size-4.5" />} />
        <StatTile label="Gross pay" loading={queue.isLoading} value={formatMoney(totals.gross)} icon={<Clock className="size-4.5" />} tone="accent" />
        <StatTile label="Net pay" loading={queue.isLoading} value={formatMoney(totals.net)} icon={<CheckCircle2 className="size-4.5" />} tone="success" />
      </div>

      <Card>
        <CardHeader title="Pending" description="Select rows to approve or reject several at once." />
        {queue.isLoading ? (
          <PageLoader />
        ) : queue.error ? (
          <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<BadgeCheck className="size-6" />} title="You're all caught up" description="No payroll is waiting for your approval." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    className="size-4 accent-primary-600"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </TH>
                <TH>Employee</TH>
                <TH>Grade</TH>
                <TH align="right">Gross</TH>
                <TH align="right">Tax</TH>
                <TH align="right">Deductions</TH>
                <TH align="right">Net</TH>
                <TH align="right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id} className={selected.has(r.id) ? 'bg-primary-50/60' : ''}>
                  <TD>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.employee?.name}`}
                      className="size-4 accent-primary-600"
                      checked={selected.has(r.id)}
                      onChange={(e) =>
                        setSelected((p) => {
                          const n = new Set(p);
                          if (e.target.checked) n.add(r.id);
                          else n.delete(r.id);
                          return n;
                        })
                      }
                    />
                  </TD>
                  <TD className="font-medium text-slate-900">{r.employee?.name ?? '—'}</TD>
                  <TD>{r.employee?.grade ?? '—'}</TD>
                  <TD align="right">{formatMoney(r.grossSalary)}</TD>
                  <TD align="right">{formatMoney(r.incomeTax)}</TD>
                  <TD align="right">{formatMoney(r.totalDeduction)}</TD>
                  <TD align="right" className="font-semibold text-slate-900">{formatMoney(r.netSalary)}</TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1">
                      {r.approvalInstanceId && (
                        <Button variant="ghost" size="icon" aria-label="Details" onClick={() => setDetails(r.approvalInstanceId)}>
                          <Eye className="size-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" aria-label="Reject" className="text-red-600 hover:bg-red-50" onClick={() => setActing({ rows: [r], action: 'REJECTED' })}>
                        <X className="size-4" />
                      </Button>
                      <Button variant="secondary" size="icon" aria-label="Approve" onClick={() => setActing({ rows: [r], action: 'APPROVED' })}>
                        <Check className="size-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <ActionDialog
        acting={acting}
        onClose={() => setActing(null)}
        onDone={() => {
          setActing(null);
          setSelected(new Set());
          qc.invalidateQueries({ queryKey: QK });
          qc.invalidateQueries({ queryKey: ['payroll'] });
        }}
      />
      <InstanceDrawer id={details} onClose={() => setDetails(null)} />
    </>
  );
}

function ActionDialog({ acting, onClose, onDone }: { acting: { rows: PendingPayrollApproval[]; action: ApprovalAction } | null; onClose: () => void; onDone: () => void }) {
  const [comment, setComment] = useState('');
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const items = acting!.rows.map((r) => toItem(r, acting!.action, comment)).filter((x): x is ActionItem => !!x);
      if (!items.length) throw new Error('These rows have no active approval stage.');
      if (items.length === 1) await approvalsApi.act(items[0]!);
      else await approvalsApi.bulk(items);
      return items.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} payroll ${n === 1 ? 'row' : 'rows'} ${acting!.action === 'APPROVED' ? 'approved' : 'rejected'}`);
      setComment('');
      onDone();
    },
    onError: (err) => {
      // Bulk runs in parallel: some items may have been saved, so always reload.
      toast.error(toApiError(err).message);
      qc.invalidateQueries({ queryKey: QK });
    },
  });
  if (!acting) return null;
  const approve = acting.action === 'APPROVED';
  const n = acting.rows.length;
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={`${approve ? 'Approve' : 'Reject'} ${n === 1 ? acting.rows[0]!.employee?.name ?? 'payroll' : `${n} payroll rows`}?`}
      description={
        approve
          ? 'When the last stage approves, the payroll becomes ready to pay.'
          : 'The request is rejected for every stage. The requester can resubmit it.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button variant={approve ? 'primary' : 'danger'} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {approve ? 'Approve' : 'Reject'}
          </Button>
        </>
      }
    >
      <Field label="Comment" hint={`${comment.length}/1000 · optional`}>
        {(id) => <Textarea id={id} maxLength={1000} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={approve ? 'Optional note' : 'Why is this rejected?'} />}
      </Field>
    </Dialog>
  );
}

const STATUS_STYLE = {
  APPROVED: { icon: CheckCircle2, cls: 'text-emerald-600', label: 'Approved' },
  REJECTED: { icon: XCircle, cls: 'text-red-600', label: 'Rejected' },
  PENDING: { icon: Clock, cls: 'text-amber-500', label: 'Pending' },
  DELEGATED: { icon: RotateCcw, cls: 'text-primary-600', label: 'Delegated' },
} as const;

function InstanceDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const employees = useEmployees();
  const qc = useQueryClient();
  const nameOf = useMemo(() => {
    const m = new Map((employees.data ?? []).map((e) => [e.id, e.name]));
    return (eid: string | null) => (eid ? m.get(eid) ?? 'Unknown employee' : '—');
  }, [employees.data]);
  const q = useQuery({ queryKey: ['approvals', 'instance', id], queryFn: () => approvalsApi.instance(id!), enabled: !!id });
  const audit = useQuery({ queryKey: ['approvals', 'audit', id], queryFn: () => approvalsApi.auditLog(id!), enabled: !!id });
  const [reason, setReason] = useState('');
  const resubmit = useMutation({
    mutationFn: () => approvalsApi.resubmit(id!, reason),
    onSuccess: () => {
      toast.success('Request resubmitted');
      setReason('');
      qc.invalidateQueries({ queryKey: ['approvals'] });
      onClose();
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const inst = q.data;
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title="Approval details"
      description={inst && <span className="flex items-center gap-2">{inst.workflow.name} · v{inst.version} <InstanceBadge status={inst.status} /></span>}
    >
      {q.isLoading ? (
        <PageLoader />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !inst ? (
        <EmptyState title="Approval not found" />
      ) : (
        <div className="space-y-7">
          {inst.resubmissionReason && <Alert tone="info" title="Resubmitted">{inst.resubmissionReason}</Alert>}
          <StagesTimeline inst={inst} nameOf={nameOf} />

          {inst.ApprovalComment.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><MessageSquare className="size-4 text-slate-400" /> Comments</h3>
              <ul className="space-y-2">
                {inst.ApprovalComment.map((c) => (
                  <li key={c.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div className="text-xs text-slate-500">{nameOf(c.authorId)} · {formatDateTime(c.createdAt)}</div>
                    <p className="mt-0.5 text-slate-700">{c.comment}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><History className="size-4 text-slate-400" /> Audit log</h3>
            {audit.data?.length ? (
              <ul className="space-y-1.5 text-sm">
                {audit.data.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-1.5">
                    <span><span className="font-medium capitalize text-slate-800">{a.action}</span> by {nameOf(a.performedBy)}{a.details && <span className="text-slate-500"> — {a.details}</span>}</span>
                    <span className="text-xs text-slate-500">{formatDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No rejections or resubmissions logged.</p>
            )}
          </section>

          {inst.status === 'REJECTED' && (
            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">Resubmit for approval</h3>
              <p className="text-xs text-slate-500">Only the original requester can resubmit. Approval starts again at the first stage.</p>
              <Textarea maxLength={1000} rows={2} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="accent" icon={<RotateCcw className="size-4" />} loading={resubmit.isPending} onClick={() => resubmit.mutate()}>
                Resubmit
              </Button>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}

function InstanceBadge({ status }: { status: ApprovalInstanceDetails['status'] }) {
  if (status === 'APPROVED') return <Badge tone="success" dot>Approved</Badge>;
  if (status === 'REJECTED') return <Badge tone="danger" dot>Rejected</Badge>;
  return <Badge tone="warning" dot>In progress</Badge>;
}

export function ruleLabel(r: { type: string; required?: number; threshold?: number }) {
  if (r.type === 'anyN') return `Any ${r.required ?? 1} approver${(r.required ?? 1) > 1 ? 's' : ''}`;
  if (r.type === 'weighted') return `Weighted, threshold ${r.threshold ?? '—'}`;
  return 'All approvers';
}

function StagesTimeline({ inst, nameOf }: { inst: ApprovalInstanceDetails; nameOf: (id: string | null) => string }) {
  const stages = [...inst.workflow.stages].sort((a, b) => a.order - b.order);
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Stages</h3>
      <ol className="relative space-y-4 border-l-2 border-slate-200 pl-6">
        {stages.map((s, i) => {
          const active = inst.activeStageIds.includes(s.id);
          const statuses = inst.stageStatuses.filter((x) => x.stageId === s.id);
          const done = statuses.length > 0 && !active && statuses.every((x) => x.status !== 'PENDING');
          return (
            <li key={s.id} className="relative">
              <span
                className={cn(
                  'absolute top-0.5 -left-[33px] flex size-4 items-center justify-center rounded-full ring-4 ring-white',
                  active ? 'bg-accent-500' : done ? 'bg-emerald-500' : 'bg-slate-300',
                )}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-900">Stage {i + 1}</span>
                <span className="text-xs text-slate-500">{ruleLabel(s.approvalRules)}</span>
                {active && <Badge tone="accent">Current</Badge>}
              </div>
              <ul className="mt-2 space-y-1.5">
                {s.stageEmployees.map((se) => {
                  const st = statuses.find((x) => x.approvedBy === se.employeeId);
                  const style = st ? STATUS_STYLE[st.status] : null;
                  const Icon = style?.icon ?? Circle;
                  return (
                    <li key={se.id} className="flex items-start gap-2 text-sm">
                      <Icon className={cn('mt-0.5 size-4 shrink-0', style?.cls ?? 'text-slate-300')} />
                      <div className="min-w-0">
                        <span className="text-slate-800">{nameOf(se.employeeId)}</span>
                        {se.weight != null && <span className="ml-1 text-xs text-slate-500">(weight {se.weight})</span>}
                        <span className="ml-2 text-xs text-slate-500">{style ? style.label : 'Not started'}{st?.approvedAt && ` · ${formatDateTime(st.approvedAt)}`}</span>
                        {st?.comments && <p className="text-xs text-slate-600">“{st.comments}”</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

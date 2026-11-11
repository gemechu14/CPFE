import { AlertTriangle, CheckCircle2, CloudDownload, Lock, PencilLine, XCircle } from 'lucide-react';
import { Badge } from './ui/Badge';
import { cn } from '@/lib/cn';
import { formatMoney, formatRelative, toNumber } from '@/lib/format';
import type { AdjustmentComponent, AdjustmentStatus, DefinitionState, EmployeeSource, SyncStatus } from '@/types/api';

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  switch (status) {
    case 'RUNNING':
      return <Badge tone="primary" dot pulse>Running</Badge>;
    case 'SUCCESS':
      return <Badge tone="success" icon={<CheckCircle2 className="size-3" />}>Success</Badge>;
    case 'PARTIAL':
      return <Badge tone="warning" icon={<AlertTriangle className="size-3" />}>Partial</Badge>;
    case 'FAILED':
      return <Badge tone="danger" icon={<XCircle className="size-3" />}>Failed</Badge>;
  }
}

export const STATE_LABEL: Record<DefinitionState, string> = {
  NOT_OPEN: 'Not open',
  OPEN: 'Open',
  CLOSED_SYNCING: 'Closed, receiving late HR changes',
  LOCKED: 'Locked',
};

export function DefinitionStateBadge({ state, short }: { state: DefinitionState; short?: boolean }) {
  switch (state) {
    case 'NOT_OPEN':
      return <Badge tone="neutral" dot>Not open</Badge>;
    case 'OPEN':
      return <Badge tone="success" dot>Open</Badge>;
    case 'CLOSED_SYNCING':
      return <Badge tone="warning" dot>{short ? 'Closed · syncing' : STATE_LABEL.CLOSED_SYNCING}</Badge>;
    case 'LOCKED':
      return <Badge tone="dark" icon={<Lock className="size-3" />}>Locked</Badge>;
  }
}

export function SourceBadge({ source, lastSyncedAt }: { source: EmployeeSource; lastSyncedAt?: string | null }) {
  if (source === 'HR_SYNC') {
    return (
      <Badge tone="primary" icon={<CloudDownload className="size-3" />}>
        Synced from HR{lastSyncedAt ? ` · ${formatRelative(lastSyncedAt)}` : ''}
      </Badge>
    );
  }
  return <Badge tone="neutral" icon={<PencilLine className="size-3" />}>Manual</Badge>;
}

export function AdjustmentStatusBadge({ status }: { status: AdjustmentStatus }) {
  if (status === 'PENDING') return <Badge tone="accent" dot>Pending</Badge>;
  if (status === 'APPLIED') return <Badge tone="success" dot>Applied</Badge>;
  return <Badge tone="neutral">Cancelled</Badge>;
}

export const COMPONENT_LABEL: Record<AdjustmentComponent, string> = {
  BASIC: 'Basic',
  ACTING: 'Acting',
  ALLOWANCE: 'Allowance',
  OVERTIME: 'Overtime',
  LWOP: 'Unpaid leave',
};

/** Signed money: green "+" for arrears, red "−" for recoveries. */
export function SignedAmount({ value, className }: { value: string | number; className?: string }) {
  const n = toNumber(value);
  return (
    <span className={cn('num font-medium', n > 0 ? 'text-emerald-700' : n < 0 ? 'text-red-600' : 'text-slate-600', className)}>
      {formatMoney(n, { sign: true })}
    </span>
  );
}

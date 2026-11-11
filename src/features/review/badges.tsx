import { Badge } from '@/components/ui/Badge';
import type { PaymentStatus, PayrollStatus, TxStatus } from './api';

export function PayrollStatusBadge({ status }: { status: PayrollStatus }) {
  if (status === 'APPROVED') return <Badge tone="success" dot>Approved</Badge>;
  if (status === 'FAILED') return <Badge tone="danger" dot>Failed</Badge>;
  if (status === 'PENDING') return <Badge tone="warning" dot>Pending</Badge>;
  return <Badge tone="neutral" dot>Awaiting approval</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus | TxStatus }) {
  switch (status) {
    case 'PAID':
    case 'COMPLETED':
      return <Badge tone="success">Paid</Badge>;
    case 'PENDING':
      return <Badge tone="primary" dot pulse>Sent to bank</Badge>;
    case 'FAILED':
      return <Badge tone="danger">Failed</Badge>;
    case 'CANCELLED':
      return <Badge tone="neutral">Cancelled</Badge>;
    default:
      return <Badge tone="accent">Unpaid</Badge>;
  }
}

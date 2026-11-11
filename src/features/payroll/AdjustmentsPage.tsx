import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { useAdjustments, useDefinitions } from '@/hooks/queries';
import { formatInt, formatMoney, toNumber } from '@/lib/format';
import { Card, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Field';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { PageHeader, StatTile } from '@/components/ui/Page';
import { Segmented } from '@/components/ui/Tabs';
import type { AdjustmentStatus } from '@/types/api';
import { AdjustmentsTable } from './AdjustmentsTable';

type StatusFilter = AdjustmentStatus | 'ALL';

export function AdjustmentsPage() {
  const [status, setStatus] = useState<StatusFilter>('PENDING');
  const [definitionId, setDefinitionId] = useState('');
  const defs = useDefinitions();
  const q = useAdjustments({ status: status === 'ALL' ? undefined : status, payrollDefinitionId: definitionId || undefined });

  const totals = useMemo(() => {
    const rows = q.data?.data ?? [];
    let arrears = 0;
    let recoveries = 0;
    for (const r of rows) {
      const n = toNumber(r.amount);
      if (n > 0) arrears += n;
      else recoveries += n;
    }
    return { arrears, recoveries, review: rows.filter((r) => r.needsReview).length };
  }, [q.data]);

  return (
    <>
      <PageHeader
        eyebrow="Payroll"
        title="Arrears & recoveries"
        description="When HR changes a month that was already paid, the difference is settled in the next payroll. Positive amounts are arrears; negative amounts are recoveries."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Arrears (owed)" loading={q.isLoading} value={formatMoney(totals.arrears)} icon={<ArrowUpRight className="size-4.5" />} tone="success" hint={`${formatInt(q.data?.data.filter((r) => toNumber(r.amount) > 0).length)} items`} />
        <StatTile label="Recoveries (overpaid)" loading={q.isLoading} value={formatMoney(totals.recoveries)} icon={<ArrowDownRight className="size-4.5" />} tone="accent" hint={`${formatInt(q.data?.data.filter((r) => toNumber(r.amount) < 0).length)} items`} />
        <StatTile label="Needs review" loading={q.isLoading} value={formatInt(totals.review)} icon={<ShieldAlert className="size-4.5" />} tone="warning" hint="employees no longer active" />
      </div>

      <Card>
        <CardHeader
          title="Adjustments"
          description={q.data ? `${formatInt(q.data.count)} total` : undefined}
          actions={
            <>
              <Select aria-label="Payroll period" value={definitionId} onChange={(e) => setDefinitionId(e.target.value)} className="h-9 w-48">
                <option value="">All periods</option>
                {(defs.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.payrollName}</option>
                ))}
              </Select>
              <Segmented<StatusFilter>
                value={status}
                onChange={setStatus}
                items={[
                  { value: 'PENDING', label: 'Pending' },
                  { value: 'APPLIED', label: 'Applied' },
                  { value: 'CANCELLED', label: 'Cancelled' },
                  { value: 'ALL', label: 'All' },
                ]}
              />
            </>
          }
        />
        {q.isLoading ? (
          <PageLoader />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.data.length ? (
          <EmptyState icon={<ArrowLeftRight className="size-6" />} title="No adjustments" description="Nothing matches these filters." />
        ) : (
          <AdjustmentsTable rows={q.data.data} showStatus={status === 'ALL'} />
        )}
      </Card>
    </>
  );
}

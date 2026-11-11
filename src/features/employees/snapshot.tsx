import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { qk } from '@/hooks/queries';
import { hrSyncApi } from '@/lib/api';
import { toApiError } from '@/lib/http';
import { currentPeriod, formatPeriod } from '@/lib/format';
import { Button } from '@/components/ui/Button';

/** The raw HR record for one employee and month. 404 = no snapshot for that month. */
export function useSnapshot(employeeId: string, period: string) {
  return useQuery({
    queryKey: qk.snapshot(employeeId, period),
    queryFn: () => hrSyncApi.snapshot(employeeId, period),
    enabled: !!period,
    retry: (n, err) => toApiError(err).status !== 404 && n < 2,
  });
}

export function shiftPeriod(period: string, by: number) {
  const [y, m] = period.split('-').map(Number);
  return currentPeriod(new Date(y!, m! - 1 + by, 1));
}

/** Month stepper: ‹ Nov 2026 › with a native month input for jumping. */
export function MonthStepper({ value, onChange }: { value: string; onChange: (p: string) => void }) {
  const isCurrent = value >= currentPeriod();
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-surface p-1 shadow-xs">
      <Button variant="ghost" size="icon" className="size-8" aria-label="Previous month" onClick={() => onChange(shiftPeriod(value, -1))}>
        <ChevronLeft className="size-4" />
      </Button>
      <label className="relative cursor-pointer px-2 text-sm font-semibold text-slate-900">
        {formatPeriod(value)}
        <input
          type="month"
          aria-label="Choose month"
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <Button variant="ghost" size="icon" className="size-8" aria-label="Next month" disabled={isCurrent} onClick={() => onChange(shiftPeriod(value, 1))}>
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

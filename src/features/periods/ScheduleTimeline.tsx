import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import type { PayrollSchedule } from '@/types/api';

const DAY = 86_400_000;

type Point = { key: string; label: string; date: string; dot: string; ring: string; explicit: boolean; above?: boolean };

/**
 * open ── cutoff ── pay ── sync-until, to scale.
 * Time already passed is drawn solid, the rest light, so "where are we" reads at a glance.
 * Pay sits above the track so its label never collides with the nearby cutoff.
 */
export function ScheduleTimeline({ s, compact, muted }: { s: PayrollSchedule; compact?: boolean; muted?: boolean }) {
  const points: Point[] = [
    { key: 'open', label: 'Open', date: s.openDate, dot: 'bg-primary-500', ring: 'border-primary-500', explicit: s.explicit.openDate },
    { key: 'cutoff', label: 'Cutoff', date: s.cutoffDate, dot: 'bg-accent-500', ring: 'border-accent-500', explicit: s.explicit.cutoffDate },
    { key: 'pay', label: 'Pay day', date: s.payDate, dot: 'bg-primary-500', ring: 'border-primary-500', explicit: true, above: true },
    { key: 'until', label: 'Sync until', date: s.syncUntilDate, dot: 'bg-slate-500', ring: 'border-slate-400', explicit: s.explicit.syncUntilDate },
  ];
  const times = points.map((p) => new Date(p.date).getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, DAY);
  const pos = (t: number) => Math.min(100, Math.max(0, ((t - min) / span) * 100));
  const now = Date.now();
  const progress = pos(now);
  const showToday = now >= min && now <= max;
  const lastIdx = points.length - 1;

  return (
    <div className={cn('relative', muted && 'opacity-60 saturate-50', compact ? 'py-2' : 'pt-7 pb-10')}>
      <div className="relative mx-2 h-1.5 rounded-full">
        {/* Track, filled up to today */}
        <div className="absolute inset-0 overflow-hidden rounded-full bg-slate-200">
          <div className="absolute inset-y-0 left-0 bg-primary-500 transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>

        {showToday && (
          <div className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${progress}%` }} title={`Today · ${formatDate(new Date().toISOString())}`}>
            <span className="block h-5 w-0.5 rounded-full bg-slate-900 shadow-[0_0_0_2px_var(--color-surface)]" />
          </div>
        )}

        {points.map((p, i) => {
          const passed = times[i]! <= now;
          const align = i === 0 ? 'left-0' : i === lastIdx ? 'right-0 text-right' : 'left-1/2 -translate-x-1/2 text-center';
          return (
            <div key={p.key} className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos(times[i]!)}%` }}>
              <span
                className={cn('block size-3.5 rounded-full border-2 shadow-sm', passed ? cn(p.dot, 'border-surface') : cn('bg-surface', p.ring))}
                title={`${p.label}: ${formatDate(p.date)}`}
              />
              {!compact && (
                <span className={cn('absolute text-[11px] leading-tight whitespace-nowrap', p.above ? 'bottom-5' : 'top-5', align)}>
                  <span className="block font-medium text-slate-700">{p.label}</span>
                  <span className="num block text-slate-500">
                    {formatDate(p.date, { day: '2-digit', month: 'short' })}
                    {!p.explicit && <span className="text-slate-400"> · default</span>}
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Legend for the timeline's phases and markers. */
export function TimelineLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500', className)}>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-5 rounded-full bg-primary-500" /> Elapsed
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-slate-400" /> Passed
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full border-2 border-slate-400 bg-surface" /> Upcoming
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3.5 w-0.5 rounded-full bg-slate-900" /> Today
      </span>
    </div>
  );
}

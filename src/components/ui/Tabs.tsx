import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export function Tabs<T extends string>({ items, value, onChange, className }: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('scroll-thin flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200', className)}>
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative -mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              active ? 'border-accent-500 text-primary-800' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn('num rounded-full px-1.5 py-0.5 text-[11px] leading-none', active ? 'bg-primary-100 text-primary-800' : 'bg-slate-100 text-slate-600')}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Pill-style segmented control for filters. */
export function Segmented<T extends string>({ items, value, onChange }: { items: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => onChange(i.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition',
            i.value === value ? 'bg-surface text-primary-800 shadow-sm' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

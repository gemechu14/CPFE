import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold tracking-wider text-accent-600 uppercase">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** One card holding a row of plain headline numbers, divided by thin lines. */
export function StatStrip({ items, loading, className }: { items: { label: ReactNode; value: ReactNode; hint?: ReactNode }[]; loading?: boolean; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 rounded-xl border border-slate-200 bg-surface shadow-card sm:grid-cols-4 sm:divide-x sm:divide-slate-100', className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0 px-5 py-4">
          <div className="text-xs text-slate-500">{it.label}</div>
          {loading ? (
            <div className="mt-1 h-6 w-24 animate-pulse rounded bg-slate-100" />
          ) : (
            <div className="num mt-0.5 truncate text-lg font-semibold text-slate-900">{it.value}</div>
          )}
          {it.hint && <div className="truncate text-xs text-slate-400">{it.hint}</div>}
        </div>
      ))}
    </div>
  );
}

/** Headline number tile. Text stays in ink colours; the icon carries the brand tint. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'primary',
  loading,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'primary' | 'accent' | 'success' | 'warning';
  loading?: boolean;
}) {
  const iconTone = {
    primary: 'bg-primary-50 text-primary-700',
    accent: 'bg-accent-50 text-accent-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon && <div className={cn('flex size-9 items-center justify-center rounded-lg', iconTone)}>{icon}</div>}
      </div>
      <div className="num mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {loading ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-slate-200/70" /> : value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function DescList({ items, cols = 2 }: { items: { label: ReactNode; value: ReactNode; hint?: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3')}>
      {items.map((i, idx) => (
        <div key={idx} className="min-w-0">
          <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{i.label}</dt>
          <dd className="mt-1 truncate text-sm text-slate-900">{i.value ?? '—'}</dd>
          {i.hint && <dd className="mt-0.5 text-xs text-slate-500">{i.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error('Copy failed — select the text and copy it manually.');
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'dark';

const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  primary: 'bg-primary-50 text-primary-800 ring-primary-200',
  accent: 'bg-accent-50 text-accent-800 ring-accent-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  dark: 'bg-brand-900 text-white ring-brand-900',
};

const dots: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  primary: 'bg-primary-600',
  accent: 'bg-accent-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  dark: 'bg-surface',
};

export function Badge({
  tone = 'neutral',
  dot,
  pulse,
  icon,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset', tones[tone], className)}>
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-75', dots[tone])} />}
          <span className={cn('relative inline-flex size-1.5 rounded-full', dots[tone])} />
        </span>
      )}
      {icon}
      {children}
    </span>
  );
}

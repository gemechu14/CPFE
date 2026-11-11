import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path d="M21 11.5a6.5 6.5 0 1 0 0 9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="22.5" cy="16" r="2.5" fill="#f7931e" />
    </svg>
  );
}

export function Logo({ inverted, className }: { inverted?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={inverted ? 'text-white/15' : 'text-brand-700'} />
      <div className="leading-tight">
        <div className={cn('text-[15px] font-bold tracking-tight', inverted ? 'text-white' : 'text-primary-900')}>
          Coop<span className="text-accent-500">ayroll</span>
        </div>
        <div className={cn('text-[10px] font-medium tracking-wider uppercase', inverted ? 'text-white/70' : 'text-slate-500')}>Payroll &amp; HR</div>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { CalendarClock, CloudDownload, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';

export function AuthLayout({ title, subtitle, children, footer }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary-500 via-primary-600 to-brand-800 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}
        />
        <div aria-hidden className="absolute -top-32 -right-32 size-96 rounded-full bg-primary-300/40 blur-3xl" />
        <div aria-hidden className="absolute -bottom-24 -left-24 size-80 rounded-full bg-accent-500/25 blur-3xl" />

        <Logo inverted className="relative" />

        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-white">
            Payroll that stays in step with <span className="text-accent-300">HR</span>.
          </h2>
          <p className="mt-4 text-white/90">
            Sync employees from your HR system, close each month at cutoff, and let late changes settle automatically as arrears or recoveries.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { icon: CloudDownload, text: 'Automatic HR sync every few hours' },
              { icon: CalendarClock, text: 'Cutoff-based schedules per payroll period' },
              { icon: ShieldCheck, text: 'Ethiopian tax, pension and provident fund rules built in' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/15 text-accent-300">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/75">© {new Date().getFullYear()} Coop Labs</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center bg-surface px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

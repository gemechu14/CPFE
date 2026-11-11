import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/http';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-primary-600', className)} />;
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="animate-fade-in-delayed flex min-h-60 flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Spinner className="size-6" />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />;
}

const alertStyles = {
  info: { box: 'bg-primary-50 text-primary-900', Icon: Info, iconCls: 'text-primary-600' },
  success: { box: 'bg-emerald-50 text-emerald-900', Icon: CheckCircle2, iconCls: 'text-emerald-600' },
  warning: { box: 'bg-amber-50 text-amber-900', Icon: AlertTriangle, iconCls: 'text-amber-600' },
  danger: { box: 'bg-red-50 text-red-900', Icon: XCircle, iconCls: 'text-red-600' },
};

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof alertStyles;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, Icon, iconCls } = alertStyles[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg px-4 py-3.5 text-sm', box, className)}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', iconCls)} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-1', 'text-[13px] opacity-80')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<XCircle className="size-6 text-red-500" />}
      title="Couldn't load this data"
      description={errorMessage(error)}
      action={
        onRetry && (
          <button onClick={onRetry} className="text-sm font-medium text-primary-700 hover:underline">
            Try again
          </button>
        )
      }
    />
  );
}

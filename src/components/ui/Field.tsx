import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm text-slate-900 transition placeholder:text-slate-400 ' +
  'focus:border-primary-500 focus:ring-3 focus:ring-primary-500/15 focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 read-only:bg-slate-50';

const invalidCls = 'border-red-400 focus:border-red-500 focus:ring-red-500/15';

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  trailing?: ReactNode;
  children: (id: string) => ReactNode;
}

/** Label + control + hint/error. The control receives the generated id. */
export function Field({ label, hint, error, required, className, children, trailing }: FieldProps) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id} className="text-sm font-medium text-slate-700">
            {label}
            {required && <span className="ml-0.5 text-accent-600">*</span>}
          </label>
          {trailing}
        </div>
      )}
      {children(id)}
      {(error || hint) && <p className={cn('text-xs', error ? 'text-red-600' : 'text-slate-500')}>{error || hint}</p>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; leading?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, leading, ...rest }, ref) {
  const input = (
    <input ref={ref} className={cn(control, 'h-10', leading && 'pl-9', invalid && invalidCls, className)} aria-invalid={invalid || undefined} {...rest} />
  );
  if (!leading) return input;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">{leading}</span>
      {input}
    </div>
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput({ className, invalid, ...rest }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={show ? 'text' : 'password'}
        className={cn(control, 'h-10 pr-10', invalid && invalidCls, className)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
        aria-label={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, 'h-10 pr-8', invalid && invalidCls, className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-20 py-2', className)} {...rest} />;
});

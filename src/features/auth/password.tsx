import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/cn';

export const PASSWORD_RULES = [
  { label: '8–128 characters', test: (p: string) => p.length >= 8 && p.length <= 128 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number', test: (p: string) => /\d/.test(p) },
];

export const isStrongPassword = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.label} className={cn('flex items-center gap-1.5', ok ? 'text-emerald-700' : 'text-slate-500')}>
            {ok ? <Check className="size-3.5" /> : <Circle className="size-3" />}
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}

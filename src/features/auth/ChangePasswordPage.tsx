import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { authApi } from '@/lib/api';
import { toApiError } from '@/lib/http';
import { Button } from '@/components/ui/Button';
import { Field, PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { AuthLayout } from './AuthLayout';
import { PasswordChecklist, isStrongPassword } from './password';

export function ChangePasswordPage() {
  const { session, markPasswordChanged, logout } = useAuth();
  const navigate = useNavigate();
  const forced = !!session?.isFirstTimeLoggedIn;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!isStrongPassword(next)) errs.next = 'Password does not meet the rules below.';
    else if (next === current) errs.next = 'New password must be different from the current one.';
    if (confirm !== next) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await authApi.changePassword(current, next);
      markPasswordChanged();
      toast.success('Password changed');
      navigate('/', { replace: true });
    } catch (err) {
      const apiErr = toApiError(err);
      if (/current password/i.test(apiErr.message)) setErrors({ current: apiErr.message });
      else if (apiErr.fieldError('newPassword')) setErrors({ next: apiErr.fieldError('newPassword') });
      else setErrors({ form: apiErr.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={forced ? 'Set your password' : 'Change password'}
      subtitle={forced ? 'This is your first sign-in. Choose a new password to secure your account.' : 'Choose a new password for your account.'}
      footer={
        forced ? (
          <button onClick={() => logout()} className="font-medium text-primary-700 hover:underline">
            Sign out
          </button>
        ) : (
          <Link to="/" className="font-medium text-primary-700 hover:underline">
            Back to dashboard
          </Link>
        )
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {errors.form && <Alert tone="danger">{errors.form}</Alert>}
        <Field label={forced ? 'Temporary password' : 'Current password'} error={errors.current}>
          {(id) => (
            <PasswordInput id={id} autoComplete="current-password" autoFocus value={current} invalid={!!errors.current} onChange={(e) => setCurrent(e.target.value)} />
          )}
        </Field>
        <Field label="New password" error={errors.next}>
          {(id) => <PasswordInput id={id} autoComplete="new-password" value={next} invalid={!!errors.next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <PasswordChecklist value={next} />
        <Field label="Confirm new password" error={errors.confirm}>
          {(id) => <PasswordInput id={id} autoComplete="new-password" value={confirm} invalid={!!errors.confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!current || !next || !confirm}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}

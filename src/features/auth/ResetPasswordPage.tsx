import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { authApi } from '@/lib/api';
import { errorMessage } from '@/lib/http';
import { Button } from '@/components/ui/Button';
import { Field, PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { AuthLayout } from './AuthLayout';
import { PasswordChecklist, isStrongPassword } from './password';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isStrongPassword(password)) return setError('Password does not meet the rules.');
    if (password !== confirm) return setError('Passwords do not match.');
    setError(null);
    setLoading(true);
    try {
      await authApi.resetPassword(token!, password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const footer = (
    <Link to="/login" className="font-medium text-primary-700 hover:underline">
      Back to sign in
    </Link>
  );

  if (!token) {
    return (
      <AuthLayout title="Invalid link" footer={footer}>
        <Alert tone="danger">This reset link is missing its token. Request a new one from the forgot password page.</Alert>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password reset" footer={footer}>
        <Alert tone="success" title="All set">
          Your password has been reset. You can now sign in with your new password.
        </Alert>
        <Link to="/login" className="mt-6 block">
          <Button size="lg" className="w-full" icon={<CheckCircle2 className="size-4" />}>
            Continue to sign in
          </Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset password" subtitle="Choose a new password for your account." footer={footer}>
      <form onSubmit={onSubmit} className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="New password">
          {(id) => <PasswordInput id={id} autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <PasswordChecklist value={password} />
        <Field label="Confirm password">
          {(id) => <PasswordInput id={id} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!password || !confirm}>
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}

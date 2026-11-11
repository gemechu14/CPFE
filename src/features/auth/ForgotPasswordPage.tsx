import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck, User } from 'lucide-react';
import { authApi } from '@/lib/api';
import { errorMessage } from '@/lib/http';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  const [username, setUsername] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.forgotPassword(username.trim());
      setSent(res.message || 'If the account exists, a reset link has been sent.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const back = (
    <Link to="/login" className="inline-flex items-center gap-1.5 font-medium text-primary-700 hover:underline">
      <ArrowLeft className="size-4" /> Back to sign in
    </Link>
  );

  if (sent) {
    return (
      <AuthLayout title="Check your inbox" footer={back}>
        <div className="flex flex-col items-center rounded-xl border border-primary-100 bg-primary-50/60 px-6 py-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-surface text-primary-700 shadow-sm">
            <MailCheck className="size-6" />
          </div>
          <p className="mt-4 text-sm text-slate-700">{sent}</p>
          <p className="mt-2 text-xs text-slate-500">The link goes to your email, or by SMS if no email is on file.</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Forgot password" subtitle="Enter your username and we'll send you a link to reset your password." footer={back}>
      <form onSubmit={onSubmit} className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Username">
          {(id) => <Input id={id} autoFocus required leading={<User className="size-4" />} value={username} onChange={(e) => setUsername(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!username.trim()}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}

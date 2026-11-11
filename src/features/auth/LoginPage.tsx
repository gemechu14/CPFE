import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Field, Input, PasswordInput } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { errorMessage } from '@/lib/http';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { login, expired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const s = await login(username.trim(), password);
      navigate(s.isFirstTimeLoggedIn ? '/change-password' : from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the username your administrator gave you. Company admins sign in with their company code, e.g. cbo.admin."
      footer={
        <>
          Setting up a new company?{' '}
          <Link to="/register" className="font-medium text-primary-700 hover:underline">
            Register it
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {expired && !error && <Alert tone="warning">Your session expired. Please sign in again.</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Username">
          {(id) => (
            <Input
              id={id}
              autoComplete="username"
              autoFocus
              required
              leading={<User className="size-4" />}
              placeholder="cbo.admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Password"
          trailing={
            <Link to="/forgot-password" className="text-xs font-medium text-primary-700 hover:underline">
              Forgot password?
            </Link>
          }
        >
          {(id) => <PasswordInput id={id} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!username || !password}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

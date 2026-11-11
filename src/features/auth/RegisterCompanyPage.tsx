import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2 } from 'lucide-react';
import { companyApi } from '@/lib/api';
import { toApiError } from '@/lib/http';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { CopyButton } from '@/components/ui/Page';
import type { Company, RegisterCompanyInput } from '@/types/api';
import { AuthLayout } from './AuthLayout';

const empty: RegisterCompanyInput = { organizationName: '', companyCode: '', phoneNumber: '', email: '', notes: '' };

export function RegisterCompanyPage() {
  const [form, setForm] = useState(empty);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof RegisterCompanyInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      const payload: RegisterCompanyInput = {
        organizationName: form.organizationName.trim(),
        companyCode: form.companyCode.trim(),
        phoneNumber: form.phoneNumber.trim(),
        ...(form.email?.trim() ? { email: form.email.trim() } : {}),
        ...(form.notes?.trim() ? { notes: form.notes.trim() } : {}),
      };
      const res = await companyApi.register(payload);
      setCreated(res.data);
    } catch (err) {
      const apiErr = toApiError(err);
      setFieldErrors(Object.fromEntries(apiErr.details.map((d) => [d.path, d.message])));
      setError(apiErr.message);
    } finally {
      setLoading(false);
    }
  }

  if (created) {
    const admin = created.adminUsername ?? `${created.companyCode.toLowerCase()}.admin`;
    return (
      <AuthLayout title="Company registered" subtitle={created.organizationName}>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="size-4" /> Your company is ready
          </div>
          <p className="mt-2 text-sm text-emerald-900/80">Sign in with the admin account below using the default password. You'll be asked to change it right away.</p>
        </div>
        <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">Admin username</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <code className="text-lg font-semibold text-primary-800">{admin}</code>
            <CopyButton value={admin} />
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">New companies start with manual employees, plus the default Ethiopian tax brackets and pension rules.</p>
        <Link to="/login" className="mt-6 block">
          <Button size="lg" className="w-full">Go to sign in</Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Register your company"
      subtitle="Create a workspace for your organisation. An admin account is created for you."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="font-medium text-primary-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Organisation name" required error={fieldErrors.organizationName}>
          {(id) => (
            <Input id={id} autoFocus required leading={<Building2 className="size-4" />} placeholder="Cooperative Bank of Oromia" value={form.organizationName} onChange={set('organizationName')} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company code" required error={fieldErrors.companyCode} hint={form.companyCode ? `Admin: ${form.companyCode.trim().toLowerCase()}.admin` : 'e.g. CBO'}>
            {(id) => <Input id={id} required placeholder="CBO" value={form.companyCode} onChange={set('companyCode')} />}
          </Field>
          <Field label="Phone number" required error={fieldErrors.phoneNumber}>
            {(id) => <Input id={id} required type="tel" placeholder="0911000001" value={form.phoneNumber} onChange={set('phoneNumber')} />}
          </Field>
        </div>
        <Field label="Email" error={fieldErrors.email}>
          {(id) => <Input id={id} type="email" placeholder="optional" value={form.email} onChange={set('email')} />}
        </Field>
        <Field label="Notes" error={fieldErrors.notes}>
          {(id) => <Textarea id={id} rows={2} placeholder="optional" value={form.notes} onChange={set('notes')} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!form.organizationName || !form.companyCode || !form.phoneNumber}>
          Register company
        </Button>
      </form>
    </AuthLayout>
  );
}

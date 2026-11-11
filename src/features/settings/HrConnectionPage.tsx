import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Globe, KeyRound, PlugZap, Trash2, Wifi } from 'lucide-react';
import { qk, useSettings } from '@/hooks/queries';
import { settingsApi } from '@/lib/api';
import { toApiError } from '@/lib/http';
import { formatPeriod, formatRelative } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import { Field, Input, PasswordInput } from '@/components/ui/Field';
import { Alert, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { ConfirmDialog } from '@/components/ui/Overlay';
import { DescList, PageHeader } from '@/components/ui/Page';
import { Switch } from '@/components/ui/Switch';
import type { HrConnectionInput, HrConnectionTestResult } from '@/types/api';

export function HrConnectionPage() {
  const settings = useSettings();
  const qc = useQueryClient();
  const [form, setForm] = useState({ baseUrl: '', apiKey: '', apiSecret: '', companyName: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [test, setTest] = useState<HrConnectionTestResult | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (settings.data) {
      setForm((f) => ({ ...f, baseUrl: settings.data.hrBaseUrl ?? '', companyName: settings.data.hrCompanyName ?? '' }));
    }
  }, [settings.data]);

  const onSaved = (msg: string) => (data: Awaited<ReturnType<typeof settingsApi.get>>) => {
    qc.setQueryData(qk.settings, data);
    toast.success(msg);
  };

  const save = useMutation({
    mutationFn: (input: HrConnectionInput) => settingsApi.saveHrConnection(input),
    onSuccess: (data) => {
      onSaved('HR connection saved')(data);
      setForm((f) => ({ ...f, apiKey: '', apiSecret: '' }));
      setFieldErrors({});
      setFormError(null);
      setTest(null);
    },
    onError: (err) => {
      const e = toApiError(err);
      setFieldErrors(Object.fromEntries(e.details.map((d) => [d.path.replace(/^body\./, ''), d.message])));
      setFormError(e.status === 409 ? 'This HR system and company are already registered by another company.' : e.message);
    },
  });

  const testConn = useMutation({
    mutationFn: settingsApi.testHrConnection,
    onSuccess: setTest,
    onError: (err) => toast.error(toApiError(err).message),
  });

  const remove = useMutation({
    mutationFn: settingsApi.removeHrConnection,
    onSuccess: (data) => {
      onSaved('HR connection removed')(data);
      setConfirmRemove(false);
      setTest(null);
      setForm({ baseUrl: '', apiKey: '', apiSecret: '', companyName: '' });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const toggleSync = useMutation({
    mutationFn: (syncEnabled: boolean) => settingsApi.update({ syncEnabled }),
    onSuccess: (data) => onSaved(data.syncEnabled ? 'Scheduled sync turned on' : 'Scheduled sync turned off')(data),
    onError: (err) => toast.error(toApiError(err).message),
  });

  if (settings.isLoading) return <PageLoader />;
  if (settings.error || !settings.data) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;
  const s = settings.data;
  const configured = s.hrConnectionConfigured;

  if (s.employeeSource !== 'HR_SYNC') {
    return (
      <>
        <PageHeader title="HR connection" />
        <Alert tone="info" title="Your company uses manual employees">
          Switch the employee source to HR sync in <Link to="/settings/payroll" className="font-medium underline">Payroll settings</Link> to connect an HR system.
        </Alert>
      </>
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    try {
      const u = new URL(form.baseUrl);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      errs.baseUrl = 'Enter a full URL, e.g. https://hr.example.com/';
    }
    if (!form.apiKey.trim()) errs.apiKey = configured ? 'Re-enter the API key to save changes' : 'API key is required';
    if (!configured && !form.apiSecret) errs.apiSecret = 'API secret is required the first time';
    if (!form.companyName.trim()) errs.companyName = 'HR company name is required';
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    save.mutate({
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim(),
      companyName: form.companyName.trim(),
      ...(form.apiSecret ? { apiSecret: form.apiSecret } : {}),
    });
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="HR connection"
        description="Connect your Frappe coop_hr system. Employees, placements, attendance and leave are pulled from it."
        actions={configured ? <Badge tone="success" icon={<CheckCircle2 className="size-3" />}>Connected</Badge> : <Badge tone="neutral">Not connected</Badge>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <form onSubmit={onSubmit} noValidate>
          <Card>
            <CardHeader icon={<PlugZap className="size-4.5" />} title="Connection details" description="The secret is stored on the server and never shown again." />
            <CardBody className="space-y-5">
              {formError && <Alert tone="danger">{formError}</Alert>}
              <Field label="Base URL" required error={fieldErrors.baseUrl} hint="HTTPS is required in production, except for private-network hosts (10.x, 172.16–31.x, 192.168.x).">
                {(id) => <Input id={id} leading={<Globe className="size-4" />} placeholder="https://hr.example.com/" value={form.baseUrl} invalid={!!fieldErrors.baseUrl} onChange={set('baseUrl')} />}
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="API key" required error={fieldErrors.apiKey} hint={configured && s.hrApiKey ? `Current: ${s.hrApiKey}` : undefined}>
                  {(id) => (
                    <Input id={id} autoComplete="off" leading={<KeyRound className="size-4" />} placeholder={configured ? s.hrApiKey ?? '' : ''} value={form.apiKey} invalid={!!fieldErrors.apiKey} onChange={set('apiKey')} />
                  )}
                </Field>
                <Field label="API secret" required={!configured} error={fieldErrors.apiSecret} hint={configured ? 'Leave empty to keep the stored secret.' : undefined}>
                  {(id) => (
                    <PasswordInput id={id} autoComplete="new-password" placeholder={configured ? '•••••• (unchanged)' : ''} value={form.apiSecret} invalid={!!fieldErrors.apiSecret} onChange={set('apiSecret')} />
                  )}
                </Field>
              </div>
              <Field label="HR company name" required error={fieldErrors.companyName} hint="Must match identity.company in the HR feed. Records from any other company are skipped.">
                {(id) => <Input id={id} placeholder="Cooperative Bank of Oromia" value={form.companyName} invalid={!!fieldErrors.companyName} onChange={set('companyName')} />}
              </Field>
            </CardBody>
            <CardFooter className="justify-between">
              {configured ? (
                <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" icon={<Trash2 className="size-4" />} onClick={() => setConfirmRemove(true)}>
                  Remove
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit" loading={save.isPending}>
                {configured ? 'Update connection' : 'Save connection'}
              </Button>
            </CardFooter>
          </Card>
        </form>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={<Wifi className="size-4.5" />} title="Test connection" description="Fetch the current period from HR without saving anything." />
            <CardBody className="space-y-4">
              <Button variant="secondary" className="w-full" disabled={!configured} loading={testConn.isPending} onClick={() => testConn.mutate()}>
                Run test
              </Button>
              {!configured && <p className="text-xs text-slate-500">Save the connection first.</p>}
              {test && <TestResult result={test} />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Scheduled sync" description={`Every ${s.syncIntervalHours} hours · last ${formatRelative(s.lastSyncedAt)}`} />
            <CardBody>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-700">{s.syncEnabled ? 'On' : 'Off'}</span>
                <Switch label="Scheduled sync" checked={s.syncEnabled} disabled={!configured || toggleSync.isPending} onChange={(v) => toggleSync.mutate(v)} />
              </div>
              {!configured && <p className="mt-2 text-xs text-slate-500">Available once the HR connection is saved.</p>}
              {configured && (
                <Link to="/hr-sync" className="mt-4 inline-block text-sm font-medium text-primary-700 hover:underline">
                  View sync runs →
                </Link>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        tone="danger"
        title="Remove HR connection?"
        confirmLabel="Remove"
      >
        The stored URL, key and secret are deleted and scheduled sync is turned off. Synced employees stay as they are.
      </ConfirmDialog>
    </>
  );
}

function TestResult({ result }: { result: HrConnectionTestResult }) {
  if (!result.ok) {
    return (
      <Alert tone="danger" title="Connection failed">
        {result.message}
      </Alert>
    );
  }
  return (
    <div className="space-y-3">
      {result.companyNameMatches ? (
        <Alert tone="success" title="Connection works">{result.message}</Alert>
      ) : (
        <Alert tone="warning" title="Company name doesn't match">
          {result.message} Every record would be skipped until this is fixed.
        </Alert>
      )}
      <div className="rounded-lg bg-slate-50 p-3">
        <DescList
          cols={1}
          items={[
            { label: 'Period', value: formatPeriod(result.period) },
            { label: 'HR company', value: result.hrCompany ?? '—' },
            { label: 'Records found', value: result.hasRecords ? 'Yes' : 'No' },
          ]}
        />
      </div>
    </div>
  );
}

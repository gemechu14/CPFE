import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Camera, ImagePlus, Info, Lock, Mail, Phone } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { qk, useCompany } from '@/hooks/queries';
import { companyApi } from '@/lib/api';
import { assetUrl, toApiError } from '@/lib/http';
import { formatDateTime, initials } from '@/lib/format';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Alert, ErrorState, PageLoader, Spinner } from '@/components/ui/Feedback';
import { CopyButton, DescList, PageHeader } from '@/components/ui/Page';
import type { Company, CompanyUpdate } from '@/types/api';

type Draft = Required<CompanyUpdate>;
type ImageKind = 'logo' | 'banner';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // backend limit

const STATUS: Record<string, { tone: Tone; label: string }> = {
  active: { tone: 'success', label: 'Active' },
  pending: { tone: 'warning', label: 'Pending approval' },
  reject: { tone: 'danger', label: 'Rejected' },
  denied: { tone: 'danger', label: 'Denied' },
};

const toDraft = (c: Company): Draft => ({
  organizationName: c.organizationName ?? '',
  phoneNumber: c.phoneNumber ?? '',
  email: c.email ?? '',
  notes: c.notes ?? '',
});

export function CompanyProfilePage() {
  const company = useCompany();
  const { can } = useAuth();
  const canEdit = can(PERMS.manageSettings);
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (company.data) setDraft(toDraft(company.data));
  }, [company.data]);

  const patch = useMemo<CompanyUpdate>(() => {
    if (!draft || !company.data) return {};
    const base = toDraft(company.data);
    const out: CompanyUpdate = {};
    (Object.keys(draft) as (keyof Draft)[]).forEach((k) => {
      if (draft[k].trim() !== base[k].trim()) out[k] = draft[k].trim();
    });
    return out;
  }, [draft, company.data]);
  const changes = Object.keys(patch).length;

  const save = useMutation({
    mutationFn: companyApi.update,
    onSuccess: (data) => {
      qc.setQueryData(qk.company, data);
      setErrors({});
      toast.success('Company profile updated');
    },
    onError: (err) => {
      const e = toApiError(err);
      setErrors(Object.fromEntries(e.details.map((d) => [d.path.replace(/^body\./, ''), d.message])));
      toast.error(e.message);
    },
  });

  if (company.isLoading || (!draft && !company.error)) return <PageLoader />;
  if (company.error || !company.data || !draft) return <ErrorState error={company.error} onRetry={() => company.refetch()} />;

  const c = company.data;
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));

  function validate() {
    const e: Record<string, string> = {};
    const d = draft!;
    if (!d.organizationName.trim()) e.organizationName = 'Organization name is required';
    else if (d.organizationName.trim().length > 100) e.organizationName = 'Keep it under 100 characters';
    if (!/^\d{10}$/.test(d.phoneNumber.trim())) e.phoneNumber = 'Phone number must be 10 digits, e.g. 0911234567';
    if (d.email.trim() && !/^\S+@\S+\.\S+$/.test(d.email.trim())) e.email = 'Enter a valid email address';
    if (!d.email.trim() && c.email) e.email = "The email can't be removed. Enter a new one instead.";
    if (d.notes.length > 1000) e.notes = 'Keep notes under 1000 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const status = c.status ? STATUS[c.status] ?? { tone: 'neutral' as Tone, label: c.status } : null;

  return (
    <div className="pb-24">
      <PageHeader title="Company profile" description="Your organization's identity across payroll, payslips and reports." />

      {!canEdit && (
        <Alert tone="info" className="mb-6">
          You can view the company profile. Changing it needs the <code className="font-mono text-xs">manage_payroll_settings</code> permission.
        </Alert>
      )}

      <BrandCard company={c} status={status} canEdit={canEdit} />

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader icon={<Building2 className="size-4.5" />} title="Organization details" description="Shown on payslips, bank files and reports." />
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field label="Organization name" required error={errors.organizationName} className="sm:col-span-2">
              {(id) => (
                <Input id={id} value={draft.organizationName} maxLength={100} disabled={!canEdit} invalid={!!errors.organizationName} onChange={set('organizationName')} />
              )}
            </Field>
            <Field label="Phone number" required error={errors.phoneNumber} hint="10 digits">
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  leading={<Phone className="size-4" />}
                  value={draft.phoneNumber}
                  maxLength={10}
                  disabled={!canEdit}
                  invalid={!!errors.phoneNumber}
                  onChange={(e) => set('phoneNumber')({ target: { value: e.target.value.replace(/\D/g, '') } })}
                />
              )}
            </Field>
            <Field label="Email" error={errors.email}>
              {(id) => (
                <Input id={id} type="email" leading={<Mail className="size-4" />} value={draft.email} disabled={!canEdit} invalid={!!errors.email} onChange={set('email')} />
              )}
            </Field>
            <Field label="Notes" error={errors.notes} hint={`${draft.notes.length}/1000`} className="sm:col-span-2">
              {(id) => <Textarea id={id} rows={4} value={draft.notes} maxLength={1000} disabled={!canEdit} onChange={set('notes')} placeholder="Anything worth knowing about this organization." />}
            </Field>
          </CardBody>
        </Card>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader icon={<Lock className="size-4.5" />} title="Account" />
            <CardBody>
              <DescList
                cols={1}
                items={[
                  { label: 'Company code', value: <code className="font-mono text-sm">{c.companyCode}</code>, hint: `Admin usernames start with it, e.g. ${c.companyCode}.admin` },
                  {
                    label: 'Company ID',
                    value: (
                      <span className="flex items-center gap-1">
                        <code className="truncate font-mono text-xs text-slate-600">{c.id}</code>
                        <CopyButton value={c.id} label="" />
                      </span>
                    ),
                  },
                  { label: 'Registered', value: formatDateTime(c.createdAt) },
                  { label: 'Last updated', value: formatDateTime(c.updatedAt) },
                ]}
              />
            </CardBody>
          </Card>
          <p className="flex gap-2 px-1 text-xs leading-relaxed text-slate-500">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            The company code can't be changed here because every login username is built from it.
          </p>
        </aside>
      </div>

      {canEdit && changes > 0 && (
        <div className="animate-slide-up fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-surface/95 backdrop-blur lg:left-64">
          <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-900">{changes}</span> unsaved change{changes > 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={save.isPending}
                onClick={() => {
                  setDraft(toDraft(c));
                  setErrors({});
                }}
              >
                Discard
              </Button>
              <Button loading={save.isPending} onClick={() => validate() && save.mutate(patch)}>
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BrandCard({ company: c, status, canEdit }: { company: Company; status: { tone: Tone; label: string } | null; canEdit: boolean }) {
  const qc = useQueryClient();
  const logoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Partial<Record<ImageKind, string>>>({});
  // Local previews stay up until unmount so the new image never flickers while the server copy loads.
  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const upload = useMutation({
    mutationFn: ({ file, type }: { file: File; type: ImageKind }) => companyApi.uploadImage(file, type),
    onSuccess: (data, { type }) => {
      qc.setQueryData(qk.company, data);
      toast.success(type === 'logo' ? 'Logo updated' : 'Banner updated');
    },
    onError: (err, { type }) => {
      setPreview((p) => ({ ...p, [type]: undefined }));
      toast.error(toApiError(err).message);
    },
  });

  const pick = (type: ImageKind) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return toast.error('Use a PNG, JPG, WebP, GIF or BMP image.');
    if (file.size > MAX_IMAGE_BYTES) return toast.error('Images must be 2 MB or smaller.');
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    setPreview((p) => ({ ...p, [type]: url }));
    upload.mutate({ file, type });
  };

  const busy = (type: ImageKind) => upload.isPending && upload.variables?.type === type;
  const banner = preview.banner ?? assetUrl(c.banner);
  const logo = preview.logo ?? assetUrl(c.logo);

  return (
    <Card className="overflow-hidden">
      <div className="group relative h-32 bg-gradient-to-r from-brand-800 via-brand-700 to-primary-600 sm:h-40">
        {banner && <img src={banner} alt="" className="absolute inset-0 size-full object-cover" />}
        {busy('banner') && (
          <div className="absolute inset-0 flex items-center justify-center bg-brand-950/50">
            <Spinner className="text-white" />
          </div>
        )}
        {canEdit && (
          <>
            <input ref={bannerInput} type="file" accept={IMAGE_TYPES.join(',')} className="hidden" onChange={pick('banner')} />
            <button
              type="button"
              disabled={upload.isPending}
              onClick={() => bannerInput.current?.click()}
              className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-black/35 px-3 py-1.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/50 disabled:opacity-60"
            >
              <ImagePlus className="size-3.5" />
              {c.banner ? 'Change banner' : 'Add banner'}
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-6 pb-5">
        <div className="relative -mt-10 shrink-0">
          <span className="flex size-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-surface bg-primary-100 text-2xl font-semibold text-primary-800 shadow-md">
            {logo ? <img src={logo} alt={`${c.organizationName} logo`} className="size-full bg-white object-contain" /> : initials(c.organizationName)}
          </span>
          {busy('logo') && (
            <span className="absolute inset-1 flex items-center justify-center rounded-xl bg-surface/70">
              <Spinner />
            </span>
          )}
          {canEdit && (
            <>
              <input ref={logoInput} type="file" accept={IMAGE_TYPES.join(',')} className="hidden" onChange={pick('logo')} />
              <button
                type="button"
                aria-label={c.logo ? 'Change logo' : 'Add logo'}
                title={c.logo ? 'Change logo' : 'Add logo'}
                disabled={upload.isPending}
                onClick={() => logoInput.current?.click()}
                className="absolute -right-1.5 -bottom-1.5 flex size-8 items-center justify-center rounded-full border-2 border-surface bg-accent-500 text-white shadow transition hover:bg-accent-600 disabled:opacity-60"
              >
                <Camera className="size-4" />
              </button>
            </>
          )}
        </div>
        <div className="min-w-0 pt-3">
          <h2 className="truncate text-xl leading-tight font-semibold text-slate-900">{c.organizationName}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="font-mono text-xs text-slate-600">{c.companyCode}</span>
            {status && (
              <Badge tone={status.tone} dot>
                {status.label}
              </Badge>
            )}
          </div>
        </div>
        {canEdit && <p className="w-full text-xs text-slate-400 sm:ml-auto sm:w-auto sm:pt-4">PNG, JPG or WebP · up to 2 MB</p>}
      </div>
    </Card>
  );
}

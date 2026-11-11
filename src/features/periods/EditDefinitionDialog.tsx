import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { qk, useDefinitions } from '@/hooks/queries';
import { definitionsApi } from '@/lib/api';
import { toApiError } from '@/lib/http';
import { toDateInput } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { ConfirmDialog, Dialog } from '@/components/ui/Overlay';
import type { PayrollDefinition, PayrollDefinitionUpdate } from '@/types/api';

/** Edit is allowed only until the pay date (Phase 6.8). */
export const canEditDefinition = (d: PayrollDefinition) => new Date() <= endOfDay(d.payDate);

function endOfDay(iso: string) {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function EditDefinitionDialog({ def, onClose }: { def: PayrollDefinition | null; onClose: () => void }) {
  const qc = useQueryClient();
  const all = useDefinitions();
  const [form, setForm] = useState({ payrollName: '', startDate: '', endDate: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (def) {
      setForm({ payrollName: def.payrollName, startDate: toDateInput(def.startDate), endDate: toDateInput(def.endDate) });
      setErrors({});
    }
  }, [def]);

  const save = useMutation({
    mutationFn: (patch: PayrollDefinitionUpdate) => definitionsApi.update(def!.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.definitions });
      qc.invalidateQueries({ queryKey: qk.schedule(def!.id) });
      toast.success('Payroll period updated');
      onClose();
    },
    onError: (err) => {
      const e = toApiError(err);
      const path = e.details[0]?.path;
      setErrors(path ? { [path]: e.details[0]!.message } : /name/i.test(e.message) ? { payrollName: e.message } : { form: e.message });
    },
  });

  if (!def) return null;

  function submit() {
    const errs: Record<string, string> = {};
    const name = form.payrollName.trim();
    if (!name) errs.payrollName = 'Name is required';
    else if ((all.data ?? []).some((d) => d.id !== def!.id && d.payrollName.trim().toLowerCase() === name.toLowerCase())) errs.payrollName = 'Another period already has this name';
    if (form.startDate && form.endDate && form.endDate < form.startDate) errs.endDate = 'End date must be on or after the start date';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    // Send only what changed; send both dates together so the backend re-checks their order.
    const patch: PayrollDefinitionUpdate = {};
    if (name !== def!.payrollName) patch.payrollName = name;
    if (form.startDate !== toDateInput(def!.startDate) || form.endDate !== toDateInput(def!.endDate)) {
      patch.startDate = form.startDate;
      patch.endDate = form.endDate;
    }
    if (!Object.keys(patch).length) return onClose();
    save.mutate(patch);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit ${def.payrollName}`}
      description="Only the name and dates can change. Use the schedule editor for open, cutoff and sync-until dates."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={submit}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        {errors.form && <Alert tone="danger">{errors.form}</Alert>}
        <Field label="Name" error={errors.payrollName}>
          {(id) => <Input id={id} value={form.payrollName} invalid={!!errors.payrollName} onChange={(e) => setForm((f) => ({ ...f, payrollName: e.target.value }))} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" error={errors.startDate}>
            {(id) => <Input id={id} type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />}
          </Field>
          <Field label="End date" error={errors.endDate}>
            {(id) => <Input id={id} type="date" value={form.endDate} invalid={!!errors.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />}
          </Field>
        </div>
        <p className="text-xs text-slate-500">Editing is blocked by the backend once payroll processing has started for this period.</p>
      </div>
    </Dialog>
  );
}

export function DeleteDefinitionDialog({ def, onClose }: { def: PayrollDefinition | null; onClose: () => void }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => definitionsApi.remove(def!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.definitions });
      qc.invalidateQueries({ queryKey: qk.currentMonth });
      toast.success('Payroll period deleted');
      onClose();
    },
    onError: (err) => {
      const e = toApiError(err);
      // The backend returns a raw database error when payroll, arrears or attendance rows use the period.
      toast.error(e.status === 400 ? 'This period is already in use and can’t be deleted.' : e.message);
      onClose();
    },
  });
  return (
    <ConfirmDialog
      open={!!def}
      onClose={onClose}
      onConfirm={() => remove.mutate()}
      loading={remove.isPending}
      tone="danger"
      title={`Delete ${def?.payrollName ?? ''}?`}
      confirmLabel="Delete period"
    >
      This permanently removes the period. It only works for periods with no payroll run, arrears or attendance yet.
    </ConfirmDialog>
  );
}

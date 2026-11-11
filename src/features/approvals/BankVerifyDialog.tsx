import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Landmark, ShieldCheck, XCircle } from 'lucide-react';
import { toApiError } from '@/lib/http';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { Dialog } from '@/components/ui/Overlay';
import { DescList } from '@/components/ui/Page';
import { approvalsApi, type BankCustomerInfo } from './api';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);

/** True when every name part of the shorter name appears in the longer one. */
function namesMatch(a: string, b: string) {
  const [x, y] = [norm(a), norm(b)];
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((p) => long.includes(p));
}

export function BankVerifyDialog({
  open,
  onClose,
  employee,
}: {
  open: boolean;
  onClose: () => void;
  employee: { id: string; name: string; payrollInfo?: { id?: string; accountNumber?: string | null; isVerified?: boolean } | null };
}) {
  const qc = useQueryClient();
  const [account, setAccount] = useState(employee.payrollInfo?.accountNumber ?? '');
  const [found, setFound] = useState<BankCustomerInfo | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const payrollInfoId = employee.payrollInfo?.id;

  useEffect(() => {
    if (open) {
      setAccount(employee.payrollInfo?.accountNumber ?? '');
      setFound(null);
      setNotFound(null);
    }
  }, [open, employee.payrollInfo?.accountNumber]);

  const verify = useMutation({
    mutationFn: () => approvalsApi.verifyAccount(account),
    onSuccess: (res) => {
      // "Not found" arrives as HTTP 200 without `data`.
      const info = res.data?.exists?.customerInfo;
      if (info) {
        setFound(info);
        setNotFound(null);
      } else {
        setFound(null);
        setNotFound(res.message || 'The bank does not recognise this account number.');
      }
    },
    onError: (err) => {
      setFound(null);
      setNotFound(toApiError(err).message);
    },
  });

  const mark = useMutation({
    mutationFn: () => approvalsApi.setVerified(payrollInfoId!, true),
    onSuccess: () => {
      toast.success('Account marked as verified');
      qc.invalidateQueries({ queryKey: ['employees'] });
      onClose();
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  const match = found ? namesMatch(found.FULLNAME, employee.name) : false;
  const sameAccount = found ? found.ACCOUNTNUMBER === account : false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Verify bank account"
      description={`Check ${employee.name}'s salary account with the bank. Payments skip unverified accounts.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            icon={<ShieldCheck className="size-4" />}
            disabled={!found || !payrollInfoId}
            loading={mark.isPending}
            variant={match ? 'primary' : 'accent'}
            onClick={() => mark.mutate()}
          >
            Mark verified
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {employee.payrollInfo?.isVerified && <Alert tone="success">This account is already verified.</Alert>}
        {!payrollInfoId && (
          <Alert tone="warning" title="No active payroll info">
            This employee has no payroll record id loaded, so the verified flag can't be saved. You can still check the account.
          </Alert>
        )}
        <div className="flex items-end gap-2">
          <Field label="Account number" className="flex-1">
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                leading={<Landmark className="size-4" />}
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value.replace(/\D/g, ''));
                  setFound(null);
                  setNotFound(null);
                }}
              />
            )}
          </Field>
          <Button variant="secondary" loading={verify.isPending} disabled={!account} onClick={() => verify.mutate()}>
            Check with bank
          </Button>
        </div>

        {notFound && <Alert tone="danger" title="Not verified">{notFound}</Alert>}
        {found && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 uppercase">Name at the bank</div>
                <div className="font-semibold text-slate-900">{found.FULLNAME}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 uppercase">Name in payroll</div>
                <div className="font-semibold text-slate-900">{employee.name}</div>
              </div>
            </div>
            {match ? (
              <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="size-4" /> Names match</p>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-amber-700"><XCircle className="size-4" /> Names don't match — check before marking verified</p>
            )}
            <DescList
              cols={2}
              items={[
                { label: 'Account', value: <span className="font-mono">{found.ACCOUNTNUMBER}</span>, hint: sameAccount ? undefined : 'Differs from the number entered' },
                { label: 'Phone', value: found.PHONENUMBER },
                { label: 'Category', value: found.CATEGORY },
                { label: 'Birth date', value: found.BIRTHDATE },
              ]}
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}

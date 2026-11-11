import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { hrSyncApi } from '@/lib/api';
import { qk } from '@/hooks/queries';
import { toApiError } from '@/lib/http';
import { formatPeriod } from '@/lib/format';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Dialog } from '@/components/ui/Overlay';

/** Queues a sync (202) and refreshes the runs list, which then polls itself. */
export function SyncNowButton({ period, askPeriod = true, ...props }: { period?: string; askPeriod?: boolean } & ButtonProps) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(period ?? '');

  const run = useMutation({
    mutationFn: (p?: string) => hrSyncApi.run(p),
    onSuccess: (res) => {
      toast.success(`HR sync queued for ${formatPeriod(res.data.period)}`, { description: 'Progress appears in the runs list.' });
      setOpen(false);
      qc.invalidateQueries({ queryKey: qk.syncRuns });
    },
    onError: (err) => toast.error(toApiError(err).message),
  });

  if (!can(PERMS.manageSettings)) return null;

  return (
    <>
      <Button
        variant="accent"
        icon={<RefreshCw className="size-4" />}
        loading={run.isPending}
        onClick={() => (askPeriod ? setOpen(true) : run.mutate(period))}
        {...props}
      >
        {props.children ?? 'Sync now'}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Run HR sync"
        description="The sync runs in the background. A full first sync of ~7,000 employees takes about a minute."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="accent" loading={run.isPending} onClick={() => run.mutate(value || undefined)}>
              Start sync
            </Button>
          </>
        }
      >
        <Field label="Period (optional)" hint="Leave empty to sync every period that is currently open for syncing, newest first.">
          {(id) => <Input id={id} type="month" value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
      </Dialog>
    </>
  );
}

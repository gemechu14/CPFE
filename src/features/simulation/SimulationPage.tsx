import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, FlaskConical, Hourglass, Lock, RotateCcw } from 'lucide-react';
import { PERMS, useAuth } from '@/auth/AuthContext';
import { toApiError } from '@/lib/http';
import { formatDuration, formatInt, formatPeriod, formatRelative } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Page';
import { simKeys, simulationApi, type Simulation } from './api';
import { BasisLegend } from './basis';
import { defaultForm, formFromParams, SimulationForm, toInput, type SimForm } from './SimulationForm';
import { SimulationResults } from './SimulationResults';

const LAST_KEY = 'payroll-simulation:last';
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const remember = (id: string | null) => {
  try {
    if (id) sessionStorage.setItem(LAST_KEY, id);
    else sessionStorage.removeItem(LAST_KEY);
  } catch {
    /* storage unavailable */
  }
};
const recall = () => {
  try {
    return sessionStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
};

/** Ticks every `ms` so relative times ("in 42 minutes") and expiry stay current. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function SimulationPage() {
  const { can } = useAuth();
  if (!can(PERMS.simulatePayroll)) {
    return (
      <Card>
        <EmptyState
          icon={<Lock className="size-6" />}
          title="You can't run payroll simulations"
          description="Ask your payroll administrator to give your role the “simulate payroll” permission."
        />
      </Card>
    );
  }
  return <Simulator />;
}

function Simulator() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const id = params.get('id');

  // Coming back to the page without ?id= reopens the last simulation of this tab (results live for an hour).
  useEffect(() => {
    if (!id) {
      const last = recall();
      if (last) setParams({ id: last }, { replace: true });
    } else remember(id);
  }, [id, setParams]);

  const [form, setForm] = useState<SimForm>(defaultForm);
  const [touched, setTouched] = useState(false);
  const [conflictId, setConflictId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const sim = useQuery({
    queryKey: simKeys.one(id ?? ''),
    queryFn: () => simulationApi.get(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === 'RUNNING' ? 1500 : false),
    refetchIntervalInBackground: true,
    retry: (n, err) => toApiError(err).status !== 404 && n < 2,
    staleTime: (q) => (q.state.data?.status === 'RUNNING' ? 0 : Infinity),
  });
  const s = sim.data;
  const notFound = !!sim.error && toApiError(sim.error).status === 404;

  // After a refresh or when opening a link, show the settings that produced these results.
  useEffect(() => {
    if (s && !touched) setForm(formFromParams(s.params));
  }, [s, touched]);

  // Toast once when a long simulation finishes in the background.
  const [wasRunning, setWasRunning] = useState(false);
  useEffect(() => {
    if (s?.status === 'RUNNING') setWasRunning(true);
    else if (wasRunning && s) {
      setWasRunning(false);
      if (s.status === 'COMPLETED') toast.success('Simulation finished', { description: 'Nothing was saved.' });
      if (s.status === 'FAILED') toast.error('Simulation failed', { description: s.error ?? undefined });
    }
  }, [s, wasRunning]);

  const open = (simId: string) => {
    setConflictId(null);
    setStartError(null);
    setTouched(false);
    setParams({ id: simId });
  };

  const start = useMutation({
    mutationFn: () => simulationApi.start(toInput(form)),
    onSuccess: (data) => {
      qc.setQueryData(simKeys.one(data.id), data);
      setStartError(null);
      setConflictId(null);
      setTouched(false);
      setParams({ id: data.id });
      if (data.status === 'COMPLETED') toast.success('Simulation complete', { description: 'Nothing was saved.' });
    },
    onError: (err) => {
      const e = toApiError(err);
      setStartError(e.message);
      setConflictId(e.status === 409 ? (UUID_RE.exec(e.message)?.[0] ?? null) : null);
    },
  });

  const now = useNow(30_000);
  const expired = notFound || (!!s && new Date(s.expiresAt).getTime() <= now);
  const running = s?.status === 'RUNNING' && !expired;

  const forget = () => {
    remember(null);
    setParams({}, { replace: true });
  };

  return (
    <div>
      <PageHeader
        eyebrow="What-if"
        title="Payroll simulation"
        description="See what each employee would be paid for a month, a range of months or a whole year, using the same calculation as the real run. Nothing is saved: no payroll rows, no approvals, and arrears stay pending."
      />

      <div className="space-y-4">
        <SimulationForm
          value={form}
          onChange={(f) => {
            setForm(f);
            setTouched(true);
          }}
          onRun={() => start.mutate()}
          running={start.isPending}
          blockedReason={running ? 'A simulation is still running. Wait for it to finish.' : null}
        />

        {startError && (
          <Alert
            tone={conflictId ? 'warning' : 'danger'}
            title={conflictId ? 'Another simulation is already running' : "The simulation didn't start"}
            action={
              conflictId && (
                <Button size="sm" variant="outline" onClick={() => open(conflictId)}>
                  Open it
                </Button>
              )
            }
          >
            {startError}
          </Alert>
        )}

        {!id ? (
          <Intro />
        ) : sim.isLoading ? (
          <PageLoader label="Loading simulation…" />
        ) : expired ? (
          <Alert
            tone="warning"
            title="These results have expired"
            action={
              <Button size="sm" icon={<RotateCcw className="size-3.5" />} loading={start.isPending} onClick={() => start.mutate()}>
                Run again
              </Button>
            }
          >
            Simulation results are kept for one hour. Run it again with the settings above.
            <button type="button" className="ml-2 underline" onClick={forget}>
              Dismiss
            </button>
          </Alert>
        ) : sim.error ? (
          <Card>
            <ErrorState error={sim.error} onRetry={() => sim.refetch()} />
          </Card>
        ) : s?.status === 'RUNNING' ? (
          <Progress sim={s} />
        ) : s?.status === 'FAILED' ? (
          <Alert
            tone="danger"
            title="The simulation failed"
            action={
              <Button size="sm" icon={<RotateCcw className="size-3.5" />} loading={start.isPending} onClick={() => start.mutate()}>
                Run again
              </Button>
            }
          >
            {s.error ?? 'Unknown error.'}
            {/interrupted/i.test(s.error ?? '') && <div className="mt-1 text-xs">The server restarted while it was running.</div>}
          </Alert>
        ) : s?.status === 'COMPLETED' && s.result ? (
          <>
            <ResultHeader sim={s} now={now} />
            <SimulationResults sim={s as Simulation & { result: NonNullable<Simulation['result']> }} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function Intro() {
  return (
    <Card>
      <EmptyState
        icon={<FlaskConical className="size-6" />}
        title="Run a simulation to see projected pay"
        description="Pick a period and employees above. Small runs finish straight away; a year for thousands of employees takes a few seconds."
      />
      <div className="border-t border-slate-100 px-5 py-4">
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">How each month is calculated</h3>
        <BasisLegend />
      </div>
    </Card>
  );
}

function Progress({ sim }: { sim: Simulation }) {
  const { percent, processedEmployees, totalEmployees } = sim.progress;
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
          <Hourglass className="size-5 animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-slate-900">Simulating {periodLabel(sim)}…</h3>
            <span className="num text-sm font-semibold text-primary-700">{Math.round(percent)}%</span>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-label="Simulation progress"
          >
            <div className="h-full rounded-full bg-primary-500 transition-[width] duration-500" style={{ width: `${Math.max(2, percent)}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            <span className="num">{formatInt(processedEmployees)}</span> of <span className="num">{formatInt(totalEmployees)}</span> employees ·
            running for {formatDuration(sim.createdAt, null)}. You can leave this page; the results are kept for an hour.
          </p>
        </div>
      </div>
    </Card>
  );
}

function periodLabel(sim: Simulation) {
  const { fromPeriod, toPeriod } = sim.params;
  return fromPeriod === toPeriod ? formatPeriod(fromPeriod) : `${formatPeriod(fromPeriod)} – ${formatPeriod(toPeriod)}`;
}

function ResultHeader({ sim, now }: { sim: Simulation; now: number }) {
  const minutesLeft = Math.max(0, Math.round((new Date(sim.expiresAt).getTime() - now) / 60_000));
  const p = sim.params;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
      <span className="text-base font-semibold text-slate-900">{periodLabel(sim)}</span>
      <Badge tone="accent" dot>Simulation · not saved</Badge>
      <span>
        {formatInt(sim.result?.employees.total ?? 0)} employee{sim.result?.employees.total === 1 ? '' : 's'}
        {p.employeeIds?.length ? ' (selected)' : ''}
      </span>
      <span>{p.useActuals ? 'Real amounts for months already run' : 'Recalculated, ignoring months already run'}</span>
      <span>{p.includeAdjustments ? 'With pending arrears' : 'Without pending arrears'}</span>
      {sim.durationMs !== null && <span>Took {sim.durationMs < 1000 ? `${sim.durationMs} ms` : `${(sim.durationMs / 1000).toFixed(1)} s`}</span>}
      <span className={minutesLeft <= 10 ? 'flex items-center gap-1 text-accent-700' : 'flex items-center gap-1'} title={`Expires ${new Date(sim.expiresAt).toLocaleTimeString()}`}>
        <Clock className="size-3.5" /> Results expire {formatRelative(sim.expiresAt)}
      </span>
    </div>
  );
}

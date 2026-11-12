import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useActiveEmployees, useIsHrSync } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import { formatInt } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Dialog } from '@/components/ui/Overlay';
import { Segmented } from '@/components/ui/Tabs';

const SHOW = 200;

/** Multi-select of ACTIVE employees. In HR_SYNC companies only HR-synced employees can be simulated. */
export function EmployeePicker({
  open,
  value,
  onClose,
  onChange,
}: {
  open: boolean;
  value: string[];
  onClose: () => void;
  onChange: (ids: string[]) => void;
}) {
  const employees = useActiveEmployees();
  const isHrSync = useIsHrSync();
  const [draft, setDraft] = useState<Set<string>>(new Set(value));
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'all' | 'selected'>('all');

  useEffect(() => {
    if (open) {
      setDraft(new Set(value));
      setSearch('');
      setView('all');
    }
  }, [open, value]);

  const list = useMemo(
    () =>
      (employees.data ?? [])
        .filter((e) => !isHrSync || e.source === 'HR_SYNC')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees.data, isHrSync],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return list.filter(
      (e) =>
        (view === 'all' || draft.has(e.id)) &&
        (!s || e.name.toLowerCase().includes(s) || e.employeeIdNumber?.toLowerCase().includes(s)),
    );
  }, [list, search, view, draft]);

  const toggle = (ids: string[], on: boolean) =>
    setDraft((prev) => {
      const n = new Set(prev);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  const allFilteredOn = filtered.length > 0 && filtered.every((e) => draft.has(e.id));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Choose employees"
      description={isHrSync ? 'Active, HR-synced employees.' : 'Active employees.'}
      footer={
        <>
          <span className="mr-auto self-center text-sm text-slate-500">
            <span className="num font-medium text-slate-800">{formatInt(draft.size)}</span> selected
          </span>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={draft.size === 0}
            onClick={() => {
              onChange([...draft]);
              onClose();
            }}
          >
            Use {formatInt(draft.size)} employee{draft.size === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input
              autoFocus
              placeholder="Search name or employee ID"
              aria-label="Search employees"
              leading={<Search className="size-4" />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Segmented
            value={view}
            onChange={setView}
            items={[
              { value: 'all', label: <>All <span className="num text-slate-400">{formatInt(list.length)}</span></> },
              { value: 'selected', label: <>Selected <span className="num text-slate-400">{formatInt(draft.size)}</span></> },
            ]}
          />
        </div>

        {employees.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : employees.error ? (
          <ErrorState error={employees.error} onRetry={() => employees.refetch()} />
        ) : (
          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-600">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="size-4 accent-primary-600"
                  checked={allFilteredOn}
                  disabled={!filtered.length}
                  onChange={(e) => toggle(filtered.map((x) => x.id), e.target.checked)}
                />
                {search ? `All ${formatInt(filtered.length)} matching` : `All ${formatInt(filtered.length)}`}
              </label>
              {draft.size > 0 && (
                <button type="button" className="ml-auto font-medium text-slate-500 hover:text-slate-800" onClick={() => setDraft(new Set())}>
                  Clear selection
                </button>
              )}
            </div>
            <ul className="scroll-thin max-h-[45vh] divide-y divide-slate-100 overflow-y-auto">
              {filtered.slice(0, SHOW).map((e) => {
                const on = draft.has(e.id);
                return (
                  <li key={e.id}>
                    <label className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-primary-50/40', on && 'bg-primary-50/30')}>
                      <input type="checkbox" className="size-4 accent-primary-600" checked={on} onChange={(ev) => toggle([e.id], ev.target.checked)} />
                      <span className="min-w-0 flex-1 truncate text-slate-800">{e.name}</span>
                      <span className="font-mono text-xs text-slate-500">{e.employeeIdNumber ?? '—'}</span>
                    </label>
                  </li>
                );
              })}
              {filtered.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-500">No employees match.</li>}
            </ul>
            {filtered.length > SHOW && (
              <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                Showing the first {formatInt(SHOW)} of {formatInt(filtered.length)}. Search to narrow the list; “All matching” still selects every match.
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

import { useDeferredValue, useMemo, useState, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CloudDownload, Info, Search, Users } from 'lucide-react';
import { useEmployees, useIsHrSync } from '@/hooks/queries';
import { formatInt, formatRelative, initials } from '@/lib/format';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Page';
import { Segmented } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { SourceBadge } from '@/components/domain';
import { SyncNowButton } from '../hr-sync/SyncNowButton';
import type { Employee } from '@/types/api';

const PAGE_SIZES = [10, 20, 50, 100] as const;
type SourceFilter = 'ALL' | 'HR_SYNC' | 'MANUAL';

/** Page indexes to show, with `null` for a gap: first, last, and the current page ±1. */
function pageList(current: number, pages: number): (number | null)[] {
  const keep = new Set([0, pages - 1, current - 1, current, current + 1]);
  const out: (number | null)[] = [];
  for (let p = 0; p < pages; p++) {
    if (keep.has(p)) out.push(p);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

function PageButton({ active, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'num inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'border-primary-600 bg-primary-600 text-white'
          : 'border-slate-200 bg-surface text-primary-600 hover:border-primary-600 hover:bg-primary-600 hover:text-white disabled:hover:border-slate-200 disabled:hover:bg-surface disabled:hover:text-primary-600',
        className,
      )}
      {...rest}
    />
  );
}

export function EmployeesPage() {
  const employees = useEmployees();
  const isHrSync = useIsHrSync();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim().toLowerCase());
  const [source, setSource] = useState<SourceFilter>('ALL');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);

  const filtered = useMemo(() => {
    const all = employees.data ?? [];
    return all.filter((e) => {
      if (source !== 'ALL' && e.source !== source) return false;
      if (!q) return true;
      return [e.name, e.employeeIdNumber, e.username, e.email, e.phoneNumber, departmentOf(e)].some((v) => typeof v === 'string' && v.toLowerCase().includes(q));
    });
  }, [employees.data, q, source]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * pageSize, current * pageSize + pageSize);

  return (
    <>
      <PageHeader
        title="Employees"
        description={employees.data ? `${formatInt(employees.data.length)} employees` : undefined}
        actions={isHrSync && <SyncNowButton variant="outline" />}
      />

      {isHrSync && (
        <Alert tone="info" className="mb-6" title="Employees are managed by HR sync">
          New hires, placements and personal details come from your HR system. Adding, importing and reassigning employees here is turned off.
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <div className="w-full max-w-sm">
            <Input
              aria-label="Search employees"
              placeholder="Search by name, ID or department…"
              leading={<Search className="size-4" />}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="flex-1" />
          <Segmented<SourceFilter>
            value={source}
            onChange={(v) => {
              setSource(v);
              setPage(0);
            }}
            items={[
              { value: 'ALL', label: 'All' },
              { value: 'HR_SYNC', label: 'From HR' },
              { value: 'MANUAL', label: 'Manual' },
            ]}
          />
        </div>

        {employees.isLoading ? (
          <PageLoader />
        ) : employees.error ? (
          <ErrorState error={employees.error} onRetry={() => employees.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={isHrSync ? <CloudDownload className="size-6" /> : <Users className="size-6" />}
            title={employees.data?.length ? 'No employees match your search' : 'No employees yet'}
            description={!employees.data?.length && isHrSync ? 'Run an HR sync to pull employees from your HR system.' : undefined}
            action={!employees.data?.length && isHrSync && <SyncNowButton />}
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Employee ID</TH>
                  <TH>Department</TH>
                  <TH>Source</TH>
                  <TH>Last synced</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((e) => (
                  <TR key={e.id} onClick={() => navigate(`/employees/${e.id}`)}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700">{initials(e.name)}</span>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">{e.name}</div>
                          {(e.email || e.username) && <div className="truncate text-xs text-slate-500">{e.email || e.username}</div>}
                        </div>
                      </div>
                    </TD>
                    <TD className="font-mono text-xs">{e.employeeIdNumber ?? '—'}</TD>
                    <TD className="max-w-56 truncate">{departmentOf(e) ?? <span className="text-slate-400">—</span>}</TD>
                    <TD><SourceBadge source={e.source} /></TD>
                    <TD className="text-slate-500">{e.source === 'HR_SYNC' ? formatRelative(e.lastSyncedAt) : '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <span>Rows per page</span>
                  <Select
                    aria-label="Rows per page"
                    className="h-8 w-20 py-0 text-sm"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(0);
                    }}
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </label>
                <span className="num">
                  {formatInt(current * pageSize + 1)}–{formatInt(Math.min(filtered.length, (current + 1) * pageSize))} of {formatInt(filtered.length)}
                </span>
              </div>
              <nav aria-label="Pagination" className="flex items-center gap-1">
                <PageButton aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>
                  <ChevronLeft className="size-4" />
                </PageButton>
                {pageList(current, pages).map((p, i) =>
                  p === null ? (
                    <span key={`gap-${i}`} className="px-1 text-slate-400">…</span>
                  ) : (
                    <PageButton key={p} active={p === current} aria-current={p === current ? 'page' : undefined} onClick={() => setPage(p)}>
                      {p + 1}
                    </PageButton>
                  ),
                )}
                <PageButton aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                  <ChevronRight className="size-4" />
                </PageButton>
              </nav>
            </div>
          </>
        )}
      </Card>
      {!isHrSync && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
          <Info className="size-3.5" /> Manual employee creation and Excel import use the existing employee screens.
        </p>
      )}
    </>
  );
}

/** The list endpoint returns the open department row; a sub-department is nested under its parent. */
function departmentOf(e: Employee) {
  const row = e.departmentHistory?.[0] as { department?: { deptName?: string }; subDepartment?: { deptName?: string } | null } | undefined;
  if (!row?.department?.deptName) return undefined;
  return row.subDepartment?.deptName ? `${row.department.deptName} › ${row.subDepartment.deptName}` : row.department.deptName;
}

export function StatusBadge({ status }: { status?: Employee['status'] }) {
  if (!status) return <span className="text-slate-400">—</span>;
  const s = status.toUpperCase();
  return <Badge tone={s === 'ACTIVE' ? 'success' : s === 'TERMINATED' || s === 'INACTIVE' ? 'neutral' : 'warning'} dot>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

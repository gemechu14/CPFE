import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  BadgeCheck,
  Banknote,
  CalendarRange,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  CloudDownload,
  FileBarChart,
  FlaskConical,
  HandCoins,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PlayCircle,
  Search,
  Settings2,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { useCompany, useSettings } from '@/hooks/queries';
import { assetUrl } from '@/lib/http';
import { authApi } from '@/lib/api';
import { qk } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import { formatRelative, initials } from '@/lib/format';
import { useTheme, type ThemePref } from '@/theme/ThemeProvider';
import { CONFIG_PATHS } from '@/features/settings/ConfigurationLayout';
import { CommandPalette, type Command } from './CommandPalette';
import { Logo, LogoMark } from './Logo';
import { Alert, PageLoader } from '../ui/Feedback';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Users;
  end?: boolean;
  show?: boolean;
  /** Extra path prefixes that also mark this item active. */
  match?: string[];
  /** For pages with tabs: the ?tab= this item opens. */
  tab?: string;
  /** This item is the page's default tab (active when no ?tab= is set). */
  defaultTab?: boolean;
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

const STORE_RAIL = 'sidebar:rail';
const STORE_CLOSED = 'sidebar:closed';

function readStore<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

const hrefOf = (i: NavItem) => (i.tab && !i.defaultTab ? `${i.to}?tab=${i.tab}` : i.to);

function isItemActive(i: NavItem, pathname: string, tab: string | null) {
  if (i.end) return pathname === i.to;
  const onPath = [i.to, ...(i.match ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!onPath || !i.tab) return onPath;
  return tab ? tab === i.tab : !!i.defaultTab;
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [rail, setRail] = useState<boolean>(() => readStore(STORE_RAIL, false));
  const [closed, setClosed] = useState<string[]>(() => readStore(STORE_CLOSED, []));
  const location = useLocation();
  const navigate = useNavigate();
  const { pathname } = location;
  const tab = new URLSearchParams(location.search).get('tab');
  const { can, permissions } = useAuth();
  const theme = useTheme();
  const settings = useSettings();
  const isHrSync = settings.data?.employeeSource === 'HR_SYNC';

  const company = useCompany();
  const inConfig = CONFIG_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  // Ctrl/⌘+K opens quick search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const canSetup = can(PERMS.viewSystem);
  const canApprove = can(PERMS.createPayrollApproval);
  const canSimulate = can(PERMS.simulatePayroll);

  // Ordered the way a month's payroll flows: prepare → run → review → approve → pay → report.
  const groups: NavGroup[] = useMemo(
    () => [
      { id: 'overview', title: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
      {
        id: 'people',
        title: 'Employee management',
        items: [
          { to: '/employees', label: 'Employees', icon: Users },
          { to: '/hr-sync', label: 'HR sync', icon: CloudDownload, show: isHrSync },
        ],
      },
      {
        id: 'payroll',
        title: 'Payroll',
        items: [
          { to: '/payroll/periods', label: 'Payroll periods', icon: CalendarRange },
          { to: '/payroll/additional-pay', label: 'Additional pay', icon: HandCoins, show: canSetup },
          { to: '/payroll/run', label: 'Run payroll', icon: PlayCircle },
          { to: '/payroll/month', label: 'This month', icon: ClipboardList },
          { to: '/payroll/adjustments', label: 'Arrears & recoveries', icon: ArrowLeftRight },
          { to: '/payroll/simulation', label: 'Simulation', icon: FlaskConical, show: canSimulate },
          { to: '/payroll/approvals', label: 'Approvals', icon: BadgeCheck, show: canApprove },
        ],
      },
      {
        id: 'payments',
        title: 'Payments',
        items: [
          { to: '/payments', label: 'Payments', icon: Banknote },
        ],
      },
      {
        id: 'reports',
        title: 'Reports',
        items: [
          { to: '/reports', label: 'Reports', icon: FileBarChart },
        ],
      },
      {
        id: 'config',
        title: 'System configuration',
        items: [{ to: '/settings/company', label: 'Configuration', icon: Settings2, match: CONFIG_PATHS }],
      },
    ],
    [isHrSync, canSetup, canApprove, canSimulate],
  );
  const visibleGroups = groups.map((g) => ({ ...g, items: g.items.filter((i) => i.show !== false) })).filter((g) => g.items.length);

  // Navigating into a closed group (e.g. from a button on a page) opens it again.
  const activeGroupId = visibleGroups.find((g) => g.items.some((i) => isItemActive(i, pathname, tab)))?.id;
  useEffect(() => {
    if (activeGroupId) setClosed((c) => (c.includes(activeGroupId) ? c.filter((x) => x !== activeGroupId) : c));
  }, [activeGroupId, pathname]);

  const toggleGroup = (id: string) =>
    setClosed((c) => {
      const next = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
      writeStore(STORE_CLOSED, next);
      return next;
    });
  const toggleRail = useCallback(
    () =>
      setRail((r) => {
        writeStore(STORE_RAIL, !r);
        return !r;
      }),
    [],
  );

  const commands: Command[] = [
      ...visibleGroups.flatMap((g) =>
        g.items.map((i) => ({
          id: `${g.id}:${i.label}`,
          label: i.label,
          group: g.title === 'Overview' ? 'Go to' : g.title,
          icon: <i.icon className="size-4" />,
          run: () => navigate(hrefOf(i)),
        })),
      ),
      {
        id: 'act:theme',
        label: theme.resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        group: 'Actions',
        icon: theme.resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />,
        run: theme.toggle,
      },
      {
        id: 'act:rail',
        label: rail ? 'Expand sidebar' : 'Collapse sidebar',
        group: 'Actions',
        icon: rail ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />,
        run: toggleRail,
      },
      { id: 'act:password', label: 'Change password', group: 'Actions', icon: <KeyRound className="size-4" />, run: () => navigate('/change-password') },
  ];

  const syncOn = !!settings.data?.syncEnabled;
  const lastSynced = formatRelative(settings.data?.lastSyncedAt);

  const renderSidebar = (compact: boolean) => (
    <div className="flex h-full flex-col border-r border-slate-200 bg-slate-50">
      <div className={cn('flex h-16 shrink-0 items-center', compact ? 'justify-center px-2' : 'px-5')}>
        {compact ? <LogoMark className="text-brand-700" /> : <Logo />}
      </div>
      <nav className={cn('scroll-hover min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-3', compact ? 'px-2' : 'px-3')}>
        <ul className="space-y-1">
          {visibleGroups.map((g, gi) => {
            const items = g.items;
            if (compact) {
              return (
                <li key={g.id} className={cn('space-y-1', gi > 0 && 'border-t border-slate-200 pt-1')}>
                  {items.map((i) => (
                    <SideLink key={i.label} item={i} active={isItemActive(i, pathname, tab)} compact />
                  ))}
                </li>
              );
            }
            // A section with one link has nothing to fold away, so only multi-link sections collapse.
            const collapsible = items.length > 1;
            const open = !collapsible || !closed.includes(g.id);
            const hasActive = items.some((i) => isItemActive(i, pathname, tab));
            const labelCls = 'truncate text-left text-[11px] font-bold tracking-wider whitespace-nowrap uppercase';
            return (
              <li key={g.id} className={gi > 0 ? 'pt-2' : undefined}>
                {collapsible ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    aria-expanded={open}
                    className={cn(
                      'group flex w-full items-center gap-2 rounded-md px-3 py-1.5 transition-colors hover:bg-slate-200/60',
                      open ? 'text-slate-500 hover:text-slate-800' : 'text-slate-700 hover:text-slate-900',
                    )}
                  >
                    <span className={cn(labelCls, 'flex-1')}>{g.title}</span>
                    {!open && hasActive && <span className="size-1.5 shrink-0 rounded-full bg-accent-500" />}
                    <ChevronDown className={cn('size-4 shrink-0 transition-transform duration-200', !open && '-rotate-90')} />
                  </button>
                ) : (
                  <div className={cn(labelCls, 'px-3 py-1.5 text-slate-500')}>{g.title}</div>
                )}
                <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                  <ul className="min-h-0 space-y-0.5 overflow-hidden" inert={!open}>
                    {items.map((i) => (
                      <li key={i.label} className="first:pt-1">
                        <SideLink item={i} active={isItemActive(i, pathname, tab)} />
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>
      {isHrSync &&
        (compact ? (
          <div className="mb-3 flex justify-center" title={`HR sync ${syncOn ? 'on' : 'off'} · last synced ${lastSynced}`}>
            <span className={cn('size-2 rounded-full', syncOn ? 'bg-emerald-500' : 'bg-slate-400')} />
          </div>
        ) : (
          <Link to="/hr-sync" className="mx-3 mt-2 mb-3 block shrink-0 rounded-lg border border-slate-200 bg-surface px-3 py-2.5 text-xs shadow-card transition-colors hover:border-primary-200 hover:bg-primary-50">
            <div className="flex items-center gap-2 font-medium text-slate-800">
              <span className="relative flex size-2">
                {syncOn && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />}
                <span className={cn('relative size-2 rounded-full', syncOn ? 'bg-emerald-500' : 'bg-slate-400')} />
              </span>
              HR sync {syncOn ? 'on' : 'off'}
            </div>
            <div className="mt-0.5 text-slate-500">Last synced {lastSynced}</div>
          </Link>
        ))}
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden transition-[width] duration-200 lg:block', rail ? 'w-[72px]' : 'w-64')}>
        {renderSidebar(rail)}
        <button
          type="button"
          onClick={toggleRail}
          title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute top-5 -right-3 flex size-6 items-center justify-center rounded-full border border-slate-200 bg-surface text-slate-500 shadow-sm transition hover:scale-110 hover:text-primary-600"
        >
          {rail ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
        </button>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-page-in bg-brand-950/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-72 shadow-xl">
            {renderSidebar(false)}
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-3 rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </aside>
        </div>
      )}

      <div className={cn('transition-[padding] duration-200', rail ? 'lg:pl-[72px]' : 'lg:pl-64')}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-slate-50/85 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {company.data && (
              <>
                {company.data.logo ? (
                  <img src={assetUrl(company.data.logo)} alt="" className="size-8 shrink-0 rounded-lg border border-slate-200 bg-white object-contain" />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-xs font-semibold text-primary-800">
                    {initials(company.data.organizationName)}
                  </span>
                )}
                <span className="hidden truncate text-sm font-semibold text-slate-800 sm:block">{company.data.organizationName}</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 md:w-64"
            aria-label="Search pages and actions"
          >
            <Search className="size-4" />
            <span className="hidden flex-1 text-left md:block">Search…</span>
            <kbd className="hidden rounded border border-slate-200 bg-surface px-1.5 py-0.5 text-[10px] font-medium md:block">Ctrl K</kbd>
          </button>
          <button
            type="button"
            onClick={theme.toggle}
            title={theme.resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme.resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="group flex size-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            {theme.resolved === 'dark' ? (
              <Sun className="size-4.5 transition-transform duration-300 group-hover:rotate-45" />
            ) : (
              <Moon className="size-4.5 transition-transform duration-300 group-hover:-rotate-12" />
            )}
          </button>
          <UserMenu />
        </header>
        <main className="w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {permissions.length === 0 && (
            <Alert tone="warning" title="Your account has no role yet" className="mb-6">
              Contact your payroll administrator to be assigned a role. Until then most pages will be empty.
            </Alert>
          )}
          <Suspense fallback={<PageLoader />}>
            {/* Re-keyed per page so it fades in. Configuration keeps one key; its tabs animate their own content. */}
            <div key={inConfig ? 'config' : pathname} className="animate-page-in">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}

function SideLink({ item, active, compact }: { item: NavItem; active: boolean; compact?: boolean }) {
  return (
    <Link
      to={hrefOf(item)}
      title={compact ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center rounded-lg text-sm font-medium transition-all duration-150',
        compact ? 'justify-center p-2.5' : 'gap-3 px-3 py-[7px]',
        active
          ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/30'
          : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 active:scale-[0.98]',
      )}
    >
      {active && <span className="absolute inset-y-2 left-1 w-[3px] rounded-full bg-accent-500" />}
      <item.icon
        className={cn(
          'size-4.5 shrink-0 transition-transform duration-150',
          active ? 'text-white' : 'text-slate-400 group-hover:translate-x-0.5 group-hover:text-slate-600',
        )}
      />
      {!compact && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

const THEME_OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function UserMenu() {
  const { session, logout } = useAuth();
  const { pref, setPref } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const me = useQuery({ queryKey: qk.me, queryFn: authApi.me, staleTime: 10 * 60_000 });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const name = me.data?.name || session?.username || 'User';
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-lg py-1.5 pr-2 pl-1.5 transition-colors hover:bg-slate-100">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary-500 text-xs font-semibold text-white">{initials(name)}</span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-40 truncate text-sm font-medium text-slate-900">{name}</span>
          <span className="block max-w-40 truncate text-xs text-slate-500">{session?.username}</span>
        </span>
        <ChevronDown className={cn('size-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 animate-page-in overflow-hidden rounded-xl border border-slate-200 bg-surface py-1 shadow-lg">
          <div className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Appearance</div>
          <div className="mx-3 mb-2 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
            {THEME_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setPref(o.value)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium transition-colors',
                  pref === o.value ? 'bg-surface text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                <o.icon className="size-4" />
                {o.label}
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-slate-100" />
          <button
            onClick={() => {
              setOpen(false);
              navigate('/change-password');
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <KeyRound className="size-4 text-slate-400" /> Change password
          </button>
          <button onClick={() => logout()} className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

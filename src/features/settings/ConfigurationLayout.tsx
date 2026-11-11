import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Building2, Network, Percent, PlugZap, Settings2, Wallet, Workflow } from 'lucide-react';
import { useAuth, PERMS } from '@/auth/AuthContext';
import { useSettings } from '@/hooks/queries';
import { cn } from '@/lib/cn';

/** Every page under System configuration. Shared by the tab bar and the sidebar's active state. */
export function useConfigTabs() {
  const { can } = useAuth();
  const settings = useSettings();
  const isHrSync = settings.data?.employeeSource === 'HR_SYNC';
  const canSetup = can(PERMS.viewSystem);

  return [
    { to: '/settings/company', label: 'Company profile', icon: Building2, show: true },
    { to: '/settings/payroll', label: 'Payroll settings', icon: Settings2, show: true },
    { to: '/settings/hr-connection', label: 'HR connection', icon: PlugZap, show: isHrSync && can(PERMS.manageSettings) },
    { to: '/setup/tax-pension', label: 'Tax & pension', icon: Percent, show: canSetup },
    { to: '/setup/structure', label: 'Grades & departments', icon: Network, show: canSetup },
    { to: '/setup/allowances', label: 'Allowances & deductions', icon: Wallet, show: canSetup },
    { to: '/setup/workflows', label: 'Approval workflows', icon: Workflow, show: canSetup },
  ].filter((t) => t.show);
}

export const CONFIG_PATHS = ['/settings', '/setup'];

export function ConfigurationLayout() {
  const tabs = useConfigTabs();
  const { pathname } = useLocation();

  return (
    <>
      <div className="mb-6">
        <div className="mb-3 text-xs font-semibold tracking-wider text-accent-600 uppercase">System configuration</div>
        <nav aria-label="Configuration" className="scroll-thin -mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 px-1">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                cn(
                  'group relative -mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                  isActive ? 'border-accent-500 text-primary-800' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <t.icon className={cn('size-4', isActive ? 'text-accent-500' : 'text-slate-400 group-hover:text-slate-600')} />
                  {t.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      {/* Keyed so each tab fades in; the tab bar itself stays put. */}
      <div key={pathname} className="animate-page-in">
        <Outlet />
      </div>
    </>
  );
}

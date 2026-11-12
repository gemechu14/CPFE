import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { GuestOnly, RequireAuth } from '@/auth/guards';
import { AppLayout } from '@/components/layout/AppLayout';
import { ConfigurationLayout } from '@/features/settings/ConfigurationLayout';
import { Button } from '@/components/ui/Button';
import { EmptyState, PageLoader } from '@/components/ui/Feedback';

/** Signed-in pages. Their code is fetched in the background once the app is idle, so navigating never waits on a download. */
const pageLoaders: (() => Promise<unknown>)[] = [];
function page<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  pageLoaders.push(load);
  return lazy(load);
}
let preloaded = false;
function preloadPages() {
  if (preloaded) return;
  preloaded = true;
  const run = () => pageLoaders.forEach((load) => load().catch(() => undefined));
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
const LoginPage = lazy(() => import('@/features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const ChangePasswordPage = lazy(() => import('@/features/auth/ChangePasswordPage').then((m) => ({ default: m.ChangePasswordPage })));
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const RegisterCompanyPage = lazy(() => import('@/features/auth/RegisterCompanyPage').then((m) => ({ default: m.RegisterCompanyPage })));
const DashboardPage = page(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const EmployeesPage = page(() => import('@/features/employees/EmployeesPage').then((m) => ({ default: m.EmployeesPage })));
const EmployeeDetailPage = page(() => import('@/features/employees/EmployeeDetailPage').then((m) => ({ default: m.EmployeeDetailPage })));
const SyncRunsPage = page(() => import('@/features/hr-sync/SyncRunsPage').then((m) => ({ default: m.SyncRunsPage })));
const PeriodsPage = page(() => import('@/features/periods/PeriodsPage').then((m) => ({ default: m.PeriodsPage })));
const RunPayrollPage = page(() => import('@/features/payroll/RunPayrollPage').then((m) => ({ default: m.RunPayrollPage })));
const AdjustmentsPage = page(() => import('@/features/payroll/AdjustmentsPage').then((m) => ({ default: m.AdjustmentsPage })));
const PayrollSettingsPage = page(() => import('@/features/settings/PayrollSettingsPage').then((m) => ({ default: m.PayrollSettingsPage })));
const HrConnectionPage = page(() => import('@/features/settings/HrConnectionPage').then((m) => ({ default: m.HrConnectionPage })));
const CompanyProfilePage = page(() => import('@/features/settings/CompanyProfilePage').then((m) => ({ default: m.CompanyProfilePage })));
const TaxPensionPage = page(() => import('@/features/rules/TaxPensionPage').then((m) => ({ default: m.TaxPensionPage })));
const StructurePage = page(() => import('@/features/structure/StructurePage').then((m) => ({ default: m.StructurePage })));
const AllowancesDeductionsPage = page(() => import('@/features/compensation/AllowancesDeductionsPage').then((m) => ({ default: m.AllowancesDeductionsPage })));
const OneOffPayPage = page(() => import('@/features/compensation/OneOffPayPage').then((m) => ({ default: m.OneOffPayPage })));
const PayrollMonthPage = page(() => import('@/features/review/PayrollMonthPage').then((m) => ({ default: m.PayrollMonthPage })));
const PaymentsPage = page(() => import('@/features/review/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const ApprovalsPage = page(() => import('@/features/approvals/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage })));
const WorkflowsPage = page(() => import('@/features/approvals/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage })));
const ReportsPage = page(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SimulationPage = page(() => import('@/features/simulation/SimulationPage').then((m) => ({ default: m.SimulationPage })));

export function App() {
  const { isAuthenticated } = useAuth();
  useEffect(() => {
    if (isAuthenticated) preloadPages();
  }, [isAuthenticated]);

  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/register" element={<RegisterCompanyPage />} />
      </Route>
      {/* Reachable signed in or out: the email link may open in any browser. */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="employees/:employeeId" element={<EmployeeDetailPage />} />
          <Route path="hr-sync" element={<SyncRunsPage />} />
          <Route path="payroll/periods" element={<PeriodsPage />} />
          <Route path="payroll/run" element={<RunPayrollPage />} />
          <Route path="payroll/adjustments" element={<AdjustmentsPage />} />
          <Route path="payroll/month" element={<PayrollMonthPage />} />
          <Route path="payroll/approvals" element={<ApprovalsPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="payroll/payments" element={<Navigate to="/payments" replace />} />
          <Route path="payroll/additional-pay" element={<OneOffPayPage />} />
          <Route path="payroll/simulation" element={<SimulationPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<Navigate to="/settings/company" replace />} />
          <Route path="setup" element={<Navigate to="/settings/company" replace />} />
          <Route element={<ConfigurationLayout />}>
            <Route path="settings/company" element={<CompanyProfilePage />} />
            <Route path="settings/payroll" element={<PayrollSettingsPage />} />
            <Route path="settings/hr-connection" element={<HrConnectionPage />} />
            <Route path="setup/tax-pension" element={<TaxPensionPage />} />
            <Route path="setup/structure" element={<StructurePage />} />
            <Route path="setup/allowances" element={<AllowancesDeductionsPage />} />
            <Route path="setup/workflows" element={<WorkflowsPage />} />
          </Route>
          <Route
            path="*"
            element={
              <EmptyState
                title="Page not found"
                description="The page you're looking for doesn't exist."
                action={<Link to="/"><Button>Back to dashboard</Button></Link>}
              />
            }
          />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  );
}

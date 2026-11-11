import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Signed-in only. Forces the change-password screen on first login. */
export function RequireAuth() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.isFirstTimeLoggedIn && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}

/** Signed-out only (login, forgot password, register). */
export function GuestOnly() {
  const { session } = useAuth();
  const location = useLocation();
  // The backend's reset link is FRONTEND_URL?token=… — route it to the reset form.
  const token = new URLSearchParams(location.search).get('token');
  if (token && location.pathname !== '/reset-password') {
    return <Navigate to={`/reset-password?token=${encodeURIComponent(token)}`} replace />;
  }
  if (session && !token) return <Navigate to={session.isFirstTimeLoggedIn ? '/change-password' : '/'} replace />;
  return <Outlet />;
}

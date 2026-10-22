import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageSpinner, ProfileLoadError } from '../components/states';
import { useAuth } from './AuthProvider';

/** Requires a signed-in learner with a loaded profile. */
export function RequireAuth() {
  const { session, profile, profileError, loading } = useAuth();
  const location = useLocation();

  if (loading || (session && !profile && !profileError)) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!profile) return <ProfileLoadError message={profileError} />;
  return <Outlet />;
}

/** Sends learners who have not finished onboarding to the onboarding flow. */
export function RequireOnboarded() {
  const { profile } = useAuth();
  if (profile && !profile.onboarded_at) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Login, register and welcome pages: signed-in learners go straight to the app. */
export function PublicOnly() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (session) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/dashboard'} replace />;
  }
  return <Outlet />;
}

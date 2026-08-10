import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile?.orgId) return <Navigate to="/onboarding" state={{ from: location }} replace />;
  return <>{children}</>;
}

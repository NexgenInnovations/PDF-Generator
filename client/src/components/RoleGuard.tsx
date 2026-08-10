import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import type { Role } from '../types.js';

interface RoleGuardProps {
  allowed: Role[];
  children: ReactNode;
}

export function RoleGuard({ allowed, children }: RoleGuardProps) {
  const { role } = useAuth();
  if (!role || !allowed.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

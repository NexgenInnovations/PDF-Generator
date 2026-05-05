import React, { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext.js';
import type { Role } from '../types.js';

interface RoleGuardProps {
  allowed: Role[];
  children: ReactNode;
}

export function RoleGuard({ allowed, children }: RoleGuardProps) {
  const { role } = useRole();
  if (!allowed.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

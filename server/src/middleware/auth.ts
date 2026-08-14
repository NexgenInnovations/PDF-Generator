import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

export type Role = 'Admin' | 'Designer' | 'FormFiller';

export interface AuthedRequest extends Request {
  auth?: { userId: string; orgId: string | null; role: Role | null };
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  const userId = userData.user.id;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('org_id, role')
    .eq('id', userId)
    .single();

  if (error || !data) {
    res.status(401).json({ error: 'No profile found for this user' });
    return;
  }

  req.auth = { userId, orgId: data.org_id, role: data.role as Role | null };
  next();
}

export function requireRole(allowed: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth?.role || !allowed.includes(req.auth.role)) {
      res.status(403).json({ error: 'Insufficient role' });
      return;
    }
    next();
  };
}

// profiles has a DB-level check constraint that org_id and role are always
// set together, so any route already gated by requireRole has a guaranteed
// non-null orgId. Routes that only use requireAuth (no role restriction)
// need this explicit check instead, since a signed-in user with no
// organization yet would otherwise reach org-scoped queries with a null
// orgId.
export function requireOrg(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.auth?.orgId) {
    res.status(403).json({ error: 'You must belong to an organization' });
    return;
  }
  next();
}

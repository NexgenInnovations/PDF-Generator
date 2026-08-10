import { Router, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

export const authRouter = Router();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

authRouter.post('/organizations', requireAuth, async (req: AuthedRequest, res: Response) => {
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (req.auth!.orgId) {
    res.status(409).json({ error: 'You already belong to an organization' });
    return;
  }

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({ name: name.trim() })
    .select('id, name')
    .single();
  if (orgError || !org) {
    res.status(500).json({ error: orgError?.message ?? 'Failed to create organization' });
    return;
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({ org_id: org.id, role: 'Admin' })
    .eq('id', req.auth!.userId);
  if (profileError) {
    res.status(500).json({ error: profileError.message });
    return;
  }

  res.status(200).json({ orgId: org.id, orgName: org.name, role: 'Admin' });
});

authRouter.get('/invites/:code', async (req: Request, res: Response) => {
  const { code } = req.params;

  const { data: invite, error } = await supabaseAdmin
    .from('invites')
    .select('role, expires_at, used_at, organizations(name)')
    .eq('code', code)
    .single();

  if (error || !invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
    res.status(404).json({ error: 'Invite not found or no longer valid' });
    return;
  }

  const org = invite.organizations as unknown as { name: string } | null;
  res.status(200).json({ orgName: org?.name ?? '', role: invite.role });
});

authRouter.post(
  '/invites/:code/accept',
  requireAuth,
  async (req: AuthedRequest, res: Response) => {
    const { code } = req.params;
    if (req.auth!.orgId) {
      res.status(409).json({ error: 'You already belong to an organization' });
      return;
    }

    const { data: invite, error } = await supabaseAdmin
      .from('invites')
      .select('id, org_id, role, expires_at, used_at')
      .eq('code', code)
      .single();
    if (error || !invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
      res.status(404).json({ error: 'Invite not found or no longer valid' });
      return;
    }

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ org_id: invite.org_id, role: invite.role })
      .eq('id', req.auth!.userId);
    if (profileError) {
      res.status(500).json({ error: profileError.message });
      return;
    }

    await supabaseAdmin
      .from('invites')
      .update({ used_at: new Date().toISOString(), used_by: req.auth!.userId })
      .eq('id', invite.id);

    res.status(200).json({ orgId: invite.org_id, role: invite.role });
  }
);

authRouter.post(
  '/invites',
  requireAuth,
  requireRole(['Admin']),
  async (req: AuthedRequest, res: Response) => {
    const { role } = req.body as { role?: string };
    if (!role || !['Admin', 'Designer', 'FormFiller'].includes(role)) {
      res.status(400).json({ error: 'role must be Admin, Designer, or FormFiller' });
      return;
    }

    const code = randomBytes(9).toString('base64url');
    const { data: invite, error } = await supabaseAdmin
      .from('invites')
      .insert({
        org_id: req.auth!.orgId,
        role,
        code,
        created_by: req.auth!.userId,
        expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      })
      .select('code, expires_at')
      .single();
    if (error || !invite) {
      res.status(500).json({ error: error?.message ?? 'Failed to create invite' });
      return;
    }

    res.status(200).json({ code: invite.code, expiresAt: invite.expires_at });
  }
);

# Supabase Auth, Organizations & Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's fake, self-selected `localStorage` role with real Supabase Auth (Google OAuth only), a genuine `organizations`/`profiles`/`invites` data model (one org per user, invite-only joining with an inviter-set role), and server-side role enforcement.

**Architecture:** A local Supabase project (Postgres + GoTrue Auth, run via the Supabase CLI, Docker) holds three new tables (`organizations`, `profiles`, `invites`) plus, as of Task 2.5, the app's existing data tables (`pdf_templates`, `template_versions`, `filled_submissions`, `generated_pdfs`, `company_assets`, `letterheads`, `signature_events`, `waitlist_signups`) migrated from MSSQL — schema and queries only, no data copied. The existing Express server gets a new `/auth` router plus token-verifying middleware, has its data layer (`server/src/db.ts`) rewritten from `mssql` to `pg` against the same Supabase Postgres instance, and applies role checks to the routes that were previously only guarded client-side. The existing React client gets a new `AuthContext` (replacing `RoleContext`), a `/login` page, an `/onboarding` (+ `/join/:code`) flow, and route guards.

**Tech Stack:** Supabase CLI (`supabase` — local Postgres 17 + GoTrue Auth via Docker), `@supabase/supabase-js` (client + server; server-side token verification goes through `supabaseAdmin.auth.getUser()`, not a local JWT-secret check — see Task 2), Express, React Router.

## Global Constraints

- Everything is verified locally: local Supabase (`npx supabase start`, requires Docker running), local Express (`npm --prefix server run dev`, port 3004), local Vite client (`npm --prefix client run dev`). No deployment.
- No automated test framework exists for `server/` or `client/` (confirmed: no `*.test.ts`/`*.test.tsx` anywhere under either, and the root `vitest.config.ts` workspace map only covers `packages/*`). Verification uses `curl`, direct `psql`/REST calls against the local Supabase Postgres, and manual browser interaction — matching how this codebase's other server/client features (e.g. the waitlist endpoint) are already verified. Do not introduce a test framework as a side effect of this feature.
- Google OAuth needs a real Google Cloud OAuth Client ID/Secret. Creating that Google Cloud project and OAuth consent screen requires the user's own Google account — that is a manual step called out explicitly in Task 4; do not attempt to create Google accounts or enter Google credentials on the user's behalf. Everything else (config wiring, the `/login` page, the redirect-to-Google URL being correctly formed) is verified without needing real credentials.
- One organization per user. Google OAuth is the only sign-in method (no email/password in the app itself — a password is used internally only for the dev test-user script in Task 2, never exposed to real users). Roles are exactly `Admin` / `Designer` / `FormFiller` (reused verbatim from the existing `Role` type). Joining an org is invite-only; the invite fixes the joiner's role, which they confirm but cannot change. Invites are shareable links/codes, not emails.
- `GET /templates/:id`, `POST /generate-pdf` (and the whole `/templates/:id/fill` page) stay fully public/unauthenticated — used by external recipients who don't have accounts. Nothing in this plan adds auth to them.
- New Supabase migrations live in `supabase/migrations/`, separate from the pre-existing (unused-by-MSSQL) `server/migrations/*.sql` files — do not touch those.
- As of Task 2.5 (added mid-plan by explicit human decision): the app's existing data tables move from MSSQL to the same local Supabase Postgres project — schema and queries only, no existing MSSQL data is copied. This removed a real blocker (the remote MSSQL dev server was intermittently unreachable over VPN, blocking every task's server verification). File storage for `company_assets` is unaffected — still local disk, only the DB layer changes.

---

### Task 1: Local Supabase project + schema (organizations, profiles, invites, trigger, RLS)

**Files:**
- Modify: root `package.json` (add `supabase` devDependency)
- Create: `supabase/config.toml` (via `supabase init`, then hand-edited)
- Create: `supabase/migrations/0001_create_organizations.sql`
- Create: `supabase/migrations/0002_create_profiles.sql`
- Create: `supabase/migrations/0003_create_profiles_trigger.sql`
- Create: `supabase/migrations/0004_create_invites.sql`
- Create: `supabase/migrations/0005_enable_rls.sql`
- Modify: `.gitignore` (ignore Supabase's local-only generated files)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a running local Supabase stack with three tables and RLS enabled. Task 2 depends on this schema and connects to it via `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (printed by `supabase status`). Task 4 depends on `SUPABASE_URL` / the anon key for the browser client.

- [ ] **Step 1: Add the Supabase CLI as a devDependency**

```bash
npm install -D supabase
```

- [ ] **Step 2: Initialize the Supabase project**

```bash
npx supabase init
```

Expected: creates `supabase/config.toml` and `supabase/` scaffolding. Accept the default when prompted.

- [ ] **Step 3: Ignore Supabase's local generated files**

Add to `.gitignore` (after the existing `.env` line):

```
supabase/.branches
supabase/.temp
```

- [ ] **Step 4: Create the `organizations` migration**

Create `supabase/migrations/0001_create_organizations.sql`:

```sql
create extension if not exists pgcrypto;

create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 5: Create the `profiles` migration**

Create `supabase/migrations/0002_create_profiles.sql`:

```sql
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid references organizations(id),
  role       text check (role in ('Admin', 'Designer', 'FormFiller')),
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now(),

  constraint org_and_role_together check (
    (org_id is null and role is null) or (org_id is not null and role is not null)
  )
);
```

- [ ] **Step 6: Create the profile-on-signup trigger**

Create `supabase/migrations/0003_create_profiles_trigger.sql`:

```sql
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

- [ ] **Step 7: Create the `invites` migration**

Create `supabase/migrations/0004_create_invites.sql`:

```sql
create table invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  role       text not null check (role in ('Admin', 'Designer', 'FormFiller')),
  code       text not null unique,
  created_by uuid not null references profiles(id),
  expires_at timestamptz not null,
  used_at    timestamptz,
  used_by    uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_invites_code_unused on invites(code) where used_at is null;
```

- [ ] **Step 8: Enable RLS**

Create `supabase/migrations/0005_enable_rls.sql`:

```sql
alter table profiles enable row level security;
alter table organizations enable row level security;
alter table invites enable row level security;

create policy "Users can read their own profile"
  on profiles for select
  using (auth.uid() = id);
```

`organizations` and `invites` get no policies — enabling RLS with zero policies blocks the `anon`/`authenticated` API roles entirely, so only the server's service-role key (which bypasses RLS) can touch them. That's intentional: all org/invite writes and invite lookups go through the Express server (Task 2), never directly from the browser.

- [ ] **Step 9: Start the local Supabase stack**

Requires Docker running.

```bash
npx supabase start
```

Expected: after pulling images, prints a table including `API URL`, `DB URL`, `anon key`, `service_role key`, `JWT secret`. Migrations apply automatically on first start. Keep this output handy — Task 2 and Task 4 need these values.

- [ ] **Step 10: Verify the tables exist**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "\dt public.*"
```

Expected: lists `organizations`, `profiles`, `invites`.

- [ ] **Step 11: Verify the trigger fires on signup**

Get the service role key from `npx supabase status`, then:

```bash
SERVICE_ROLE_KEY=<paste service_role key>

curl -s -X POST "http://127.0.0.1:54321/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"trigger-test@example.com","password":"test-password-123","email_confirm":true}'

PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c \
  "select org_id, role from profiles where id = (select id from auth.users where email='trigger-test@example.com');"
```

Expected: one row, `org_id` and `role` both `NULL` (profile auto-created, onboarding not done yet).

- [ ] **Step 12: Verify RLS blocks anonymous reads and allows self-reads**

Get the anon key from `npx supabase status`, then:

```bash
ANON_KEY=<paste anon key>

# Anonymous (no token) — RLS blocks all rows
curl -s "http://127.0.0.1:54321/rest/v1/profiles?select=*" -H "apikey: $ANON_KEY"
```

Expected: `[]`

```bash
TOKEN=$(curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"trigger-test@example.com","password":"test-password-123"}' \
  | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).access_token))")

# Authenticated — sees exactly their own row
curl -s "http://127.0.0.1:54321/rest/v1/profiles?select=*" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN"
```

Expected: a one-element array containing the `trigger-test@example.com` profile, `org_id`/`role` still `NULL`.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json supabase/config.toml supabase/migrations .gitignore
git commit -m "feat(supabase): add local Supabase project with organizations/profiles/invites schema"
```

---

### Task 2: Server auth middleware + `/auth` routes

**Files:**
- Modify: `server/package.json` (add `@supabase/supabase-js`)
- Modify: root `.env.example` (document new server env vars)
- Modify: `server/.env` (real local values — not committed)
- Modify: `supabase/migrations/0005_enable_rls.sql` (extend the existing GRANT to include `service_role` — Task 1's grant covered `anon`/`authenticated` only, but `supabaseAdmin` below authenticates as `service_role` and needs to read/write these tables too; found during Task 2 verification)
- Create: `server/src/lib/supabaseAdmin.ts`
- Create: `server/src/middleware/auth.ts`
- Create: `server/src/routes/auth.ts`
- Modify: `server/src/index.ts` (mount `authRouter`)
- Create: `server/scripts/mint-test-token.ts` (dev-only helper)

**Interfaces:**
- Consumes: the `profiles`/`organizations`/`invites` schema from Task 1; `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` env vars (values from `npx supabase status`).
- Produces: `requireAuth`, `requireRole(allowed: Role[])`, and the `AuthedRequest` type from `server/src/middleware/auth.ts` — Task 3 applies these to the existing template/asset/letterhead/submission routes. `authRouter` mounted at `/auth`, exposing `POST /auth/organizations`, `GET /auth/invites/:code`, `POST /auth/invites/:code/accept`, `POST /auth/invites` — Task 5 (client `api.ts`) calls these by exact path/method/body shape below.

- [ ] **Step 0: Extend Task 1's RLS grant to cover `service_role`**

In `supabase/migrations/0005_enable_rls.sql`, Task 1's grant statement covers `anon, authenticated` but not `service_role` — the role this task's `supabaseAdmin` client authenticates as. Without this, every DB call in `requireAuth`/`authRouter` fails with a Postgres permission error on a freshly-seeded environment. Change:

```sql
grant select, insert, update, delete on public.profiles, public.organizations, public.invites
  to anon, authenticated;
```

to:

```sql
grant select, insert, update, delete on public.profiles, public.organizations, public.invites
  to anon, authenticated, service_role;
```

Apply it: `npx supabase db reset` (replays all migrations from a clean database, including this change).

- [ ] **Step 1: Add server dependencies**

```bash
npm --prefix server install @supabase/supabase-js
```

- [ ] **Step 2: Add env vars**

Append to root `.env.example`:

```
# Supabase (values from `npx supabase status`)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=
```

Append the same two keys, filled in with real values from `npx supabase status`, to `server/.env`.

- [ ] **Step 3: Create the Supabase admin client**

Create `server/src/lib/supabaseAdmin.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

- [ ] **Step 4: Create the auth middleware**

Create `server/src/middleware/auth.ts`. Token verification goes through `supabaseAdmin.auth.getUser(token)` rather than a local shared-secret check — the local Supabase CLI signs tokens with an asymmetric key by default, which a static-secret `jsonwebtoken` check cannot verify; `getUser()` delegates verification to Supabase's own Auth server and works regardless of signing algorithm (costs one extra local network hop per authenticated request, negligible here):

```ts
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
```

- [ ] **Step 5: Create the `/auth` routes**

Create `server/src/routes/auth.ts`:

```ts
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
```

- [ ] **Step 6: Mount the router**

In `server/src/index.ts`, add the import after the existing `import { waitlistRouter } from './routes/waitlist.js';` line:

```ts
import { authRouter } from './routes/auth.js';
```

Add the mount after `app.use('/waitlist', waitlistRouter);`:

```ts
app.use('/auth', authRouter);
```

- [ ] **Step 7: Create the dev test-token script**

Create `server/scripts/mint-test-token.ts`:

```ts
// Dev-only helper: creates (or reuses) a local Supabase test user and prints
// a real access token, so protected routes can be curl'd without going
// through the Google OAuth flow. Local Supabase only.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY (see `npx supabase status`).');
  process.exit(1);
}

const email = process.argv[2];
const password = 'test-password-123';
if (!email) {
  console.error('Usage: npx tsx server/scripts/mint-test-token.ts <email>');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anon = createClient(SUPABASE_URL, ANON_KEY);

const { data: existing } = await admin.auth.admin.listUsers();
const already = existing.users.find((u) => u.email === email);

if (!already) {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
}

const { data, error } = await anon.auth.signInWithPassword({ email, password });
if (error) throw error;

console.log(data.session?.access_token);
```

- [ ] **Step 8: Start the server locally**

```bash
npm --prefix server run dev
```

Expected: starts on port 3004 with no errors (in addition to the existing `Connected to MSSQL` / `Tables ready` output).

- [ ] **Step 9: Verify org creation**

```bash
SUPABASE_SERVICE_ROLE_KEY=<service_role key> SUPABASE_ANON_KEY=<anon key> \
  npx tsx server/scripts/mint-test-token.ts admin@example.com
```

Copy the printed token as `$ADMIN_TOKEN`, then:

```bash
curl -s -X POST http://localhost:3004/auth/organizations \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Acme Inc"}'
```

Expected: `200`, `{"orgId":"...","orgName":"Acme Inc","role":"Admin"}`.

- [ ] **Step 10: Verify invite create → lookup → accept**

```bash
curl -s -X POST http://localhost:3004/auth/invites \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"role":"Designer"}'
```

Expected: `200`, `{"code":"...","expiresAt":"..."}`. Save the code as `$CODE`.

```bash
curl -s http://localhost:3004/auth/invites/$CODE
```

Expected: `200`, `{"orgName":"Acme Inc","role":"Designer"}`.

```bash
SUPABASE_SERVICE_ROLE_KEY=<service_role key> SUPABASE_ANON_KEY=<anon key> \
  npx tsx server/scripts/mint-test-token.ts designer@example.com
```

Copy as `$DESIGNER_TOKEN`, then:

```bash
curl -s -X POST http://localhost:3004/auth/invites/$CODE/accept -H "Authorization: Bearer $DESIGNER_TOKEN"
```

Expected: `200`, `{"orgId":"<same as Step 9's orgId>","role":"Designer"}`.

- [ ] **Step 11: Verify the invite can't be reused and non-admins can't create invites**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3004/auth/invites/$CODE
```

Expected: `404`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3004/auth/invites \
  -H "Authorization: Bearer $DESIGNER_TOKEN" -H 'Content-Type: application/json' -d '{"role":"FormFiller"}'
```

Expected: `403` (the Designer isn't an Admin).

- [ ] **Step 12: Commit**

```bash
git add server/package.json server/package-lock.json server/src/lib/supabaseAdmin.ts \
  server/src/middleware/auth.ts server/src/routes/auth.ts server/src/index.ts \
  server/scripts/mint-test-token.ts .env.example supabase/migrations/0005_enable_rls.sql
git commit -m "feat(server): add Supabase auth middleware and /auth routes for orgs/invites"
```

---

### Task 2.5: Migrate app data schema and queries from MSSQL to Supabase Postgres

**Added mid-plan, by explicit human decision, after Task 2.** The original plan deferred migrating `pdf_templates`/`template_versions`/`filled_submissions`/`generated_pdfs`/`company_assets`/`letterheads`/`signature_events`/`waitlist_signups` off MSSQL to a separate later project. The human decided to bring that forward now: create the equivalent tables on the same local Supabase Postgres project (schema only — no data copied, since there's nothing worth preserving in the current MSSQL dev data), and rewire `server/src/db.ts` to query Postgres instead of MSSQL. This removes the app's dependency on the remote MSSQL server entirely (it was intermittently unreachable over VPN, blocking verification).

**Scope boundary:** this migrates the *database* layer only. File storage for `company_assets` stays exactly as-is — local disk (`server/assets/`), with only the path recorded in the DB, same as today. Moving that to Supabase Storage is a separate, unrequested change and is out of scope here.

**Files:**
- Create: `supabase/migrations/0006_create_pdf_templates.sql` through `0013_create_waitlist_signups.sql` (one file per table, matching Task 1's per-table convention)
- Modify: `server/src/db.ts` (full rewrite: `mssql` → `pg`)
- Modify: `server/src/routes/templates.ts` (the one place outside `db.ts` that inspects an MSSQL-specific error shape)
- Modify: `server/package.json` (remove `mssql`, `@types/mssql`; add `pg`, `@types/pg`)
- Modify: root `.env.example` and `server/.env` (remove `DB_SERVER`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`/`DB_ENCRYPT`/`DB_TRUST_CERT`/`DB_POOL_MIN`/`DB_POOL_MAX`; add `SUPABASE_DB_URL`)

**Interfaces:**
- Consumes: the local Supabase Postgres instance from Task 1 (same project, same `npx supabase status` "DB URL").
- Produces: every `db.ts` export keeps its **exact current name, parameter types, and return shape** — Task 3 (which comes next) adds auth middleware to the route files that call these functions, and does not touch `db.ts` at all. No route file other than `templates.ts`'s one error-code check should need to change.

- [ ] **Step 1: Read the current `server/src/db.ts` in full before deleting anything**

Open `server/src/db.ts` and note the exact TypeScript parameter and return types on every exported function (`TemplateRow`, `TemplateVersionRow`, `FilledSubmissionRow`, `GeneratedPdfRow`, `CompanyAssetRow`, `LetterheadRow`/`LetterheadSummaryRow`, `SignatureEventRow`, and every function signature). The rewrite below preserves the same shapes, but confirm against the real file — if anything here doesn't match what a route file actually imports/expects, match the real file, not this brief, and note the discrepancy in your report.

- [ ] **Step 2: Create the Postgres migrations**

One file per table, `supabase/migrations/`, continuing Task 1's numbering:

`0006_create_pdf_templates.sql`:
```sql
create table pdf_templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  current_version integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

`0007_create_template_versions.sql`:
```sql
create table template_versions (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references pdf_templates(id) on delete cascade,
  version     integer not null,
  status      text not null default 'published',
  tag         text,
  schema      text not null,
  base_pdf    text not null,
  schemas     text not null,
  created_at  timestamptz not null default now(),
  constraint uq_template_version unique (template_id, version)
);

create unique index uq_template_versions_tag
  on template_versions (template_id, tag)
  where status = 'published';
```

`0008_create_filled_submissions.sql`:
```sql
create table filled_submissions (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null references pdf_templates(id) on delete cascade,
  template_version integer not null,
  inputs           text not null,
  submitted_at     timestamptz not null default now()
);
```

`0009_create_generated_pdfs.sql` (no `on delete cascade` on either FK — matches the current MSSQL schema's behavior exactly, do not add cascade here even though it looks inconsistent with the two tables above; that inconsistency already exists in production behavior and changing it is out of scope):
```sql
create table generated_pdfs (
  id               uuid primary key default gen_random_uuid(),
  submission_id    uuid not null references filled_submissions(id),
  template_id      uuid not null references pdf_templates(id),
  template_version integer not null,
  inputs_snapshot  text not null,
  schema_snapshot  text not null,
  file_path        text not null,
  file_size_bytes  bigint,
  generated_at     timestamptz not null default now()
);
```

`0010_create_company_assets.sql`:
```sql
create table company_assets (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  file_path        text not null,
  mime_type        text not null,
  file_size_bytes  bigint not null,
  created_at       timestamptz not null default now()
);
```

`0011_create_letterheads.sql` (this models the table's current *effective* live shape in MSSQL, i.e. after all of `db.ts`'s historical `ALTER TABLE` migrations are accounted for — not its original `CREATE TABLE` — so `static_schema`/`page_width`/`page_height` are nullable and `base_pdf`/`type` already exist):
```sql
create table letterheads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          text not null default 'fields',
  static_schema text,
  page_width    double precision,
  page_height   double precision,
  base_pdf      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

`0012_create_signature_events.sql`:
```sql
create table signature_events (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references filled_submissions(id),
  field_name    text not null,
  signer_name   text not null,
  signer_email  text not null,
  signed_at     timestamptz not null default now(),
  ip_address    text,
  document_hash text not null
);
```

`0013_create_waitlist_signups.sql`:
```sql
create table waitlist_signups (
  id         integer generated always as identity primary key,
  name       text not null,
  email      text not null unique,
  created_at timestamptz not null default now()
);
```

None of these 8 tables get RLS enabled or any grants to `anon`/`authenticated`/`service_role`. Unlike `organizations`/`profiles`/`invites` (Task 1), these tables are never queried through PostgREST/`supabase-js` — the server connects to Postgres directly via the `pg` package using the `postgres` superuser connection string, which bypasses RLS and has full privileges by default. Adding RLS here would be unused complexity.

Apply: `npx supabase db reset` (replays all 13 migrations from a clean database).

- [ ] **Step 3: Swap the server dependency**

```bash
npm --prefix server uninstall mssql @types/mssql
npm --prefix server install pg
npm --prefix server install -D @types/pg
```

- [ ] **Step 4: Update env vars**

In root `.env.example`, remove the entire `# MSSQL` block (`DB_SERVER` through `DB_POOL_MAX`) and add, next to the existing Supabase vars:

```
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

In `server/.env`, remove the same MSSQL vars and add `SUPABASE_DB_URL` with the real value from `npx supabase status` ("DB URL").

- [ ] **Step 5: Rewrite `server/src/db.ts`**

Replace the entire file. Preserve every exported function's name and (per Step 1) parameter/return types exactly — route files must not need to change except where noted in Step 6.

```ts
// server/src/db.ts
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL ?? '',
});

export async function initDb(): Promise<void> {
  await pool.query('select 1');
  console.log('Connected to Postgres (Supabase)');
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

// ---------- pdf_templates ----------

export interface TemplateRow {
  id: string;
  name: string;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export async function listTemplates(): Promise<TemplateRow[]> {
  const { rows } = await pool.query<TemplateRow>(
    `SELECT id, name, current_version, created_at, updated_at FROM pdf_templates ORDER BY created_at DESC`
  );
  return rows;
}

export async function getTemplate(id: string): Promise<TemplateRow | null> {
  const { rows } = await pool.query<TemplateRow>(
    `SELECT id, name, current_version, created_at, updated_at FROM pdf_templates WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createTemplate(name: string): Promise<TemplateRow> {
  const { rows } = await pool.query<TemplateRow>(`INSERT INTO pdf_templates (name) VALUES ($1) RETURNING *`, [name]);
  return rows[0];
}

export async function updateTemplate(id: string, name: string): Promise<TemplateRow | null> {
  const { rows } = await pool.query<TemplateRow>(
    `UPDATE pdf_templates SET name = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [name, id]
  );
  return rows[0] ?? null;
}

export async function deleteTemplate(id: string): Promise<void> {
  await pool.query(`DELETE FROM pdf_templates WHERE id = $1`, [id]);
}

// ---------- template_versions ----------

export interface TemplateVersionRow {
  id: string;
  template_id: string;
  version: number;
  status: string;
  tag: string | null;
  schema: unknown;
  base_pdf: unknown;
  schemas: unknown;
  created_at: string;
}

interface TemplateVersionDbRow {
  id: string;
  template_id: string;
  version: number;
  status: string;
  tag: string | null;
  schema: string;
  base_pdf: string;
  schemas: string;
  created_at: string;
}

function parseVersionRow(row: TemplateVersionDbRow): TemplateVersionRow {
  return { ...row, schema: JSON.parse(row.schema), base_pdf: JSON.parse(row.base_pdf), schemas: JSON.parse(row.schemas) };
}

export async function saveDraft(templateId: string, schema: unknown): Promise<TemplateVersionRow> {
  const schemaObj = schema as { basePdf: unknown; schemas: unknown };
  const schemaStr = JSON.stringify(schema);
  const basePdfStr = JSON.stringify(schemaObj.basePdf);
  const schemasStr = JSON.stringify(schemaObj.schemas);

  const { rows: existing } = await pool.query<{ id: string }>(
    `SELECT id FROM template_versions WHERE template_id = $1 AND status = 'draft'`,
    [templateId]
  );

  if (existing[0]) {
    const { rows } = await pool.query<TemplateVersionDbRow>(
      `UPDATE template_versions SET schema = $1, base_pdf = $2, schemas = $3, created_at = now() WHERE id = $4 RETURNING *`,
      [schemaStr, basePdfStr, schemasStr, existing[0].id]
    );
    return parseVersionRow(rows[0]);
  }

  const { rows: templateRows } = await pool.query(`SELECT id FROM pdf_templates WHERE id = $1`, [templateId]);
  if (!templateRows[0]) throw new Error('Template not found');

  const { rows } = await pool.query<TemplateVersionDbRow>(
    `INSERT INTO template_versions (template_id, version, status, tag, schema, base_pdf, schemas)
     VALUES ($1, 0, 'draft', NULL, $2, $3, $4) RETURNING *`,
    [templateId, schemaStr, basePdfStr, schemasStr]
  );
  return parseVersionRow(rows[0]);
}

export async function getDraft(templateId: string): Promise<TemplateVersionRow | null> {
  const { rows } = await pool.query<TemplateVersionDbRow>(
    `SELECT * FROM template_versions WHERE template_id = $1 AND status = 'draft'`,
    [templateId]
  );
  return rows[0] ? parseVersionRow(rows[0]) : null;
}

export type PublishTarget = { mode: 'new' } | { mode: 'replace'; version: number };

export async function publishVersion(
  templateId: string,
  schema: unknown,
  tag: string | null,
  target: PublishTarget
): Promise<TemplateVersionRow> {
  const schemaObj = schema as { basePdf: unknown; schemas: unknown };
  const schemaStr = JSON.stringify(schema);
  const basePdfStr = JSON.stringify(schemaObj.basePdf);
  const schemasStr = JSON.stringify(schemaObj.schemas);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let row: TemplateVersionDbRow;
    if (target.mode === 'new') {
      const { rows: updated } = await client.query<{ current_version: number }>(
        `UPDATE pdf_templates SET current_version = current_version + 1, updated_at = now() WHERE id = $1 RETURNING current_version`,
        [templateId]
      );
      if (!updated[0]) throw new Error('Template not found');
      const version = updated[0].current_version;

      const { rows } = await client.query<TemplateVersionDbRow>(
        `INSERT INTO template_versions (template_id, version, status, tag, schema, base_pdf, schemas)
         VALUES ($1, $2, 'published', $3, $4, $5, $6) RETURNING *`,
        [templateId, version, tag, schemaStr, basePdfStr, schemasStr]
      );
      row = rows[0];
    } else {
      const { rows } = await client.query<TemplateVersionDbRow>(
        `UPDATE template_versions SET tag = $1, schema = $2, base_pdf = $3, schemas = $4, created_at = now()
         WHERE template_id = $5 AND version = $6 AND status = 'published' RETURNING *`,
        [tag, schemaStr, basePdfStr, schemasStr, templateId, target.version]
      );
      if (!rows[0]) throw new Error('Published version not found');
      row = rows[0];
    }

    await client.query('COMMIT');
    return parseVersionRow(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listPublishedVersions(templateId: string): Promise<TemplateVersionRow[]> {
  const { rows } = await pool.query<TemplateVersionDbRow>(
    `SELECT * FROM template_versions WHERE template_id = $1 AND status = 'published' ORDER BY version DESC`,
    [templateId]
  );
  return rows.map(parseVersionRow);
}

export type VersionRef = { version: number } | { tag: string };

export async function getPublishedVersion(templateId: string, ref: VersionRef): Promise<TemplateVersionRow | null> {
  const { rows } =
    'version' in ref
      ? await pool.query<TemplateVersionDbRow>(
          `SELECT * FROM template_versions WHERE template_id = $1 AND version = $2 AND status = 'published'`,
          [templateId, ref.version]
        )
      : await pool.query<TemplateVersionDbRow>(
          `SELECT * FROM template_versions WHERE template_id = $1 AND tag = $2 AND status = 'published'`,
          [templateId, ref.tag]
        );
  return rows[0] ? parseVersionRow(rows[0]) : null;
}

export async function getLatestPublishedVersion(templateId: string): Promise<TemplateVersionRow | null> {
  const { rows } = await pool.query<TemplateVersionDbRow>(
    `SELECT * FROM template_versions WHERE template_id = $1 AND status = 'published' ORDER BY version DESC LIMIT 1`,
    [templateId]
  );
  return rows[0] ? parseVersionRow(rows[0]) : null;
}

// ---------- filled_submissions ----------

export interface FilledSubmissionRow {
  id: string;
  template_id: string;
  template_version: number;
  inputs: unknown;
  submitted_at: string;
}

interface FilledSubmissionDbRow extends Omit<FilledSubmissionRow, 'inputs'> {
  inputs: string;
}

export async function createFilledSubmission(
  templateId: string,
  templateVersion: number,
  inputs: unknown
): Promise<FilledSubmissionRow> {
  const { rows } = await pool.query<FilledSubmissionDbRow>(
    `INSERT INTO filled_submissions (template_id, template_version, inputs) VALUES ($1, $2, $3) RETURNING *`,
    [templateId, templateVersion, JSON.stringify(inputs)]
  );
  return { ...rows[0], inputs: JSON.parse(rows[0].inputs) };
}

export async function listSubmissionsForTemplate(templateId: string): Promise<FilledSubmissionRow[]> {
  const { rows } = await pool.query<FilledSubmissionDbRow>(
    `SELECT * FROM filled_submissions WHERE template_id = $1 ORDER BY submitted_at DESC`,
    [templateId]
  );
  return rows.map((row) => ({ ...row, inputs: JSON.parse(row.inputs) }));
}

export async function getFilledSubmission(id: string): Promise<FilledSubmissionRow | null> {
  const { rows } = await pool.query<FilledSubmissionDbRow>(`SELECT * FROM filled_submissions WHERE id = $1`, [id]);
  return rows[0] ? { ...rows[0], inputs: JSON.parse(rows[0].inputs) } : null;
}

// ---------- generated_pdfs ----------

export interface GeneratedPdfRow {
  id: string;
  submission_id: string;
  template_id: string;
  template_version: number;
  inputs_snapshot: unknown;
  schema_snapshot: unknown;
  file_path: string;
  file_size_bytes: number | null;
  generated_at: string;
}

interface GeneratedPdfDbRow extends Omit<GeneratedPdfRow, 'inputs_snapshot' | 'schema_snapshot'> {
  inputs_snapshot: string;
  schema_snapshot: string;
}

export async function createGeneratedPdf(opts: {
  submissionId: string;
  templateId: string;
  templateVersion: number;
  inputsSnapshot: unknown;
  schemaSnapshot: unknown;
  filePath: string;
  fileSizeBytes?: number;
}): Promise<GeneratedPdfRow> {
  const { rows } = await pool.query<GeneratedPdfDbRow>(
    `INSERT INTO generated_pdfs
       (submission_id, template_id, template_version, inputs_snapshot, schema_snapshot, file_path, file_size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      opts.submissionId,
      opts.templateId,
      opts.templateVersion,
      JSON.stringify(opts.inputsSnapshot),
      JSON.stringify(opts.schemaSnapshot),
      opts.filePath,
      opts.fileSizeBytes ?? null,
    ]
  );
  const row = rows[0];
  return { ...row, inputs_snapshot: JSON.parse(row.inputs_snapshot), schema_snapshot: JSON.parse(row.schema_snapshot) };
}

// ---------- company_assets ----------

export interface CompanyAssetRow {
  id: string;
  name: string;
  file_path: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
}

export async function listAssets(): Promise<CompanyAssetRow[]> {
  const { rows } = await pool.query<CompanyAssetRow>(
    `SELECT id, name, file_path, mime_type, file_size_bytes, created_at FROM company_assets ORDER BY created_at DESC`
  );
  return rows;
}

export async function getAsset(id: string): Promise<CompanyAssetRow | null> {
  const { rows } = await pool.query<CompanyAssetRow>(`SELECT * FROM company_assets WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createAsset(input: {
  name: string;
  filePath: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<CompanyAssetRow> {
  const { rows } = await pool.query<CompanyAssetRow>(
    `INSERT INTO company_assets (name, file_path, mime_type, file_size_bytes) VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.name, input.filePath, input.mimeType, input.fileSizeBytes]
  );
  return rows[0];
}

export async function deleteAsset(id: string): Promise<CompanyAssetRow | null> {
  const { rows } = await pool.query<CompanyAssetRow>(`DELETE FROM company_assets WHERE id = $1 RETURNING *`, [id]);
  return rows[0] ?? null;
}

// ---------- letterheads ----------

export interface LetterheadSummaryRow {
  id: string;
  name: string;
  type: string;
  page_width: number | null;
  page_height: number | null;
  created_at: string;
  updated_at: string;
}

export interface LetterheadRow extends LetterheadSummaryRow {
  static_schema: unknown | null;
  base_pdf: string | null;
}

interface LetterheadDbRow extends Omit<LetterheadRow, 'static_schema'> {
  static_schema: string | null;
}

function parseLetterheadRow(row: LetterheadDbRow): LetterheadRow {
  return { ...row, static_schema: row.static_schema ? JSON.parse(row.static_schema) : null };
}

export async function listLetterheads(): Promise<LetterheadSummaryRow[]> {
  const { rows } = await pool.query<LetterheadSummaryRow>(
    `SELECT id, name, type, page_width, page_height, created_at, updated_at FROM letterheads ORDER BY updated_at DESC`
  );
  return rows;
}

export async function getLetterhead(id: string): Promise<LetterheadRow | null> {
  const { rows } = await pool.query<LetterheadDbRow>(
    `SELECT id, name, type, static_schema, page_width, page_height, base_pdf, created_at, updated_at FROM letterheads WHERE id = $1`,
    [id]
  );
  return rows[0] ? parseLetterheadRow(rows[0]) : null;
}

export async function createLetterhead(input: {
  name: string;
  type: 'fields' | 'pdf';
  staticSchema?: unknown;
  pageWidth?: number;
  pageHeight?: number;
  basePdf?: string;
}): Promise<LetterheadRow> {
  const { rows } = await pool.query<LetterheadDbRow>(
    `INSERT INTO letterheads (name, type, static_schema, page_width, page_height, base_pdf)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, type, static_schema, page_width, page_height, base_pdf, created_at, updated_at`,
    [
      input.name,
      input.type,
      input.staticSchema !== undefined ? JSON.stringify(input.staticSchema) : null,
      input.pageWidth ?? null,
      input.pageHeight ?? null,
      input.basePdf ?? null,
    ]
  );
  return parseLetterheadRow(rows[0]);
}

export async function updateLetterhead(
  id: string,
  input: { name?: string; staticSchema?: unknown; pageWidth?: number; pageHeight?: number; basePdf?: string }
): Promise<LetterheadRow | null> {
  const existing = await getLetterhead(id);
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const staticSchema = input.staticSchema !== undefined ? input.staticSchema : existing.static_schema;
  const pageWidth = input.pageWidth ?? existing.page_width;
  const pageHeight = input.pageHeight ?? existing.page_height;
  const basePdf = input.basePdf ?? existing.base_pdf;

  const { rows } = await pool.query<LetterheadDbRow>(
    `UPDATE letterheads SET name = $1, static_schema = $2, page_width = $3, page_height = $4, base_pdf = $5, updated_at = now()
     WHERE id = $6
     RETURNING id, name, type, static_schema, page_width, page_height, base_pdf, created_at, updated_at`,
    [name, staticSchema !== null && staticSchema !== undefined ? JSON.stringify(staticSchema) : null, pageWidth, pageHeight, basePdf, id]
  );
  return rows[0] ? parseLetterheadRow(rows[0]) : null;
}

export async function deleteLetterhead(id: string): Promise<void> {
  await pool.query(`DELETE FROM letterheads WHERE id = $1`, [id]);
}

// ---------- signature_events ----------

export interface SignatureEventRow {
  id: string;
  submission_id: string;
  field_name: string;
  signer_name: string;
  signer_email: string;
  signed_at: string;
  ip_address: string | null;
  document_hash: string;
}

export async function createSignatureEvent(input: {
  submissionId: string;
  fieldName: string;
  signerName: string;
  signerEmail: string;
  ipAddress: string | null;
  documentHash: string;
}): Promise<SignatureEventRow> {
  const { rows } = await pool.query<SignatureEventRow>(
    `INSERT INTO signature_events (submission_id, field_name, signer_name, signer_email, ip_address, document_hash)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.submissionId, input.fieldName, input.signerName, input.signerEmail, input.ipAddress, input.documentHash]
  );
  return rows[0];
}

export async function listSignatureEventsForSubmission(submissionId: string): Promise<SignatureEventRow[]> {
  const { rows } = await pool.query<SignatureEventRow>(
    `SELECT * FROM signature_events WHERE submission_id = $1 ORDER BY signed_at ASC`,
    [submissionId]
  );
  return rows;
}

// ---------- waitlist_signups ----------

export async function createWaitlistSignup(name: string, email: string): Promise<{ alreadyOnList: boolean }> {
  try {
    await pool.query(`INSERT INTO waitlist_signups (name, email) VALUES ($1, $2)`, [name, email]);
    return { alreadyOnList: false };
  } catch (error) {
    if (isUniqueViolation(error)) return { alreadyOnList: true };
    throw error;
  }
}
```

Notes on fidelity to the original:
- `listFilledSubmissions` (a duplicate of `listSubmissionsForTemplate`, same query, confirmed unused by any route) is intentionally dropped — if you find a live caller of it that Step 1 didn't catch, add it back with the same query instead of leaving an import error.
- `generated_pdfs`/`signature_events` foreign keys intentionally have no `ON DELETE` clause, matching the original MSSQL schema's (inconsistent, but current) behavior — do not add cascades here.
- The `updateLetterhead` read-then-write pattern (not a single atomic statement) is preserved as-is — this is an existing, documented behavior, not something to fix as part of this migration.

- [ ] **Step 6: Fix the one MSSQL-specific error check outside `db.ts`**

In `server/src/routes/templates.ts`, the `POST /:id/publish` handler catches a duplicate-tag violation by inspecting an MSSQL-specific error shape (`(error as { number?: number }).number === 2601 || ... === 2627`). Find that check and replace it with the Postgres equivalent — `(error as { code?: string }).code === '23505'` — keeping the same 409 response behavior around it. Do not change anything else in this file; this is the only MSSQL-specific code outside `db.ts`, per the mapping this task was based on.

- [ ] **Step 7: Build check**

```bash
npm --prefix server run build
```

Expected: clean, no errors. If there are type errors, they most likely mean a route file expects a `db.ts` export shape that drifted from Step 1's real signatures — fix `db.ts` to match the real, pre-existing route usage, not the other way around.

- [ ] **Step 8: Start the server and verify each table end-to-end**

```bash
npm --prefix server run dev
```

Expected: `Connected to Postgres (Supabase)` and `Server running on port 3004`, no MSSQL-related output at all.

Run this sequence, confirming each step's shape/status code:

```bash
# Create a template (uses pdf_templates + template_versions draft path)
curl -s -X POST http://localhost:3004/templates \
  -H 'Content-Type: application/json' \
  -d '{"name":"Migration Test","schema":{"basePdf":{"width":210,"height":297,"padding":[0,0,0,0]},"schemas":[[]]}}'
```
Expected: 200, a JSON template row with a `draft` object.

```bash
# List templates
curl -s http://localhost:3004/templates
```
Expected: 200, array including the template just created.

```bash
# Publish it (exercises the transaction in publishVersion)
curl -s -X POST http://localhost:3004/templates/<id>/publish \
  -H 'Content-Type: application/json' \
  -d '{"schema":{"basePdf":{"width":210,"height":297,"padding":[0,0,0,0]},"schemas":[[]]},"tag":"v1","mode":"new"}'
```
Expected: 200, `{"schema":{...},"version":1,"tag":"v1"}`.

```bash
# Publish the same tag again to trigger the 409 path (exercises Step 6's fix)
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3004/templates/<id>/publish \
  -H 'Content-Type: application/json' \
  -d '{"schema":{"basePdf":{"width":210,"height":297,"padding":[0,0,0,0]},"schemas":[[]]},"tag":"v1","mode":"new"}'
```
Expected: `409`.

```bash
# Generate a filled PDF (exercises filled_submissions + generated_pdfs)
curl -s -o /tmp/migration-test.pdf -w '%{http_code}\n' -X POST http://localhost:3004/generate-pdf \
  -H 'Content-Type: application/json' \
  -d '{"template_id":"<id>","inputs":[{}],"tag":"v1"}'
```
Expected: `200`, and `/tmp/migration-test.pdf` is a non-empty file (`file /tmp/migration-test.pdf` reports PDF document).

```bash
# List submissions for the template (exercises the submissions route + signature_events join)
curl -s http://localhost:3004/templates/<id>/submissions
```
Expected: 200, array with one submission, `signatureEvents: []`.

```bash
# Company assets round-trip
curl -s -X POST http://localhost:3004/assets -F "file=@/tmp/migration-test.pdf;type=application/pdf" -F "name=Test Asset"
curl -s http://localhost:3004/assets
```
Expected: both 200; the list includes the created asset.

```bash
# Letterheads round-trip
curl -s -X POST http://localhost:3004/letterheads \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Letterhead","type":"fields","staticSchema":[],"pageWidth":210,"pageHeight":297}'
curl -s http://localhost:3004/letterheads
```
Expected: both 200; the list includes the created letterhead.

```bash
# Waitlist (exercises the unique-violation → alreadyOnList path)
curl -s -X POST http://localhost:3004/waitlist -H 'Content-Type: application/json' -d '{"name":"Test","email":"migration-test@example.com"}'
curl -s -X POST http://localhost:3004/waitlist -H 'Content-Type: application/json' -d '{"name":"Test","email":"migration-test@example.com"}'
```
Expected: first `{"alreadyOnList":false}`, second `{"alreadyOnList":true}` — both HTTP 200.

- [ ] **Step 9: Delete the template created for verification (cleanup, exercises `deleteTemplate` + cascade)**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:3004/templates/<id>
```
Expected: matches whatever status the existing delete handler already returns on success (confirm from the route file, don't assume). Then confirm the child `template_versions`/`filled_submissions` rows are gone too (cascade):

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c \
  "select count(*) from template_versions where template_id = '<id>'; select count(*) from filled_submissions where template_id = '<id>';"
```
Expected: both `0`.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0006_create_pdf_templates.sql supabase/migrations/0007_create_template_versions.sql \
  supabase/migrations/0008_create_filled_submissions.sql supabase/migrations/0009_create_generated_pdfs.sql \
  supabase/migrations/0010_create_company_assets.sql supabase/migrations/0011_create_letterheads.sql \
  supabase/migrations/0012_create_signature_events.sql supabase/migrations/0013_create_waitlist_signups.sql \
  server/src/db.ts server/src/routes/templates.ts server/package.json server/package-lock.json .env.example
git commit -m "feat(server): migrate app data schema and queries from MSSQL to Supabase Postgres"
```

---

### Task 3: Server-side role enforcement on existing routes

**Files:**
- Modify: `server/src/routes/templates.ts`
- Modify: `server/src/routes/assets.ts`
- Modify: `server/src/routes/letterheads.ts`
- Modify: `server/src/routes/submissions.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole` from `server/src/middleware/auth.ts` (Task 2). Uses the `$ADMIN_TOKEN`/`$DESIGNER_TOKEN` test tokens minted in Task 2.
- Produces: the exact route protection matrix below. Nothing later depends on this task's internals — Task 5's client `api.ts` just needs to send the `Authorization` header (already true for every request once Task 5 is done), and this task's guards will accept or reject it.

Route protection matrix (derived from the client's existing `RoleGuard allowed={[...]}` lists in `App.tsx` and `TemplateList.tsx`'s `canDelete = role === 'Admin'`):

| Route | Protection |
|---|---|
| `GET /templates` | `requireAuth` only (any signed-in, onboarded user) |
| `GET /templates/:id` | **unchanged — stays public** (used by the public `/templates/:id/fill` page) |
| `GET /templates/:id/versions` | `requireAuth` only |
| `POST /templates` | `requireAuth` + `requireRole(['Admin', 'Designer'])` |
| `PUT /templates/:id` | `requireAuth` + `requireRole(['Admin', 'Designer'])` |
| `POST /templates/:id/publish` | `requireAuth` + `requireRole(['Admin', 'Designer'])` |
| `DELETE /templates/:id` | `requireAuth` + `requireRole(['Admin'])` |
| all of `assetsRouter` | `requireAuth` + `requireRole(['Admin', 'Designer'])` |
| all of `letterheadsRouter` | `requireAuth` + `requireRole(['Admin', 'Designer'])` |
| `GET /templates/:id/submissions` | `requireAuth` + `requireRole(['Admin', 'Designer'])` |

- [ ] **Step 1: Protect `templates.ts`**

Add the import after the existing `import { Router, Request, Response } from 'express';` line:

```ts
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
```

Change each route declaration:

```ts
templatesRouter.get('/', async (_req: Request, res: Response) => {
```
→
```ts
templatesRouter.get('/', requireAuth, async (_req: AuthedRequest, res: Response) => {
```

Leave `templatesRouter.get('/:id', ...)` exactly as-is (must stay public).

```ts
templatesRouter.post('/', async (req: Request, res: Response) => {
```
→
```ts
templatesRouter.post('/', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
```

```ts
templatesRouter.put('/:id', async (req: Request, res: Response) => {
```
→
```ts
templatesRouter.put('/:id', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
```

```ts
templatesRouter.post('/:id/publish', async (req: Request, res: Response) => {
```
→
```ts
templatesRouter.post('/:id/publish', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
```

```ts
templatesRouter.get('/:id/versions', async (req: Request, res: Response) => {
```
→
```ts
templatesRouter.get('/:id/versions', requireAuth, async (req: AuthedRequest, res: Response) => {
```

```ts
templatesRouter.delete('/:id', async (req: Request, res: Response) => {
```
→
```ts
templatesRouter.delete('/:id', requireAuth, requireRole(['Admin']), async (req: AuthedRequest, res: Response) => {
```

- [ ] **Step 2: Protect `assets.ts`**

Add the import after `import { Router, Request, Response, NextFunction } from 'express';`:

```ts
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
```

```ts
assetsRouter.post('/', handleUpload, async (req: Request, res: Response) => {
```
→
```ts
assetsRouter.post('/', requireAuth, requireRole(['Admin', 'Designer']), handleUpload, async (req: AuthedRequest, res: Response) => {
```

```ts
assetsRouter.get('/', async (_req: Request, res: Response) => {
```
→
```ts
assetsRouter.get('/', requireAuth, requireRole(['Admin', 'Designer']), async (_req: AuthedRequest, res: Response) => {
```

```ts
assetsRouter.get('/:id/file', async (req: Request, res: Response) => {
```
→
```ts
assetsRouter.get('/:id/file', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
```

```ts
assetsRouter.delete('/:id', async (req: Request, res: Response) => {
```
→
```ts
assetsRouter.delete('/:id', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
```

- [ ] **Step 3: Protect `letterheads.ts`**

Add the import after `import { Router, Request, Response } from 'express';`:

```ts
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
```

```ts
letterheadsRouter.post('/', async (req: Request, res: Response) => {
```
→
```ts
letterheadsRouter.post('/', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
```

```ts
letterheadsRouter.get('/', async (_req: Request, res: Response) => {
```
→
```ts
letterheadsRouter.get('/', requireAuth, requireRole(['Admin', 'Designer']), async (_req: AuthedRequest, res: Response) => {
```

```ts
letterheadsRouter.get('/:id', async (req: Request, res: Response) => {
```
→
```ts
letterheadsRouter.get('/:id', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
```

```ts
letterheadsRouter.put('/:id', async (req: Request, res: Response) => {
```
→
```ts
letterheadsRouter.put('/:id', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
```

```ts
letterheadsRouter.delete('/:id', async (req: Request, res: Response) => {
```
→
```ts
letterheadsRouter.delete('/:id', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
```

- [ ] **Step 4: Protect `submissions.ts`**

Add the import after `import { Router, Request, Response } from 'express';`:

```ts
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
```

```ts
submissionsRouter.get('/templates/:id/submissions', async (req: Request, res: Response) => {
```
→
```ts
submissionsRouter.get('/templates/:id/submissions', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
```

- [ ] **Step 5: Restart the server**

```bash
npm --prefix server run dev
```

Expected: starts cleanly, no TypeScript errors.

- [ ] **Step 6: Verify unauthenticated requests are rejected**

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3004/templates
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3004/templates -H 'Content-Type: application/json' -d '{"name":"x","schema":{}}'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3004/assets
```

Expected: all three print `401`.

- [ ] **Step 7: Verify the public form-fill path is untouched**

Using an existing template id from before this feature (or create one first via Step 8 below, then re-run this):

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3004/templates/<some-template-id>
```

Expected: `200` (or `404` if the id doesn't exist) — never `401`.

- [ ] **Step 8: Verify role-gated writes with the Task 2 test tokens**

Reuse `$ADMIN_TOKEN` and `$DESIGNER_TOKEN` from Task 2 (re-mint if the server was restarted and tokens expired — `jwt_expiry` defaults to 3600s):

```bash
curl -s -X POST http://localhost:3004/templates \
  -H "Authorization: Bearer $DESIGNER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Test Template","schema":{"basePdf":{"width":210,"height":297,"padding":[0,0,0,0]},"schemas":[[]]}}'
```

Expected: `200` — Designer is allowed to create templates. Note the returned `id` as `$TEMPLATE_ID`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:3004/templates/$TEMPLATE_ID \
  -H "Authorization: Bearer $DESIGNER_TOKEN"
```

Expected: `403` — Designer cannot delete (Admin-only).

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:3004/templates/$TEMPLATE_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Expected: `204` (or whatever the existing delete handler returns on success) — Admin can delete.

- [ ] **Step 9: Commit**

```bash
git add server/src/routes/templates.ts server/src/routes/assets.ts server/src/routes/letterheads.ts server/src/routes/submissions.ts
git commit -m "feat(server): enforce role checks on template/asset/letterhead/submission routes"
```

---

### Task 4: Client Supabase setup, AuthContext, and Login page

**Files:**
- Modify: `client/package.json` (add `@supabase/supabase-js`)
- Modify: `client/.env.example` and `client/.env` (real local values — not committed)
- Modify: `supabase/config.toml` (add the Google provider block)
- Create: `client/src/lib/supabase.ts`
- Create: `client/src/context/AuthContext.tsx`
- Create: `client/src/pages/Login.tsx`

**Interfaces:**
- Consumes: `SUPABASE_URL` / anon key from Task 1's `npx supabase status`.
- Produces: `supabase` client from `client/src/lib/supabase.ts`; `AuthProvider`, `useAuth()`, and the `Profile` type from `client/src/context/AuthContext.tsx` — `useAuth()` returns `{ session, profile, role, loading, signInWithGoogle, signOut, refreshProfile }`. Task 5 and Task 6 both consume `useAuth()` by this exact shape.

- [ ] **Step 1: Add the client dependency**

```bash
npm --prefix client install @supabase/supabase-js
```

- [ ] **Step 2: Add client env vars**

Write to `client/.env.example`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=
```

Write the same two keys, filled in with real values from `npx supabase status`, to `client/.env`.

- [ ] **Step 3: Configure the Google provider in `supabase/config.toml`**

Add this block anywhere under the commented `[auth.external.*]` section of `supabase/config.toml` (near the existing `[auth.external.apple]` example that `supabase init` generated):

```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"
skip_nonce_check = true
```

`skip_nonce_check = true` is required for local Google sign-in per Supabase's own config comment on the neighboring `apple` block.

- [ ] **Step 4: Get real Google OAuth credentials (manual, user-performed step)**

This step requires the user's own Google account and cannot be automated:

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or select a project → **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type **Web application**.
2. Under **Authorized redirect URIs**, add exactly: `http://127.0.0.1:54321/auth/v1/callback`
3. Copy the generated **Client ID** and **Client secret**.
4. Add to root `.env` (create the file if it doesn't exist there for these two, or add alongside the existing MSSQL vars):

```
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<paste client id>
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<paste client secret>
```

5. Restart Supabase so it picks up the new config: `npx supabase stop && npx supabase start`.

If these real credentials aren't available yet, continue the plan anyway — Steps 8–9 below verify everything up to (but not including) actually completing Google's consent screen.

- [ ] **Step 5: Create the browser Supabase client**

Create `client/src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey);
```

- [ ] **Step 6: Create `AuthContext`**

Create `client/src/context/AuthContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';
import type { Role } from '../types.js';

export interface Profile {
  id: string;
  orgId: string | null;
  role: Role | null;
  fullName: string | null;
  avatarUrl: string | null;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, org_id, role, full_name, avatar_url')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    orgId: data.org_id,
    role: data.role,
    fullName: data.full_name,
    avatarUrl: data.avatar_url,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    setProfile(await fetchProfile(userId));
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (session) await loadProfile(session.user.id);
  };

  return (
    <AuthContext.Provider
      value={{ session, profile, role: profile?.role ?? null, loading, signInWithGoogle, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 7: Create the Login page**

Create `client/src/pages/Login.tsx`:

```tsx
import { Navigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { useAuth } from '../context/AuthContext.js';

export default function Login() {
  const { session, profile, loading, signInWithGoogle } = useAuth();

  if (loading) return null;
  if (session) {
    return <Navigate to={profile?.orgId ? '/' : '/onboarding'} replace />;
  }

  return (
    <div
      style={{ background: 'var(--nx-canvas)', color: 'var(--nx-ink)' }}
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-[var(--nx-radius-sm)] mb-6"
        style={{ background: 'var(--nx-accent-tint)' }}
      >
        <FileText className="h-6 w-6" style={{ color: 'var(--nx-accent)' }} />
      </div>
      <h1 className="text-3xl font-bold tracking-tight">Sign in to NexGen PDF Manager</h1>
      <p className="mt-3 text-base max-w-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
        Sign in with your Google account to continue.
      </p>
      <Button size="lg" className="h-12 px-6 text-base mt-8" onClick={() => void signInWithGoogle()}>
        Sign in with Google
      </Button>
    </div>
  );
}
```

This page isn't reachable yet (not wired into `App.tsx`/`main.tsx` until Task 6) — verify it directly for now.

- [ ] **Step 8: Temporarily preview the Login page**

In `client/src/main.tsx`, temporarily wrap with `AuthProvider` instead of `RoleProvider` and render `<Login />` directly in place of `<App />` for this check only (revert after — Task 6 does this wiring for real):

```bash
npm --prefix client run dev
```

Open the client dev server in the browser. Confirm the "Sign in to NexGen PDF Manager" heading and "Sign in with Google" button render with the same visual style (colors, spacing) as the existing Waitlist page.

- [ ] **Step 9: Verify the Google redirect is wired correctly**

Click "Sign in with Google". Using the browser's network tab or the Browser pane's `read_network_requests`, confirm the browser navigated to `http://127.0.0.1:54321/auth/v1/authorize?provider=google...` and then either:
- redirected on to `accounts.google.com` (real credentials configured — if you have a real Google account, you may finish signing in yourself here to confirm the full round trip, since only you can complete Google's own consent screen), or
- returned a Supabase error page naming the `google` provider (expected if Step 4's real credentials aren't set up yet) — this still confirms the client-to-Supabase wiring is correct; the only missing piece is the user's own Google credentials.

Revert the temporary `main.tsx` change from Step 8 (back to whatever it was — Task 6 replaces `RoleProvider` with `AuthProvider` properly).

- [ ] **Step 10: Commit**

```bash
git add client/package.json client/package-lock.json client/.env.example supabase/config.toml \
  client/src/lib/supabase.ts client/src/context/AuthContext.tsx client/src/pages/Login.tsx
git commit -m "feat(client): add Supabase client, AuthContext, and Login page"
```

---

### Task 5: Onboarding page + client API additions

**Files:**
- Modify: `client/src/lib/api.ts`
- Create: `client/src/pages/Onboarding.tsx`

**Interfaces:**
- Consumes: `POST /auth/organizations`, `GET /auth/invites/:code`, `POST /auth/invites/:code/accept`, `POST /auth/invites` from Task 2; `useAuth()` from Task 4.
- Produces: `api.createOrganization(name)`, `api.getInvite(code)`, `api.acceptInvite(code)`, `api.createInvite(role)` on the existing `api` object — Task 6's `Settings.tsx` consumes `api.createInvite`. Every existing `api.*` call now also attaches the caller's Supabase access token when one exists — Task 3's server-side guards depend on this being present once Task 6 finishes wiring real logins.

- [ ] **Step 1: Add the Supabase session token to every request**

In `client/src/lib/api.ts`, add the import after the existing `import type { Template } from "@pdfme/common";` line:

```ts
import { supabase } from "./supabase.js";
```

Replace the `request` function:

```ts
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + url, options);
```

with:

```ts
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = { ...(await authHeaders()), ...(options?.headers ?? {}) };
  const res = await fetch(API_BASE + url, { ...options, headers });
```

- [ ] **Step 2: Attach the header to the two raw-`fetch` helpers too**

In `createFilledPdf`, replace:

```ts
    const res = await fetch(API_BASE + "/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
```

with:

```ts
    const res = await fetch(API_BASE + "/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
```

In `uploadAsset`, replace:

```ts
    const res = await fetch(API_BASE + "/assets", { method: "POST", body: formData });
```

with:

```ts
    const res = await fetch(API_BASE + "/assets", { method: "POST", headers: await authHeaders(), body: formData });
```

- [ ] **Step 3: Add `Role` to the existing type-only import**

Change:

```ts
import type {
  TemplateRecord,
  TemplateSummary,
  PublishedVersionSummary,
  AssetRecord,
  LetterheadSummary,
  LetterheadRecord,
  SubmissionRecord,
} from "../types.js";
```

to:

```ts
import type {
  Role,
  TemplateRecord,
  TemplateSummary,
  PublishedVersionSummary,
  AssetRecord,
  LetterheadSummary,
  LetterheadRecord,
  SubmissionRecord,
} from "../types.js";
```

- [ ] **Step 4: Add the four new `api` methods**

Add to the `api` object, after the existing `submitWaitlist` entry:

```ts
  getInvite: (code: string) => request<{ orgName: string; role: Role }>(`/auth/invites/${code}`),

  acceptInvite: (code: string) =>
    request<{ orgId: string; role: Role }>(`/auth/invites/${code}/accept`, { method: "POST" }),

  createOrganization: (name: string) =>
    request<{ orgId: string; orgName: string; role: Role }>("/auth/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  createInvite: (role: Role) =>
    request<{ code: string; expiresAt: string }>("/auth/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    }),
```

- [ ] **Step 5: Create the Onboarding page**

Create `client/src/pages/Onboarding.tsx`:

```tsx
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../lib/api.js';

interface InviteInfo {
  orgName: string;
  role: string;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ background: 'var(--nx-canvas)', color: 'var(--nx-ink)' }}
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-[var(--nx-radius-sm)] mb-6"
        style={{ background: 'var(--nx-accent-tint)' }}
      >
        <FileText className="h-6 w-6" style={{ color: 'var(--nx-accent)' }} />
      </div>
      {children}
    </div>
  );
}

export default function Onboarding() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { session, profile, loading, signInWithGoogle, refreshProfile } = useAuth();

  const [orgName, setOrgName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [inviteLoaded, setInviteLoaded] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setInviteLoaded(true);
      return;
    }
    api
      .getInvite(code)
      .then(setInvite)
      .catch(() => setInviteError('This invite link is invalid or has expired.'))
      .finally(() => setInviteLoaded(true));
  }, [code]);

  if (loading || !inviteLoaded) return null;

  if (!session) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">
          {code ? 'Sign in to accept your invite' : 'Sign in to continue'}
        </h1>
        <Button size="lg" className="h-12 px-6 text-base mt-8" onClick={() => void signInWithGoogle()}>
          Sign in with Google
        </Button>
      </Shell>
    );
  }

  if (profile?.orgId) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">You're already part of an organization</h1>
        <Button size="lg" className="h-12 px-6 text-base mt-8" onClick={() => navigate('/')}>
          Go to Dashboard
        </Button>
      </Shell>
    );
  }

  const handleAcceptInvite = async () => {
    if (!code) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.acceptInvite(code);
      await refreshProfile();
      navigate('/');
    } catch {
      setError('Could not accept this invite. It may have already been used.');
      setSubmitting(false);
    }
  };

  const handleCreateOrg = async (e: FormEvent) => {
    e.preventDefault();
    if (orgName.trim().length === 0) {
      setError('Please enter an organization name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createOrganization(orgName.trim());
      await refreshProfile();
      navigate('/');
    } catch {
      setError('Something went wrong creating your organization — please try again.');
      setSubmitting(false);
    }
  };

  if (code) {
    if (inviteError) {
      return (
        <Shell>
          <h1 className="text-2xl font-bold tracking-tight">Invalid invite</h1>
          <p className="mt-3 text-base" style={{ color: 'var(--nx-ink-secondary)' }}>{inviteError}</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">Join {invite?.orgName}</h1>
        <p className="mt-3 text-base" style={{ color: 'var(--nx-ink-secondary)' }}>
          You've been invited to join as <strong>{invite?.role}</strong>.
        </p>
        {error && (
          <div
            className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm mt-4"
            role="alert"
            style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <Button size="lg" className="h-12 px-6 text-base mt-6" disabled={submitting} onClick={handleAcceptInvite}>
          {submitting ? 'Joining…' : `Join ${invite?.orgName}`}
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight">Create your organization</h1>
      <p className="mt-3 text-base" style={{ color: 'var(--nx-ink-secondary)' }}>
        You'll be the Admin and can invite teammates afterward.
      </p>
      <form onSubmit={handleCreateOrg} className="mt-8 w-full max-w-sm flex flex-col gap-3 text-left">
        <label className="sr-only" htmlFor="org-name">Organization name</label>
        <Input
          id="org-name"
          placeholder="Organization name"
          value={orgName}
          disabled={submitting}
          onChange={(e) => setOrgName(e.target.value)}
        />
        {error && (
          <div
            className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm"
            role="alert"
            style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <Button type="submit" size="lg" className="h-12 text-base" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create organization'}
        </Button>
      </form>
    </Shell>
  );
}
```

This page isn't reachable yet (wired into routing in Task 6) — verify it directly for now.

- [ ] **Step 6: Verify the create-org path with a browser-injected session**

Start the client (`npm --prefix client run dev`) and server (`npm --prefix server run dev`) if not already running. Temporarily render `<Onboarding />` directly in `main.tsx` in place of `<App />` (same technique as Task 4 Step 8), wrapped in `AuthProvider`.

Since there's no real Google login yet, inject a real session from Task 2's test-token flow via the browser console (use the Browser pane's `javascript_tool`) — mint a fresh token pair for a brand-new test user first:

```bash
SUPABASE_SERVICE_ROLE_KEY=<service_role key> SUPABASE_ANON_KEY=<anon key> \
  npx tsx server/scripts/mint-test-token.ts onboarding-test@example.com
```

That script only prints the access token; for a browser session you also need the refresh token. Get both directly:

```bash
ANON_KEY=<anon key>
curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"onboarding-test@example.com","password":"test-password-123"}'
```

Copy `access_token` and `refresh_token` from the response. In the browser (on the client dev server origin), run via `javascript_tool`:

```js
await window.supabase.auth.setSession({ access_token: '<access_token>', refresh_token: '<refresh_token>' });
location.reload();
```

(Temporarily add `(window as any).supabase = supabase;` at the bottom of `client/src/lib/supabase.ts` to make this reachable — remove it again once this manual check is done.)

After reload, confirm the "Create your organization" form renders (this test user has no org yet). Type a name, submit, and confirm it redirects to `/` (or shows a blank page if `/` isn't routed to `Dashboard` yet in `main.tsx`'s temporary override — that's fine, the important thing is no error was shown and `api.createOrganization` returned 200). Verify directly against the DB:

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c \
  "select role, organizations.name from profiles join organizations on organizations.id = profiles.org_id where profiles.id = (select id from auth.users where email='onboarding-test@example.com');"
```

Expected: one row, `role = Admin`, the org name you typed.

- [ ] **Step 7: Verify the join-by-invite path**

As the org Admin created in Step 6, mint an invite via curl (reusing the `$ADMIN_TOKEN`-style flow from Task 2, but for `onboarding-test@example.com`'s token) targeting role `FormFiller`. Then create a second test user, set their session in the browser the same way, and navigate to `/join/<code>` (with the temporary `main.tsx` override rendering `<Onboarding />` regardless of path, or restore normal routing early if Task 6 is done by this point). Confirm the "Join `<org name>`... as FormFiller" screen renders, clicking the join button succeeds, and the same DB query as Step 6 (for the second test user) now shows `role = FormFiller` and the same org name.

Revert the temporary `main.tsx` override and the temporary `window.supabase` exposure.

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/api.ts client/src/pages/Onboarding.tsx
git commit -m "feat(client): add onboarding flow (create org / accept invite) and auth-aware api client"
```

---

### Task 6: Routing, guards, Sidebar, Settings/invite UI, and cleanup

**Files:**
- Create: `client/src/components/AuthGuard.tsx`
- Modify: `client/src/components/RoleGuard.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/main.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/pages/Dashboard.tsx`
- Modify: `client/src/pages/TemplateList.tsx`
- Modify: `client/src/lib/productTour.ts`
- Create: `client/src/pages/Settings.tsx`
- Delete: `client/src/context/RoleContext.tsx`
- Delete: `client/src/components/NavBar.tsx` (dead code — unused anywhere, and it imports the now-deleted `RoleContext`)

**Interfaces:**
- Consumes: `useAuth()` (Task 4), `Onboarding.tsx`/`api.createInvite` (Task 5).
- Produces: the final routing/UI. Nothing later depends on this — last task.

- [ ] **Step 1: Create `AuthGuard`**

Create `client/src/components/AuthGuard.tsx`:

```tsx
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
```

- [ ] **Step 2: Update `RoleGuard` to read from `AuthContext`**

Replace the full contents of `client/src/components/RoleGuard.tsx`:

```tsx
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
```

- [ ] **Step 3: Rewrite `App.tsx`**

Replace the full contents of `client/src/App.tsx`:

```tsx
import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { RoleGuard } from './components/RoleGuard.js';
import { AuthGuard } from './components/AuthGuard.js';

const Landing = lazy(() => import('./pages/Landing.js'));
const Waitlist = lazy(() => import('./pages/Waitlist.js'));
const Login = lazy(() => import('./pages/Login.js'));
const Onboarding = lazy(() => import('./pages/Onboarding.js'));
const Dashboard = lazy(() => import('./pages/Dashboard.js'));
const TemplateList = lazy(() => import('./pages/TemplateList.js'));
const TemplateGallery = lazy(() => import('./pages/TemplateGallery.js'));
const TemplateDesigner = lazy(() => import('./pages/TemplateDesigner.js'));
const FormFill = lazy(() => import('./pages/FormFill.js'));
const Assets = lazy(() => import('./pages/Assets.js'));
const Letterheads = lazy(() => import('./pages/Letterheads.js'));
const Submissions = lazy(() => import('./pages/Submissions.js'));
const Settings = lazy(() => import('./pages/Settings.js'));
const NotFound = lazy(() => import('./pages/NotFound.js'));

function RouteFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '2px solid var(--nx-hairline)',
          borderTopColor: 'var(--nx-accent)',
          animation: 'nx-spin 0.6s linear infinite',
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/welcome" element={<Landing />} />
        <Route path="/waitlist" element={<Waitlist />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/join/:code" element={<Onboarding />} />
        <Route path="/templates/:id/fill" element={<FormFill />} />

        <Route path="/" element={<AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/templates" element={<AuthGuard><TemplateList /></AuthGuard>} />
        <Route
          path="/templates/gallery"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <TemplateGallery />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/templates/new"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <TemplateDesigner />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/templates/:id/edit"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <TemplateDesigner />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/assets"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <Assets />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/letterheads"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <Letterheads />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/templates/:id/submissions"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin', 'Designer']}>
                <Submissions />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGuard>
              <RoleGuard allowed={['Admin']}>
                <Settings />
              </RoleGuard>
            </AuthGuard>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
```

- [ ] **Step 4: Wire `AuthProvider` in `main.tsx`**

Replace the full contents of `client/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.js';
import { AuthProvider } from './context/AuthContext.js';
import App from './App.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
```

- [ ] **Step 5: Update `Sidebar.tsx`**

Replace the import line:

```tsx
import { useRole } from '../../context/RoleContext.js';
```

with:

```tsx
import { useAuth } from '../../context/AuthContext.js';
```

Add `AvatarImage` to the existing avatar import:

```tsx
import { Avatar, AvatarFallback } from '../ui/avatar.js';
```
→
```tsx
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.js';
```

Replace the function body's opening (from `export function Sidebar() {` through the `initials` line):

```tsx
export function Sidebar() {
  const { role, setRole } = useRole();
  const navigate = useNavigate();
  const initials = role === 'FormFiller' ? 'FF' : role.slice(0, 2).toUpperCase();
```

with:

```tsx
export function Sidebar() {
  const { role, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const displayName = profile?.fullName ?? 'Account';
  const initials = displayName
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };
```

Replace the entire "User footer" block (from `{/* User footer */}` to the closing `</div>` right before `</aside>`):

```tsx
      {/* User footer */}
      <div className="p-3 space-y-3" style={{ borderTop: '1px solid var(--nx-hairline)' }}>
        {/* Role switcher */}
        <div data-tour={TOUR_ANCHORS.sidebarRoleSwitcher}>
          <p
            className="px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--nx-ink-muted)' }}
          >
            Switch Role
          </p>
          <div className="flex gap-1">
            {(['Admin', 'Designer', 'FormFiller'] as const).map((r) => (
              <TooltipProvider key={r} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setRole(r)}
                      className={cn(
                        'flex-1 px-1 py-1 text-[11px] font-medium transition-colors duration-150 rounded-[var(--nx-radius-sm)]',
                        role === r
                          ? 'text-white'
                          : 'text-[var(--nx-ink-secondary)] hover:bg-[var(--nx-surface)] border border-[var(--nx-hairline)]'
                      )}
                      style={role === r ? { background: 'var(--nx-accent)' } : undefined}
                    >
                      {r === 'FormFiller' ? 'Filler' : r}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Switch to {r}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>

        {/* User row */}
        <div className="flex items-center gap-3 px-1">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs font-semibold text-white" style={{ background: 'var(--nx-ink)' }}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--nx-ink)' }}>{role}</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--nx-ink-muted)' }}>
              Current role
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="transition-colors"
            style={{ color: 'var(--nx-ink-muted)' }}
            title="Home"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
```

with:

```tsx
      {/* User footer */}
      <div
        className="p-3 space-y-3"
        style={{ borderTop: '1px solid var(--nx-hairline)' }}
        data-tour={TOUR_ANCHORS.sidebarRoleSwitcher}
      >
        <div className="flex items-center gap-3 px-1">
          <Avatar className="h-8 w-8 shrink-0">
            {profile?.avatarUrl ? (
              <AvatarImage src={profile.avatarUrl} alt={displayName} />
            ) : (
              <AvatarFallback className="text-xs font-semibold text-white" style={{ background: 'var(--nx-ink)' }}>
                {initials}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--nx-ink)' }}>{displayName}</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--nx-ink-muted)' }}>
              {role ?? '—'}
            </p>
          </div>
          <button
            onClick={() => void handleSignOut()}
            className="transition-colors"
            style={{ color: 'var(--nx-ink-muted)' }}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
```

The `TooltipProvider`/`Tooltip`/`TooltipTrigger`/`TooltipContent` imports remain in use elsewhere in the file (the nav items still use them) — do not remove those imports. The `cn` import also remains in use elsewhere.

- [ ] **Step 6: Update `Dashboard.tsx` and `TemplateList.tsx`**

In both files, change:

```ts
import { useRole } from '../context/RoleContext.js';
```

to:

```ts
import { useAuth } from '../context/AuthContext.js';
```

And change:

```ts
const { role } = useRole();
```

to:

```ts
const { role } = useAuth();
```

- [ ] **Step 7: Update the product tour's role-switcher step copy**

In `client/src/lib/productTour.ts`, replace:

```ts
      {
        element: `[data-tour="${TOUR_ANCHORS.sidebarRoleSwitcher}"]`,
        popover: {
          title: 'Switch roles',
          description: 'Preview the app as an Admin, Designer, or Form Filler — each sees a different set of tools.',
        },
      },
```

with:

```ts
      {
        element: `[data-tour="${TOUR_ANCHORS.sidebarRoleSwitcher}"]`,
        popover: {
          title: 'Your role',
          description: 'Your role in this organization is shown here. Ask an Admin to invite you again with a different role if you need broader access.',
        },
      },
```

- [ ] **Step 8: Create the Settings page (invite teammates)**

Create `client/src/pages/Settings.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { AlertCircle, Copy, Check } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { api } from '../lib/api.js';
import type { Role } from '../types.js';

const INVITABLE_ROLES: Role[] = ['Admin', 'Designer', 'FormFiller'];

export default function Settings() {
  const [role, setRole] = useState<Role>('Designer');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setInviteLink(null);
    try {
      const { code } = await api.createInvite(role);
      setInviteLink(`${window.location.origin}/join/${code}`);
    } catch {
      setError('Something went wrong generating the invite — please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppLayout>
      <TopBar title="Settings" />
      <div className="p-6 max-w-xl">
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--nx-ink)' }}>Invite a teammate</h2>
          <p className="text-sm mb-5" style={{ color: 'var(--nx-ink-secondary)' }}>
            Generate a link that lets someone join your organization with the role you choose.
          </p>
          <form onSubmit={handleGenerate} className="flex flex-col gap-3">
            <label
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--nx-ink-muted)' }}
              htmlFor="invite-role"
            >
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-9 px-3 text-sm rounded-[var(--nx-radius-sm)]"
              style={{ border: '1px solid var(--nx-hairline)', color: 'var(--nx-ink)' }}
            >
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {error && (
              <div
                className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm"
                role="alert"
                style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button type="submit" disabled={generating} className="self-start">
              {generating ? 'Generating…' : 'Generate invite link'}
            </Button>
          </form>

          {inviteLink && (
            <div
              className="mt-5 flex items-center gap-2 p-3 rounded-[var(--nx-radius-sm)]"
              style={{ background: 'var(--nx-surface)', border: '1px solid var(--nx-hairline)' }}
            >
              <code className="flex-1 text-xs truncate" style={{ color: 'var(--nx-ink)' }}>{inviteLink}</code>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
```

- [ ] **Step 9: Delete the dead `RoleContext` and `NavBar`**

```bash
rm client/src/context/RoleContext.tsx client/src/components/NavBar.tsx
```

`NavBar.tsx` was already unused anywhere in the app (confirmed via `grep -rl "NavBar" client/src` returning only the file itself) — it's removed here only because it imports the now-deleted `RoleContext` and would otherwise fail to type-check.

- [ ] **Step 10: Type-check the client**

```bash
npm --prefix client run build
```

Expected: `tsc` (the first half of the `build` script) completes with no errors. This also confirms nothing still imports `RoleContext.js` or `NavBar.js`.

- [ ] **Step 11: Full manual walkthrough in the browser**

With local Supabase (`npx supabase start`), the server (`npm --prefix server run dev`), and the client (`npm --prefix client run dev`) all running:

1. Open the client root URL while logged out. Confirm it redirects to `/login`.
2. Repeat the session-injection technique from Task 5 Step 6 (mint a fresh test user, `supabase.auth.setSession(...)` in the browser console) for a brand-new email. After reload, confirm it lands on `/onboarding` (not `/login`, not `/`) showing "Create your organization".
3. Create an org. Confirm redirect to `/`, the Sidebar shows the real display name/role (not "Admin"/"Designer" switch buttons), and `/settings` is reachable (Admin).
4. On `/settings`, generate an invite for role `FormFiller`. Copy the link.
5. In a private/incognito window (or after signing out), inject a session for a second brand-new test user and navigate to the copied `/join/<code>` URL. Confirm it shows "Join `<org>` ... as FormFiller", accept it, and confirm redirect to `/`.
6. As this FormFiller user, confirm the Sidebar does not show Templates/New Template/Gallery/Assets/Letterheads/Settings nav items (RoleGuard still hides them client-side) and that navigating directly to `/templates/gallery` bounces back to `/`.
7. Sign out via the Sidebar's sign-out button. Confirm redirect to `/login` and that navigating back to `/` also redirects to `/login` (session is really gone, not just hidden).

Take a screenshot of the Dashboard (as the Admin user, mid-walkthrough) and the Settings invite screen for the report.

- [ ] **Step 12: Commit**

```bash
git add client/src/components/AuthGuard.tsx client/src/components/RoleGuard.tsx client/src/App.tsx \
  client/src/main.tsx client/src/components/layout/Sidebar.tsx client/src/pages/Dashboard.tsx \
  client/src/pages/TemplateList.tsx client/src/lib/productTour.ts client/src/pages/Settings.tsx
git rm client/src/context/RoleContext.tsx client/src/components/NavBar.tsx
git commit -m "feat(client): wire real auth routing, remove fake role switcher, add invite settings page"
```

# Supabase Auth, Organizations & Roles — Design

**Date:** 2026-08-10
**Status:** Approved
**Database:** Supabase (Postgres) — new, separate from the existing MSSQL app database

---

## Overview

The app currently has no real authentication. `role` (`Admin` | `Designer` | `FormFiller`) is a value the user picks themselves and stores in `localStorage` ([client/src/context/RoleContext.tsx](../../../client/src/context/RoleContext.tsx)); `RoleGuard` ([client/src/components/RoleGuard.tsx](../../../client/src/components/RoleGuard.tsx)) only hides routes client-side — nothing prevents anyone from setting `role=Admin` and calling any server route directly.

This spec adds:
- Supabase Auth with Google OAuth as the only sign-in method (no email/password)
- Organizations, with one org per user
- A signup flow that either creates a new org (org creator becomes `Admin`) or joins an existing org via an invite link that carries a pre-set role
- Server-side enforcement of `role`, replacing the client-only `RoleGuard`

**This spec does not migrate existing app data** (`pdf_templates`, `template_versions`, submissions, assets, letterheads, waitlist) off MSSQL. That is a separate, later project. This spec only adds new tables in Supabase's Postgres for auth/orgs/roles/invites.

---

## Data Model (Supabase Postgres)

### `organizations`

```sql
CREATE TABLE organizations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `profiles`

One row per authenticated user, created automatically right after Supabase creates the corresponding `auth.users` row. `org_id` and `role` start `NULL` and are filled in by the onboarding flow (org creation or invite acceptance) — a user who has authenticated but not yet completed onboarding has a `profiles` row with no org.

```sql
CREATE TABLE profiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     UUID        REFERENCES organizations(id),
  role       TEXT        CHECK (role IN ('Admin', 'Designer', 'FormFiller')),
  full_name  TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT org_and_role_together CHECK (
    (org_id IS NULL AND role IS NULL) OR (org_id IS NOT NULL AND role IS NOT NULL)
  )
);
```

A Postgres trigger on `auth.users` (`AFTER INSERT`) inserts the matching `profiles` row, copying `full_name`/`avatar_url` out of the Google OAuth `raw_user_meta_data`.

### `invites`

```sql
CREATE TABLE invites (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('Admin', 'Designer', 'FormFiller')),
  code       TEXT        NOT NULL UNIQUE,
  created_by UUID        NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  used_by    UUID        REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invites_code ON invites(code) WHERE used_at IS NULL;
```

`code` is an opaque random token (e.g. `nanoid`), embedded in the invite URL as `/join/:code`. An invite is valid if `used_at IS NULL AND expires_at > NOW()`.

### Relationships

```
organizations
  └── profiles     (one org → many members; each profile has exactly one org)
  └── invites       (one org → many invites, each invite pre-sets a role)
```

---

## Signup / Onboarding Flow (client)

1. User clicks **Sign in with Google**. Supabase handles the OAuth redirect and returns a session.
2. Client fetches the user's `profiles` row.
   - **`org_id` is set** → onboarding already done, go straight to the Dashboard.
   - **`org_id` is `NULL`** → onboarding required:
     - **No invite code in the URL** → show "Create your organization" (name field only). On submit: create the `organizations` row, then update `profiles` to `{ org_id, role: 'Admin' }`.
     - **Invite code present** (arrived via `/join/:code`) → look up the invite, show the org name and the role it carries (read-only — the invitee cannot change it), and a confirm button. On confirm: update `profiles` to `{ org_id: invite.org_id, role: invite.role }`, mark the invite used.
     - Invalid/expired/already-used invite code → show an error and fall back to the "create your organization" path.
3. `AuthContext` (new, replaces `RoleContext`) holds the Supabase session and the `profiles` row, and exposes `{ user, org, role, signOut }`. `RoleGuard` reads `role` from `AuthContext` instead of `localStorage`.

---

## Invites (client + server)

- New "Invite teammate" screen, visible only to `Admin`. Admin picks a role from a dropdown and clicks Generate; server creates an `invites` row and returns the code. The UI shows a copyable `/join/:code` link.
- Server route validates and consumes invite codes (create + lookup + mark-used) — the client never writes to `invites` directly, so a user can't forge an invite or grant themselves a role.

---

## Server-Side Enforcement

- New Express middleware verifies the Supabase-issued JWT from the `Authorization: Bearer <token>` header via `supabaseAdmin.auth.getUser(token)` (delegates verification to Supabase's own Auth server, so it works regardless of signing algorithm — see "JWT verification" decision below) and attaches `{ userId, orgId, role }` to `req`.
- Applied to all routes that are currently only guarded client-side by `RoleGuard` with `allowed={['Admin', 'Designer']}`: templates gallery, template create/edit, assets, letterheads, submissions-list. The server-side check mirrors the client's allow-list.
- Routes that stay public/unauthenticated (unchanged): `/health`, `/waitlist`, `/templates/:id/fill` (and the POST endpoints it depends on to submit/generate a filled PDF) — these are used by external recipients who don't have accounts.
- Because the app tables (`pdf_templates`, etc.) still live in MSSQL in this spec, the new middleware does not yet scope *those* queries by `org_id` — there's only one tenant's worth of app data today. Org-scoping the app data itself happens when those tables move to Supabase Postgres in the follow-up project.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Google OAuth only, no email/password | Matches stated requirement; avoids building password reset / email verification flows |
| One org per user | Matches how the app is used today (single company workspace); no org-switcher UI needed |
| Org creator becomes `Admin` automatically | The first person from a company has to have full access to invite others |
| Invited users get the role the inviter set, not a free choice | Prevents a new joiner from self-assigning `Admin` |
| Invite is a shareable link/code, not an email | No email-sending infrastructure (Supabase email config, templates) needed for this spec |
| `profiles.org_id`/`role` nullable together | Lets a user exist in `auth.users`/`profiles` between "signed in with Google" and "finished onboarding" without a separate onboarding-state table |
| Reuse existing `Admin`/`Designer`/`FormFiller` roles | No new role semantics to design; just make the existing ones real and enforced |
| `/templates/:id/fill` and its supporting routes stay unauthenticated | External form-fillers generally don't have (and shouldn't need) accounts |
| JWT verified via `supabaseAdmin.auth.getUser(token)`, not a local shared-secret check | Originally planned as local HS256-secret verification to avoid a network call, but the local Supabase CLI signs tokens with an asymmetric ES256 key (its modern default) that a static-secret check can't verify. `getUser()` delegates verification to Supabase's own Auth server, works regardless of signing algorithm, and needs no JWT-secret env var — at the cost of one extra local network hop per authenticated request, negligible for this app's traffic. Discovered and decided during Task 2 implementation. |

---

## Migration File Naming Convention

New Supabase migrations, separate from the existing `server/migrations/*.sql` (MSSQL/legacy Postgres-schema files, untouched by this spec):

```
supabase/migrations/
  0001_create_organizations.sql
  0002_create_profiles.sql
  0003_create_profiles_trigger.sql
  0004_create_invites.sql
```

---

## Out of Scope

- Migrating `pdf_templates`, `template_versions`, submissions, assets, letterheads, waitlist off MSSQL (separate follow-up project)
- Multiple organizations per user / org switching
- Email/password sign-in, password reset
- Email-based invites (only shareable link/code)
- An `Owner` role above `Admin`
- Org-level billing or settings beyond a name
- Requiring login on the public form-fill flow

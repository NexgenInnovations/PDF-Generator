# Email/Password Auth & Password Reset — Design

**Date:** 2026-08-18
**Status:** Approved

---

## Overview

Auth today is Google OAuth only (see [2026-08-10-supabase-auth-organizations-design.md](2026-08-10-supabase-auth-organizations-design.md), which explicitly scoped email/password out). This spec adds email/password as a second sign-in method, available alongside Google, plus a self-service password-reset flow — using Supabase Auth's built-in `signUp` / `signInWithPassword` / `resetPasswordForEmail` / `updateUser`, not custom token or email infrastructure.

Everything downstream of "we have a session" — onboarding (org creation / invite acceptance), `profiles` row creation, `RoleGuard`, server-side `requireAuth` — is provider-agnostic already and needs no changes. This spec only touches how a session gets created in the first place, plus two new client pages for the reset flow.

---

## Supabase Config (`supabase/config.toml`)

| Setting | Current | New | Why |
|---|---|---|---|
| `auth.email.enable_confirmations` | `false` | `true` | Require confirming the email address before first sign-in, so signups can't be made with an address the signer-upper doesn't own. |
| `auth.minimum_password_length` | `6` | `8` | Basic hygiene floor. |
| `auth.password_requirements` | `""` | `""` (unchanged) | Length-only — no forced symbol/case mix. A full strength-meter was explicitly decided against. |

`site_url` / `additional_redirect_urls` are already set for local dev (`http://localhost:5173/**`) and don't need changes for this spec; production values are a deploy-time concern, out of scope here.

**Known limitation carried forward:** per the existing spec's "Known Limitations" §2, `auth.email.enable_signup` was already `true` at the Supabase Auth server level for local dev test tooling (`mint-test-token.ts`), even though the UI didn't expose it. This spec makes that UI exposure real and intentional — the limitation note about disabling it "before sharing this config beyond a single developer's machine" no longer applies once this ships, since email/password becomes an intended, first-class sign-in method.

---

## Data Model — No Changes

`handle_new_user()` (the `auth.users` → `profiles` trigger) already reads `full_name`/`avatar_url` via Postgres `->>`, which safely resolves to `NULL` when the key is absent:

```sql
insert into public.profiles (id, full_name, avatar_url)
values (
  new.id,
  new.raw_user_meta_data ->> 'full_name',
  new.raw_user_meta_data ->> 'avatar_url'
);
```

Email/password signups will pass `full_name` explicitly through `signUp`'s `options.data`, so it lands in `raw_user_meta_data` the same way Google's profile data does today. `avatar_url` stays `NULL` for email signups — the UI (`Sidebar.tsx`) already falls back to an icon/initials when `avatarUrl` is absent, so no UI change needed there.

---

## `AuthContext` — New Methods

Added to `client/src/context/AuthContext.tsx`, alongside the existing `signInWithGoogle` / `signOut`:

```ts
signUpWithEmail(email: string, password: string, fullName: string): Promise<{ error: string | null }>
signInWithEmail(email: string, password: string): Promise<{ error: string | null }>
sendPasswordReset(email: string): Promise<{ error: string | null }>
updatePassword(newPassword: string): Promise<{ error: string | null }>
```

Each wraps the corresponding Supabase call and normalizes the error into a string message for the calling form to display, rather than throwing — matching how the rest of the auth UI (`Onboarding.tsx`) handles errors today (catch → set an error string in state).

- `signUpWithEmail` → `supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/login` } })`. Because `enable_confirmations` is on, this returns a user but no session — the UI must show a "check your email" message rather than expecting immediate sign-in.
- `signInWithEmail` → `supabase.auth.signInWithPassword({ email, password })`.
- `sendPasswordReset` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })`.
- `updatePassword` → `supabase.auth.updateUser({ password: newPassword })`, used only from the `ResetPassword` page (see below).

---

## UI Changes (client)

### `Login.tsx` (rewrite)

Adds an email/password form beside the existing "Sign in with Google" button:

- Mode toggle: **Sign in** / **Sign up** (default: Sign in).
- **Sign in** mode: email + password fields, submit → `signInWithEmail`. "Forgot password?" link → `/forgot-password`.
- **Sign up** mode: full name + email + password fields, submit → `signUpWithEmail`. On success (no error), replace the form with a "Check your email to confirm your account" message instead of redirecting — there's no session yet.
- Errors from either mode render inline the same way `Onboarding.tsx` already renders its error state (icon + message in a destructive-tinted box), for visual consistency.
- The existing `session` redirect logic (`Navigate to={profile?.orgId ? '/' : '/onboarding'}`) is unchanged — once a session exists (via Google, or via confirmed email sign-in), it fires the same way regardless of provider.

### `ForgotPassword.tsx` (new, route `/forgot-password`)

Single email field → `sendPasswordReset`. Always shows a generic "If that email is registered, we've sent a reset link" success message after submit (don't reveal whether the address has an account — standard practice, and Supabase's API doesn't distinguish either).

### `ResetPassword.tsx` (new, route `/reset-password`)

Destination of the link in the reset email. The Supabase JS client auto-detects the recovery token in the URL fragment and fires a `PASSWORD_RECOVERY` auth event (already wired through `AuthContext`'s `onAuthStateChange` listener — no changes needed there since it just sets `session`). The page:

1. Waits for `loading` to clear (same pattern as `Login.tsx`/`Onboarding.tsx`).
2. If no session at all → show "This reset link is invalid or has expired," with a link back to `/forgot-password`.
3. If session present → show a new-password form (password + confirm, client-side min-8-chars check mirroring the Supabase config) → `updatePassword` → on success, `navigate('/')` (the existing root-route logic then sends the user to `/onboarding` or the dashboard as appropriate).

### `App.tsx` routing

Two new public routes, alongside the existing `/login` and `/onboarding`:

```tsx
<Route path="/forgot-password" element={<ForgotPassword />} />
<Route path="/reset-password" element={<ResetPassword />} />
```

---

## Server — No Changes

`requireAuth` (`server/src/middleware/auth.ts`) verifies via `supabaseAdmin.auth.getUser(token)`, which works identically regardless of which provider issued the token. `authRouter`'s organization/invite routes are also provider-agnostic. Confirmed by reading both files — no edits needed in `server/src/`.

---

## Error Handling

| Case | Handling |
|---|---|
| Sign-in with wrong password | Supabase returns `Invalid login credentials` — surfaced as-is (matches Supabase's own generic wording, avoids revealing whether the email exists). |
| Sign-in before confirming email | Supabase returns an "email not confirmed" error — surfaced with a hint to check inbox / resend (resend via calling `signUpWithEmail` again is Supabase's existing behavior, no new endpoint needed). |
| Sign-up with an email that already has an account | Supabase's behavior with confirmations on: no error is returned (to avoid leaking existence of the account) and no new confirmation email is sent to an already-confirmed address — the sign-up form shows the same "check your email" message either way, matching Supabase's own anti-enumeration design. |
| Reset link expired/invalid | `ResetPassword.tsx` shows the invalid-link state described above. |
| Password under 8 characters | Caught client-side before submit; also enforced server-side by Supabase's `minimum_password_length`. |

---

## Testing

- Extend `packages/ui`/client test setup only if there's an existing pattern for testing `Login.tsx`/`Onboarding.tsx` — otherwise this is UI verified manually in the playground per project convention (`DEVELOPMENT.md`), consistent with how the original Google-only auth spec was verified.
- Manual verification path: sign up with email → confirm via local Inbucket → sign in → onboarding → forgot password → reset link via Inbucket → set new password → sign in with new password.

---

## Out of Scope

- Domain-restricted / auto-join org membership by email domain (confirmed with user: "custom domains" means *any* email address is allowed, not domain-based org matching).
- Production SMTP provider configuration (local dev already sends mail via Supabase's local Inbucket; a real provider like SendGrid is a deploy-time/infra decision, not app code).
- MFA/2FA.
- Changing email address after signup, or re-sending confirmation from a dedicated "resend" button (falls out naturally by re-running signup, per Supabase's behavior above; a dedicated resend UI can be added later if needed).

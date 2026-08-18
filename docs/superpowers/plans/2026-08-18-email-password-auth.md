# Email/Password Auth & Password Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password as a second sign-in method alongside the existing Google OAuth, plus a self-service password-reset flow.

**Architecture:** Everything is built on Supabase Auth's built-in `signUp` / `signInWithPassword` / `resetPasswordForEmail` / `updateUser` calls — no custom token generation or email-sending infrastructure. `AuthContext` gains four new methods; two new pages (`ForgotPassword`, `ResetPassword`) handle the reset flow; `Login` gains an email/password form beside the existing Google button. Server-side `requireAuth` and the onboarding flow (org creation / invite acceptance) are provider-agnostic already and need no changes.

**Tech Stack:** React + TypeScript (client), Supabase Auth (`@supabase/supabase-js`), Supabase local CLI (`supabase/config.toml`), React Router.

**Spec:** [docs/superpowers/specs/2026-08-18-email-password-auth-design.md](../specs/2026-08-18-email-password-auth-design.md)

## Global Constraints

- `auth.minimum_password_length` = `8` (up from `6`) — Supabase-enforced floor.
- `auth.password_requirements` stays `""` — length-only, no forced symbol/case mix.
- `auth.email.enable_confirmations` = `true` — email must be confirmed before first sign-in via the public signup flow.
- No new npm dependencies. No new automated test infrastructure — this client has none today; verify UI changes manually via the dev server, matching existing project convention (`DEVELOPMENT.md`, and how `Login.tsx`/`Onboarding.tsx` were verified originally).
- No server-side (`server/src/`) changes — `requireAuth` and `authRouter` are already provider-agnostic.

---

### Task 1: Supabase Auth config — require email confirmation, raise password minimum

**Files:**
- Modify: `supabase/config.toml:182` (`minimum_password_length`)
- Modify: `supabase/config.toml:219` (stale comment above `[auth.email]`)
- Modify: `supabase/config.toml:227` (`enable_confirmations` under `[auth.email]`)

**Interfaces:**
- Consumes: nothing (pure config)
- Produces: an Auth server where (a) public `signUp` requires clicking a confirmation email before a session is issued, (b) passwords under 8 characters are rejected. Later tasks (2–5) depend on this behavior being live locally to test against.

- [ ] **Step 1: Edit `minimum_password_length`**

In `supabase/config.toml`, change:
```toml
# Passwords shorter than this value will be rejected as weak. Minimum 6, recommended 8 or more.
minimum_password_length = 6
```
to:
```toml
# Passwords shorter than this value will be rejected as weak. Minimum 6, recommended 8 or more.
minimum_password_length = 8
```

- [ ] **Step 2: Edit `enable_confirmations` and the stale comment above `[auth.email]`**

Change:
```toml
# enable_signup stays true for local dev test tooling (mint-test-token.ts) — disable before sharing this config beyond a single developer's machine.
[auth.email]
# Allow/disallow new user signups via email to your project.
enable_signup = true
# If enabled, a user will be required to confirm any email change on both the old, and new email
# addresses. If disabled, only the new email is required to confirm.
double_confirm_changes = true
# If enabled, users need to confirm their email address before signing in.
enable_confirmations = false
```
to:
```toml
# Email/password is a first-class sign-in method (see docs/superpowers/specs/2026-08-18-email-password-auth-design.md).
# mint-test-token.ts still works with enable_confirmations = true: it creates users via
# admin.auth.admin.createUser({ email_confirm: true }), which bypasses the public signup
# confirmation requirement entirely.
[auth.email]
# Allow/disallow new user signups via email to your project.
enable_signup = true
# If enabled, a user will be required to confirm any email change on both the old, and new email
# addresses. If disabled, only the new email is required to confirm.
double_confirm_changes = true
# If enabled, users need to confirm their email address before signing in.
enable_confirmations = true
```

- [ ] **Step 3: Restart local Supabase to apply the config**

Run: `npx supabase stop && npx supabase start`
Expected: command completes and prints the local service URLs (API, Studio, Inbucket/mail testing on port 54324) with no errors.

- [ ] **Step 4: Verify the new settings are live**

Run:
```bash
curl -s -X POST 'http://127.0.0.1:54321/auth/v1/signup' \
  -H "apikey: $(grep VITE_SUPABASE_ANON_KEY client/.env | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"email":"config-check@example.com","password":"short"}'
```
Expected: a JSON error response mentioning the password is too short (confirms `minimum_password_length = 8` is enforced).

Then run the same curl with `"password":"longenoughpassword"` instead of `"short"`.
Expected: a 200 response for a created user with `"confirmed_at": null` (or no `session` field) — confirms `enable_confirmations = true` is blocking immediate session issuance.

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml
git commit -m "chore(auth): require email confirmation, raise password minimum to 8"
```

---

### Task 2: `AuthContext` — add email/password + reset methods

**Files:**
- Modify: `client/src/context/AuthContext.tsx`

**Interfaces:**
- Consumes: `supabase` client from `client/src/lib/supabase.ts` (already imported in this file).
- Produces (consumed by Tasks 3, 4, 5):
  - `signUpWithEmail(email: string, password: string, fullName: string): Promise<{ error: string | null }>`
  - `signInWithEmail(email: string, password: string): Promise<{ error: string | null }>`
  - `sendPasswordReset(email: string): Promise<{ error: string | null }>`
  - `updatePassword(newPassword: string): Promise<{ error: string | null }>`
  - All four are exposed on the `AuthContextValue` returned by `useAuth()`, alongside the existing `session`, `profile`, `role`, `loading`, `signInWithGoogle`, `signOut`, `refreshProfile`.

- [ ] **Step 1: Add the four methods to `AuthContextValue` and the provider**

In `client/src/context/AuthContext.tsx`, extend the interface:

```ts
interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}
```

Add the implementations inside `AuthProvider`, right after the existing `signInWithGoogle` function:

```ts
  const signUpWithEmail = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    return { error: error?.message ?? null };
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  };
```

Then add all four to the `<AuthContext.Provider value={{ ... }}>` object, alongside the existing entries:

```tsx
  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        role: profile?.role ?? null,
        loading,
        signInWithGoogle,
        signUpWithEmail,
        signInWithEmail,
        sendPasswordReset,
        updatePassword,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npm run build`
Expected: `tsc` and `vite build` both complete with no errors. (This will fail until Tasks 3–5 also compile if you run it after adding a broken consumer later — for this task alone, with no new consumers yet, it must pass cleanly since `AuthContext.tsx` has no unused-variable issues: all four new values are consumed by the provider's own `value={{ ... }}` object.)

- [ ] **Step 3: Commit**

```bash
git add client/src/context/AuthContext.tsx
git commit -m "feat(auth): add email/password signup, sign-in, and reset methods to AuthContext"
```

---

### Task 3: `ForgotPassword` page

**Files:**
- Create: `client/src/pages/ForgotPassword.tsx`
- Modify: `client/src/App.tsx` (add lazy import + route)

**Interfaces:**
- Consumes: `useAuth().sendPasswordReset` (Task 2).
- Produces: route `/forgot-password`, linked to by `Login.tsx` in Task 5.

- [ ] **Step 1: Create `client/src/pages/ForgotPassword.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileText, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { useAuth } from '../context/AuthContext.js';

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (email.trim().length === 0) {
      setError('Please enter your email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await sendPasswordReset(email.trim());
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    setSent(true);
  };

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
      {sent ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="mt-3 text-base max-w-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            If that email is registered, we've sent a link to reset your password.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
          <p className="mt-3 text-base max-w-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            Enter your email and we'll send you a link to reset your password.
          </p>
          <form onSubmit={handleSubmit} className="mt-8 w-full max-w-sm flex flex-col gap-3 text-left">
            <label className="sr-only" htmlFor="forgot-email">Email</label>
            <Input
              id="forgot-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              disabled={submitting}
              onChange={(e) => setEmail(e.target.value)}
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
              {submitting ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        </>
      )}
      <Link to="/login" className="mt-6 text-sm" style={{ color: 'var(--nx-accent)' }}>
        Back to sign in
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route in `client/src/App.tsx`**

Add the lazy import next to the `Onboarding` import:
```ts
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.js'));
```

Add the route next to `/onboarding`:
```tsx
<Route path="/forgot-password" element={<ForgotPassword />} />
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npm run build`
Expected: passes with no errors.

- [ ] **Step 4: Manual verification**

Start the client dev server (`cd client && npm run dev`) with the local Supabase stack running (from Task 1). In a browser:
1. Navigate to `http://localhost:5173/forgot-password`.
2. Submit an email address (use a real local test address, e.g. `config-check@example.com` created in Task 1's verification, or any address — Supabase's local Auth server will still attempt to send).
3. Confirm the page switches to the "Check your email" state.
4. Open `http://127.0.0.1:54324` (local Inbucket mail viewer) and confirm a password-reset email arrived for that address, containing a link to `http://localhost:5173/reset-password#...`.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ForgotPassword.tsx client/src/App.tsx
git commit -m "feat(auth): add forgot-password page and route"
```

---

### Task 4: `ResetPassword` page

**Files:**
- Create: `client/src/pages/ResetPassword.tsx`
- Modify: `client/src/App.tsx` (add lazy import + route)

**Interfaces:**
- Consumes: `useAuth().session`, `useAuth().loading`, `useAuth().updatePassword` (Task 2). Relies on the Supabase JS client's default `detectSessionInUrl: true` behavior (`client/src/lib/supabase.ts` uses `createClient` with no overrides, so this is already on) to turn the recovery link's URL fragment into a session, which `AuthContext`'s existing `onAuthStateChange` listener picks up automatically — no changes needed in `AuthContext.tsx` for this.
- Produces: route `/reset-password`, the destination of the link sent by Task 3's `sendPasswordReset`.

- [ ] **Step 1: Create `client/src/pages/ResetPassword.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { useAuth } from '../context/AuthContext.js';

export default function ResetPassword() {
  const { session, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    navigate('/');
  };

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
      {!session ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight">This reset link is invalid or has expired</h1>
          <Button size="lg" className="h-12 px-6 text-base mt-8" onClick={() => navigate('/forgot-password')}>
            Request a new link
          </Button>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
          <form onSubmit={handleSubmit} className="mt-8 w-full max-w-sm flex flex-col gap-3 text-left">
            <label className="sr-only" htmlFor="new-password">New password</label>
            <Input
              id="new-password"
              type="password"
              placeholder="New password"
              value={password}
              disabled={submitting}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label className="sr-only" htmlFor="confirm-password">Confirm password</label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Confirm password"
              value={confirm}
              disabled={submitting}
              onChange={(e) => setConfirm(e.target.value)}
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
              {submitting ? 'Saving…' : 'Save new password'}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the route in `client/src/App.tsx`**

Add the lazy import next to `ForgotPassword`:
```ts
const ResetPassword = lazy(() => import('./pages/ResetPassword.js'));
```

Add the route next to `/forgot-password`:
```tsx
<Route path="/reset-password" element={<ResetPassword />} />
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npm run build`
Expected: passes with no errors.

- [ ] **Step 4: Manual verification — invalid link case**

With the dev server running, navigate directly to `http://localhost:5173/reset-password` (no token in the URL).
Expected: page shows "This reset link is invalid or has expired" with a "Request a new link" button that navigates to `/forgot-password`.

- [ ] **Step 5: Manual verification — real reset link**

Using the email captured in Task 3 Step 4 (Inbucket at `http://127.0.0.1:54324`), open the password-reset email and click its link.
Expected: browser lands on `/reset-password` and shows the "Set a new password" form (not the invalid-link state) — confirms the Supabase client picked up the recovery session from the URL. Enter a new password (≥ 8 characters) twice and submit.
Expected: no error shown, and the browser navigates away from `/reset-password` (to `/` or `/onboarding` depending on whether the account has completed onboarding).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ResetPassword.tsx client/src/App.tsx
git commit -m "feat(auth): add reset-password page and route"
```

---

### Task 5: `Login` page — add email/password sign-in and sign-up

**Files:**
- Modify: `client/src/pages/Login.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useAuth().signInWithGoogle` (existing), `useAuth().signInWithEmail`, `useAuth().signUpWithEmail` (Task 2), `Link` to `/forgot-password` (Task 3).
- Produces: the only entry point users need — Google button, email/password sign-in, email/password sign-up, and a link into the forgot-password flow, all on `/login`.

- [ ] **Step 1: Replace `client/src/pages/Login.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { FileText, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { useAuth } from '../context/AuthContext.js';

type Mode = 'signin' | 'signup';

export default function Login() {
  const { session, profile, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUp, setSignedUp] = useState(false);

  if (loading) return null;
  if (session) {
    return <Navigate to={profile?.orgId ? '/' : '/onboarding'} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (email.trim().length === 0 || password.length === 0) {
      setError('Please enter your email and password.');
      return;
    }
    if (mode === 'signup') {
      if (fullName.trim().length === 0) {
        setError('Please enter your name.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
    }

    setSubmitting(true);
    const result =
      mode === 'signup'
        ? await signUpWithEmail(email.trim(), password, fullName.trim())
        : await signInWithEmail(email.trim(), password);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (mode === 'signup') {
      setSignedUp(true);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
  };

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

      {signedUp ? (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="mt-3 text-base max-w-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            We've sent a confirmation link to {email.trim()}. Click it to activate your account, then sign in.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Sign in to NexGen PDF Manager</h1>
          <p className="mt-3 text-base max-w-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            {mode === 'signup' ? 'Create an account to get started.' : 'Sign in to continue.'}
          </p>

          <Button size="lg" className="h-12 px-6 text-base mt-8" onClick={() => void signInWithGoogle()}>
            Sign in with Google
          </Button>

          <div className="flex items-center gap-3 w-full max-w-sm mt-8" style={{ color: 'var(--nx-ink-secondary)' }}>
            <div className="h-px flex-1" style={{ background: 'var(--nx-hairline)' }} />
            <span className="text-xs uppercase tracking-wide">or</span>
            <div className="h-px flex-1" style={{ background: 'var(--nx-hairline)' }} />
          </div>

          <form onSubmit={handleSubmit} className="mt-6 w-full max-w-sm flex flex-col gap-3 text-left">
            {mode === 'signup' && (
              <>
                <label className="sr-only" htmlFor="full-name">Full name</label>
                <Input
                  id="full-name"
                  placeholder="Full name"
                  value={fullName}
                  disabled={submitting}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </>
            )}
            <label className="sr-only" htmlFor="email">Email</label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              disabled={submitting}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label className="sr-only" htmlFor="password">Password</label>
            <Input
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              disabled={submitting}
              onChange={(e) => setPassword(e.target.value)}
            />

            {mode === 'signin' && (
              <Link to="/forgot-password" className="text-sm self-end" style={{ color: 'var(--nx-accent)' }}>
                Forgot password?
              </Link>
            )}

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
              {submitting ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </Button>
          </form>

          <button
            type="button"
            className="mt-6 text-sm"
            style={{ color: 'var(--nx-accent)' }}
            onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}
          >
            {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npm run build`
Expected: passes with no errors.

- [ ] **Step 3: Manual verification — sign-up → confirm → sign-in**

With the dev server and local Supabase running:
1. Navigate to `http://localhost:5173/login`. Confirm both the Google button and the email/password form render, with "Don't have an account? Sign up" visible.
2. Click "Don't have an account? Sign up". Confirm the Full name field appears and the submit button now reads "Create account".
3. Submit with a new email (e.g. `signup-test@example.com`), a full name, and an 8+ character password.
4. Confirm the page switches to "Check your email".
5. Open `http://127.0.0.1:54324`, find the confirmation email, and click its link.
6. Confirm the browser lands back on the app already signed in (redirected per the existing `session`/`profile.orgId` logic to `/onboarding`, since this is a brand-new user).
7. Complete onboarding (create an organization) and confirm the sidebar's account display name shows the full name entered at signup — this confirms `raw_user_meta_data.full_name` flowed through `signUp`'s `options.data` into the `profiles` row via the existing `handle_new_user()` trigger, with no code changes needed on that side.
8. Sign out (via the existing sidebar sign-out control), return to `/login`, and sign in with the same email/password. Confirm it succeeds and redirects the same way.

- [ ] **Step 4: Manual verification — error cases**

1. On `/login` in sign-in mode, submit the email from Step 3 with a deliberately wrong password. Confirm an inline error renders (Supabase's "Invalid login credentials" message) and the form stays usable.
2. Sign up with a second new email but do **not** click its confirmation link, then immediately try to sign in with that email/password. Confirm an inline error renders indicating the email isn't confirmed.
3. In sign-up mode, submit a password under 8 characters. Confirm the client-side "Password must be at least 8 characters" error renders without a network call (no new Inbucket email should appear for it).
4. In sign-up mode, submit the already-confirmed email from Step 3 again (duplicate signup). Confirm the UI still shows the "Check your email" success state with no inline error — matching Supabase's anti-enumeration behavior described in the spec (no new confirmation email should appear in Inbucket for this one, since the address is already confirmed).

- [ ] **Step 5: Full-flow screenshot for the record**

Take a screenshot of `/login` in both sign-in and sign-up modes to confirm visual consistency with the rest of the app (spacing, button styles, error box styling matching `Onboarding.tsx`'s pattern).

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Login.tsx
git commit -m "feat(auth): add email/password sign-in and sign-up to the login page"
```

---

## Post-Plan Verification

After all five tasks are committed:

- [ ] Run `cd client && npm run build` once more from a clean state to confirm the full set of changes compiles together.
- [ ] Re-read `docs/superpowers/specs/2026-08-18-email-password-auth-design.md` and confirm every section (Supabase config, data model, `AuthContext` methods, `Login`/`ForgotPassword`/`ResetPassword` UI, routing, error handling) has a corresponding implemented task above.
- [ ] Confirm `server/src/routes/auth.ts` and `server/src/middleware/auth.ts` are untouched (`git diff main -- server/src/` shows nothing), matching the spec's "Server — No Changes" section.

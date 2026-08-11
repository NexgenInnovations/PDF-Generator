# Auth & Waitlist Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare single-button Login screen with a proper split-screen sign-in experience, share that shell with the Waitlist page, add OAuth-failure handling, and fix stale "NexGen PDF Manager" branding to "Build Doc".

**Architecture:** Two new small, reusable presentational components (`GoogleButton`, `AuthShell`) built first and verified in isolation, then three existing pages (`Login.tsx`, `Waitlist.tsx`, `Onboarding.tsx`) are updated to use them. No changes to auth logic, routing, or the waitlist API.

**Tech Stack:** React + TypeScript, react-router-dom, Tailwind CSS (with CSS custom properties defined in `client/src/index.css`), lucide-react icons, existing `cn()` helper (`client/src/lib/utils.ts`).

## Global Constraints

- Local imports use the `.js` extension even though source files are `.tsx` (this repo's TS module resolution requires it) — e.g. `import { Button } from '../components/ui/button.js'`.
- Use existing design tokens only — do not introduce new colors. Available tokens: `--nx-canvas`, `--nx-surface`, `--nx-surface-tint`, `--nx-hairline`, `--nx-ink`, `--nx-ink-secondary`, `--nx-ink-muted`, `--nx-accent`, `--nx-accent-tint`, `--nx-success`, `--nx-success-tint`, `--nx-destructive`, `--nx-destructive-tint`, `--nx-radius-sm`, `--nx-radius-md` (defined in `client/src/index.css:11-34`).
- Brand name is "Build Doc" everywhere in these flows — not "NexGen PDF Manager".
- No terms-of-service / privacy-policy links — those pages don't exist yet.
- The `client` package has no test runner configured (no `test` script in `client/package.json`, no existing `*.test.*` files). Verification for this plan is manual, via the browser preview tool, matching how the existing `Waitlist.tsx` and `Login.tsx` were built. Do not add a test framework as part of this work.
- Don't touch `AuthContext.tsx`'s auth logic, `AuthGuard.tsx`, routing in `App.tsx`, or the waitlist backend/API.

---

## Task 1: `GoogleButton` component

**Files:**
- Create: `client/src/components/ui/google-button.tsx`

**Interfaces:**
- Produces: `GoogleButton`, a named export, props `{ onClick: () => void; loading?: boolean; className?: string }`. Renders a full-width white button with a multicolor Google "G" icon and the label "Continue with Google" (or "Redirecting…" + spinner when `loading` is true, and disabled in that state).

- [ ] **Step 1: Create the component**

```tsx
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils.js';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3.02h3.88c2.27-2.09 3.59-5.17 3.59-8.84Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.27a12 12 0 0 0 0 10.76l4-3.11Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

interface GoogleButtonProps {
  onClick: () => void;
  loading?: boolean;
  className?: string;
}

export function GoogleButton({ onClick, loading = false, className }: GoogleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'inline-flex h-11 w-full items-center justify-center gap-3 rounded-[var(--nx-radius-sm)] border border-[var(--nx-hairline)] bg-white text-sm font-semibold text-[var(--nx-ink)] transition-all duration-150 hover:bg-[var(--nx-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nx-accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60',
        className
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <GoogleIcon />}
      <span>{loading ? 'Redirecting…' : 'Continue with Google'}</span>
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors referencing `google-button.tsx`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/google-button.tsx
git commit -m "feat(client): add GoogleButton component"
```

---

## Task 2: `AuthShell` component

**Files:**
- Create: `client/src/components/AuthShell.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `AuthShell`, a named export, props `{ eyebrow?: string; headline: string; bullets: string[]; children: ReactNode }`. Renders a full-height split layout: a dark gradient left panel (hidden below `md`) with the Build Doc logo, optional eyebrow badge, headline, and bullet checklist; a white right panel that centers `children` in a `max-width: 400px` column, with its own compact logo lockup shown only below `md`. The logo in both panels is a button that navigates to `/welcome`.

- [ ] **Step 1: Create the component**

```tsx
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, CheckCircle2 } from 'lucide-react';

interface AuthShellProps {
  eyebrow?: string;
  headline: string;
  bullets: string[];
  children: ReactNode;
}

export function AuthShell({ eyebrow, headline, bullets, children }: AuthShellProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen md:flex" style={{ background: 'var(--nx-canvas)' }}>
      <div
        className="hidden md:flex md:w-[55%] flex-col justify-center px-16 py-12 text-white"
        style={{ background: 'linear-gradient(160deg, #04150f 0%, #0a2540 55%, #059669 130%)' }}
      >
        <button onClick={() => navigate('/welcome')} className="flex w-fit items-center gap-2 mb-10">
          <div className="flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)] bg-white/10">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Build Doc</span>
        </button>
        {eyebrow && (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium mb-5">
            {eyebrow}
          </div>
        )}
        <h2 className="text-3xl font-bold tracking-tight leading-[1.15] max-w-md">{headline}</h2>
        <ul className="mt-8 flex flex-col gap-3">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2.5 text-sm text-white/80">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-white/60" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <button onClick={() => navigate('/welcome')} className="flex w-fit items-center gap-2 mb-8 md:hidden">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[var(--nx-radius-sm)]"
            style={{ background: 'var(--nx-accent-tint)' }}
          >
            <FileText className="h-4 w-4" style={{ color: 'var(--nx-accent)' }} />
          </div>
          <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--nx-ink)' }}>
            Build Doc
          </span>
        </button>
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors referencing `AuthShell.tsx`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AuthShell.tsx
git commit -m "feat(client): add AuthShell split-screen layout component"
```

---

## Task 3: Redesign `Login.tsx`

**Files:**
- Modify: `client/src/pages/Login.tsx` (full rewrite of the existing 34-line file)

**Interfaces:**
- Consumes: `AuthShell` from `../components/AuthShell.js` (Task 2), `GoogleButton` from `../components/ui/google-button.js` (Task 1), `useAuth()` from `../context/AuthContext.js` (existing — `session`, `profile`, `loading`, `signInWithGoogle`).
- Produces: default export `Login`, unchanged route usage (`App.tsx:8,44` already wires `/login` to this default export — no changes needed there).

- [ ] **Step 1: Replace the file contents**

```tsx
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { AuthShell } from '../components/AuthShell.js';
import { GoogleButton } from '../components/ui/google-button.js';
import { useAuth } from '../context/AuthContext.js';

const bullets = [
  'Dynamic PDF templates with tables, letterheads, and reusable fields',
  'Fill a shared form and sign directly on the document',
  'Every submission tracked in one place, draft to complete',
];

export default function Login() {
  const { session, profile, loading, signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const description = params.get('error_description') || params.get('error');
    if (description) {
      setOauthError(description.replace(/\+/g, ' '));
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      url.searchParams.delete('error_description');
      url.searchParams.delete('error_code');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  if (loading) return null;
  if (session) {
    return <Navigate to={profile?.orgId ? '/' : '/onboarding'} replace />;
  }

  const handleSignIn = async () => {
    setSigningIn(true);
    await signInWithGoogle();
  };

  return (
    <AuthShell headline="Design, fill, and sign documents in minutes" bullets={bullets}>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--nx-ink)' }}>
        Welcome back
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
        Sign in with your Google account to continue to Build Doc.
      </p>
      {oauthError && (
        <div
          className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm mt-5"
          role="alert"
          style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{oauthError}</span>
        </div>
      )}
      <div className="mt-6">
        <GoogleButton onClick={() => void handleSignIn()} loading={signingIn} />
      </div>
    </AuthShell>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors referencing `Login.tsx`.

- [ ] **Step 3: Manual verification in the browser preview**

Start the client dev server preview and navigate to `/login`. Confirm:
- Desktop width (≥768px): left panel shows the dark gradient, Build Doc logo, headline "Design, fill, and sign documents in minutes", and 3 bullets. Right panel shows "Welcome back", subtext, and the white "Continue with Google" button with the multicolor G icon.
- Resize to mobile width (<768px): left panel disappears, a small logo + "Build Doc" appears above the card.
- Navigate to `/login?error_description=Access%20denied`: a red alert banner reading "Access denied" appears above the button, and the URL's query string is stripped after the page loads (check via the address bar or `read_page`).
- Click the logo (desktop and mobile): navigates to `/welcome`.
- Click "Continue with Google": button becomes disabled and shows "Redirecting…" (verify via `read_page` immediately after `computer` click, since the real OAuth redirect will navigate away).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Login.tsx
git commit -m "feat(client): redesign Login page with split-screen AuthShell"
```

---

## Task 4: Redesign `Waitlist.tsx`

**Files:**
- Modify: `client/src/pages/Waitlist.tsx:1-138` (full rewrite)

**Interfaces:**
- Consumes: `AuthShell` from `../components/AuthShell.js` (Task 2). `api.submitWaitlist(name, email)` from `../lib/api.js` (existing, unchanged — signature `(name: string, email: string) => Promise<{ alreadyOnList: boolean }>`).
- Produces: default export `Waitlist`, unchanged route usage (`App.tsx:7,43`).

- [ ] **Step 1: Replace the file contents**

```tsx
import { useState, type FormEvent } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { AuthShell } from '../components/AuthShell.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { api } from '../lib/api.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = 'idle' | 'submitting' | 'success' | 'duplicate' | 'error';

const bullets = [
  'Early access when new plans and features launch',
  'Priority onboarding for your organization',
  'A say in what we build next',
];

export default function Waitlist() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setValidationError(null);

    if (name.trim().length === 0) {
      setValidationError('Please enter your name.');
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setValidationError('Please enter a valid email address.');
      return;
    }
    setStatus('submitting');

    try {
      const result = await api.submitWaitlist(name.trim(), email.trim());
      setStatus(result.alreadyOnList ? 'duplicate' : 'success');
    } catch (err) {
      const raw = (err as Error).message;
      console.error('Waitlist signup failed:', raw);
      setSubmitError(
        raw.startsWith('429')
          ? "You're submitting a bit fast — please wait a few minutes and try again."
          : 'Something went wrong — please try again in a few minutes.'
      );
      setStatus('error');
    }
  };

  return (
    <AuthShell eyebrow="Coming soon" headline="Get early access to what's next" bullets={bullets}>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--nx-ink)' }}>
        Join the waitlist
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
        We're building new plans and features for Build Doc — be the first to know.
      </p>
      <div className="mt-6">
        {status === 'success' || status === 'duplicate' ? (
          <p className="text-base font-semibold" role="status" style={{ color: 'var(--nx-ink)' }}>
            {status === 'success'
              ? "You're on the list — we'll be in touch."
              : "You're already on the list!"}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-left">
            <label className="sr-only" htmlFor="waitlist-name">Name</label>
            <Input
              id="waitlist-name"
              placeholder="Name"
              value={name}
              disabled={status === 'submitting'}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="sr-only" htmlFor="waitlist-email">Email</label>
            <Input
              id="waitlist-email"
              type="email"
              placeholder="Email"
              value={email}
              disabled={status === 'submitting'}
              onChange={(e) => setEmail(e.target.value)}
            />
            {validationError && (
              <div
                className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm"
                role="alert"
                style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}
            {status === 'error' && submitError && (
              <div
                className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm"
                role="alert"
                style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}
            <Button type="submit" size="lg" className="h-12 text-base" disabled={status === 'submitting'}>
              {status === 'submitting' ? 'Joining…' : 'Join the waitlist'}
              {status !== 'submitting' && <CheckCircle2 className="h-4 w-4" />}
            </Button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors referencing `Waitlist.tsx`.

- [ ] **Step 3: Manual verification in the browser preview**

Navigate to `/waitlist`. Confirm:
- Left panel shows "Coming soon" eyebrow, headline "Get early access to what's next", and 3 bullets; right panel shows "Join the waitlist" heading and the name/email form.
- Submitting an invalid email shows the validation alert; a valid submission calls the waitlist API (check via `read_network_requests`) and shows the success or "already on the list" message depending on the response.
- No occurrence of "NexGen" remains on the page (`get_page_text` and check).

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Waitlist.tsx
git commit -m "feat(client): redesign Waitlist page with shared AuthShell"
```

---

## Task 5: Swap Onboarding's bare Google button for `GoogleButton`

**Files:**
- Modify: `client/src/pages/Onboarding.tsx:57-68`

**Interfaces:**
- Consumes: `GoogleButton` from `../components/ui/google-button.js` (Task 1).

- [ ] **Step 1: Add the import**

In `client/src/pages/Onboarding.tsx`, add to the existing import block (near line 4-7):

```tsx
import { GoogleButton } from '../components/ui/google-button.js';
```

- [ ] **Step 2: Replace the button**

Replace this block (`client/src/pages/Onboarding.tsx:57-68`):

```tsx
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
```

with:

```tsx
  if (!session) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">
          {code ? 'Sign in to accept your invite' : 'Sign in to continue'}
        </h1>
        <div className="mt-8 w-full max-w-sm">
          <GoogleButton onClick={() => void signInWithGoogle()} />
        </div>
      </Shell>
    );
  }
```

- [ ] **Step 3: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors referencing `Onboarding.tsx` (the `Button` import stays used by the other branches at lines 74, 138, and 170 — do not remove it).

- [ ] **Step 4: Manual verification in the browser preview**

Log out (or open a private/incognito-style session) and navigate to `/join/somecode` (any code — the invite lookup will fail, but that's irrelevant to this check since the `!session` branch renders first). Confirm the centered `Shell` now shows the white bordered "Continue with Google" button instead of the solid emerald button.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Onboarding.tsx
git commit -m "feat(client): use shared GoogleButton in Onboarding's sign-in fallback"
```

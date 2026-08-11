# Auth & waitlist shell redesign

## Problem

`Login.tsx` is a bare centered page with a single "Sign in with Google" button — no
branding context, no error handling, nothing that reads as a finished product screen.
`Waitlist.tsx` already works but has its own one-off header/shell. Both pages also still
say "NexGen PDF Manager", left over from before the rebrand to "Build Doc" (commit
`09a8a993`), while `Landing.tsx` already uses the new name.

Onboarding's unauthenticated fallback (`Onboarding.tsx`, the `!session` branch shown when
visiting `/join/:code` while logged out) has the same bare-button pattern as the old Login
page.

## Goals

- Replace the single-button Login screen with a real sign-in screen.
- Give Login and Waitlist a shared visual shell so the pre-auth experience feels
  consistent with the rest of the app (Stripe-style, emerald accent, white surfaces —
  see `client/src/index.css`).
- Fix the stale "NexGen PDF Manager" branding to "Build Doc" everywhere it appears in
  these flows.
- Handle the OAuth failure case, which today is silently dropped.

## Non-goals

- No changes to the Supabase auth logic itself (`AuthContext.tsx`'s `signInWithGoogle`,
  session handling, and profile fetching are unchanged).
- No terms-of-service / privacy-policy pages or links — none exist yet, so the sign-in
  screen won't reference them.
- No redesign of Onboarding's other screens (create org, accept invite) — only its
  existing bare Google button is swapped for the new shared button component.
- No changes to the waitlist API/backend (`api.submitWaitlist`) or its validation logic.

## Design

### 1. `AuthShell` component — `client/src/components/AuthShell.tsx`

A shared two-panel layout used by both Login and Waitlist:

- **Left panel** (`hidden md:flex`, roughly 55% width): deep gradient background using
  the existing ink/accent tokens (`--nx-ink` → an emerald-tinted dark, not a new color),
  the Build Doc logo mark, a headline, and a short feature checklist (3 bullets with
  `CheckCircle2` icons). Headline and bullets are passed in as props so each page shows
  relevant copy:
  - Login: "Design, fill, and sign documents in minutes" + bullets pulled from the same
    feature copy already used on `Landing.tsx` (template designer, e-signature,
    submissions tracking).
  - Waitlist: "Get early access to what's next" + relevant bullets (new plans, early
    access, priority onboarding — short, waitlist-appropriate copy).
- **Right panel** (45% width, white background, `var(--nx-canvas)`): vertically centered
  content area, `max-width: 400px`, renders `children` — this is where the page-specific
  card content goes (Google button for Login, form for Waitlist).
- **Mobile** (below `md`): left panel is hidden entirely; a small logo + "Build Doc"
  wordmark renders at the top of the right panel instead, so branding isn't lost.
- Props: `{ eyebrow?: string; headline: string; bullets: string[]; children: ReactNode }`.

### 2. `GoogleButton` component — `client/src/components/ui/google-button.tsx`

- White background, `--nx-hairline` border, full width, `--nx-radius-sm` corners —
  visually distinct from the primary emerald `Button`.
- Inline multicolor Google "G" SVG icon (no external asset/network fetch).
- Label: "Continue with Google".
- `loading` prop: swaps label to "Redirecting…" and disables the button while
  `signInWithGoogle()` is in flight (covers the brief moment before the OAuth redirect
  fires).
- Used by `Login.tsx`, and swapped into `Onboarding.tsx`'s existing `!session` branch in
  place of the current plain `Button`-based "Sign in with Google" (single-line change,
  rest of `Onboarding.tsx` untouched).

### 3. `Login.tsx`

- Rebuilt using `AuthShell`. Right panel content: heading "Welcome back", one-line
  subtext ("Sign in with your Google account to continue."), `GoogleButton`.
- OAuth error handling: on mount, read `error_description` (and fall back to `error`)
  from the URL query string — Supabase appends these to the redirect URL when an OAuth
  attempt fails (e.g. user cancels consent). If present, show the existing destructive
  alert pattern (`AlertCircle` + `--nx-destructive-tint` background, same as
  `Waitlist.tsx` and `Onboarding.tsx` already use) above the button, and strip the query
  params from the URL via `history.replaceState` so a refresh doesn't re-show the error.
- Fix: "Sign in to NexGen PDF Manager" → "Build Doc" branding in headline/copy.

### 4. `Waitlist.tsx`

- Swap the custom `<header>` + centered `<main>` wrapper for `AuthShell`. The existing
  badge ("Coming soon"), heading, and subtext move into the shell's headline/bullets
  props (or stay as page content in the right panel if they read better there — kept
  short either way). Form logic (validation, submit, success/duplicate/error states) is
  unchanged — only the surrounding chrome changes.
- Fix: two "NexGen PDF Manager" mentions → "Build Doc".

## Testing

- Manual verification in the browser preview (per project convention — this is a
  frontend-only visual change):
  - `/login` renders the split shell on desktop and collapses correctly on mobile widths.
  - Clicking "Continue with Google" triggers `signInWithGoogle()` (existing behavior,
    unchanged).
  - Visiting `/login?error_description=...` shows the error banner; refreshing clears it.
  - `/waitlist` still submits successfully and shows success/duplicate/error states.
  - `/join/:code` while logged out shows the new `GoogleButton` in Onboarding's shell.
- No new automated tests planned — these are presentational/layout changes with no new
  business logic beyond the query-param error read, which is simple enough to verify
  manually.

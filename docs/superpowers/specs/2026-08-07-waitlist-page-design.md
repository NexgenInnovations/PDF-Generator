# Waitlist Page + Signup Capture — Design

## Context

Following the Framer marketing landing page rebuild
([2026-08-06-framer-marketing-landing-page-design.md](2026-08-06-framer-marketing-landing-page-design.md)),
we're adding a waitlist page: a place to capture interest/early-access
signups for NexGen PDF Manager, separate from the main landing page's
existing "Go to Dashboard" flow (the product itself stays open — this
isn't a gate on access).

## Goals

- A new "Waitlist" page in the same Framer project as the landing page,
  with a name + email signup form.
- A new backend endpoint that stores signups in the app's own database
  (not a third-party email tool, not Framer's native form storage).
- Basic spam protection on the new public endpoint, since it's the app's
  first unauthenticated public-facing form.

## Non-goals (out of scope for this task)

- Deploying the backend server publicly. It currently only runs locally
  (`npm --prefix server run dev`, or via `docker-compose.yml` on port
  3004). Standing up public hosting (provider, domain, SSL, secrets) is a
  separate follow-up task the user will scope later — this task builds
  and locally verifies the feature only.
- Sending a confirmation email. The backend has no email-sending capability
  today (no nodemailer/SMTP/transactional-email integration, confirmed by
  research). Signup success is shown on-page only.
- Any change to the existing landing page (`/` in the Framer project) — its
  CTAs, copy, and sections are untouched.
- Authentication of any kind on the new endpoint — the rest of this
  backend has no auth anywhere (confirmed by research), and this endpoint
  follows that same existing pattern; adding auth is out of scope.

## Framer side: new "Waitlist" page

Added to the existing Framer project (`9EWDQbiBnMiY9W2bJHWJ`, "NexGen PDF
Manager — Landing"), as a new page at path `/waitlist`.

**Header**: a minimal header, not the full landing-page Nav — just the
existing logo mark + "NexGen PDF Manager" wordmark (same styling as the
landing page's Nav), linking back to `/`. No anchor links, since this page
has no sub-sections to jump to.

**Copy** (final, not placeholder):
- Eyebrow: "Coming soon"
- Headline (H1): "Get early access to what's next"
- Subhead: "We're building new plans and features for NexGen PDF Manager —
  join the waitlist to be the first to know, and get early access when
  they launch."

**Form**: Name + Email fields, one submit button ("Join the waitlist").
Built as a **Framer Code Component** (React, via the framer-code-components
patterns), not Framer's native Form element — this gives full control over
validation, loading state, and a custom success/duplicate/error message,
styled with the same `--nx-*`-equivalent color styles (`canvas`, `ink`,
`ink-secondary`, `ink-muted`, `accent`, `accent-tint`, `hairline`) and
Figtree font already defined on this Framer project.

States:
- **Idle**: two inputs (Name, Email) + submit button.
- **Submitting**: button shows a loading state, inputs disabled.
- **Success (new signup)**: form replaced with a confirmation message,
  e.g. "You're on the list — we'll be in touch."
- **Success (duplicate email)**: a distinct friendly message, e.g. "You're
  already on the list!" — not treated as an error.
- **Error** (network failure, validation failure, server error): inline
  error message near the form, inputs re-enabled, user can retry.

**Configuration**: the component exposes an editable Framer property
control for the API base URL, defaulting to `http://localhost:3004`. The
component POSTs to `{apiBaseUrl}/waitlist`. This makes the eventual
production URL a one-line property change in Framer, not a rebuild, once
the backend is deployed (follow-up task).

## Backend side: `server/`

**Schema** — new table added to the existing `ensureTables()` idempotent
schema function in `server/src/db.ts` (this codebase has no separate
migration tool; `server/migrations/*.sql` is stale/unused Postgres SQL and
is not touched by this work):

```sql
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'waitlist_signups')
CREATE TABLE waitlist_signups (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(200) NOT NULL,
  email NVARCHAR(320) NOT NULL UNIQUE,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
)
```

**Route** — new file `server/src/routes/waitlist.ts`, following the
existing `Router()` pattern (see `server/src/routes/health.ts`), mounted
in `server/src/index.ts` as `app.use('/waitlist', waitlistRouter)`.

`POST /waitlist`
- Body: `{ name: string, email: string }`
- Validation: `name` non-empty (trimmed), `email` matches a standard email
  regex. Invalid input → `400` with a message identifying the bad field.
- Insert into `waitlist_signups`. On a unique-constraint violation (email
  already present), catch it and respond `200` with a body indicating
  `alreadyOnList: true` rather than an error — the frontend renders this
  as the "You're already on the list!" state, not an error state.
- On success (new row), respond `200` with `alreadyOnList: false`.
- Unexpected DB errors → `500` with a generic error body (no stack trace
  leaked).

**Rate limiting**: `express-rate-limit` added as a new dependency, applied
only to the `waitlistRouter` (not globally — the rest of the app has no
rate limiting today and this task doesn't change that elsewhere). Limit:
5 requests per IP per 15 minutes, returning `429` with a plain message
when exceeded.

**CORS**: no change needed — `server/src/index.ts` already calls `cors()`
with no origin restriction, so a Framer-hosted origin (once deployed) will
be able to reach this endpoint.

## Testing / verification

- **Backend**: run the server locally (`npm --prefix server run dev`),
  exercise `POST /waitlist` directly (e.g. via `curl`) for: valid new
  signup (200, `alreadyOnList: false`), duplicate email (200,
  `alreadyOnList: true`), invalid email (400), missing name (400), and
  6th request within 15 minutes from the same IP (429). Confirm the row
  lands in `waitlist_signups` for valid signups only.
- **Frontend**: with the local server running, open the Waitlist page live
  in Framer's editor canvas (not published) and exercise the form's real
  network calls against `http://localhost:3004` — submit a new email
  (success state), resubmit the same email (duplicate state), submit an
  invalid email (client-side validation, no network call), and simulate a
  server error if feasible (e.g. stop the server mid-test) to confirm the
  error state renders.
- **Not tested in this task**: a true end-to-end test against a live,
  publicly reachable Framer URL — that requires either a Framer "preview"
  publish (an explicit-permission action, not assumed here) or the backend
  being deployed, both out of scope. This gap closes naturally once the
  deployment follow-up happens.

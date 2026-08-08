# Port Framer Landing + Waitlist Pages into client/src — Design

## Context

The marketing landing page and waitlist page were built and published on
Framer (see [2026-08-06-framer-marketing-landing-page-design.md](2026-08-06-framer-marketing-landing-page-design.md)
and [2026-08-07-waitlist-page-design.md](2026-08-07-waitlist-page-design.md),
live at https://considerate-tone-972589.framer.app). This work ports both
pages into the app's own React frontend (`client/src`) as real code, so
they no longer depend on Framer hosting.

## Goals

- Recreate the live Framer landing page and waitlist page as React
  components in `client/src`, matching content and layout exactly.
- Wire the waitlist form to the real `POST /waitlist` backend endpoint
  (already built, see [2026-08-07-waitlist-page-design.md](2026-08-07-waitlist-page-design.md)),
  using the client's existing API client pattern.
- No new dependencies (no accordion library, no toast library) — reuse
  existing `components/ui/` primitives and patterns already used elsewhere
  in `client/src`.

## Non-goals

- No changes to any other route, page, or the app's own dashboard/auth
  flows.
- No changes to the Framer project itself — it stays published as a
  reference/fallback; this is a separate, parallel implementation.
- No new screenshot capture — the three screenshots already captured
  during the Framer work (dashboard, designer canvas, a signed submission)
  are reused as static image assets.

## Routes

- `client/src/pages/Landing.tsx` stays at the existing `/welcome` route —
  its content is rebuilt in place to match the Framer version.
- A new `client/src/pages/Waitlist.tsx` is added at a new `/waitlist`
  route, following the existing lazy-loaded route pattern in
  `client/src/App.tsx`.

## Landing page (`client/src/pages/Landing.tsx`)

Rebuilt to match the live Framer page:
- **Nav**: sticky header with the existing logo mark (rounded square,
  `--nx-accent-tint` background, `FileText` icon in `--nx-accent`) +
  "NexGen PDF Manager" wordmark, plus three anchor links ("How it works",
  "Features", "FAQ") scrolling to in-page section ids, plus the existing
  "Go to Dashboard" button. Gains a background blur + `--nx-hairline`
  bottom border once scrolled past ~20px (a scroll listener toggling a
  class/style, matching the Framer version's behavior).
- **Hero**: same eyebrow/headline/subhead/CTA copy as today. The fake mock
  document card is replaced with the real Dashboard screenshot
  (`client/public/landing/dashboard.png`) inside a browser-chrome frame
  (rounded rectangle, `--nx-hairline` border, soft shadow, a top strip with
  three dots). The floating "Submitted" callout card is kept, overlapping
  the screenshot frame's bottom-left corner as it does today.
- **How It Works**: same 3-step copy as today, each step now paired with a
  real screenshot crop below the text — Designer canvas
  (`designer-canvas.png`) for "Design", the signed submission
  (`signed-form.png`) for "Fill & sign", and a cropped view of the
  Dashboard's "Recent Templates" grid (`dashboard.png`, cropped via CSS
  `object-fit`/`object-position`) for "Track".
- **Features**: unchanged from today — same 4 cards, same copy.
- **FAQ** (new section): the same 4 Q&As from the Framer version, verbatim,
  as plain stacked blocks (question in `--nx-ink` semibold, answer in
  `--nx-ink-secondary`, separated by a `--nx-hairline` top border) —
  covering self-attested e-signature/audit trail, Admin vs. Designer
  roles, no-code template building, and where submissions go.
- **CTA banner**: unchanged from today.
- **Footer**: gains two links, "Dashboard" and "Templates", alongside the
  existing "NexGen PDF Manager" text — matching the Framer version.

## Waitlist page (`client/src/pages/Waitlist.tsx`)

- Simple, non-sticky header: logo mark + wordmark, linking back to
  `/welcome` (this app's marketing home — the equivalent of Framer's own
  `/` link). No anchor nav.
- Centered copy: eyebrow "Coming soon", headline "Get early access to
  what's next", subhead "We're building new plans and features for NexGen
  PDF Manager — join the waitlist to be the first to know, and get early
  access when they launch." (verbatim from the Framer version).
- A `WaitlistForm` component below the copy: Name + Email `Input`s (reusing
  `client/src/components/ui/input.tsx`), a submit `Button`, and the same
  states as the Framer version:
  - **Idle**: both inputs + button enabled.
  - **Submitting**: client-side validates non-empty name and a basic email
    pattern before any network call; on success, disables inputs/button
    and shows a loading label.
  - **Success (new)**: replaces the form with "You're on the list — we'll
    be in touch."
  - **Success (duplicate)**: replaces the form with "You're already on the
    list!"
  - **Error**: inline callout below the form (styled with
    `--nx-destructive`/`--nx-destructive-tint`, matching the pattern
    already used in `client/src/pages/Assets.tsx`), inputs re-enabled for
    retry.

## API integration

`client/src/lib/api.ts` gets one new entry:

```ts
submitWaitlist: (name: string, email: string) =>
  request<{ alreadyOnList: boolean }>("/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  }),
```

This goes through the existing `API_BASE` (`/api` by default) and the
existing Vite dev-server proxy (`client/vite.config.ts`, `/api` →
`http://localhost:3004` with the `/api` prefix stripped), so it reaches
the real `POST /waitlist` backend endpoint with no new configuration.

## Assets

The three screenshots already captured during the Framer work (not
re-captured) are copied into `client/public/landing/`:
`dashboard.png`, `designer-canvas.png`, `signed-form.png`. Referenced via
plain `<img>` tags; visual "crops" for the How It Works section use CSS
(`object-fit: cover` + `object-position` on a fixed-size container) rather
than separate pre-cropped image files.

## Testing / verification

- Run the client dev server (`npm --prefix client run dev`) and the
  backend server (`npm --prefix server run dev`) locally.
- Visually compare the rendered `/welcome` and `/waitlist` pages against
  the live published Framer site (https://considerate-tone-972589.framer.app)
  for section-by-section parity (layout, copy, images).
- Exercise the waitlist form's real states (idle → submitting → success,
  duplicate, and error) against the local backend, the same way the
  Framer version was verified.
- Confirm the nav's anchor links scroll to the correct sections, and the
  scroll-triggered nav style change works.

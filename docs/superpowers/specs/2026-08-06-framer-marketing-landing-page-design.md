# Framer Marketing Landing Page — Design

## Context

The current marketing landing page lives inside the app itself at
`client/src/pages/Landing.tsx`, served at the `/welcome` route. It is a
React + Tailwind page using the app's existing design tokens (see
`client/src/index.css`: `--nx-*` variables) and shadcn/ui-style components.

The goal is to build a new, better-executed version of this landing page as
a standalone site on Framer, reusing the existing copy/branding as a base
rather than inventing new messaging.

## Goals

- Recreate the current landing page content on Framer with stronger visual
  execution (real product screenshots, motion, refined layout/typography).
- Keep branding and copy consistent with the in-app product (NexGen PDF
  Manager) and its existing design tokens.
- Do not fabricate content that doesn't exist in the product today (no fake
  testimonials, customer logos, or stats).

## Non-goals (out of scope for this task)

- Removing or redirecting the in-app `/welcome` route — a follow-up once the
  Framer page is approved.
- Publishing the Framer site live — building stays in draft; publishing is a
  separate, explicitly-confirmed step.
- Any backend or app code changes.

## Site structure

Single scrollable page:

1. **Nav** — logo mark + "NexGen PDF Manager" wordmark, anchor links (How it
   works / Features / FAQ), "Go to Dashboard" button. Gains a blur/shadow on
   scroll (mirrors the app's own sticky header).
2. **Hero** — eyebrow badge ("Design, fill, sign, and track — all in one
   place"), headline ("PDF documents, from template to signature"), subhead,
   two CTAs ("Go to Dashboard", "Browse templates"). Visual: a real app
   screenshot in a browser-chrome frame, replacing the current fake mock
   document card. Keep the floating "Submitted" callout badge as a detail
   overlaid on the real screenshot.
3. **How it works** — same 3 steps (Design → Fill & sign → Track, same copy
   as today), each paired with a small real screenshot crop of that part of
   the app instead of just a numbered circle + text.
4. **Features** — same 4 cards (Template designer, Form fill + e-signature,
   Submissions tracking, Roles & permissions), same copy, refined visual
   treatment (spacing, hover elevation).
5. **FAQ** (new) — 4-5 Q&As grounded only in real product behavior, e.g.:
   - What does "self-attested" e-signature mean here? (references the
     existing signature audit trail feature — no legal-certification claims)
   - What's the difference between Admin, Designer, and other roles?
   - Do I need to write code to build a template?
   - Where do submissions go after they're signed?
   No fabricated stats, customers, or testimonials.
6. **CTA banner** — same dark contrast panel and copy ("Ready to get
   started?").
7. **Footer** — logo/tagline plus real links (Dashboard, Templates) instead
   of a single line of text.

## Visual design language

Matched to the existing app so the marketing site and product feel
consistent:

- **Colors**: canvas `#fff`, ink `#0a2540` (headings), ink-secondary
  `#425466` (body), ink-muted `#8792a2`, accent emerald `#059669`,
  accent-tint `#ecfdf5`, hairline `#e3e8ef`.
- **Type**: Figtree, same scale as today (5xl–6xl hero, 3xl–4xl section
  headers).
- **Shape language**: rounded corners (6–8px radius), 1px hairline borders,
  soft elevated shadows on hover.
- **Motion** (new, native to Framer): sections fade/slide up on scroll into
  view; nav gains blur/shadow on scroll; card hover states lift slightly.

## Assets

Real screenshots captured from the running app (Dashboard, Designer canvas,
a filled/signed form) via the browser preview tooling, brought into Framer
for the hero and How-it-works section. No placeholder/illustrative mockups.

## Review & publishing

Built as a draft Framer project. Preview link and screenshots shared for
review before any publish step. Publishing live is a separate, explicitly
confirmed action — not part of this task.

## Testing / verification

- Visual review of the Framer preview across breakpoints (desktop, tablet,
  mobile).
- Content parity check against the current `/welcome` page copy.
- Confirm CTA links point to the right destinations (Dashboard, Templates)
  even though this is a standalone Framer project (no live app routing).

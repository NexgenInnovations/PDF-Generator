# Self-attested signature audit trail

Date: 2026-07-31
Status: Approved for planning

## Context

This app already has a "signature" field: pdfme's stock `signature` schema
plugin (`packages/schemas/src/graphics/signature.ts`), a draw-with-mouse/
touch pad (backed by the `signature_pad` library) that saves a base64 PNG
into the field's `content` — exactly like any text or image field. There is
currently **no identity capture, no timestamp-of-signing, no IP address, and
no tamper-evidence** anywhere in the codebase. The signature image sits in
`filled_submissions.inputs` (`server/src/db.ts`) as just one more string
value among all the other field values, indistinguishable from any other
field.

The user wants "strict, accurate" signing, modeled loosely on DocuSign's
evidentiary model, but scoped deliberately: this spec covers **self-attested
identity** only (the signer types their own name and email, unverified —
DocuSign's default "click to sign" tier). A separate, later spec will cover
higher-assurance ID verification (a third-party identity-check provider),
which requires infrastructure (email sending, a verification service
integration) that doesn't exist in this codebase yet and is out of scope
here.

This app has no authentication system at all — `/templates/:id/fill` has no
`RoleGuard`, and `RoleContext` is a client-side-only, unauthenticated
`localStorage` value. Self-attested identity is therefore the honest
description of what's achievable without building auth first: the signer's
name/email is captured and recorded as part of the evidentiary trail, but
never verified against anything.

## Feature behavior

**What gets captured per signature**: full name, email, exact timestamp,
IP address, and a SHA-256 hash of the exact generated PDF the signature
was part of — matching DocuSign's "Certificate of Completion" evidentiary
set. The image itself (the drawn signature) continues to be stored exactly
as today, embedded in the generated PDF and present in
`filled_submissions.inputs` — this feature adds the surrounding evidence,
it does not change how the drawn mark itself is stored or rendered.

**Data model**: a new `signature_events` table, one row per signature
field per submission, linked to the existing `filled_submissions` table
via `submission_id`:
- `id`, `submission_id` (FK → `filled_submissions.id`), `field_name` (the
  pdfme schema field name this event corresponds to), `signer_name`,
  `signer_email`, `signed_at`, `ip_address`, `document_hash`
  (SHA-256 hex digest of the generated PDF bytes).

**Identity is per signature field, not per submission**: a template can
have multiple signature fields (e.g. "Employee Signature" and "Witness
Signature") representing genuinely different people. Each signature field
gets its own captured name/email — a template with 2 signature fields
produces 2 `signature_events` rows per submission, potentially with
different names/emails.

**Fill-flow UI** (`client/src/pages/FormFill.tsx`): research during
brainstorming confirmed pdfme's `Form` component has no public API for a
host React app to render custom UI positioned next to a specific field —
the only mechanism for that is modifying the vendored `signature` plugin's
own DOM rendering, which was explicitly rejected as too invasive for this
feature. Instead:
- Before the embedded pdfme `Form`, render one "Your Details" panel per
  signature field the template contains — the count and which field each
  panel corresponds to is statically determined by scanning the loaded
  template's schema for fields of `type: 'signature'` (no dynamic
  add/remove UI, no signer-assignment UI — the panel count always equals
  the signature-field count, in schema order).
- Each panel is a plain React form section (not embedded inside pdfme's
  canvas) requiring **Full name** and **Email** text inputs, labeled with
  the signature field's own name/label so the signer knows which panel
  corresponds to which signature (e.g. "Details for: Employee
  Signature").
- This panel layout is always shown, even when a template has exactly one
  signature field — no special-cased "skip the panel" behavior for the
  single-signer case, keeping one consistent code path regardless of
  field count.
- If a template has zero signature fields, no panels render at all — the
  fill flow is completely unchanged from today.

**Submission validation**: the existing "Generate PDF" submit button
becomes disabled (in addition to its existing conditions) until: every
signature field's pad has been drawn (has non-empty `content`) AND every
corresponding "Your Details" panel has both name and email filled in.

**Submit flow**: on submit, after the server generates the PDF (as it
already does in `POST /generate-pdf`), the server computes a SHA-256 hash
of the exact generated PDF bytes it produced (not a client-computed hash —
the server is the trust root for "what was actually signed," since the
client's own locally-generated preview PDF is a separate, non-authoritative
copy used only for on-screen display). The server inserts one
`signature_events` row per signature field, using that shared hash and
timestamp, plus the field-specific name/email sent up from the client's
per-field "Your Details" panels, plus the request's IP address
(`req.ip` — Express's default `X-Forwarded-For`-aware IP resolution;
correctness behind a reverse proxy depends on Express's `trust proxy`
setting, which is not currently configured anywhere in this codebase —
noted here as a caveat for real deployments, not addressed by this spec).

**Audit trail visibility**: a new "Submissions" view, reachable from a
template's management UI, listing past submissions for that template —
each submission shows its `signature_events` (name, email, signed-at, IP,
hash) so the captured evidence is actually visible to an Admin/Designer,
not just sitting in the database unreachable by any UI. Read-only, no
export/download of the audit data in this pass (that's a natural future
enhancement, not required now).

## Server API changes

`POST /generate-pdf` (`server/src/routes/filledPdfs.ts`) is extended:
request body gains an optional `signatureEvents` array (one entry per
signature field, each `{ fieldName, signerName, signerEmail }` — no hash,
no timestamp, no IP; those three are server-computed/captured, never
trusted from the client). After generating the PDF and creating the
`filled_submissions` row (as today), the route also computes the SHA-256
hash of the generated bytes and inserts one `signature_events` row per
entry in the request's `signatureEvents` array, all sharing that hash,
the current server timestamp, and `req.ip`. This insert happens inside
the same best-effort, non-blocking try/catch that already wraps
`createFilledSubmission`/`createGeneratedPdf` today — a signature-event
recording failure must not prevent the signer from getting their
generated PDF.

New route(s) for the Submissions view: `GET /templates/:id/submissions`
(list past submissions for a template, most recent first) and
`GET /submissions/:id/signature-events` (or the events are included
inline in the list response — an implementation detail for the plan to
decide) to power the new audit-trail UI.

## Out of scope

- Higher-assurance ID-verification signing tier (third-party provider
  integration) — a separate, later spec.
- Email confirmation/verification of the signer's typed email address —
  self-attested means unverified, by design, for this pass.
- Multi-party sequential signing workflows (routing a document to
  multiple people over time, one after another, via email invites) — this
  spec only covers multiple signature fields filled in a single sitting
  by whoever has the fill link, exactly like today's form-fill model.
  There is no concept of "signer B can't see the form until signer A
  finishes."
- Any modification to the vendored `signature` plugin
  (`packages/schemas/src/graphics/signature.ts`) or its rendering —
  the drawn-signature-image mechanism itself is completely unchanged.
- A dynamic "add signer" / signer-assignment UI — the number and mapping
  of "Your Details" panels to signature fields is always fixed, derived
  directly from the template's own schema.
- Exporting, downloading, or emailing the audit trail data — the new
  Submissions view is read-only, in-app viewing only.
- Configuring Express's `trust proxy` setting or otherwise hardening IP
  capture for reverse-proxied deployments — flagged as a known caveat,
  not solved here.

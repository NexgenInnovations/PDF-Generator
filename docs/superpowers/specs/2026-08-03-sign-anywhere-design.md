# Click-to-Place Signature ("Sign Document")

## Problem

Today a signer can only draw into signature fields the template author placed at design time (`type: 'signature'` schema entries, fixed position/size). There is no DocuSign-style "click here to sign" affordance — if a template has zero signature fields, or the signer wants to sign somewhere the template author didn't anticipate, there's no way to do it.

## Goal

Add a "Sign Document" button to the fill flow (`FormFill.tsx`) that lets the signer click anywhere on the rendered PDF (any page) to drop a new signature field at that exact spot, sign it inline, and have it appear in the generated PDF — with the same name/email capture and audit-trail recording (server-computed hash/IP/timestamp in `signature_events`) that pre-placed signature fields already get.

Exactly one click-placed signature is allowed per submission. The button is always available, regardless of whether the template already has pre-placed signature fields.

## Global Constraints

- `packages/schemas/src/graphics/signature.ts` is never modified — same constraint as the existing signature-audit-trail feature. This is pure application-level code around the stock, unmodified signature plugin.
- The server is the trust root for what actually ends up in the generated PDF and what gets hashed. The client sends only primitive values (`page`, `x`, `y`, `content`, `signerName`, `signerEmail`) for the click-placed signature — never a client-constructed `Schema` object. The server builds the `Schema` itself.
- The stored/published template (`pdf_templates`, `template_versions` in the DB) is never mutated by this feature. The click-placed field only exists in the one PDF generated for that specific submission — a deep clone of the resolved template is modified in memory, generated from, and discarded.
- `x`/`y` sent by the client are clamped server-side to keep the fixed-size signature box (62.5×37.5mm, pdfme's own default signature field size) fully within the page's bounds. `page` is validated to be a real page index in the resolved template.
- Exactly one click-placed signature per submission — not a general-purpose "add arbitrary fields" mechanism. The client only ever sends zero or one `signAnywhere` object; the server only ever merges at most one extra schema.
- This is purely additive: a template/submission that doesn't use "Sign Document" behaves identically to today — no change to existing signature fields, `inputs`, or `signatureEvents` handling.

## Design

### Client interaction (`client/src/pages/FormFill.tsx`)

- New state: `placementMode: boolean` and `signAnywhereFieldName: string | null` (the generated local field name once placed, so the code can find/remove it; `null` when nothing is placed).
- New toolbar button, "Sign Document" (icon: a pen/signature icon from `lucide-react`, e.g. `PenLine`), always rendered next to the existing Submit controls during `pageState === 'filling'`.
  - If `signAnywhereFieldName` is `null`: button reads "Sign Document"; clicking toggles `placementMode` on (button shows an active/highlighted state, page cursor becomes crosshair via CSS while `placementMode` is true). Clicking it again while active exits placement mode without placing anything (per the confirmed toggle-to-cancel behavior).
  - If `signAnywhereFieldName` is set: button reads "Remove Signature" (or similar); clicking it removes the placed field from the template (splices it out via `updateTemplate`) and clears `signAnywhereFieldName`, re-enabling placement.
- While `placementMode` is true, a transparent click-catching overlay (`position: absolute`, sized/positioned to cover the Form's rendered pages) sits on top of `containerRef`'s content. This needs to span every visible page block Form renders — the overlay listens for a click anywhere within the Form's scrollable container and determines which page (and where on it) was clicked by comparing the click's `clientY`/`clientX` against each page block's own `getBoundingClientRect()` (confirmed by reading `packages/ui/src/components/Paper.tsx`: pdfme's `Paper` component renders exactly one `<div>` per page, stacked vertically with `top` offsets, each independently measurable via `getBoundingClientRect()`). This app's `FormFill.tsx` always calls `getInputFromTemplate(template)` and only ever indexes `inputs[0]` (confirmed at `FormFill.tsx:70,104`) — i.e. exactly one input "unit" is ever rendered, so there's no ambiguity from pdfme's multi-unit (`UnitPager`) support; every page block on screen belongs to that single unit.
- On click (in placement mode):
  1. Identify the clicked page index by finding which page block's bounding rect contains the click point.
  2. Compute mm position within that page: `pxX = clickX - pageRect.left`, `pxY = clickY - pageRect.top` (both already in *rendered*, post-CSS-transform pixels, since `getBoundingClientRect()` reflects whatever zoom/scale pdfme's `Paper` component applied — confirmed by reading `packages/ui/src/components/Paper.tsx`, which wraps all pages in one `transform: scale(...)` div). Derive a single combined px-per-mm ratio directly from the rendered rect — `pxPerMm = pageRect.width / pageWidthMm` (page width in mm read from `templateRecord.schema.basePdf` if it's a `BlankPdf`, else fall back to A4's 210mm — same fallback pattern already used for AI occupied-region computation in `TemplateDesigner.tsx`) — then `mmX = pxX / pxPerMm`, `mmY = pxY / pxPerMm`. This deliberately does NOT use `@pdfme/common`'s `ZOOM`/`px2mm` constant separately, since the rendered rect already bakes in both pdfme's internal `ZOOM` factor and its current user-facing zoom level in one number — introducing `px2mm` on top would double-apply a conversion.
  3. Clamp `mmX`/`mmY` client-side too (not just server-side) so the box doesn't visually hang off the page edge before the user even submits: `mmX = clamp(mmX, 0, pageWidthMm - 62.5)`, `mmY = clamp(mmY, 0, pageHeightMm - 37.5)`.
  4. Generate a unique field name: `` `sign_anywhere_${Date.now()}_${Math.floor(Math.random()*100000)}` `` (matches this file's existing `handleAssetPicked`-style naming convention from `TemplateDesigner.tsx`).
  5. Read the current template via `(uiRef.current as Form).getTemplate()`, splice a new schema `{ name, type: 'signature', content: '', position: {x: mmX, y: mmY}, width: 62.5, height: 37.5 }` onto `schemas[pageIndex]`, call `(uiRef.current as Form).updateTemplate({...t, schemas})`.
  6. Set `signAnywhereFieldName = name`, exit `placementMode`.
- Once placed, the field is a normal live signature field in the Form — the existing `getSignatureFields()` scan (already re-runs on template change via the existing `useEffect` at `FormFill.tsx:53-63`) picks it up automatically, so a `SignerDetailsPanel` renders for it exactly like any pre-placed signature field. No new panel-rendering code path is needed — this composes with what already exists.
- Submit validation (`handleSubmit`): the existing `allSignerDetailsFilled`/`allSignaturesDrawn` checks already iterate `signatureFields` (derived from `getSignatureFields(templateRecord.schema)`), which will include the click-placed field once added — so those checks already cover it with zero changes. The only new logic: when building the request body, if `signAnywhereFieldName` is set, pull that field's drawn `content` out of `inputs[0][signAnywhereFieldName]` and its position out of the current template's schema, and construct the `signAnywhere` payload object separately — then **exclude** that field's key from the `signatureEvents` array sent for the template's own pre-existing fields (it goes in `signAnywhere` instead, since the server needs `{page, x, y}` to reconstruct the schema, which `signatureEvents` entries don't carry).
- `api.createFilledPdf` gains an optional 5th parameter for the `signAnywhere` payload.

### Server-side (`server/src/routes/filledPdfs.ts`, `server/src/services/pdfService.ts`)

- `POST /generate-pdf` request body gains an optional field:
  ```ts
  signAnywhere?: {
    page?: number;
    x?: number;
    y?: number;
    content?: string;
    signerName?: string;
    signerEmail?: string;
  }
  ```
- Validation (mirrors the existing `signatureEvents` validation style already in this file):
  - If present, `page` must be an integer, `0 <= page < resolvedVersion.schema.schemas.length`.
  - `x`/`y` must be finite numbers (any value accepted pre-clamp — clamping happens next, not rejection, since a slightly-off client-computed position shouldn't fail the whole submission).
  - `content` must be a non-empty string.
  - `signerName`/`signerEmail` must be non-empty strings (same trim+validate treatment as `signatureEvents` entries).
  - Any missing/invalid field in a present `signAnywhere` object → `400`, matching the existing error-response pattern for malformed `signatureEvents`.
- Page dimensions for clamping: read from `resolvedVersion.schema.basePdf` — if it's a `BlankPdf` (has `width`/`height`), use those; if it's a custom/imported PDF (string/buffer, no explicit dimensions available), fall back to A4 (210×297mm) — same fallback already established for the AI occupied-region feature.
- Clamp: `clampedX = Math.min(Math.max(x, 0), pageWidth - 62.5)`, `clampedY = Math.min(Math.max(y, 0), pageHeight - 37.5)`.
- Build the schema server-side (never trust a client-sent schema shape):
  ```ts
  {
    name: `sign_anywhere_${randomUUID()}`,
    type: 'signature',
    content: signAnywhere.content,
    position: { x: clampedX, y: clampedY },
    width: 62.5,
    height: 37.5,
  }
  ```
- Deep-clone `resolvedVersion.schema` (structuredClone or an equivalent — must not mutate the object returned from the DB layer, since that could be a cached reference), push the new schema onto `clonedSchema.schemas[page]`, and call `generatePdf(clonedSchema, inputs)` instead of the raw `resolvedVersion.schema` when `signAnywhere` is present. When absent, behavior is byte-for-byte identical to today (same `generatePdf(resolvedVersion.schema as Template, inputs)` call).
- After generation, if `signAnywhere` was present and validated, its `{fieldName: <the generated name>, signerName, signerEmail}` is added to the same `createSignatureEvent` loop that already processes `validatedSignatureEvents` — same server-computed `documentHash` (hashed from the final PDF bytes, which now include the click-placed signature, so the hash correctly reflects what's in the document) and same `ipAddress` (`req.ip`). This requires the loop to iterate over `[...validatedSignatureEvents, ...signAnywhereEvent]` rather than just `validatedSignatureEvents` — a minimal change to the existing loop, not a parallel code path.
- No changes to `createSignatureEvent`, the `signature_events` table schema, or `pdfService.ts`'s plugin list — `generatePdf`'s signature (`template: Template, inputs: Record<string,string>[]`) is unchanged; the caller just passes a modified `template` argument when `signAnywhere` is present.

### What doesn't change

- `packages/schemas/src/graphics/signature.ts` — untouched.
- Pre-placed signature fields, `SignerDetailsPanel`, and the existing `signatureEvents` flow — untouched, still work exactly as today for templates/submissions that don't use "Sign Document."
- `signature_events` table schema — unchanged; a click-placed signature is just another row with a server-generated `field_name` (`sign_anywhere_<uuid>`), indistinguishable in storage from any other signature event.
- The stored/published `Template` in the database — never mutated. The click-placed field exists only in the in-memory clone used for that one PDF generation.

## Self-Review Notes

- **Spec coverage:** confirmed decisions from brainstorming are all reflected — button always visible (not gated on existing signature fields), toggle-to-cancel placement mode, inline signing at the clicked spot (no separate modal), signer details captured via the existing `SignerDetailsPanel` mechanism, one signature only, any page, server clamps rather than trusts the client's position.
- **Trust boundary:** the client never sends a `Schema` object — only `{page, x, y, content, signerName, signerEmail}` primitives. The server is solely responsible for constructing the actual `Schema`, generating its name, and clamping its position. This mirrors the existing `document_hash`-must-be-server-computed principle from the signature-audit-trail feature.
- **No new DB schema:** deliberately reuses `signature_events` as-is — a click-placed signature is evidentially identical to a pre-placed one (name, email, hash, IP, timestamp all captured the same way), so no new columns or tables are needed.

# Import a PDF as a letterhead

Date: 2026-07-30
Status: Approved for planning

## Context

The letterhead templates feature (already shipped) supports one kind of
letterhead: a reusable header/footer fragment (`staticSchema`, a set of
pdfme fields) applied on top of whatever background a template already
has. The user wants a second way to create a letterhead: upload an actual
letterhead PDF (e.g. a company's official pre-printed letterhead document)
and use that PDF itself as the letterhead — not extract or recreate its
visual content as fields (that's a different, existing capability —
AcroForm/AI-vision field detection on "Change PDF" — and is explicitly
unrelated to this feature).

This is confirmed to be a genuinely different underlying model from
today's letterheads: applying it replaces the template's `basePdf`
entirely with the imported PDF (the same kind of swap "Change PDF"
already performs), rather than writing into `basePdf.staticSchema`. The
two kinds of letterhead — "field-based" (today's, unchanged) and
"PDF-based" (this feature) — coexist in the same table, the same
Letterheads management page, and the same Designer picker.

## Data model changes

The existing `letterheads` table (`server/src/db.ts`) gains:
- `type NVARCHAR(10) NOT NULL DEFAULT 'fields'` — `'fields' | 'pdf'`.
- `static_schema`, `page_width`, `page_height` become **nullable** — they
  are populated only for `type = 'fields'` letterheads (today's rows, and
  all future field-based ones); `NULL` for `type = 'pdf'` rows.
- A new nullable `base_pdf NVARCHAR(MAX)` column — a base64 string of the
  uploaded PDF, populated only for `type = 'pdf'` letterheads; `NULL` for
  `type = 'fields'` rows.

One table, one row shape per letterhead — the `type` discriminator tells
every consumer (management page, picker, apply logic) which of the two
optional field-groups is populated. This mirrors how `BasePdf` itself is
already a union type in this codebase (`CustomPdf | BlankPdf`,
`packages/common/src/schema.ts`) — this feature's `letterheads.type`
plays the same discriminating role at the letterhead level.

Existing rows (all currently `type = 'fields'` implicitly) are backfilled
with `type = 'fields'` on migration — no behavior change for anything
already saved.

## Feature behavior

**Import flow**: the Letterheads management page (`client/src/pages/Letterheads.tsx`)
gets a new **"Import PDF"** button, placed alongside the existing "New
Letterhead" button. Clicking it opens a file picker (PDF only), then
prompts for a name (reusing the same lightweight naming pattern already
used elsewhere in this app, e.g. a simple inline field or prompt — no new
modal component needed beyond what "New Letterhead"'s flow already
establishes). On confirm, the PDF is read as a base64 data URL client-side
(same technique `TemplateDesigner.tsx`'s `handleBasePdfFile` already uses
for "Change PDF") and saved as a new `type: 'pdf'` letterhead via a new
API call. No editor step — the uploaded PDF is the entire content, there
is nothing to arrange.

**Apply flow, in the Designer**: the existing "Apply Letterhead" toolbar
button is no longer gated to blank-PDF templates only (previously
`disabled={!isBlank}`, matching "Header/Footer" — that constraint made
sense only for field-based letterheads, which write into
`basePdf.staticSchema`, a `BlankPdf`-only concept). The button is now
**always enabled**.

The picker (`LetterheadPicker`) lists every letterhead regardless of
type, but adapts to the current template's `basePdf`:
- If the current template's `basePdf` is a `BlankPdf`: both kinds of
  letterhead are pickable, exactly as today.
- If the current template's `basePdf` is a `CustomPdf` (a PDF background,
  not blank): field-based letterheads are shown but **visually disabled**
  (grayed out, genuinely non-clickable — not just styled to look
  disabled) since there is no `staticSchema` concept to write into;
  PDF-based letterheads remain fully pickable regardless. The
  `isBlankPdf` type guard (`@pdfme/common`, already imported in
  `TemplateDesigner.tsx`) is the mechanism for this check, consistent
  with how the existing "Header/Footer" and today's "Apply Letterhead"
  buttons already gate on it.

Picking a **field-based** letterhead behaves exactly as it does today —
unchanged, `basePdf.staticSchema` is replaced.

Picking a **PDF-based** letterhead replaces the template's `basePdf`
entirely with the letterhead's stored PDF (the same base64 swap
"Change PDF" performs). Critically, the template's existing `schemas`
array (its fillable fields) is **left completely untouched** — only the
background changes, fields stay exactly where they are, now overlaid on
the new PDF. This matches "Change PDF"'s own existing background-only
behavior and was an explicit design decision (rejected the alternative of
wiping `schemas` on the reasoning that the user may still want their
existing fields, and this mirrors how "Change PDF" already treats a
background swap as non-destructive to fields).

## Server API changes

`server/src/routes/letterheads.ts`'s existing routes are extended, not
replaced:
- `POST /letterheads` — request body gains an optional `type` field
  (`'fields' | 'pdf'`, defaulting to `'fields'` for backward
  compatibility with the existing field-based creation flow) and an
  optional `basePdf` field (base64 string, required when `type: 'pdf'`).
  Validation branches on `type`: `'fields'` requires
  `staticSchema`/`pageWidth`/`pageHeight` (as today); `'pdf'` requires
  `basePdf` and does not require the field-based trio.
- `GET /letterheads` (list) and `GET /letterheads/:id` (single) both
  return the new `type`/`base_pdf` fields alongside the existing ones (all
  nullable/optional as appropriate) — no breaking change to the response
  shape for existing field-based rows, purely additive fields.
- `PUT /letterheads/:id` — a PDF-based letterhead can have its `name` or
  its `basePdf` updated; a field-based letterhead's update behavior is
  unchanged. `type` itself is not editable after creation (out of scope —
  converting one kind of letterhead into the other is not a supported
  operation).
- `DELETE /letterheads/:id` — unchanged, works identically for both
  types.

## Out of scope

- Extracting/recreating an imported PDF's visual content as `staticSchema`
  fields — this is what the existing "Change PDF" AcroForm/AI-vision
  detection features already do, and is unrelated to this feature's goal
  of using the PDF exactly as-is.
- Converting an existing field-based letterhead into a PDF-based one (or
  vice versa) after creation.
- Any editor/preview step for PDF-based letterheads before saving — the
  uploaded file is used exactly as provided, matching "Change PDF"'s own
  no-preview behavior today.
- Enforcing or validating that an imported PDF has any particular page
  size relative to templates it might later be applied to — a PDF-based
  letterhead replaces the whole background, so there is no page-size
  mismatch concern the way there is for field-based letterheads (whose
  content is positioned relative to a specific page height).
- Any change to how field-based letterheads are created, edited, or
  applied — that flow is entirely unchanged by this feature.

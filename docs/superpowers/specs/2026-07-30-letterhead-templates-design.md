# Letterhead templates

Date: 2026-07-30
Status: Approved for planning

## Context

This is the second half of a two-part feature the user requested together
("storing letterhead templates, storing company assets like logos and
stuff"). The company assets library (shared logo/image storage) shipped
first, since letterheads were expected to build on it. This spec covers
that second half: reusable, shared letterhead templates.

A "letterhead" is a header/footer fragment — visually, it's the same thing
the existing Header & Footer editor
(`client/src/components/HeaderFooterEditor.tsx`) already produces: a
pdfme `staticSchema` array (text + logo image fields, laid out in the top
and bottom 30mm bands of a page). `staticSchema` is a native pdfme concept
already supported on `BlankPdf` — schemas there render on every page and
don't participate in per-input data-filling. Today this content lives
embedded inside one specific template's `basePdf` JSON blob, with no way
to save, name, reuse, or apply it to a different template.

This feature adds a way to save a header/footer fragment as a named,
reusable "letterhead," manage a library of them, and apply one to any
template being worked on in the Designer — without introducing any new
UI-building code, since the existing `HeaderFooterEditor` component
already does the actual editing work and can be reused as-is.

## Feature behavior

**Reference model**: bake-in, not live — matches how the company assets
picker already works. Applying a letterhead copies its `staticSchema`
content into the current template at that moment. Editing the letterhead
later has zero effect on templates that already applied it (there is no
ID or reference retained in the template pointing back to the
letterhead).

**Management page** (`client/src/pages/Letterheads.tsx`, new): a new
top-level page, routed at `/letterheads`, added to the sidebar nav
alongside "Assets"/"Templates", role-gated to `Admin`/`Designer` (same
gating as `/assets` and `/templates/new`). Lists saved letterheads by
name. Supports:
- **Create**: user picks a page size (reusing the exact same
  `PageSizeName`/`PAGE_SIZES_PORTRAIT_MM` A4/Letter/Legal + orientation
  convention already defined in `client/src/pages/TemplateDesigner.tsx`)
  and a name, which opens the existing `HeaderFooterEditor` on a blank
  canvas of that size. Saving in the editor stores the resulting
  `staticSchema` as a new letterhead.
- **Edit**: re-opens `HeaderFooterEditor` pre-loaded with the letterhead's
  existing `staticSchema` (via `HeaderFooterEditor`'s existing
  `basePdf.staticSchema` prop) and the page size it was originally created
  with, saving overwrites the same letterhead's content. The name is
  editable separately on the management page itself (e.g. inline rename),
  not inside the `HeaderFooterEditor` modal — that component has no name
  field today and isn't being extended with one; content editing and
  renaming are two independent actions on the same letterhead.
- **Delete**: removes the letterhead. Has zero effect on any template
  that already applied it (per the bake-in model above — nothing to
  break).

**Page size is recorded per-letterhead**: `HeaderFooterEditor`'s footer
positioning math depends on the page's height (`splitStaticSchema`/
`handleSave` rebase footer elements relative to `basePdf.height`), so each
letterhead stores the width/height it was designed against. This is
metadata for correctly re-opening the editor later — it is NOT enforced
as a constraint when applying the letterhead to a template of a different
page size; applying to a mismatched size is allowed and is the user's
judgment call (out of scope: no automatic repositioning/rescaling).

**Applying a letterhead in the Designer**: a new "Apply Letterhead"
toolbar button in `client/src/pages/TemplateDesigner.tsx` (alongside the
existing "Change PDF"/"Pick from Assets"/"Header/Footer" buttons — same
toolbar group), opening a new picker modal listing saved letterheads by
name (styled consistently with the existing `AssetPicker`/
`ApiPayloadModal` modal conventions). Selecting one replaces the current
template's `basePdf.staticSchema` entirely — no confirmation prompt, even
if the template already has header/footer content — matching the
established pattern in this app where "Change PDF" and asset-insertion
already silently replace/add content without confirmation. Only available
when the template's `basePdf` is a `BlankPdf` (via `isBlankPdf`), matching
the exact same constraint the existing "Header/Footer" button already
has (a PDF-background template has no `staticSchema` concept to write
into).

**Logos inside a letterhead**: no new integration work needed. Each of
`HeaderFooterEditor`'s two embedded mini-`Designer` instances already has
the full plugin set (`getPlugins()`), including the `image` field with
its native per-field upload — a user can add a logo directly there exactly
as they can today. Additionally, since the main Designer's "Pick from
Assets" button (from the prior feature) already lets a user insert a
picked library asset as an image field, nothing new is required to
support "logo from the asset library" inside a letterhead either — that
capability already exists at the main-Designer level and produces the
same kind of image schema element `HeaderFooterEditor` already accepts
into its `staticSchema`.

## Server API

New table, `letterheads`: `id`, `name`, `static_schema` (JSON), `page_width`,
`page_height` (the page dimensions the letterhead was designed against,
in mm), `created_at`, `updated_at` — following this codebase's existing
`NVARCHAR(MAX)` JSON-blob convention (`template_versions.schemas`) for
the schema data, and the existing `pdf_templates` table's
created_at/updated_at column conventions.

New routes, likely `server/src/routes/letterheads.ts` mounted at
`/letterheads`:
- `POST /letterheads` — create. Body: `{ name, staticSchema, pageWidth, pageHeight }`.
- `GET /letterheads` — list all (for the management page and the
  Designer's picker).
- `GET /letterheads/:id` — fetch one (for the edit flow, to pre-load
  `HeaderFooterEditor`).
- `PUT /letterheads/:id` — update (name and/or content).
- `DELETE /letterheads/:id` — delete.

No changes to any existing table, route, or the PDF generation pipeline
— this is fully additive, mirroring how the assets feature shipped.

## Out of scope

- Live-reference/linked-letterhead behavior — editing a letterhead never
  retroactively changes a template that already applied it (explicitly
  rejected, consistent with the asset picker's bake-in model).
- Automatic repositioning or rescaling when a letterhead's content is
  applied to a template with a different page size than it was designed
  for.
- A confirmation prompt before replacing existing header/footer content
  when applying a letterhead.
- Any change to `HeaderFooterEditor.tsx` itself — reused completely as-is,
  for both letterhead creation/editing and (unchanged) direct
  template-level header/footer editing.
- Per-user ownership, sharing permissions, or folders/categories for
  organizing letterheads — a flat, shared list (same model as the assets
  library).
- Usage tracking ("this letterhead is used by N templates") or
  delete warnings — matches the assets library's "delete is safe, nothing
  to break" precedent.

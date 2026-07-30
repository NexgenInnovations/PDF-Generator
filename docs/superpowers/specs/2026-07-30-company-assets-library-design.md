# Company assets library (logos and images)

Date: 2026-07-30
Status: Approved for planning

## Context

The user wants two related features: a way to store and reuse "letterhead
templates," and a way to store "company assets like logos." Brainstorming
established these are architecturally distinct and should ship as two
separate spec/plan cycles:

1. **This spec**: a general-purpose, shared company asset library (upload
   once, reuse anywhere an image is needed).
2. **A follow-up spec** (not covered here): letterhead templates as a
   reusable, shared entity that other templates can reference — deferred
   until this asset library exists, since letterheads will likely consume
   assets from it.

Today, there is **no asset storage of any kind** in this app. Every image
(a logo dropped into a header/footer via pdfme's built-in `image` schema
field, or the base PDF itself) is base64-encoded and embedded directly
inside the template's JSON, stored as an `NVARCHAR(MAX)` string in
`template_versions`. There is no deduplication, no reuse mechanism, and no
binary file storage anywhere in the codebase — confirmed by inspecting
`server/src/db.ts`'s `generated_pdfs` table, which has a `file_path`
column that looks like a filesystem-storage precedent but is actually
never used for a real path: `server/src/routes/filledPdfs.ts` always
writes the literal string `'generated-in-memory'` into it, because
generated PDFs are streamed directly to the HTTP response and never
written to disk. This feature introduces the app's first real filesystem
file storage.

## Feature behavior

**Ownership model**: assets are shared/global — one company-wide library,
not scoped per-user. Matches the "company assets" framing; avoids needing
to touch the existing role/auth system (`RoleContext`/`RoleGuard`) for
this feature.

**Accepted file types**: PNG, JPEG, and SVG only — matches what pdfme's
existing `image` schema plugin already renders, plus SVG for vector logos.
Validated server-side by MIME type.

**Storage**: uploaded files are written to a new `server/assets/`
directory on disk (parallel in spirit to the existing, currently-unused
`server/outputs/` convention), named by a generated ID to avoid filename
collisions. A new `company_assets` table stores metadata: `id`, `name`,
`file_path`, `mime_type`, `file_size_bytes`, `created_at` — following the
exact column-naming and type conventions already used in
`generated_pdfs` (`server/src/db.ts`'s `ensureTables()`).

**Asset library page** (`client/src/pages/Assets.tsx`, new): a new
top-level page, added to the sidebar nav (`client/src/components/layout/Sidebar.tsx`)
and routed at `/assets` in `client/src/App.tsx`, following the existing
`RoleGuard`-wrapped, lazy-loaded route pattern already used for
`/templates/new` and `/templates/:id/edit` (role-gated to `Admin`/`Designer`,
matching those routes' existing gating — asset management is a
content-authoring action, not something `FormFiller`-role users need).
Shows a grid of uploaded assets with thumbnail previews (rendered directly
from the serving URL, no separate thumbnail generation), each asset's
name, and per-asset delete. Includes an upload button/dropzone.

**Asset picker component** (`client/src/components/AssetPicker.tsx`,
new): a reusable modal, styled consistently with existing modals in this
codebase (`ApiPayloadModal.tsx`'s backdrop/card conventions — translucent
blurred backdrop, white rounded card). Shows the same asset grid as the
Assets page, single-select. On selection, fetches the chosen asset's raw
file bytes from the server and returns them to the caller (as a base64
data URL, ready to drop into a pdfme schema's `content` field) via an
`onSelect` callback prop — the picker itself has no detection/insertion
logic; that's the caller's responsibility.

**Designer integration**: a new "Pick from Assets" toolbar button in
`client/src/pages/TemplateDesigner.tsx` (alongside the existing "Change
PDF"/"Ask AI" toolbar buttons), opening the `AssetPicker`. On selection,
inserts a new `image`-type pdfme schema field onto the current page at a
default position/size, with the picked asset's base64 as `content` — the
same shape pdfme's own built-in image field produces when a user uploads
directly. The user can then drag/resize this field like any other,
exactly as they could with a manually-uploaded image. This is a
one-time "insert" action, not a live reference: **once picked, the asset
is baked into the template as base64, with no ongoing link back to the
library asset it came from.**

**Delete behavior**: deleting an asset from the library only removes it
from the library (server file + DB row deleted). It has **zero effect**
on any template that has already picked and embedded that asset's base64
content — because a picked asset is copied into the template at
selection time, not referenced live, there is nothing to break. No usage
tracking, no "in use" warnings, no reference-counting — deliberately kept
simple.

**pdfme's built-in image field is untouched**: rather than modifying the
vendored/forked `packages/schemas/src/graphics/image.ts` plugin to add an
"or pick from library" option inside its own UI (riskier, diverges
further from upstream pdfme), the asset picker is a fully separate,
additive toolbar button. Both paths — pdfme's native per-field upload, and
this new library-backed picker — produce the same kind of `image` schema
field with base64 `content`; they just differ in whether that base64 came
from a fresh file-picker dialog or from a previously-uploaded, reusable
asset.

## Server API

New routes, likely `server/src/routes/assets.ts` mounted at `/assets`:

- `POST /assets` — multipart file upload (new dependency: `multer`, or
  equivalent — this app has no existing binary-upload handling to reuse).
  Body: a single file field plus a `name` field. Validates MIME type
  (`image/png`, `image/jpeg`, `image/svg+xml`) before accepting. Writes
  the file to `server/assets/<generated-id>.<ext>`, inserts a
  `company_assets` row, returns the created row as JSON.
- `GET /assets` — lists all assets (metadata only, no file bytes) for the
  library page and picker to render their grids.
- `GET /assets/:id/file` — streams the raw file bytes with the correct
  `Content-Type` (from the stored `mime_type`), used both for `<img src>`
  thumbnails in the browser and for the picker's "fetch and base64-encode
  the chosen asset" step.
- `DELETE /assets/:id` — deletes the DB row and the underlying file from
  `server/assets/`.

No changes to any existing route, table, or the template-generation
pipeline (`server/src/services/pdfService.ts`) — this is fully additive.

`name` is display metadata only — not a unique key. Two assets may share
the same `name`; nothing in this design looks assets up by name (always
by `id`), so duplicate names are harmless and require no validation.

## Out of scope

- Letterhead templates (shared, reusable header/footer entities that
  other templates reference) — a separate, follow-up spec.
- Any live-reference/"linked asset" model where updating a library asset
  propagates to templates that already used it — explicitly rejected in
  favor of the simpler bake-in-at-pick-time model, consistent with how
  pdfme's own image field already works.
- Usage tracking / "this asset is used by N templates" / delete
  warnings or blocking.
- Per-user asset ownership, sharing permissions, or folders/categories
  for organizing assets — a flat, shared list is sufficient for this
  pass.
- PDF files as assets — images only (PNG/JPEG/SVG).
- Modifying pdfme's own `image` schema plugin
  (`packages/schemas/src/graphics/image.ts`) — untouched.
- Thumbnail generation/resizing on the server — the browser renders
  thumbnails directly from the full-size served file via `<img>`; if
  performance becomes an issue with many large assets, that's a future
  optimization, not part of this pass.

# Draft / Publish versioning

Date: 2026-07-23
Status: Approved for planning

## Context

Templates currently have basic versioning infrastructure in `server/src/db.ts`
(`pdf_templates.current_version`, a `template_versions` table with one row
per version) but no draft/publish distinction: every save in the Designer
(`PUT /templates/:id`) immediately calls `createTemplateVersion`, which both
inserts a new version row **and** bumps `current_version` — meaning every
save is instantly "live" and immediately used for PDF generation and form
filling (`getLatestTemplateVersion` always drives `/generate-pdf` and
`GET /templates/:id`).

The user wants:
- A **draft** state — work-in-progress edits that don't affect what end
  users see when filling a form or generating a PDF.
- A **publish** action — explicitly promotes draft content into a
  published version, either as a brand-new version or by replacing an
  existing published version in place.
- Published versions carry a **unique (per-template) free-text tag** the
  user enters at publish time.
- The Designer opens the draft if one exists, otherwise falls back to the
  latest published version.
- Admins/Designers can direct an end user to fill a **specific** published
  version (by version number or tag), not just "whatever is latest" —
  fill/generate URLs gain an optional version reference.
- The template's own ID never changes across this lifecycle (already true
  today — confirmed as existing, correct behavior, not something to build).

## Data model changes

**`pdf_templates`**: no schema change. `current_version` continues to be
an integer counter, but its meaning shifts slightly: it now tracks "the
highest version number ever published" (used to number new published
versions), not "the currently live version."

**`template_versions`**: add two columns:

```sql
ALTER TABLE template_versions ADD status NVARCHAR(20) NOT NULL DEFAULT 'published';
  -- values: 'draft' | 'published'
ALTER TABLE template_versions ADD tag NVARCHAR(255) NULL;
```

- Exactly one `status = 'draft'` row may exist per `template_id` at a time
  (enforced in application code via upsert, not a DB constraint — see
  below).
- `tag` is required (non-null) for `status = 'published'` rows, and must
  be unique per `(template_id, tag)`. Enforced via a filtered unique index:

```sql
CREATE UNIQUE INDEX uq_template_versions_tag
  ON template_versions(template_id, tag)
  WHERE status = 'published';
```

- The existing `UNIQUE (template_id, version)` constraint stays — draft
  rows reuse the current `current_version` number (not yet incremented)
  until they're published, at which point publishing either creates a new
  row with `version = current_version + 1` or updates an existing
  published row's content in place (same version number).

This is implemented directly in `server/src/db.ts`'s `ensureTables()`
function (the codebase's existing pattern — the numbered `.sql` files under
`server/migrations/` are historical/reference artifacts not actually
executed; `db.ts` self-manages its schema on `initDb()`). Since
`ensureTables()` only runs `CREATE TABLE IF NOT EXISTS`, the two new
columns and the filtered index need their own idempotent `IF NOT EXISTS`
guards added alongside the existing table-creation blocks.

## `db.ts` function changes

- **`saveDraft(templateId: string, schema: unknown): Promise<TemplateVersionRow>`**
  — upsert. If a `status='draft'` row exists for `templateId`, update its
  `schema`/`base_pdf`/`schemas`/`created_at` (reusing `created_at` as an
  "updated at" marker for the draft, consistent with how the row is
  reused). Otherwise insert a new row with `status='draft'`,
  `version = <template's current_version>` (draft doesn't consume a new
  version number).
- **`getDraft(templateId: string): Promise<TemplateVersionRow | null>`**
  — fetch the one draft row.
- **`publishVersion(templateId: string, schema: unknown, tag: string, target: { mode: 'new' } | { mode: 'replace', version: number }): Promise<TemplateVersionRow>`**
  — wrapped in a transaction, same pattern as today's `createTemplateVersion`:
  - `mode: 'new'`: increments `pdf_templates.current_version`, inserts a
    new `template_versions` row with `status='published'`, the new version
    number, and the given `tag`.
  - `mode: 'replace'`: updates the existing `status='published'` row at
    `target.version` in place — new `schema`/`base_pdf`/`schemas`/`tag`,
    same `version` number, `template_id`. 404s (throws) if no published
    row exists at that version.
  - In both modes, the tag uniqueness constraint applies — a duplicate tag
    within the same template throws a clear, catchable error (constraint
    violation surfaces as a 409 at the route layer).
  - The draft row is **not** modified or deleted by this function — the
    caller (route layer) is responsible for the "draft mirrors what was
    just published" behavior described below.
- **`listPublishedVersions(templateId: string): Promise<TemplateVersionRow[]>`**
  — all `status='published'` rows for the template, ordered by version
  descending. Used for the publish dialog's "replace existing" picker and
  any future version-browsing UI.
- **`getPublishedVersion(templateId: string, ref: { version: number } | { tag: string }): Promise<TemplateVersionRow | null>`**
  — fetch one specific published version, by number or by tag.
- **`getLatestPublishedVersion(templateId: string): Promise<TemplateVersionRow | null>`**
  — replaces today's `getLatestTemplateVersion` (which conflated "latest
  row" with "current row" under the old no-draft model). Returns the
  highest-numbered `status='published'` row.

`createTemplateVersion` (today's function) is retired — its two call sites
(`POST /templates` on template creation, `PUT /templates/:id` on save) are
replaced as described below.

## API route changes

**`POST /templates`** (create template): creates the `pdf_templates` row,
then calls `saveDraft` (not `createTemplateVersion`) with the initial
schema — a brand-new template starts with only a draft, no published
version yet.

**`GET /templates/:id`**: returns the template row plus both `draft` (if
any) and `latestPublished` (if any) in one response, so the client can
implement "open draft, else open latest published" without a second round
trip:

```json
{
  "id": "...", "name": "...", "current_version": 3,
  "created_at": "...", "updated_at": "...",
  "draft": { "schema": {...}, "version": 3 } | null,
  "latestPublished": { "schema": {...}, "version": 2, "tag": "v1.1" } | null
}
```

Supports optional `?version=N` or `?tag=v1.2` query params — when present,
returns that specific published version's schema as `latestPublished`
(field name kept for client-side consistency; it represents "the
published version being requested," whether or not it's actually the
highest-numbered one) and omits `draft` entirely (draft is never relevant
to a specific-version request — this mode is what `FormFill` uses).

**`PUT /templates/:id`** (Designer save): renamed in intent, same route —
updates the template's `name`, and if `schema` is present in the body,
calls `saveDraft` (never auto-publishes). Response includes the updated
draft.

**`POST /templates/:id/publish`** (new): body
`{ schema: unknown, tag: string, mode: 'new' } | { schema: unknown, tag: string, mode: 'replace', version: number }`.
Calls `publishVersion`. After a successful publish, also calls `saveDraft`
with the same `schema` so the draft mirrors the just-published content
(per "draft has the most updated version" — the draft is not cleared, it's
kept in sync with whatever was just published, ready for the next edit to
diverge from). Returns the created/updated published version. 409 on
duplicate tag.

**`GET /templates/:id/versions`** (new): returns `listPublishedVersions`
— used by the publish dialog's replace-target picker and the "share a
specific version" UI in `TemplateList`.

**`POST /generate-pdf`**: body gains optional `version` (number) or `tag`
(string) alongside the existing `template_id`/`inputs`. When present,
resolves via `getPublishedVersion`; when absent, resolves via
`getLatestPublishedVersion` (same as today's implicit behavior, just
renamed under the hood). 404s if the requested version/tag doesn't exist
for that template. Never resolves to the draft.

## Client changes

**`client/src/lib/api.ts`**:
- `getTemplate(id: string, versionRef?: { version: number } | { tag: string })`
  — appends `?version=`/`?tag=` when provided.
- `updateTemplate(id: string, name: string, schema: Template)` — same
  signature as today, still `PUT /templates/:id`, but now writes to the
  draft server-side instead of publishing (behavior change only, no
  client-side rename — the Designer's "Save Draft" button calls this
  existing function).
- `publishTemplate(id: string, schema: Template, tag: string, target: {mode: 'new'} | {mode: 'replace', version: number})` — new, `POST /templates/:id/publish`.
- `listPublishedVersions(id: string)` — new, `GET /templates/:id/versions`.
- `createFilledPdf(templateId: string, inputs: Record<string,string>[], versionRef?: {version: number} | {tag: string})`.

**`client/src/pages/TemplateDesigner.tsx`**:
- On load: fetch the template; if `draft` present, load it into the pdfme
  `Designer`; else load `latestPublished`. If neither exists (shouldn't
  happen post-creation, but defensively), fall back to `BLANK_TEMPLATE`.
- "Save" button relabeled "Save Draft" — writes to the draft only.
- New "Publish" toolbar button opens a modal: two options —
  - **New version**: text input for a required, unique tag.
  - **Replace existing**: a list of published versions (version # + tag +
    date) fetched via `listPublishedVersions`; selecting one pre-fills the
    tag field with that version's existing tag (editable).
  - Submits to `publishTemplate`.

**`client/src/pages/TemplateList.tsx`**: the "Fill" action (for
Admin/Designer roles) opens a small picker listing published versions
(via `listPublishedVersions`) and copies a shareable link
`/templates/:id/fill?version=N` (or `?tag=...`) to the clipboard, instead
of navigating directly. FormFiller-role users (who only ever reach this
page via a shared link, not by browsing) are unaffected by this change —
their existing links keep working as version-specific URLs.

**`client/src/pages/FormFill.tsx`**: reads `version`/`tag` from
`useSearchParams()`, passes through to `api.getTemplate` and
`api.createFilledPdf`. Falls back to latest published when absent — this
is form-filling, so it never touches the draft.

## Out of scope

- Migrating or reconciling the unused numbered `.sql` files under
  `server/migrations/` — `db.ts`'s `ensureTables()` remains the single
  source of schema truth, consistent with existing practice.
- Deleting or un-publishing a version.
- Draft history / undo — only the single current draft state is kept, no
  history of prior draft saves.
- Changing the template's own ID/lifecycle — already stable today, no
  work needed.
- Any change to `HeaderFooterEditor`, `ApiPayloadModal`, or other
  Designer-toolbar features built in prior work — this plan only touches
  the save/publish/load flow and the version-aware read paths.

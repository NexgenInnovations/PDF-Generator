# Letterhead PDF Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second kind of letterhead — "PDF-based" — where an uploaded PDF is stored and applied as-is (replacing a template's `basePdf` entirely), coexisting with today's "field-based" letterheads (`staticSchema` fragments) in the same table, management page, and Designer picker.

**Architecture:** The existing `letterheads` table gains a `type` discriminator column and relaxed nullability on its field-based columns, plus a new nullable `base_pdf` column for PDF-based rows — following this codebase's established online-migration pattern (`IF NOT EXISTS (SELECT 1 FROM sys.columns ...) ALTER TABLE ...`, already used for `template_versions.status`/`tag`). The existing CRUD functions and routes are extended (not replaced) to branch on `type`. On the client, `Letterheads.tsx` gains an "Import PDF" button (reusing the base64-read technique `handleBasePdfFile` already uses for "Change PDF"), and `LetterheadPicker`/`TemplateDesigner.tsx` are extended so the picker adapts to the current template's `basePdf` kind and the apply handler branches on the picked letterhead's `type`.

**Tech Stack:** Node.js + Express + TypeScript + MSSQL (`mssql` package) on the server; React 18 + TypeScript on the client. No new npm dependencies. No test runner exists in either `client/` or `server/` — verification is manual: typecheck plus live server/browser testing.

## Global Constraints

- One `letterheads` table represents both kinds via a `type NVARCHAR(10) NOT NULL DEFAULT 'fields'` discriminator (`'fields' | 'pdf'`). `static_schema`, `page_width`, `page_height` are nullable and populated only for `type = 'fields'`; the new `base_pdf` column is nullable and populated only for `type = 'pdf'`.
- All existing rows (implicitly `type = 'fields'` today) must continue to work identically after migration — the migration must be purely additive/relaxing (no data loss, no re-validation that could reject existing rows).
- The existing field-based letterhead creation/edit/rename/delete flow is completely unchanged in behavior — this plan only adds a new, parallel path.
- "Apply Letterhead" in the Designer is no longer gated to blank-PDF templates (`disabled={!isBlank}` is removed from that button) — it is always enabled. The picker itself handles per-letterhead compatibility: field-based letterheads are shown but non-clickable (via `disabled` on their button, not just visual styling) when the current template's `basePdf` is not a `BlankPdf` (checked via `isBlankPdf` from `@pdfme/common`); PDF-based letterheads are always clickable.
- Picking a PDF-based letterhead replaces `basePdf` entirely (the same shape "Change PDF" already produces: `{ ...t, basePdf: dataUrl }`) and leaves the template's `schemas` array completely untouched.
- `type` is not editable after creation — no route/UI supports converting one kind of letterhead into the other.
- No changes to `HeaderFooterEditor.tsx`, the assets feature, or any unrelated route/table.

---

## File Structure

- **Modify:** `server/src/db.ts` — add the migration (new columns, relaxed nullability), extend `LetterheadRow`/`LetterheadSummaryRow` types, extend `createLetterhead`/`updateLetterhead`/`getLetterhead`/`listLetterheads` to handle `type`/`base_pdf`.
- **Modify:** `server/src/routes/letterheads.ts` — extend POST/PUT validation to branch on `type`; GET routes already pass through whatever `db.ts` returns, no route-level changes needed there beyond the type surface.
- **Modify:** `client/src/types.ts` — extend `LetterheadSummary`/`LetterheadRecord` with `type`/`base_pdf`.
- **Modify:** `client/src/lib/api.ts` — extend `createLetterhead`/`updateLetterhead` to accept the new fields.
- **Modify:** `client/src/pages/Letterheads.tsx` — add "Import PDF" button and its file-read/save flow.
- **Modify:** `client/src/components/LetterheadPicker.tsx` — accept a prop indicating whether the current template is blank, disable incompatible field-based letterheads, branch `onSelect`'s payload shape by `type`.
- **Modify:** `client/src/pages/TemplateDesigner.tsx` — remove the `disabled={!isBlank}` gate on "Apply Letterhead"; extend `handleLetterheadPicked` to branch on `type` (staticSchema replace vs. basePdf replace); pass the current blank-state into `LetterheadPicker`.

---

### Task 1: Server — migrate `letterheads` table, extend types and CRUD

**Files:**
- Modify: `server/src/db.ts`

**Interfaces:**
- Produces (extends Task 1's prior-session interfaces, now with `type`/`base_pdf`):
  ```ts
  export interface LetterheadRow {
    id: string;
    name: string;
    type: 'fields' | 'pdf';
    static_schema: unknown | null;
    page_width: number | null;
    page_height: number | null;
    base_pdf: string | null;
    created_at: string;
    updated_at: string;
  }
  export interface LetterheadSummaryRow {
    id: string;
    name: string;
    type: 'fields' | 'pdf';
    page_width: number | null;
    page_height: number | null;
    created_at: string;
    updated_at: string;
  }
  export async function createLetterhead(input: {
    name: string;
    type: 'fields' | 'pdf';
    staticSchema?: unknown;
    pageWidth?: number;
    pageHeight?: number;
    basePdf?: string;
  }): Promise<LetterheadRow>
  export async function updateLetterhead(id: string, input: {
    name?: string;
    staticSchema?: unknown;
    pageWidth?: number;
    pageHeight?: number;
    basePdf?: string;
  }): Promise<LetterheadRow | null>
  ```
  `listLetterheads`/`getLetterhead`/`deleteLetterhead` keep their existing signatures — only their return shape gains the new fields. `createLetterhead`'s `type` is required (no default at the function layer — the route layer defaults to `'fields'` before calling in, per Task 2, so this function always receives an explicit value). `updateLetterhead` intentionally has no `type` parameter — per the Global Constraints, `type` is immutable after creation, so there is no code path that can change it.

- [ ] **Step 1: Add the migration to `ensureTables()`**

Read the current `server/src/db.ts` in full first (740+ lines) to find the exact current `letterheads` table creation block and the exact point after it (before other tables' migrations, or at the end of `ensureTables()` — match this codebase's existing convention of placing a table's own migrations immediately after its own `CREATE TABLE IF NOT EXISTS` block, as already done for `template_versions.status`/`tag`). Insert this migration block immediately after the existing `letterheads` `CREATE TABLE IF NOT EXISTS` block:

```ts
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('letterheads') AND name = 'type')
    ALTER TABLE letterheads ADD type NVARCHAR(10) NOT NULL DEFAULT 'fields'
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('letterheads') AND name = 'base_pdf')
    ALTER TABLE letterheads ADD base_pdf NVARCHAR(MAX) NULL
  `);

  await p.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('letterheads') AND name = 'static_schema' AND is_nullable = 0
    )
    ALTER TABLE letterheads ALTER COLUMN static_schema NVARCHAR(MAX) NULL
  `);

  await p.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('letterheads') AND name = 'page_width' AND is_nullable = 0
    )
    ALTER TABLE letterheads ALTER COLUMN page_width FLOAT NULL
  `);

  await p.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('letterheads') AND name = 'page_height' AND is_nullable = 0
    )
    ALTER TABLE letterheads ALTER COLUMN page_height FLOAT NULL
  `);
```

Notes on this migration:
- `type` uses `ADD ... DEFAULT 'fields'` so every pre-existing row (all field-based today) is backfilled to `'fields'` automatically by SQL Server's `ADD COLUMN ... DEFAULT` behavior — no separate `UPDATE` statement needed, unlike the `tag` backfill pattern used for `template_versions` (that one needed a manual `UPDATE` because it had to compute a *derived* value per row; here every row gets the identical literal default).
- The three `ALTER COLUMN ... NULL` statements each check `is_nullable = 0` first so they are idempotent — re-running them after the column is already nullable is a no-op check, not an error (MSSQL's `ALTER COLUMN` to the same nullability is technically also idempotent on its own, but the `sys.columns` guard keeps this consistent with every other migration in this function and avoids re-running `ALTER COLUMN` unnecessarily on every server start).
- No new index is needed on `type` — this table is never expected to hold enough rows for a `type`-filtered query to need one (matches the plan's spec, which sets no scale expectations for this feature).

- [ ] **Step 2: Extend the `LetterheadRow`/`LetterheadSummaryRow` types**

Find the existing `LetterheadRow`/`LetterheadSummaryRow` interfaces (in the `// ─── Types ───` section) and replace them with:

```ts
export interface LetterheadRow {
  id: string;
  name: string;
  type: 'fields' | 'pdf';
  static_schema: unknown | null;
  page_width: number | null;
  page_height: number | null;
  base_pdf: string | null;
  created_at: string;
  updated_at: string;
}

export interface LetterheadSummaryRow {
  id: string;
  name: string;
  type: 'fields' | 'pdf';
  page_width: number | null;
  page_height: number | null;
  created_at: string;
  updated_at: string;
}
```

`LetterheadSummaryRow` deliberately excludes `base_pdf` (a potentially large base64 string) from the list view, exactly as it already excludes `static_schema` — the list is metadata-only regardless of type; full content (either kind) is only fetched via `getLetterhead`.

- [ ] **Step 3: Extend `listLetterheads`, `getLetterhead`, `createLetterhead`, `updateLetterhead`**

Read the current implementations of these four functions in full first (they currently assume `type = 'fields'` implicitly and don't select/handle `type`/`base_pdf` at all). Replace them with:

```ts
export async function listLetterheads(): Promise<LetterheadSummaryRow[]> {
  const result = await getPool().request().query(
    'SELECT id, name, type, page_width, page_height, created_at, updated_at FROM letterheads ORDER BY updated_at DESC'
  );
  return result.recordset;
}

function parseLetterheadRow(row: Record<string, unknown>): LetterheadRow {
  return {
    ...row,
    static_schema: row.static_schema ? JSON.parse(row.static_schema as string) : null,
  } as LetterheadRow;
}

export async function getLetterhead(id: string): Promise<LetterheadRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('SELECT id, name, type, static_schema, page_width, page_height, base_pdf, created_at, updated_at FROM letterheads WHERE id = @id');
  const row = result.recordset[0];
  return row ? parseLetterheadRow(row) : null;
}

export async function createLetterhead(input: {
  name: string;
  type: 'fields' | 'pdf';
  staticSchema?: unknown;
  pageWidth?: number;
  pageHeight?: number;
  basePdf?: string;
}): Promise<LetterheadRow> {
  const result = await getPool()
    .request()
    .input('name', sql.NVarChar(255), input.name)
    .input('type', sql.NVarChar(10), input.type)
    .input('static_schema', sql.NVarChar(sql.MAX), input.staticSchema !== undefined ? JSON.stringify(input.staticSchema) : null)
    .input('page_width', sql.Float, input.pageWidth ?? null)
    .input('page_height', sql.Float, input.pageHeight ?? null)
    .input('base_pdf', sql.NVarChar(sql.MAX), input.basePdf ?? null)
    .query(`
      INSERT INTO letterheads (name, type, static_schema, page_width, page_height, base_pdf)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.type, INSERTED.static_schema, INSERTED.page_width,
             INSERTED.page_height, INSERTED.base_pdf, INSERTED.created_at, INSERTED.updated_at
      VALUES (@name, @type, @static_schema, @page_width, @page_height, @base_pdf)
    `);
  return parseLetterheadRow(result.recordset[0]);
}

export async function updateLetterhead(
  id: string,
  input: { name?: string; staticSchema?: unknown; pageWidth?: number; pageHeight?: number; basePdf?: string }
): Promise<LetterheadRow | null> {
  const existing = await getLetterhead(id);
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const staticSchema = input.staticSchema !== undefined ? input.staticSchema : existing.static_schema;
  const pageWidth = input.pageWidth ?? existing.page_width;
  const pageHeight = input.pageHeight ?? existing.page_height;
  const basePdf = input.basePdf ?? existing.base_pdf;

  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar(255), name)
    .input('static_schema', sql.NVarChar(sql.MAX), staticSchema !== null ? JSON.stringify(staticSchema) : null)
    .input('page_width', sql.Float, pageWidth)
    .input('page_height', sql.Float, pageHeight)
    .input('base_pdf', sql.NVarChar(sql.MAX), basePdf)
    .query(`
      UPDATE letterheads
      SET name = @name, static_schema = @static_schema, page_width = @page_width,
          page_height = @page_height, base_pdf = @base_pdf, updated_at = GETUTCDATE()
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.type, INSERTED.static_schema, INSERTED.page_width,
             INSERTED.page_height, INSERTED.base_pdf, INSERTED.created_at, INSERTED.updated_at
      WHERE id = @id
    `);
  const row = result.recordset[0];
  return row ? parseLetterheadRow(row) : null;
}
```

Note on `staticSchema`'s merge logic in `updateLetterhead`: changed from the prior session's `input.staticSchema ?? existing.static_schema` to `input.staticSchema !== undefined ? input.staticSchema : existing.static_schema` — the prior `??` form is subtly wrong now that `existing.static_schema` can legitimately be `null` (for a PDF-based letterhead) or the caller might (in principle, though no current caller does) want to explicitly clear it; `!== undefined` is the correct "was this field provided in this PUT request at all" check, distinguishing "omitted" from "explicitly null," which `??` cannot do. `UPDATE` still unconditionally writes all five mutable columns on every call (matching the existing function's established pattern from the prior session) — this is safe because every value going into the query is always either the caller's new value or the existing row's current value, never `undefined`.

- [ ] **Step 4: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors. `server/src/routes/letterheads.ts` (not yet modified in this task) may now show type errors against the widened `createLetterhead` signature — that's expected and is Task 2's job to fix; if `tsc --noEmit` reports errors ONLY in that file, note it in your report as expected but do not fix it (out of scope for this task) — if it reports errors anywhere else, treat that as a real bug to fix within this task.

- [ ] **Step 5: Manual verification**

Start the server (`cd server && npm run dev`, on an alternate port if 3004 is in use by another process — verify via `ps -p <pid> -o command` before touching anything). Confirm the log shows `Connected to MSSQL` / `Tables ready` with no thrown error — this confirms the new `ALTER TABLE` statements are valid MSSQL syntax and ran successfully against a database that already has the OLD (pre-migration) `letterheads` table shape from the prior session's work.

If you have DB query access, confirm existing letterhead rows (created before this migration) still have `type = 'fields'` and their original `static_schema`/`page_width`/`page_height` values intact (e.g. `SELECT TOP 5 id, name, type, page_width, page_height FROM letterheads` — if the table is empty in this environment, that's fine, just confirm no error was thrown by the migration itself).

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts
git commit -m "feat(server): migrate letterheads table for PDF-based letterhead support"
```

---

### Task 2: Server — extend letterhead routes for `type`/`base_pdf`

**Files:**
- Modify: `server/src/routes/letterheads.ts`

**Interfaces:**
- Consumes: Task 1's extended `createLetterhead`/`updateLetterhead` signatures.
- Produces: `POST /letterheads` now accepts an optional `type` (`'fields' | 'pdf'`, default `'fields'`) and branches its required-field validation accordingly; `PUT /letterheads/:id` accepts an optional `basePdf` field alongside the existing optional fields.

- [ ] **Step 1: Update POST validation to branch on `type`**

Read the current `POST /` handler in full. Replace it with:

```ts
letterheadsRouter.post('/', async (req: Request, res: Response) => {
  const { name, type, staticSchema, pageWidth, pageHeight, basePdf } = req.body as {
    name?: string;
    type?: 'fields' | 'pdf';
    staticSchema?: unknown;
    pageWidth?: number;
    pageHeight?: number;
    basePdf?: string;
  };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const resolvedType: 'fields' | 'pdf' = type === 'pdf' ? 'pdf' : 'fields';

  if (resolvedType === 'fields') {
    if (!Array.isArray(staticSchema)) {
      res.status(400).json({ error: 'staticSchema is required and must be an array' });
      return;
    }
    if (typeof pageWidth !== 'number' || typeof pageHeight !== 'number') {
      res.status(400).json({ error: 'pageWidth and pageHeight are required numbers' });
      return;
    }
  } else {
    if (!basePdf || typeof basePdf !== 'string') {
      res.status(400).json({ error: 'basePdf is required and must be a string' });
      return;
    }
  }

  try {
    const letterhead = await createLetterhead({
      name: name.trim(),
      type: resolvedType,
      staticSchema: resolvedType === 'fields' ? staticSchema : undefined,
      pageWidth: resolvedType === 'fields' ? pageWidth : undefined,
      pageHeight: resolvedType === 'fields' ? pageHeight : undefined,
      basePdf: resolvedType === 'pdf' ? basePdf : undefined,
    });
    res.status(201).json(letterhead);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});
```

`type: type === 'pdf' ? 'pdf' : 'fields'` (rather than a simpler `type ?? 'fields'`) intentionally treats ANY value other than the literal string `'pdf'` — including an invalid string, `undefined`, or omission — as `'fields'`, matching the Global Constraint that `'fields'` is the default and preserving exact backward compatibility with every existing client call that never sends `type` at all.

- [ ] **Step 2: Update PUT to accept `basePdf`**

Read the current `PUT /:id` handler in full. Replace it with:

```ts
letterheadsRouter.put('/:id', async (req: Request, res: Response) => {
  const { name, staticSchema, pageWidth, pageHeight, basePdf } = req.body as {
    name?: string;
    staticSchema?: unknown;
    pageWidth?: number;
    pageHeight?: number;
    basePdf?: string;
  };

  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  if (staticSchema !== undefined && !Array.isArray(staticSchema)) {
    res.status(400).json({ error: 'staticSchema must be an array' });
    return;
  }
  if (basePdf !== undefined && typeof basePdf !== 'string') {
    res.status(400).json({ error: 'basePdf must be a string' });
    return;
  }

  try {
    const updated = await updateLetterhead(req.params.id, {
      name: name?.trim(),
      staticSchema,
      pageWidth,
      pageHeight,
      basePdf,
    });
    if (!updated) {
      res.status(404).json({ error: 'Letterhead not found' });
      return;
    }
    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});
```

Note: this route does not validate/enforce that `staticSchema` is only sent for `type: 'fields'` rows or `basePdf` only for `type: 'pdf'` rows — it trusts the caller to send the field appropriate to the letterhead's existing (immutable) type, consistent with `type` being immutable and this plan's client-side code (Task 3/4) only ever sending the field that matches what it already knows the letterhead's type to be. A future hardening pass could add that cross-check server-side, but the Global Constraints don't require it and no current caller in this codebase would trigger it.

- [ ] **Step 3: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors (this should now also resolve any Task 1-flagged errors in this file).

- [ ] **Step 4: Manual verification**

Start the server (alternate port if needed, confirm process ownership). Run:

```bash
curl -s -X POST http://localhost:3004/letterheads \
  -H "Content-Type: application/json" \
  -d '{"name":"PDF Letterhead Test","type":"pdf","basePdf":"data:application/pdf;base64,JVBERi0xLjQK"}' \
  -w "\nHTTP %{http_code}\n"
```
Expected: `201`, response includes `"type":"pdf"`, `"base_pdf":"data:application/pdf;base64,JVBERi0xLjQK"`, `"static_schema":null`, `"page_width":null`, `"page_height":null`.

```bash
curl -s -X POST http://localhost:3004/letterheads \
  -H "Content-Type: application/json" \
  -d '{"name":"Missing basePdf","type":"pdf"}' \
  -w "\nHTTP %{http_code}\n"
```
Expected: `400`, `"basePdf is required and must be a string"`.

```bash
curl -s -X POST http://localhost:3004/letterheads \
  -H "Content-Type: application/json" \
  -d '{"name":"Legacy Field Letterhead","staticSchema":[],"pageWidth":210,"pageHeight":297}' \
  -w "\nHTTP %{http_code}\n"
```
Expected: `201` with `"type":"fields"` — confirms omitting `type` entirely still defaults correctly (backward compatibility with the existing "New Letterhead" flow, which this task's route change must not break).

```bash
curl -s http://localhost:3004/letterheads -w "\nHTTP %{http_code}\n"
```
Expected: `200`, list includes both created letterheads, each with correct `type`, no `static_schema`/`base_pdf` fields present in the summary rows.

Delete both test letterheads afterward via `DELETE /letterheads/:id` to leave the DB clean. Kill the server process (verify PID ownership first).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/letterheads.ts
git commit -m "feat(server): accept type and basePdf in letterhead routes"
```

---

### Task 3: Client — API, types, and "Import PDF" on the Letterheads page

**Files:**
- Modify: `client/src/types.ts`
- Modify: `client/src/lib/api.ts`
- Modify: `client/src/pages/Letterheads.tsx`

**Interfaces:**
- Consumes: Task 2's extended routes.
- Produces:
  ```ts
  // client/src/types.ts
  export interface LetterheadSummary {
    id: string;
    name: string;
    type: 'fields' | 'pdf';
    page_width: number | null;
    page_height: number | null;
    created_at: string;
    updated_at: string;
  }
  export interface LetterheadRecord extends LetterheadSummary {
    static_schema: unknown[] | null;
    base_pdf: string | null;
  }
  // client/src/lib/api.ts
  createLetterhead: (input: {
    name: string;
    type: 'fields' | 'pdf';
    staticSchema?: unknown[];
    pageWidth?: number;
    pageHeight?: number;
    basePdf?: string;
  }) => Promise<LetterheadRecord>
  updateLetterhead: (id: string, patch: { name?: string; staticSchema?: unknown[]; pageWidth?: number; pageHeight?: number; basePdf?: string }) => Promise<LetterheadRecord>
  ```
  `createLetterhead`'s signature CHANGES from four positional parameters (prior session's `(name, staticSchema, pageWidth, pageHeight)`) to a single options object — this is a breaking change to that function's call sites, both of which live in `Letterheads.tsx` and are updated together in this same task's Step 3, so nothing is left broken. `updateLetterhead`'s signature is unchanged in shape (still `(id, patch)`), only `patch`'s type gains an optional `basePdf` field.

- [ ] **Step 1: Extend the types**

In `client/src/types.ts`, find the existing `LetterheadSummary`/`LetterheadRecord` interfaces and replace them with:

```ts
export interface LetterheadSummary {
  id: string;
  name: string;
  type: 'fields' | 'pdf';
  page_width: number | null;
  page_height: number | null;
  created_at: string;
  updated_at: string;
}

export interface LetterheadRecord extends LetterheadSummary {
  static_schema: unknown[] | null;
  base_pdf: string | null;
}
```

- [ ] **Step 2: Extend `api.ts`**

Read the current `client/src/lib/api.ts` in full. Replace the existing `createLetterhead` and `updateLetterhead` methods with:

```ts
  createLetterhead: (input: {
    name: string;
    type: "fields" | "pdf";
    staticSchema?: unknown[];
    pageWidth?: number;
    pageHeight?: number;
    basePdf?: string;
  }) =>
    request<LetterheadRecord>("/letterheads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  updateLetterhead: (
    id: string,
    patch: { name?: string; staticSchema?: unknown[]; pageWidth?: number; pageHeight?: number; basePdf?: string }
  ) =>
    request<LetterheadRecord>(`/letterheads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
```

(`listLetterheads`, `getLetterhead`, `deleteLetterhead` are unchanged — their generic type parameters already resolve to the now-widened `LetterheadSummary`/`LetterheadRecord` types from Step 1 automatically, no code change needed for those three.)

- [ ] **Step 3: Update `Letterheads.tsx`'s existing `createLetterhead` call site, and add "Import PDF"**

Read the current `client/src/pages/Letterheads.tsx` in full (233 lines). Two changes:

First, update `handleEditorSave`'s existing call to the now-changed `api.createLetterhead` signature:

```tsx
  const handleEditorSave = async (staticSchema: Schema[]) => {
    if (!editorState) return;
    try {
      if (editorState.id) {
        await api.updateLetterhead(editorState.id, { staticSchema });
      } else {
        await api.createLetterhead({
          name: editorState.name,
          type: 'fields',
          staticSchema,
          pageWidth: editorState.basePdf.width,
          pageHeight: editorState.basePdf.height,
        });
      }
      setEditorState(null);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };
```

Second, add a new "Import PDF" button and its handler. Add a `useRef` import (alongside the existing `useEffect, useState` import) and a hidden file input, following the exact pattern `client/src/pages/Assets.tsx` already uses for its own file upload button (`fileInputRef`, a hidden `<input type="file">`, a visible button that calls `.click()` on it):

```tsx
import { useEffect, useRef, useState } from 'react';
```

Add new state near the existing `pageSizePickerOpen`/`editorState` state:

```tsx
const [importing, setImporting] = useState(false);
const pdfFileInputRef = useRef<HTMLInputElement | null>(null);
```

Add the handler function, placed near `startCreate`/`confirmCreateSize`:

```tsx
  const handleImportClick = () => pdfFileInputRef.current?.click();

  const handlePdfFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const name = window.prompt('Name this letterhead', file.name.replace(/\.pdf$/i, ''));
    if (!name || name.trim().length === 0) return;

    setImporting(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const basePdf = reader.result as string;
        await api.createLetterhead({ name: name.trim(), type: 'pdf', basePdf });
        refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setImporting(false);
      }
    };
    reader.onerror = () => {
      setError('Could not read the selected file.');
      setImporting(false);
    };
    reader.readAsDataURL(file);
  };
```

This mirrors `TemplateDesigner.tsx`'s `handleBasePdfFile`'s exact `FileReader.readAsDataURL` technique for producing a base64 data URL client-side — no new file-reading approach introduced.

Add the button next to the existing "New Letterhead" button:

```tsx
          <div className="flex items-center gap-2">
            <Button onClick={startCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Letterhead
            </Button>
            <Button onClick={handleImportClick} disabled={importing} variant="outline">
              <Upload className="h-4 w-4 mr-1.5" />
              {importing ? 'Importing…' : 'Import PDF'}
            </Button>
            <input
              ref={pdfFileInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={handlePdfFileSelected}
            />
          </div>
```

Replace the existing bare `<Button onClick={startCreate}>...</Button>` (currently the sole button in that toolbar row) with this `<div className="flex items-center gap-2">...</div>` wrapper containing both buttons — read the current JSX around that button first to confirm the exact surrounding `<div className="flex items-center justify-between">` structure so the new wrapper nests correctly without breaking the existing `justify-between` layout (the letterhead-count `<p>` on the left, both buttons together on the right).

Add `Upload` to the existing `lucide-react` import line — verified current state is `import { Plus, Trash2, Pencil, AlertCircle } from 'lucide-react';`, no `Upload` present, no collision.

Finally, update the grid card rendering to show each letterhead's `type` (so a user can visually distinguish the two kinds in the list) — find the existing `<p className="text-xs" ...>{lh.page_width}×{lh.page_height}mm</p>` line and replace it with a type-aware version:

```tsx
                <p className="text-xs" style={{ color: 'var(--nx-ink-muted)' }}>
                  {lh.type === 'pdf' ? 'Imported PDF' : `${lh.page_width}×${lh.page_height}mm`}
                </p>
```

Also, the existing "Edit" button (which opens `HeaderFooterEditor`) only makes sense for `type: 'fields'` letterheads — a PDF-based letterhead has no field content to edit in that modal. Find the existing `<button onClick={() => startEdit(lh)}>...Edit</button>` and gate it:

```tsx
                  {lh.type === 'fields' && (
                    <button
                      onClick={() => startEdit(lh)}
                      className="flex items-center gap-1 text-xs"
                      style={{ color: 'var(--nx-ink-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  )}
```

("Rename" and "Delete" remain available for both types unchanged — renaming and deleting are type-agnostic operations already handled generically by `handleRename`/`handleDelete`, which only ever touch `name`/`id`, never `static_schema`/`base_pdf`.)

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Start both server and client dev servers (alternate ports if needed, confirm process ownership before reusing any port). If a browser is available:
1. Navigate to `/letterheads`. Confirm both "New Letterhead" and "Import PDF" buttons are visible.
2. Click "Import PDF", select any real PDF file, provide a name in the prompt. Confirm it appears in the grid labeled "Imported PDF" (not a page-size dimension), with no "Edit" button (only "Rename"/"Delete").
3. Confirm an existing field-based letterhead (or a newly-created one via "New Letterhead") still shows its page dimensions and its "Edit" button, unchanged from before this task.
4. Click "Rename" and "Delete" on the imported PDF letterhead — confirm both still work (these are type-agnostic per this task's design).

If no browser is available, perform a careful code-path walkthrough (import flow: file select → name prompt → base64 read → `api.createLetterhead` with `type: 'pdf'` → refresh; conditional "Edit" button rendering; conditional dimension-vs-"Imported PDF" label) and describe it in detail in your report.

- [ ] **Step 6: Commit**

```bash
git add client/src/types.ts client/src/lib/api.ts client/src/pages/Letterheads.tsx
git commit -m "feat(letterheads): add Import PDF flow to the Letterheads page"
```

---

### Task 4: Client — picker compatibility filtering and Designer apply branching

**Files:**
- Modify: `client/src/components/LetterheadPicker.tsx`
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- Consumes: Task 3's extended `LetterheadSummary`/`LetterheadRecord` types and `api.getLetterhead`.
- Produces:
  ```tsx
  export default function LetterheadPicker(props: {
    currentIsBlank: boolean;
    onSelect: (letterhead: { type: 'fields'; staticSchema: import('@pdfme/common').Schema[] } | { type: 'pdf'; basePdf: string }) => void;
    onClose: () => void;
  }): JSX.Element
  ```
  `onSelect`'s payload is now a discriminated union instead of a bare `Schema[]` — `TemplateDesigner.tsx`'s `handleLetterheadPicked` (this same task) is the only caller and is updated together with this change, so nothing else in the codebase references the old `(staticSchema: Schema[]) => void` shape.

- [ ] **Step 1: Update `LetterheadPicker.tsx`**

Read the current file in full (102 lines). Replace it with:

```tsx
// client/src/components/LetterheadPicker.tsx
import { useEffect, useState } from 'react';
import type { Schema } from '@pdfme/common';
import { api } from '../lib/api.js';
import type { LetterheadSummary } from '../types.js';

type LetterheadSelection =
  | { type: 'fields'; staticSchema: Schema[] }
  | { type: 'pdf'; basePdf: string };

export default function LetterheadPicker(props: {
  currentIsBlank: boolean;
  onSelect: (selection: LetterheadSelection) => void;
  onClose: () => void;
}) {
  const { currentIsBlank, onSelect, onClose } = props;
  const [letterheads, setLetterheads] = useState<LetterheadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    api.listLetterheads()
      .then(setLetterheads)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const handlePick = async (letterhead: LetterheadSummary) => {
    setSelectingId(letterhead.id);
    setError(null);
    try {
      const full = await api.getLetterhead(letterhead.id);
      if (full.type === 'pdf') {
        if (!full.base_pdf) throw new Error('This letterhead has no stored PDF content.');
        onSelect({ type: 'pdf', basePdf: full.base_pdf });
      } else {
        onSelect({ type: 'fields', staticSchema: (full.static_schema ?? []) as Schema[] });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSelectingId(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.40)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '480px', maxWidth: '90vw', maxHeight: '80vh',
          background: '#fff',
          border: '1px solid #e6e6e6',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>Apply Letterhead</span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 16, overflow: 'auto' }}>
          {error && (
            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>
          )}
          {loading ? (
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 13 }}>Loading…</div>
          ) : letterheads.length === 0 ? (
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 13 }}>
              No letterheads yet. Create one from the Letterheads page first.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {letterheads.map(lh => {
                const incompatible = lh.type === 'fields' && !currentIsBlank;
                return (
                  <button
                    key={lh.id}
                    onClick={() => handlePick(lh)}
                    disabled={incompatible || selectingId !== null}
                    style={{
                      textAlign: 'left', padding: '10px 14px', borderRadius: 10,
                      border: '1px solid #e6e6e6', background: 'transparent',
                      cursor: incompatible ? 'not-allowed' : selectingId ? 'wait' : 'pointer',
                      opacity: incompatible ? 0.4 : (selectingId && selectingId !== lh.id ? 0.5 : 1),
                    }}
                  >
                    <div style={{ color: '#000', fontWeight: 600, fontSize: 13 }}>
                      {selectingId === lh.id ? 'Loading…' : lh.name}
                    </div>
                    <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 11 }}>
                      {lh.type === 'pdf'
                        ? 'Imported PDF'
                        : `${lh.page_width}×${lh.page_height}mm`}
                      {incompatible && ' — requires a blank-page template'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (this file alone)**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: errors in `TemplateDesigner.tsx` are expected at this point (its `<LetterheadPicker onSelect={handleLetterheadPicked} />` usage hasn't been updated to the new prop shape yet) — Step 3 fixes that. If `LetterheadPicker.tsx` itself has errors, fix those before proceeding.

- [ ] **Step 3: Update `TemplateDesigner.tsx`**

Read the current file in full. Three changes:

First, remove the `disabled={!isBlank}` gate from the "Apply Letterhead" button (find it — it's immediately after the "Pick from Assets" button in the `Group label="Edit"` block):

```tsx
          <ToolbarBtn
            icon={<BookOpen size={13} />}
            label="Apply Letterhead"
            onClick={() => setLetterheadPickerOpen(true)}
          />
```

(The `disabled={!isBlank}` line is deleted entirely — not set to `false`, removed, so the button has no `disabled` prop at all, matching how other always-enabled `ToolbarBtn`s in this file are written.)

Second, replace `handleLetterheadPicked` (currently takes `staticSchema: Schema[]` directly) with a version handling the discriminated union:

```tsx
  const handleLetterheadPicked = (selection: { type: 'fields'; staticSchema: import('@pdfme/common').Schema[] } | { type: 'pdf'; basePdf: string }) => {
    if (!designerRef.current) return;
    const t = designerRef.current.getTemplate();

    if (selection.type === 'fields') {
      if (!isBlankPdf(t.basePdf)) return;
      designerRef.current.updateTemplate({
        ...t,
        basePdf: { ...t.basePdf, staticSchema: selection.staticSchema },
      });
    } else {
      designerRef.current.updateTemplate({
        ...t,
        basePdf: selection.basePdf,
      });
    }

    setTemplateVersion(v => v + 1);
    setLetterheadPickerOpen(false);
  };
```

The `'pdf'` branch has no `isBlankPdf` guard — per the Global Constraints, PDF-based letterheads apply to any template regardless of its current `basePdf` kind, and `basePdf: selection.basePdf` (a plain string data URL) directly replaces whatever `basePdf` was there before, exactly matching the shape `handleBasePdfFile`'s "Change PDF" flow already produces (`updateTemplate({ ...t, basePdf: dataUrl })`) — `t.schemas` is untouched by this spread, satisfying the constraint that existing fillable fields survive a PDF-based letterhead apply.

Third, update the `<LetterheadPicker />` render to pass the new required `currentIsBlank` prop:

```tsx
      {letterheadPickerOpen && (
        <LetterheadPicker
          currentIsBlank={isBlank}
          onSelect={handleLetterheadPicked}
          onClose={() => setLetterheadPickerOpen(false)}
        />
      )}
```

`isBlank` is an existing variable already computed earlier in this component (`const isBlank = currentBasePdf ? isBlankPdf(currentBasePdf) : false;`) and already used by the "Header/Footer" button's `disabled` prop — reused here directly, no new derivation needed.

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Start both server and client dev servers (alternate ports if needed). Ensure at least one field-based and one PDF-based letterhead exist (create both via `/letterheads` per Task 3's verification if not already present). If a browser is available:
1. Open the Designer on a **blank-PDF** template (`/templates/new`). Click "Apply Letterhead". Confirm BOTH kinds of letterhead are shown as pickable (not grayed out).
2. Pick the PDF-based one. Confirm the template's background becomes that PDF, and the modal closes.
3. Click "Apply Letterhead" again, pick the field-based one this time. Confirm the header/footer content appears (this will visually replace the PDF background set in step 2 with a blank page again, since field-based apply always sets `basePdf.staticSchema` on whatever `t.basePdf` object shape currently exists — if step 2 left `t.basePdf` as a `CustomPdf` string, note in your report whether `isBlankPdf(t.basePdf)` correctly returns `false` in that case and the field-based option was actually NOT pickable at this point, which would be correct per this task's compatibility rule, not a bug — describe exactly what you observe here since this is the trickiest interaction in the whole feature and worth documenting precisely).
4. Now upload any PDF via "Change PDf" so the template's `basePdf` is a `CustomPdf`. Click "Apply Letterhead" again. Confirm the field-based letterhead is now grayed out/disabled (with the "requires a blank-page template" hint text visible), while the PDF-based one remains pickable.
5. Pick the PDF-based letterhead again on this PDF-background template. Confirm the background swaps to the letterhead's PDF and any existing fillable fields (add one via the canvas first if none exist) remain in place at their same positions.

If no browser is available, perform a careful code-path walkthrough of all these scenarios (the `incompatible` computation in the picker, both branches of `handleLetterheadPicked`) and describe it in detail in your report.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/LetterheadPicker.tsx client/src/pages/TemplateDesigner.tsx
git commit -m "feat(designer): support applying PDF-based letterheads"
```

---

## Self-Review Notes

- **Spec coverage:** Every behavior in `docs/superpowers/specs/2026-07-30-letterhead-pdf-import-design.md` is covered — the `type` discriminator + nullable columns (Task 1), branching validation on both POST and PUT (Task 2), the "Import PDF" button and its base64-read technique reused from `handleBasePdfFile` (Task 3), the always-enabled "Apply Letterhead" button with picker-level compatibility filtering (Task 4), background-only replacement preserving `schemas` for PDF-based apply (Task 4's `handleLetterheadPicked`), and `type` remaining immutable after creation (no route/UI anywhere in this plan allows changing it post-creation).
- **Placeholder scan:** No TBD/TODO; all four tasks contain complete code.
- **Type consistency:** Server `LetterheadRow`/`LetterheadSummaryRow` (Task 1) → client `LetterheadRecord`/`LetterheadSummary` (Task 3) match field-for-field including nullability (`page_width: number | null`, etc.) on both sides of the boundary. `api.createLetterhead`'s new object-parameter signature (Task 3) is used identically by both of its two call sites (`Letterheads.tsx`'s `handleEditorSave` for `type: 'fields'`, and the new `handlePdfFileSelected` for `type: 'pdf'`) — both updated in the same task, so no stale four-positional-argument call site is left anywhere. `LetterheadPicker`'s new discriminated-union `onSelect` payload (Task 4) is produced by exactly one function (`handlePick`) and consumed by exactly one function (`handleLetterheadPicked`), both updated together in Task 4 — no mismatched intermediate state.
- **Task ordering:** Task 1 → Task 2 (needs Task 1's extended `createLetterhead`/`updateLetterhead`) → Task 3 (needs Task 2's extended routes) → Task 4 (needs Task 3's extended types/`api.ts`) — strictly sequential, matching the dependency shape of every prior plan in this series.
- **Backward compatibility explicitly verified in the plan's own steps:** Task 2 Step 4's third curl check specifically exercises creating a letterhead WITHOUT sending `type` at all, confirming the route still defaults correctly — this guards against a regression in the exact call shape the *existing*, already-shipped "New Letterhead" flow uses (which won't be touched to add `type` until Task 3, so Task 2 must work correctly against callers that don't yet know `type` exists).
- **Known interaction flagged for the implementer, not silently glossed over:** Task 4 Step 5's manual verification explicitly calls out and asks the implementer to document (not silently pass/fail) the specific sequencing case of applying a field-based letterhead immediately after a PDF-based one on the same template — this is the one place the two letterhead kinds' apply logic can interact within a single session, and the plan is explicit that the expected behavior (field-based becomes correctly inapplicable once `basePdf` is no longer blank) is itself the correct outcome, not a bug to fix.

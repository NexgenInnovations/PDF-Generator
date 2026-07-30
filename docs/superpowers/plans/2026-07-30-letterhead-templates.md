# Letterhead Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add saved, reusable "letterhead" header/footer fragments (built on the existing `HeaderFooterEditor` component, unmodified) with a management page and a Designer-side picker that applies a saved letterhead to the current template's `staticSchema`.

**Architecture:** Server: a new `letterheads` MSSQL table storing a JSON `staticSchema` blob plus the page dimensions it was designed against, following this codebase's existing `NVARCHAR(MAX)` JSON-blob convention (`template_versions`), with a new CRUD route file. Client: a new `/letterheads` page reusing the existing `HeaderFooterEditor` component unchanged for create/edit (wrapped in a page-size picker for creation), and a new `LetterheadPicker` modal wired into a new Designer toolbar button that replaces `basePdf.staticSchema` on apply — mirroring the exact pattern the company assets feature already established (`AssetPicker` → `handleAssetPicked`).

**Tech Stack:** Node.js + Express + TypeScript + MSSQL (`mssql` package) on the server; React 18 + TypeScript on the client. No new npm dependencies. No test runner exists in either `client/` or `server/` — verification is manual: typecheck plus live server/browser testing.

## Global Constraints

- Bake-in, not live reference: applying a letterhead copies its `staticSchema` into the current template at that moment. No letterhead ID or reference is retained in the template afterward — editing or deleting a letterhead later has zero effect on templates that already applied it.
- `HeaderFooterEditor.tsx` (`client/src/components/HeaderFooterEditor.tsx`) is reused completely unmodified — it already accepts `{ basePdf: BlankPdf; onSave: (staticSchema: Schema[]) => void; onClose: () => void }` and needs no changes for this feature.
- Each letterhead stores the page width/height (mm) it was designed against, since `HeaderFooterEditor`'s footer-positioning math depends on `basePdf.height` — this is metadata for correctly re-opening the editor on Edit, not an enforced constraint on where a letterhead can later be applied.
- Applying a letterhead replaces the current template's `basePdf.staticSchema` entirely — no confirmation prompt, matching the existing "Change PDF" / asset-insertion patterns in this app.
- The new "Apply Letterhead" Designer toolbar button is only enabled when the current template's `basePdf` is a `BlankPdf` (via `isBlankPdf`), exactly matching the existing "Header/Footer" button's `disabled={!isBlank}` gating.
- Letterheads are shared/global (no per-user scoping), matching the assets library's ownership model. `/letterheads` and its management page are role-gated to `Admin`/`Designer`, matching `/assets` and `/templates/new`.
- No changes to any existing table, route, the PDF generation pipeline, or `HeaderFooterEditor.tsx` itself.
- Renaming a letterhead is a separate action from editing its content — done on the management page (e.g. inline), not inside the `HeaderFooterEditor` modal (which has no name field and isn't being given one).

---

## File Structure

- **Modify:** `server/src/db.ts` — add `letterheads` table to `ensureTables()`, add `LetterheadRow` type and CRUD functions (`listLetterheads`, `getLetterhead`, `createLetterhead`, `updateLetterhead`, `deleteLetterhead`).
- **Create:** `server/src/routes/letterheads.ts` — new Express router: `POST /letterheads`, `GET /letterheads`, `GET /letterheads/:id`, `PUT /letterheads/:id`, `DELETE /letterheads/:id`.
- **Modify:** `server/src/index.ts` — mount the new `letterheadsRouter` at `/letterheads`.
- **Modify:** `client/src/lib/api.ts` — add letterhead-related types and `api.listLetterheads`/`api.getLetterhead`/`api.createLetterhead`/`api.updateLetterhead`/`api.deleteLetterhead`.
- **Modify:** `client/src/types.ts` — add `LetterheadSummary`/`LetterheadRecord` types.
- **Create:** `client/src/pages/Letterheads.tsx` — the letterhead management page (list, create via page-size picker + `HeaderFooterEditor`, edit, delete, rename).
- **Modify:** `client/src/App.tsx` — add the `/letterheads` route (role-gated).
- **Modify:** `client/src/components/layout/Sidebar.tsx` — add the "Letterheads" nav item.
- **Create:** `client/src/components/LetterheadPicker.tsx` — reusable picker modal for the Designer.
- **Modify:** `client/src/pages/TemplateDesigner.tsx` — add "Apply Letterhead" toolbar button + apply handler.

---

### Task 1: Server — `letterheads` table and CRUD

**Files:**
- Modify: `server/src/db.ts`

**Interfaces:**
- Produces (for Task 2 to consume):
  ```ts
  export interface LetterheadRow {
    id: string;
    name: string;
    static_schema: unknown;
    page_width: number;
    page_height: number;
    created_at: string;
    updated_at: string;
  }
  export async function listLetterheads(): Promise<LetterheadRow[]>
  export async function getLetterhead(id: string): Promise<LetterheadRow | null>
  export async function createLetterhead(input: { name: string; staticSchema: unknown; pageWidth: number; pageHeight: number }): Promise<LetterheadRow>
  export async function updateLetterhead(id: string, input: { name?: string; staticSchema?: unknown; pageWidth?: number; pageHeight?: number }): Promise<LetterheadRow | null>
  export async function deleteLetterhead(id: string): Promise<void>
  ```
  `static_schema` is stored as an `NVARCHAR(MAX)` JSON string (following `template_versions.schemas`'s exact convention) and `JSON.parse`d back into `unknown` on every read, mirroring `parseVersionRow`'s pattern in this same file. `listLetterheads` deliberately does NOT return `static_schema` (list views only need name/id/timestamps — matches how `listTemplates` omits full template JSON) — only `getLetterhead` returns the full row including parsed `static_schema`.

- [ ] **Step 1: Add the `letterheads` table to `ensureTables()`**

Read the current `server/src/db.ts` in full first (626+ lines, may have shifted from company-assets work) to find the exact end of `ensureTables()` (currently ends with the `company_assets` table creation followed by `console.log('Tables ready');`). Insert a new table-creation block immediately before that `console.log`:

```ts
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'letterheads')
    CREATE TABLE letterheads (
      id               UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      name             NVARCHAR(255)    NOT NULL,
      static_schema    NVARCHAR(MAX)    NOT NULL,
      page_width       FLOAT            NOT NULL,
      page_height      FLOAT            NOT NULL,
      created_at       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      updated_at       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
```

- [ ] **Step 2: Add the `LetterheadRow` type**

Find the `// ─── Types ───` section (where `TemplateRow`, `CompanyAssetRow`, etc. are defined) and add, after `CompanyAssetRow`:

```ts
export interface LetterheadRow {
  id: string;
  name: string;
  static_schema: unknown;
  page_width: number;
  page_height: number;
  created_at: string;
  updated_at: string;
}

export interface LetterheadSummaryRow {
  id: string;
  name: string;
  page_width: number;
  page_height: number;
  created_at: string;
  updated_at: string;
}
```

`LetterheadSummaryRow` (no `static_schema`) is the shape `listLetterheads` returns; `LetterheadRow` (with parsed `static_schema`) is what `getLetterhead`/`createLetterhead`/`updateLetterhead` return.

- [ ] **Step 3: Add the CRUD functions**

At the end of the file (after the `company_assets` section), add a new section:

```ts
// ─── letterheads ──────────────────────────────────────────────────────────────

export async function listLetterheads(): Promise<LetterheadSummaryRow[]> {
  const result = await getPool().request().query(
    'SELECT id, name, page_width, page_height, created_at, updated_at FROM letterheads ORDER BY updated_at DESC'
  );
  return result.recordset;
}

function parseLetterheadRow(row: Record<string, unknown>): LetterheadRow {
  return {
    ...row,
    static_schema: JSON.parse(row.static_schema as string),
  } as LetterheadRow;
}

export async function getLetterhead(id: string): Promise<LetterheadRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('SELECT id, name, static_schema, page_width, page_height, created_at, updated_at FROM letterheads WHERE id = @id');
  const row = result.recordset[0];
  return row ? parseLetterheadRow(row) : null;
}

export async function createLetterhead(input: {
  name: string;
  staticSchema: unknown;
  pageWidth: number;
  pageHeight: number;
}): Promise<LetterheadRow> {
  const result = await getPool()
    .request()
    .input('name', sql.NVarChar(255), input.name)
    .input('static_schema', sql.NVarChar(sql.MAX), JSON.stringify(input.staticSchema))
    .input('page_width', sql.Float, input.pageWidth)
    .input('page_height', sql.Float, input.pageHeight)
    .query(`
      INSERT INTO letterheads (name, static_schema, page_width, page_height)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.static_schema, INSERTED.page_width,
             INSERTED.page_height, INSERTED.created_at, INSERTED.updated_at
      VALUES (@name, @static_schema, @page_width, @page_height)
    `);
  return parseLetterheadRow(result.recordset[0]);
}

export async function updateLetterhead(
  id: string,
  input: { name?: string; staticSchema?: unknown; pageWidth?: number; pageHeight?: number }
): Promise<LetterheadRow | null> {
  const existing = await getLetterhead(id);
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const staticSchema = input.staticSchema ?? existing.static_schema;
  const pageWidth = input.pageWidth ?? existing.page_width;
  const pageHeight = input.pageHeight ?? existing.page_height;

  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar(255), name)
    .input('static_schema', sql.NVarChar(sql.MAX), JSON.stringify(staticSchema))
    .input('page_width', sql.Float, pageWidth)
    .input('page_height', sql.Float, pageHeight)
    .query(`
      UPDATE letterheads
      SET name = @name, static_schema = @static_schema, page_width = @page_width,
          page_height = @page_height, updated_at = GETUTCDATE()
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.static_schema, INSERTED.page_width,
             INSERTED.page_height, INSERTED.created_at, INSERTED.updated_at
      WHERE id = @id
    `);
  const row = result.recordset[0];
  return row ? parseLetterheadRow(row) : null;
}

export async function deleteLetterhead(id: string): Promise<void> {
  await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('DELETE FROM letterheads WHERE id = @id');
}
```

Note: `updateLetterhead` does a read-then-write (fetching `existing` first) to support partial updates (e.g. a rename-only request that doesn't resend `staticSchema`) — this mirrors the plan's Task 3 route design where the client's "rename" action and "save new content" action are two independent operations that may not always send every field. `sql.NVarChar(sql.MAX)` is verified-working syntax already in use in this exact file (`server/src/db.ts`'s `template_versions.schemas`/`schema`/`base_pdf` columns, e.g. `.input('schema_val', sql.NVarChar(sql.MAX), schemaVal)`) — no substitution needed, use it exactly as written above.

- [ ] **Step 4: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Start the server (`cd server && npm run dev`, on an alternate port if 3004 is in use by another process — verify via `ps -p <pid> -o command` before assuming it's safe to reuse). Confirm the log shows `Connected to MSSQL` / `Tables ready` with no thrown error, confirming the new `CREATE TABLE letterheads (...)` statement is valid MSSQL syntax and executed successfully.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts
git commit -m "feat(server): add letterheads table and CRUD functions"
```

---

### Task 2: Server — letterhead CRUD routes

**Files:**
- Create: `server/src/routes/letterheads.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `listLetterheads`, `getLetterhead`, `createLetterhead`, `updateLetterhead`, `deleteLetterhead` from `../db.js` (Task 1).
- Produces: mounted router `letterheadsRouter` at `/letterheads`, exposing:
  - `POST /letterheads` — body `{ name: string; staticSchema: unknown; pageWidth: number; pageHeight: number }`. Returns `201` with the created `LetterheadRow`, or `400` for missing/invalid fields.
  - `GET /letterheads` — returns `200` with `LetterheadSummaryRow[]`.
  - `GET /letterheads/:id` — returns `200` with the full `LetterheadRow`, or `404` if not found.
  - `PUT /letterheads/:id` — body `{ name?: string; staticSchema?: unknown; pageWidth?: number; pageHeight?: number }` (all optional, partial update). Returns `200` with the updated `LetterheadRow`, or `404` if not found.
  - `DELETE /letterheads/:id` — `204` on success.
  These exact shapes are what Task 3 (client `api.ts`) will call.

- [ ] **Step 1: Create the route**

```ts
// server/src/routes/letterheads.ts
import { Router, Request, Response } from 'express';
import { listLetterheads, getLetterhead, createLetterhead, updateLetterhead, deleteLetterhead } from '../db.js';

export const letterheadsRouter = Router();

/**
 * @openapi
 * /letterheads:
 *   post:
 *     summary: Create a new letterhead
 *     tags: [Letterheads]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, staticSchema, pageWidth, pageHeight]
 *             properties:
 *               name:
 *                 type: string
 *               staticSchema:
 *                 type: array
 *               pageWidth:
 *                 type: number
 *               pageHeight:
 *                 type: number
 *     responses:
 *       201:
 *         description: The created letterhead
 *       400:
 *         description: Missing or invalid fields
 */
letterheadsRouter.post('/', async (req: Request, res: Response) => {
  const { name, staticSchema, pageWidth, pageHeight } = req.body as {
    name?: string;
    staticSchema?: unknown;
    pageWidth?: number;
    pageHeight?: number;
  };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!Array.isArray(staticSchema)) {
    res.status(400).json({ error: 'staticSchema is required and must be an array' });
    return;
  }
  if (typeof pageWidth !== 'number' || typeof pageHeight !== 'number') {
    res.status(400).json({ error: 'pageWidth and pageHeight are required numbers' });
    return;
  }

  try {
    const letterhead = await createLetterhead({ name: name.trim(), staticSchema, pageWidth, pageHeight });
    res.status(201).json(letterhead);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /letterheads:
 *   get:
 *     summary: List all letterheads (metadata only)
 *     tags: [Letterheads]
 *     responses:
 *       200:
 *         description: All letterheads
 */
letterheadsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const letterheads = await listLetterheads();
    res.json(letterheads);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /letterheads/{id}:
 *   get:
 *     summary: Get a single letterhead, including its full static schema
 *     tags: [Letterheads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The letterhead
 *       404:
 *         description: Letterhead not found
 */
letterheadsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const letterhead = await getLetterhead(req.params.id);
    if (!letterhead) {
      res.status(404).json({ error: 'Letterhead not found' });
      return;
    }
    res.json(letterhead);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /letterheads/{id}:
 *   put:
 *     summary: Update a letterhead (partial update — omit fields to leave them unchanged)
 *     tags: [Letterheads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               staticSchema:
 *                 type: array
 *               pageWidth:
 *                 type: number
 *               pageHeight:
 *                 type: number
 *     responses:
 *       200:
 *         description: The updated letterhead
 *       404:
 *         description: Letterhead not found
 */
letterheadsRouter.put('/:id', async (req: Request, res: Response) => {
  const { name, staticSchema, pageWidth, pageHeight } = req.body as {
    name?: string;
    staticSchema?: unknown;
    pageWidth?: number;
    pageHeight?: number;
  };

  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  if (staticSchema !== undefined && !Array.isArray(staticSchema)) {
    res.status(400).json({ error: 'staticSchema must be an array' });
    return;
  }

  try {
    const updated = await updateLetterhead(req.params.id, {
      name: name?.trim(),
      staticSchema,
      pageWidth,
      pageHeight,
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

/**
 * @openapi
 * /letterheads/{id}:
 *   delete:
 *     summary: Delete a letterhead
 *     tags: [Letterheads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted
 */
letterheadsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteLetterhead(req.params.id);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});
```

- [ ] **Step 2: Mount the route in `server/src/index.ts`**

Read the current `server/src/index.ts` in full first (do not disturb the existing `/ai-form/detect-from-pdf` body-limit ordering). Add the import:
```ts
import { letterheadsRouter } from './routes/letterheads.js';
```
and mount it alongside the other simple JSON routers (e.g. after `app.use('/assets', assetsRouter);`):
```ts
app.use('/letterheads', letterheadsRouter);
```
This route uses plain JSON bodies (no multipart), so it needs no special body-limit handling — the existing global `express.json({limit:'10mb'})` covers it (a `staticSchema` array with a few text/image elements is well within 10mb, consistent with how `/templates` already handles full template JSON under the same limit).

- [ ] **Step 3: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the server (alternate port if needed, confirm process ownership before touching any port). Run:
```bash
curl -s -X POST http://localhost:3004/letterheads \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Letterhead","staticSchema":[{"name":"header_text","type":"text","content":"Acme Corp","position":{"x":20,"y":5},"width":100,"height":10}],"pageWidth":210,"pageHeight":297}' \
  -w "\nHTTP %{http_code}\n"
```
Expected: `201` with a JSON body containing `id`, `name`, `static_schema` (parsed array, not a string), `page_width: 210`, `page_height: 297`, timestamps.

```bash
curl -s http://localhost:3004/letterheads -w "\nHTTP %{http_code}\n"
```
Expected: `200` with an array containing the created letterhead's summary (no `static_schema` field present).

```bash
LH_ID="<id from create response>"
curl -s http://localhost:3004/letterheads/$LH_ID -w "\nHTTP %{http_code}\n"
```
Expected: `200`, full row including `static_schema` as a parsed array matching what was sent.

```bash
curl -s -X PUT http://localhost:3004/letterheads/$LH_ID \
  -H "Content-Type: application/json" \
  -d '{"name":"Renamed Letterhead"}' \
  -w "\nHTTP %{http_code}\n"
```
Expected: `200`, `name: "Renamed Letterhead"`, but `static_schema`/`page_width`/`page_height` unchanged from creation (confirms partial-update behavior works).

```bash
curl -s -X DELETE http://localhost:3004/letterheads/$LH_ID -w "\nHTTP %{http_code}\n"
curl -s http://localhost:3004/letterheads/$LH_ID -w "\nHTTP %{http_code}\n"
```
Expected: `204` on delete, then `404` confirming it's gone.

Kill the server process you started (verify PID ownership first).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/letterheads.ts server/src/index.ts
git commit -m "feat(server): add letterhead CRUD routes"
```

---

### Task 3: Client — API client, types, and Letterheads management page

**Files:**
- Modify: `client/src/lib/api.ts`
- Modify: `client/src/types.ts`
- Create: `client/src/pages/Letterheads.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: Task 2's routes; `HeaderFooterEditor` from `../components/HeaderFooterEditor.js` (existing, unmodified); `PageSizeName`/`PAGE_SIZES_PORTRAIT_MM` convention (redefine locally in this new file — these are currently private, non-exported constants inside `TemplateDesigner.tsx`, so this task duplicates the same three-entry lookup table rather than attempting a cross-file export/import refactor of an existing, working file for this one new consumer).
- Produces:
  ```ts
  // client/src/types.ts
  export interface LetterheadSummary {
    id: string;
    name: string;
    page_width: number;
    page_height: number;
    created_at: string;
    updated_at: string;
  }
  export interface LetterheadRecord extends LetterheadSummary {
    static_schema: import('@pdfme/common').Schema[];
  }
  // client/src/lib/api.ts
  export const api = {
    // ...existing...
    listLetterheads: () => Promise<LetterheadSummary[]>,
    getLetterhead: (id: string) => Promise<LetterheadRecord>,
    createLetterhead: (name: string, staticSchema: Schema[], pageWidth: number, pageHeight: number) => Promise<LetterheadRecord>,
    updateLetterhead: (id: string, patch: { name?: string; staticSchema?: Schema[]; pageWidth?: number; pageHeight?: number }) => Promise<LetterheadRecord>,
    deleteLetterhead: (id: string) => Promise<void>,
  };
  ```
  `listLetterheads`/`getLetterhead`/`createLetterhead` are consumed by this task's `Letterheads.tsx`; all five methods (including `updateLetterhead`) are also consumed by Task 4's `LetterheadPicker` (read-only: `listLetterheads`/`getLetterhead` only) and this task's own edit/rename flows.

- [ ] **Step 1: Add `LetterheadSummary`/`LetterheadRecord` types**

In `client/src/types.ts`, add:

```ts
export interface LetterheadSummary {
  id: string;
  name: string;
  page_width: number;
  page_height: number;
  created_at: string;
  updated_at: string;
}

export interface LetterheadRecord extends LetterheadSummary {
  static_schema: unknown[];
}
```

`static_schema: unknown[]` (not `Schema[]` from `@pdfme/common`) is deliberate — `types.ts` today has no existing dependency on `@pdfme/common`'s types (confirm by reading the current file), and introducing one for a single field isn't warranted; call sites that need the precise `Schema[]` type will cast/assert at the point of use (`Letterheads.tsx`, `LetterheadPicker.tsx`), consistent with how `AssetRecord`/other types in this file already stay framework-agnostic.

- [ ] **Step 2: Add API client methods**

Read the current `client/src/lib/api.ts` in full first. Add `LetterheadSummary, LetterheadRecord` to the existing `import type { ... } from "../types.js";` line. Add to the `api` object, after the existing `assetFileUrl` method:

```ts
  listLetterheads: () => request<LetterheadSummary[]>("/letterheads"),

  getLetterhead: (id: string) => request<LetterheadRecord>(`/letterheads/${id}`),

  createLetterhead: (name: string, staticSchema: unknown[], pageWidth: number, pageHeight: number) =>
    request<LetterheadRecord>("/letterheads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, staticSchema, pageWidth, pageHeight }),
    }),

  updateLetterhead: (
    id: string,
    patch: { name?: string; staticSchema?: unknown[]; pageWidth?: number; pageHeight?: number }
  ) =>
    request<LetterheadRecord>(`/letterheads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  deleteLetterhead: (id: string) => request<void>(`/letterheads/${id}`, { method: "DELETE" }),
```

- [ ] **Step 3: Create the Letterheads management page**

```tsx
// client/src/pages/Letterheads.tsx
import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import type { LetterheadSummary } from '../types.js';
import type { Schema } from '@pdfme/common';
import HeaderFooterEditor from '../components/HeaderFooterEditor.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';

type PageSizeName = 'A4' | 'Letter' | 'Legal';

const PAGE_SIZES_PORTRAIT_MM: Record<PageSizeName, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

export default function Letterheads() {
  const [letterheads, setLetterheads] = useState<LetterheadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pageSizePickerOpen, setPageSizePickerOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<PageSizeName>('A4');
  const [editorState, setEditorState] = useState<{
    id: string | null;
    name: string;
    basePdf: { width: number; height: number; padding: [number, number, number, number]; staticSchema?: Schema[] };
  } | null>(null);

  const refresh = () => {
    setLoading(true);
    api.listLetterheads()
      .then(setLetterheads)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const startCreate = () => setPageSizePickerOpen(true);

  const confirmCreateSize = () => {
    const size = PAGE_SIZES_PORTRAIT_MM[selectedSize];
    setPageSizePickerOpen(false);
    setEditorState({
      id: null,
      name: 'New Letterhead',
      basePdf: { width: size.width, height: size.height, padding: [10, 10, 10, 10] },
    });
  };

  const startEdit = async (summary: LetterheadSummary) => {
    try {
      const full = await api.getLetterhead(summary.id);
      setEditorState({
        id: full.id,
        name: full.name,
        basePdf: {
          width: full.page_width,
          height: full.page_height,
          padding: [10, 10, 10, 10],
          staticSchema: full.static_schema as Schema[],
        },
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleEditorSave = async (staticSchema: Schema[]) => {
    if (!editorState) return;
    try {
      if (editorState.id) {
        await api.updateLetterhead(editorState.id, { staticSchema });
      } else {
        await api.createLetterhead(editorState.name, staticSchema, editorState.basePdf.width, editorState.basePdf.height);
      }
      setEditorState(null);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleRename = async (id: string, currentName: string) => {
    const nextName = window.prompt('Rename letterhead', currentName);
    if (!nextName || nextName.trim().length === 0 || nextName === currentName) return;
    try {
      await api.updateLetterhead(id, { name: nextName.trim() });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteLetterhead(id);
      setLetterheads(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <AppLayout>
      <TopBar title="Letterheads" />
      <div className="p-6 space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm" style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}>
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            {letterheads.length} letterhead{letterheads.length === 1 ? '' : 's'}
          </p>
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Letterhead
          </Button>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>Loading…</p>
        ) : letterheads.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>No letterheads yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {letterheads.map(lh => (
              <Card key={lh.id} className="p-3 space-y-2">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--nx-ink)' }} title={lh.name}>
                  {lh.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--nx-ink-muted)' }}>
                  {lh.page_width}×{lh.page_height}mm
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => startEdit(lh)}
                    className="flex items-center gap-1 text-xs"
                    style={{ color: 'var(--nx-ink-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleRename(lh.id, lh.name)}
                    className="text-xs"
                    style={{ color: 'var(--nx-ink-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDelete(lh.id)}
                    className="flex items-center gap-1 text-xs"
                    style={{ color: 'var(--nx-destructive)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {pageSizePickerOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.40)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setPageSizePickerOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '360px',
              background: '#fff',
              border: '1px solid #e6e6e6',
              borderRadius: 16,
              padding: 16,
              display: 'flex', flexDirection: 'column', gap: 12,
              boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
            }}
          >
            <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>Page size</span>
            <select
              value={selectedSize}
              onChange={e => setSelectedSize(e.target.value as PageSizeName)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e6e6e6', fontSize: 13 }}
            >
              {(Object.keys(PAGE_SIZES_PORTRAIT_MM) as PageSizeName[]).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setPageSizePickerOpen(false)}
                style={{ padding: '6px 16px', borderRadius: 50, border: '1px solid #e6e6e6', background: 'transparent', color: 'rgba(0,0,0,0.55)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmCreateSize}
                style={{ padding: '6px 16px', borderRadius: 50, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {editorState && (
        <HeaderFooterEditor
          basePdf={editorState.basePdf}
          onSave={handleEditorSave}
          onClose={() => setEditorState(null)}
        />
      )}
    </AppLayout>
  );
}
```

Verified: `BlankPdf` (`packages/common/src/schema.ts:150-155`) is exactly `{ width: number; height: number; padding: [number,number,number,number]; staticSchema?: Schema[] }` — the `editorState.basePdf` shape above matches it field-for-field, no additional fields needed and no cast required.

Note on `handleRename`: uses the browser's native `window.prompt` rather than a custom modal — a deliberate minimal-scope choice for a single-field rename action; no existing modal-based rename pattern exists elsewhere in this codebase to follow instead, and building one is unwarranted complexity for this one interaction.

- [ ] **Step 4: Add the `/letterheads` route**

In `client/src/App.tsx`, add the lazy import:
```tsx
const Letterheads = lazy(() => import('./pages/Letterheads.js'));
```
and a new route, following the same `RoleGuard` pattern as `/assets`:
```tsx
<Route
  path="/letterheads"
  element={
    <RoleGuard allowed={['Admin', 'Designer']}>
      <Letterheads />
    </RoleGuard>
  }
/>
```

- [ ] **Step 5: Add the "Letterheads" nav item**

In `client/src/components/layout/Sidebar.tsx`, add an icon import (e.g. `FileStack` or `BookOpen` from `lucide-react` — pick one not already imported in this file's existing icon import line; confirm no name collision) and a new `NavItem`, placed after the existing "Assets" nav item, inside the same `(role === 'Admin' || role === 'Designer')`-gated block:

```tsx
<NavItem to="/letterheads" icon={<BookOpen className="h-4 w-4" />} label="Letterheads" />
```

- [ ] **Step 6: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Start both server and client dev servers (alternate ports if needed, confirm process ownership before reusing any port). If a browser is available:
1. Navigate to `/letterheads`. Confirm "No letterheads yet."
2. Click "New Letterhead", pick a page size (e.g. A4), continue. Confirm the `HeaderFooterEditor` modal opens with empty header/footer canvases.
3. Add a text field to the header canvas (e.g. type a company name). Click Save. Confirm the modal closes and the new letterhead appears in the grid with the correct page size shown.
4. Click "Edit" on that letterhead. Confirm the editor re-opens with the previously-added text field already present in the header canvas.
5. Click "Rename", enter a new name. Confirm it updates in the grid.
6. Click "Delete". Confirm it disappears.

If no browser is available, perform a careful code-path walkthrough (create flow, edit-preload flow, rename, delete) and describe it in detail in your report.

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/api.ts client/src/types.ts client/src/pages/Letterheads.tsx client/src/App.tsx client/src/components/layout/Sidebar.tsx
git commit -m "feat(letterheads): add Letterheads management page and API client"
```

---

### Task 4: Client — LetterheadPicker and Designer integration

**Files:**
- Create: `client/src/components/LetterheadPicker.tsx`
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- Consumes: `api.listLetterheads`, `api.getLetterhead` from `../lib/api.js` (Task 3); `LetterheadSummary` from `../types.js` (Task 3).
- Produces:
  ```tsx
  export default function LetterheadPicker(props: {
    onSelect: (staticSchema: import('@pdfme/common').Schema[]) => void;
    onClose: () => void;
  }): JSX.Element
  ```
  Consumed by `TemplateDesigner.tsx` in this same task. `onSelect` receives the picked letterhead's full `staticSchema` array, fetched via `api.getLetterhead(id)` at pick time (the list view only has summaries, not the full schema) — so the caller never has to make its own follow-up fetch.

- [ ] **Step 1: Create the picker component**

```tsx
// client/src/components/LetterheadPicker.tsx
import { useEffect, useState } from 'react';
import type { Schema } from '@pdfme/common';
import { api } from '../lib/api.js';
import type { LetterheadSummary } from '../types.js';

export default function LetterheadPicker(props: {
  onSelect: (staticSchema: Schema[]) => void;
  onClose: () => void;
}) {
  const { onSelect, onClose } = props;
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
      onSelect(full.static_schema as Schema[]);
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
              {letterheads.map(lh => (
                <button
                  key={lh.id}
                  onClick={() => handlePick(lh)}
                  disabled={selectingId !== null}
                  style={{
                    textAlign: 'left', padding: '10px 14px', borderRadius: 10,
                    border: '1px solid #e6e6e6', background: 'transparent',
                    cursor: selectingId ? 'wait' : 'pointer',
                    opacity: selectingId && selectingId !== lh.id ? 0.5 : 1,
                  }}
                >
                  <div style={{ color: '#000', fontWeight: 600, fontSize: 13 }}>
                    {selectingId === lh.id ? 'Loading…' : lh.name}
                  </div>
                  <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 11 }}>
                    {lh.page_width}×{lh.page_height}mm
                  </div>
                </button>
              ))}
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
Expected: no errors.

- [ ] **Step 3: Wire into `TemplateDesigner.tsx`**

Read the current `client/src/pages/TemplateDesigner.tsx` in full before editing. Add the import (alongside `AssetPicker`):
```tsx
import LetterheadPicker from '../components/LetterheadPicker.js';
```

Add new state alongside `assetPickerOpen`:
```tsx
const [letterheadPickerOpen, setLetterheadPickerOpen] = useState(false);
```

Add a handler function (placed near `handleAssetPicked`):

```tsx
const handleLetterheadPicked = (staticSchema: import('@pdfme/common').Schema[]) => {
  if (!designerRef.current) return;
  const t = designerRef.current.getTemplate();
  if (!isBlankPdf(t.basePdf)) return;
  designerRef.current.updateTemplate({
    ...t,
    basePdf: { ...t.basePdf, staticSchema },
  });
  setTemplateVersion(v => v + 1);
  setLetterheadPickerOpen(false);
};
```

This mirrors `handleHeaderFooterSave`'s exact pattern (same `isBlankPdf` guard, same `basePdf: {...t.basePdf, staticSchema}` replacement) — applying a letterhead and saving from the header/footer editor produce an identical end state (a `staticSchema` written into `basePdf`), just from a different source.

Add a new toolbar button, in the same `Group label="Edit"` as "Header/Footer" and "Pick from Assets", disabled under the same condition as "Header/Footer":
```tsx
<ToolbarBtn
  icon={<BookOpen size={13} />}
  label="Apply Letterhead"
  onClick={() => setLetterheadPickerOpen(true)}
  disabled={!isBlank}
/>
```
(add `BookOpen` — or whichever icon was chosen for the Sidebar nav item in Task 3, for visual consistency — to this file's existing `lucide-react` import line; confirm no name collision with anything already imported in this file before adding it).

Add the modal's conditional render near the other modals (`assetPickerOpen && <AssetPicker .../>`, etc.):
```tsx
{letterheadPickerOpen && (
  <LetterheadPicker
    onSelect={handleLetterheadPicked}
    onClose={() => setLetterheadPickerOpen(false)}
  />
)}
```

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Start both server and client dev servers (alternate ports if needed). If a browser is available:
1. Create at least one letterhead via `/letterheads` first (per Task 3's verification, with a distinctive header text field so it's easy to visually confirm).
2. Open the Designer on a blank-PDF template (`/templates/new`). Confirm "Apply Letterhead" is enabled (template starts as a blank A4 `BlankPdf`).
3. Click "Apply Letterhead". Confirm the picker shows the created letterhead(s) by name and page size.
4. Click one. Confirm the modal closes and the template's header now shows the letterhead's content (visible in the Designer canvas).
5. Upload a PDF as the base (via "Change PDF") so `basePdf` is no longer a `BlankPdf`. Confirm "Apply Letterhead" becomes disabled — matching "Header/Footer"'s existing behavior in the same situation.
6. Apply a DIFFERENT letterhead to a template that already has header/footer content from step 4. Confirm the content is replaced outright, no confirmation prompt (per spec).
7. Delete the letterhead used in step 4 from `/letterheads`. Confirm the ALREADY-APPLIED content in the template from step 4 (if that Designer session/tab is still open, or if you reload it) is completely unaffected — the core "bake-in, not live reference" guarantee.

If no browser is available, perform a careful code-path walkthrough and describe it in detail in your report.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/LetterheadPicker.tsx client/src/pages/TemplateDesigner.tsx
git commit -m "feat(designer): add Apply Letterhead picker"
```

---

## Self-Review Notes

- **Spec coverage:** Every behavior in `docs/superpowers/specs/2026-07-30-letterhead-templates-design.md` is covered — bake-in-not-live-reference (Task 4's `handleLetterheadPicked` copies `staticSchema` by value, no letterhead ID retained anywhere in the applied template), `HeaderFooterEditor` reused completely unmodified (confirmed no changes to that file anywhere in this plan), page size recorded per-letterhead and used to pre-load the editor correctly on Edit (Task 3's `startEdit`), no confirmation on apply (Task 4's `handleLetterheadPicked` has no confirm dialog), `isBlankPdf` gating matching the existing "Header/Footer" button exactly (Task 4 Step 3), shared/global ownership with `Admin`/`Designer` role-gating matching `/assets` (Task 3 Steps 4-5), rename as a separate action from content-editing (Task 3's `handleRename` vs. `handleEditorSave`, two independent `updateLetterhead` call sites).
- **Placeholder scan:** No TBD/TODO; all four tasks contain complete code.
- **Type consistency:** `LetterheadRow`/`LetterheadSummaryRow` (Task 1, server) → `LetterheadRecord`/`LetterheadSummary` (Task 3, client) intentionally rename `static_schema`'s server-side `unknown` to a client-side `unknown[]` (narrowed at the boundary since the server validates it's an array on write) — consistent with the existing `CompanyAssetRow`→`AssetRecord` boundary-narrowing precedent from the assets feature. `api.getLetterhead(id): Promise<LetterheadRecord>` (Task 3) is called identically in both Task 3's `startEdit` and Task 4's `LetterheadPicker.handlePick`. `LetterheadPicker`'s `onSelect: (staticSchema: Schema[]) => void` (Task 4) matches exactly how `TemplateDesigner.tsx`'s `handleLetterheadPicked(staticSchema: Schema[])` is passed as that prop.
- **Task ordering:** Task 1 → Task 2 (needs Task 1's CRUD functions) → Task 3 (needs Task 2's routes) → Task 4 (needs Task 3's `api.ts`/`types.ts`) — strictly sequential, no parallelization possible. Mirrors the exact task-dependency shape that worked cleanly for the assets feature.
- **Deliberate deviation flagged for the implementer:** Task 3's `PageSizeName`/`PAGE_SIZES_PORTRAIT_MM` constants are duplicated from `TemplateDesigner.tsx` rather than extracted into a shared module — noted explicitly in Task 3's Interfaces block as a scoped, intentional choice (avoiding a cross-cutting refactor of a working file for one new consumer), not an oversight a reviewer should flag as "should have been shared."

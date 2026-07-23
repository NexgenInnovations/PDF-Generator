# Draft / Publish Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a draft/publish workflow to templates — one draft per template that never affects end-user output, and a history of tagged published versions that PDF generation/form-filling reference explicitly or via "latest."

**Architecture:** Bottom-up across three layers: DB (`server/src/db.ts`), server routes (`server/src/routes/templates.ts`, `server/src/routes/filledPdfs.ts`), then client API (`client/src/lib/api.ts`) and the three consuming pages (`TemplateDesigner.tsx`, `TemplateList.tsx`, `FormFill.tsx`). Each task only touches its own layer; later tasks depend on earlier ones being in place first.

**Tech Stack:** Node.js + Express + `mssql` (server), React 18 + TypeScript + react-router-dom (client). No test runner exists in either `server/` or `client/` — verification is manual: typecheck plus a real dev-server smoke test against a running MSSQL instance where feasible, or reasoned-through code inspection where a live DB isn't available in the execution environment.

## Global Constraints

- The template's own `id` (UUID) never changes across drafts/versions — already true today, not something to modify.
- At most one `status = 'draft'` row exists per `template_id` at any time — enforced by upsert logic in `saveDraft`, not a DB constraint.
- Published version `tag` is required (non-null) and unique per `(template_id, tag)` — enforced by a filtered unique index; duplicate tags surface as a clear error (409 at the route layer, not a raw DB error leaking to the client).
- Publishing never clears or modifies the draft's own content — after `POST /templates/:id/publish` succeeds, the draft row is updated to mirror exactly what was just published (same schema), so the draft always reflects "the most recently saved-or-published" content.
- `GET /templates/:id` (no query params) returns both `draft` and `latestPublished` in one response — the client decides "load draft, else load latest published" from this, no second round trip.
- `GET /templates/:id?version=N` or `?tag=X` returns that specific published version only (as `latestPublished`, no `draft` field) — this is the mode `FormFill` uses; it never receives or uses the draft.
- `/generate-pdf` accepts optional `version` (number) or `tag` (string) in its request body; when neither is given, resolves to the latest published version — never the draft.
- No new npm dependencies in either `server/` or `client/`.
- Follow the existing hand-rolled modal pattern already used by the JSON editor, `HeaderFooterEditor`, and `ApiPayloadModal` in `TemplateDesigner.tsx` for any new modal UI (fixed-position overlay `<div>`, not the unused `client/src/components/ui/dialog.tsx`).
- Follow the existing Stripe-style token system (`--nx-*` CSS custom properties) for any new UI, matching the established look of `TemplateList.tsx`/`Dashboard.tsx`.

---

## File Structure

- **Modify:** `server/src/db.ts` — schema (`ensureTables`), new draft/publish functions, retire `createTemplateVersion`/`getLatestTemplateVersion` in favor of the new functions.
- **Modify:** `server/src/routes/templates.ts` — draft-only save, new `/publish` and `/versions` routes, version-aware `GET /:id`.
- **Modify:** `server/src/routes/filledPdfs.ts` — version-aware `/generate-pdf`.
- **Modify:** `client/src/lib/api.ts` — new/changed API functions, `TemplateRecord` type gains `draft`/`latestPublished`.
- **Modify:** `client/src/types.ts` — `TemplateRecord` type update, new `PublishedVersionSummary` type.
- **Modify:** `client/src/pages/TemplateDesigner.tsx` — draft-else-published load order, "Save Draft" relabel, new "Publish" modal.
- **Modify:** `client/src/pages/TemplateList.tsx` — version-aware "Fill" link picker for Admin/Designer.
- **Modify:** `client/src/pages/FormFill.tsx` — reads `version`/`tag` from the URL query string.

---

### Task 1: Database schema and draft/publish functions

**Files:**
- Modify: `server/src/db.ts`

**Interfaces:**
- Consumes: nothing new (same `mssql` package already in use).
- Produces:
  ```ts
  export interface TemplateVersionRow {
    id: string;
    template_id: string;
    version: number;
    status: 'draft' | 'published';
    tag: string | null;
    schema: unknown;
    base_pdf: unknown;
    schemas: unknown;
    created_at: string;
  }

  export async function saveDraft(templateId: string, schema: unknown): Promise<TemplateVersionRow>
  export async function getDraft(templateId: string): Promise<TemplateVersionRow | null>
  export async function publishVersion(
    templateId: string,
    schema: unknown,
    tag: string,
    target: { mode: 'new' } | { mode: 'replace'; version: number }
  ): Promise<TemplateVersionRow>
  export async function listPublishedVersions(templateId: string): Promise<TemplateVersionRow[]>
  export async function getPublishedVersion(
    templateId: string,
    ref: { version: number } | { tag: string }
  ): Promise<TemplateVersionRow | null>
  export async function getLatestPublishedVersion(templateId: string): Promise<TemplateVersionRow | null>
  ```
  Task 2 (`templates.ts`) and Task 3 (`filledPdfs.ts`) import and call these directly from `../db.js`.

- [ ] **Step 1: Add the `status`/`tag` columns and filtered unique index to `ensureTables`**

Modify `server/src/db.ts:47-59` (the `template_versions` table creation block) — replace it with the extended `CREATE TABLE` plus two new idempotent `ALTER`/`CREATE INDEX` guards right after:

```ts
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'template_versions')
    CREATE TABLE template_versions (
      id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      template_id UNIQUEIDENTIFIER NOT NULL REFERENCES pdf_templates(id) ON DELETE CASCADE,
      version     INT              NOT NULL,
      status      NVARCHAR(20)     NOT NULL DEFAULT 'published',
      tag         NVARCHAR(255)    NULL,
      [schema]    NVARCHAR(MAX)    NOT NULL,
      base_pdf    NVARCHAR(MAX)    NOT NULL,
      [schemas]   NVARCHAR(MAX)    NOT NULL,
      created_at  DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT uq_template_version UNIQUE (template_id, version)
    )
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('template_versions') AND name = 'status')
    ALTER TABLE template_versions ADD status NVARCHAR(20) NOT NULL DEFAULT 'published'
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('template_versions') AND name = 'tag')
    ALTER TABLE template_versions ADD tag NVARCHAR(255) NULL
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_template_versions_tag' AND object_id = OBJECT_ID('template_versions'))
    CREATE UNIQUE INDEX uq_template_versions_tag
      ON template_versions(template_id, tag)
      WHERE status = 'published'
  `);
```

(The inline `CREATE TABLE` already includes `status`/`tag` for fresh databases; the two `ALTER TABLE ... ADD` guards handle databases that already have the table from before this change — both paths are idempotent and safe to run on every `initDb()` call, matching the existing pattern in this file.)

- [ ] **Step 2: Update `TemplateVersionRow` and add the new functions**

Modify the `TemplateVersionRow` interface at `server/src/db.ts:100-108`:

```ts
export interface TemplateVersionRow {
  id: string;
  template_id: string;
  version: number;
  status: 'draft' | 'published';
  tag: string | null;
  schema: unknown;
  base_pdf: unknown;
  schemas: unknown;
  created_at: string;
}
```

Replace the entire `// ─── template_versions ───` section (`server/src/db.ts:182-294`, from the `createTemplateVersion` function through the end of `getLatestTemplateVersion`) with:

```ts
// ─── template_versions ───────────────────────────────────────────────────────

function parseVersionRow(row: Record<string, unknown>): TemplateVersionRow {
  return {
    ...row,
    schema: JSON.parse(row.schema as string),
    base_pdf: JSON.parse(row.base_pdf as string),
    schemas: JSON.parse(row.schemas as string),
  } as TemplateVersionRow;
}

export async function saveDraft(templateId: string, schema: unknown): Promise<TemplateVersionRow> {
  const p = getPool();
  const schemaObj = schema as { basePdf?: unknown; schemas?: unknown };
  const schemaVal = JSON.stringify(schema);
  const basePdfVal = JSON.stringify(schemaObj.basePdf ?? null);
  const schemasVal = JSON.stringify(schemaObj.schemas ?? null);

  const existing = await p.request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query(`SELECT id FROM template_versions WHERE template_id = @tid AND status = 'draft'`);

  if (existing.recordset[0]) {
    const result = await p.request()
      .input('id', sql.UniqueIdentifier, existing.recordset[0].id)
      .input('schema_val', sql.NVarChar(sql.MAX), schemaVal)
      .input('base_pdf', sql.NVarChar(sql.MAX), basePdfVal)
      .input('schemas_val', sql.NVarChar(sql.MAX), schemasVal)
      .query(`
        UPDATE template_versions
        SET [schema] = @schema_val, base_pdf = @base_pdf, [schemas] = @schemas_val, created_at = GETUTCDATE()
        OUTPUT INSERTED.id, INSERTED.template_id, INSERTED.version, INSERTED.status, INSERTED.tag,
               INSERTED.[schema], INSERTED.base_pdf, INSERTED.[schemas], INSERTED.created_at
        WHERE id = @id
      `);
    return parseVersionRow(result.recordset[0]);
  }

  const templateResult = await p.request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query('SELECT current_version FROM pdf_templates WHERE id = @tid');
  if (!templateResult.recordset[0]) throw new Error('Template not found');
  const version = templateResult.recordset[0].current_version as number;

  const insertResult = await p.request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .input('version', sql.Int, version)
    .input('schema_val', sql.NVarChar(sql.MAX), schemaVal)
    .input('base_pdf', sql.NVarChar(sql.MAX), basePdfVal)
    .input('schemas_val', sql.NVarChar(sql.MAX), schemasVal)
    .query(`
      INSERT INTO template_versions (template_id, version, status, tag, [schema], base_pdf, [schemas])
      OUTPUT INSERTED.id, INSERTED.template_id, INSERTED.version, INSERTED.status, INSERTED.tag,
             INSERTED.[schema], INSERTED.base_pdf, INSERTED.[schemas], INSERTED.created_at
      VALUES (@tid, @version, 'draft', NULL, @schema_val, @base_pdf, @schemas_val)
    `);
  return parseVersionRow(insertResult.recordset[0]);
}

export async function getDraft(templateId: string): Promise<TemplateVersionRow | null> {
  const result = await getPool()
    .request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query(`
      SELECT id, template_id, version, status, tag, [schema], base_pdf, [schemas], created_at
      FROM template_versions
      WHERE template_id = @tid AND status = 'draft'
    `);
  const row = result.recordset[0];
  return row ? parseVersionRow(row) : null;
}

export async function publishVersion(
  templateId: string,
  schema: unknown,
  tag: string,
  target: { mode: 'new' } | { mode: 'replace'; version: number }
): Promise<TemplateVersionRow> {
  const p = getPool();
  const transaction = new sql.Transaction(p);
  await transaction.begin();
  try {
    const schemaObj = schema as { basePdf?: unknown; schemas?: unknown };
    const schemaVal = JSON.stringify(schema);
    const basePdfVal = JSON.stringify(schemaObj.basePdf ?? null);
    const schemasVal = JSON.stringify(schemaObj.schemas ?? null);

    let row: Record<string, unknown>;

    if (target.mode === 'new') {
      const versionResult = await transaction.request()
        .input('tid', sql.UniqueIdentifier, templateId)
        .query(`
          UPDATE pdf_templates
          SET current_version = current_version + 1, updated_at = GETUTCDATE()
          OUTPUT INSERTED.current_version
          WHERE id = @tid
        `);
      if (!versionResult.recordset[0]) throw new Error('Template not found');
      const version = versionResult.recordset[0].current_version as number;

      const insertResult = await transaction.request()
        .input('tid', sql.UniqueIdentifier, templateId)
        .input('version', sql.Int, version)
        .input('tag', sql.NVarChar(255), tag)
        .input('schema_val', sql.NVarChar(sql.MAX), schemaVal)
        .input('base_pdf', sql.NVarChar(sql.MAX), basePdfVal)
        .input('schemas_val', sql.NVarChar(sql.MAX), schemasVal)
        .query(`
          INSERT INTO template_versions (template_id, version, status, tag, [schema], base_pdf, [schemas])
          OUTPUT INSERTED.id, INSERTED.template_id, INSERTED.version, INSERTED.status, INSERTED.tag,
                 INSERTED.[schema], INSERTED.base_pdf, INSERTED.[schemas], INSERTED.created_at
          VALUES (@tid, @version, 'published', @tag, @schema_val, @base_pdf, @schemas_val)
        `);
      row = insertResult.recordset[0];
    } else {
      const updateResult = await transaction.request()
        .input('tid', sql.UniqueIdentifier, templateId)
        .input('version', sql.Int, target.version)
        .input('tag', sql.NVarChar(255), tag)
        .input('schema_val', sql.NVarChar(sql.MAX), schemaVal)
        .input('base_pdf', sql.NVarChar(sql.MAX), basePdfVal)
        .input('schemas_val', sql.NVarChar(sql.MAX), schemasVal)
        .query(`
          UPDATE template_versions
          SET tag = @tag, [schema] = @schema_val, base_pdf = @base_pdf, [schemas] = @schemas_val, created_at = GETUTCDATE()
          OUTPUT INSERTED.id, INSERTED.template_id, INSERTED.version, INSERTED.status, INSERTED.tag,
                 INSERTED.[schema], INSERTED.base_pdf, INSERTED.[schemas], INSERTED.created_at
          WHERE template_id = @tid AND version = @version AND status = 'published'
        `);
      if (!updateResult.recordset[0]) throw new Error('Published version not found');
      row = updateResult.recordset[0];
    }

    await transaction.commit();
    return parseVersionRow(row);
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}

export async function listPublishedVersions(templateId: string): Promise<TemplateVersionRow[]> {
  const result = await getPool()
    .request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query(`
      SELECT id, template_id, version, status, tag, [schema], base_pdf, [schemas], created_at
      FROM template_versions
      WHERE template_id = @tid AND status = 'published'
      ORDER BY version DESC
    `);
  return result.recordset.map(parseVersionRow);
}

export async function getPublishedVersion(
  templateId: string,
  ref: { version: number } | { tag: string }
): Promise<TemplateVersionRow | null> {
  const request = getPool().request().input('tid', sql.UniqueIdentifier, templateId);
  let result;
  if ('version' in ref) {
    result = await request
      .input('version', sql.Int, ref.version)
      .query(`
        SELECT id, template_id, version, status, tag, [schema], base_pdf, [schemas], created_at
        FROM template_versions WHERE template_id = @tid AND version = @version AND status = 'published'
      `);
  } else {
    result = await request
      .input('tag', sql.NVarChar(255), ref.tag)
      .query(`
        SELECT id, template_id, version, status, tag, [schema], base_pdf, [schemas], created_at
        FROM template_versions WHERE template_id = @tid AND tag = @tag AND status = 'published'
      `);
  }
  const row = result.recordset[0];
  return row ? parseVersionRow(row) : null;
}

export async function getLatestPublishedVersion(templateId: string): Promise<TemplateVersionRow | null> {
  const result = await getPool()
    .request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query(`
      SELECT TOP 1 id, template_id, version, status, tag, [schema], base_pdf, [schemas], created_at
      FROM template_versions
      WHERE template_id = @tid AND status = 'published'
      ORDER BY version DESC
    `);
  const row = result.recordset[0];
  return row ? parseVersionRow(row) : null;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors from this file. (This project has a pre-existing, unrelated `storage.ts` typecheck error from an earlier incomplete migration — ignore it if present; confirm no NEW errors are introduced by this change.)

- [ ] **Step 4: Manual verification**

If a live MSSQL instance is reachable (check `server/.env` for `DB_SERVER`/`DB_PORT` and try connecting): start the server (`cd server && npm run dev`), confirm the console prints "Connected to MSSQL" and "Tables ready" with no errors — this exercises `ensureTables()`'s new idempotent column/index guards against a real (possibly pre-existing) `template_versions` table.

If no live DB is reachable in this environment, read through `saveDraft`/`publishVersion`/`getPublishedVersion` once more and manually trace: (1) calling `saveDraft` twice in a row on a template with no prior draft — first call inserts, second call updates the same row (same `id`) rather than inserting a second draft row; (2) calling `publishVersion` with `{mode: 'new'}` twice — each call produces a different `version` number; (3) calling `publishVersion` with `{mode: 'replace', version: 2}` when no published row exists at version 2 — throws `'Published version not found'` rather than silently doing nothing. Note this reasoning in your report.

- [ ] **Step 5: Commit**

```bash
git add server/src/db.ts
git commit -m "feat(db): add draft/publish status and tag to template_versions"
```

---

### Task 2: Template routes — draft-only save, publish, versions list

**Files:**
- Modify: `server/src/routes/templates.ts`

**Interfaces:**
- Consumes: `saveDraft`, `getDraft`, `publishVersion`, `listPublishedVersions`, `getPublishedVersion`, `getLatestPublishedVersion` from `../db.js` (Task 1).
- Produces: `POST /templates/:id/publish`, `GET /templates/:id/versions` routes; changes `GET /templates/:id` and `PUT /templates/:id` response shapes (consumed by Task 4's `client/src/lib/api.ts`).

- [ ] **Step 1: Update `POST /templates` (create) to save a draft, not a published version**

Modify `server/src/routes/templates.ts:118-131`:

```ts
templatesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, schema } = req.body as { name: string; schema: unknown };
    if (!name || !schema) {
      res.status(400).json({ error: 'name and schema are required' });
      return;
    }
    const template = await createTemplate(name);
    const draft = await saveDraft(template.id, schema);
    res.status(201).json({ ...template, schema, draft: { schema: draft.schema, version: draft.version } });
  } catch (error) {
    handleError(res, error);
  }
});
```

- [ ] **Step 2: Update `GET /templates/:id` to return `draft` and `latestPublished`, with version-ref query params**

Modify `server/src/routes/templates.ts:71-83`:

```ts
templatesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const { version, tag } = req.query as { version?: string; tag?: string };
    if (version !== undefined || tag !== undefined) {
      const ref = version !== undefined ? { version: Number(version) } : { tag: tag as string };
      const published = await getPublishedVersion(req.params.id, ref);
      if (!published) {
        res.status(404).json({ error: 'Requested version not found' });
        return;
      }
      res.json({
        ...template,
        latestPublished: { schema: published.schema, version: published.version, tag: published.tag },
        draft: null,
      });
      return;
    }

    const [draft, latestPublished] = await Promise.all([
      getDraft(req.params.id),
      getLatestPublishedVersion(req.params.id),
    ]);
    res.json({
      ...template,
      draft: draft ? { schema: draft.schema, version: draft.version } : null,
      latestPublished: latestPublished
        ? { schema: latestPublished.schema, version: latestPublished.version, tag: latestPublished.tag }
        : null,
    });
  } catch (error) {
    handleError(res, error);
  }
});
```

- [ ] **Step 3: Update `PUT /templates/:id` to write to the draft only**

Modify `server/src/routes/templates.ts:172-191`:

```ts
templatesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, schema } = req.body as { name?: string; schema?: unknown };
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const template = await updateTemplate(req.params.id, name);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    let draft = null;
    if (schema !== undefined) {
      const draftRow = await saveDraft(template.id, schema);
      draft = { schema: draftRow.schema, version: draftRow.version };
    }
    res.json({ ...template, draft });
  } catch (error) {
    handleError(res, error);
  }
});
```

- [ ] **Step 4: Add `POST /templates/:id/publish`**

Add after the `PUT /:id` route (after the block from Step 3), before the `DELETE /:id` route:

```ts
/**
 * @openapi
 * /templates/{id}/publish:
 *   post:
 *     summary: Publish a template's draft as a new or replacement published version
 *     tags: [Templates]
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
 *             required: [schema, tag, mode]
 *             properties:
 *               schema:
 *                 type: object
 *               tag:
 *                 type: string
 *               mode:
 *                 type: string
 *                 enum: [new, replace]
 *               version:
 *                 type: integer
 *                 description: Required when mode is "replace"
 *     responses:
 *       200:
 *         description: The created or updated published version
 *       400:
 *         description: Missing required fields
 *       409:
 *         description: Duplicate tag for this template
 */
templatesRouter.post('/:id/publish', async (req: Request, res: Response) => {
  try {
    const { schema, tag, mode, version } = req.body as {
      schema?: unknown;
      tag?: string;
      mode?: 'new' | 'replace';
      version?: number;
    };
    if (!schema || !tag || !mode) {
      res.status(400).json({ error: 'schema, tag, and mode are required' });
      return;
    }
    if (mode === 'replace' && typeof version !== 'number') {
      res.status(400).json({ error: 'version is required when mode is "replace"' });
      return;
    }

    const target = mode === 'new' ? { mode: 'new' as const } : { mode: 'replace' as const, version: version! };
    const published = await publishVersion(req.params.id, schema, tag, target);
    await saveDraft(req.params.id, schema);

    res.json({ schema: published.schema, version: published.version, tag: published.tag });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    if (message.includes('UNIQUE') || message.includes('duplicate')) {
      res.status(409).json({ error: `Tag "${(req.body as { tag?: string }).tag}" is already used for this template` });
      return;
    }
    handleError(res, error);
  }
});
```

- [ ] **Step 5: Add `GET /templates/:id/versions`**

Add after the `POST /:id/publish` route from Step 4:

```ts
/**
 * @openapi
 * /templates/{id}/versions:
 *   get:
 *     summary: List a template's published versions
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Array of published versions, newest first
 */
templatesRouter.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const versions = await listPublishedVersions(req.params.id);
    res.json(versions.map(v => ({ version: v.version, tag: v.tag, created_at: v.created_at })));
  } catch (error) {
    handleError(res, error);
  }
});
```

- [ ] **Step 6: Update imports**

Modify `server/src/routes/templates.ts:1-10`:

```ts
import { Router, Request, Response } from 'express';
import {
  createTemplate,
  deleteTemplate,
  getDraft,
  getLatestPublishedVersion,
  getPublishedVersion,
  getTemplate,
  listPublishedVersions,
  listTemplates,
  publishVersion,
  saveDraft,
  updateTemplate,
} from '../db.js';
```

- [ ] **Step 7: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Manual verification**

If a live server + DB is reachable: start it (`cd server && npm run dev`), then with `curl`:
1. `POST /templates` with `{"name":"Test","schema":{"basePdf":{"width":210,"height":297,"padding":[10,10,10,10]},"schemas":[[]]}}` — confirm 201, response has no `latestPublished`/version-history side effects visible yet (just `draft`).
2. `GET /templates/:id` on the created template — confirm `draft` is populated, `latestPublished` is `null`.
3. `POST /templates/:id/publish` with `{"schema": {...same...}, "tag": "v1", "mode": "new"}` — confirm 200, `version: 1`.
4. `GET /templates/:id` again — confirm `latestPublished` is now populated with `tag: "v1"`, `draft` is still populated (not cleared).
5. `POST /templates/:id/publish` again with the same `tag: "v1"`, `mode: "new"` — confirm 409.
6. `GET /templates/:id/versions` — confirm one entry, `{version: 1, tag: "v1", ...}`.

If no live DB is reachable, reason through the route handlers' logic against Task 1's function contracts and describe the walkthrough in your report — specifically confirm the 409 duplicate-tag path and the `mode: 'replace'` 400-when-missing-version path are both reachable and correctly typed.

- [ ] **Step 9: Commit**

```bash
git add server/src/routes/templates.ts
git commit -m "feat(server): add draft/publish routes for templates"
```

---

### Task 3: Generate-PDF route — version-aware resolution

**Files:**
- Modify: `server/src/routes/filledPdfs.ts`

**Interfaces:**
- Consumes: `getPublishedVersion`, `getLatestPublishedVersion` from `../db.js` (Task 1), replacing `getLatestTemplateVersion`.
- Produces: `/generate-pdf` accepts optional `version`/`tag` in its request body.

- [ ] **Step 1: Update the import and the version-resolution logic**

Modify `server/src/routes/filledPdfs.ts:1-4`:

```ts
import { Router, Request, Response } from 'express';
import { generatePdf } from '../services/pdfService.js';
import { getTemplate, getPublishedVersion, getLatestPublishedVersion, createFilledSubmission, createGeneratedPdf } from '../db.js';
import type { Template } from '@pdfme/common';
```

Modify the request body destructuring and version resolution at `server/src/routes/filledPdfs.ts:83-101` (from the `const { template_id, inputs } = ...` line through the `generatePdf(...)` call):

```ts
generatePdfRouter.post('/', async (req: Request, res: Response) => {
  const { template_id, inputs, version, tag } = req.body as {
    template_id?: string;
    inputs?: Record<string, string>[];
    version?: number;
    tag?: string;
  };

  if (!template_id || !Array.isArray(inputs) || inputs.length === 0) {
    res.status(400).json({ error: 'template_id and a non-empty inputs array are required' });
    return;
  }

  try {
    const record = await getTemplate(template_id);
    if (!record) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const resolvedVersion = version !== undefined
      ? await getPublishedVersion(template_id, { version })
      : tag !== undefined
        ? await getPublishedVersion(template_id, { tag })
        : await getLatestPublishedVersion(template_id);

    if (!resolvedVersion) {
      res.status(404).json({ error: 'No published version found' });
      return;
    }

    const pdf = await generatePdf(resolvedVersion.schema as Template, inputs);
```

Then update the remainder of the handler (the `createFilledSubmission`/`createGeneratedPdf` block) to reference `resolvedVersion` instead of `latestVersion` — modify `server/src/routes/filledPdfs.ts:103-113` (renaming every `latestVersion` occurrence to `resolvedVersion`):

```ts
    try {
      const submission = await createFilledSubmission(
        template_id,
        resolvedVersion.version,
        inputs
      );
      await createGeneratedPdf({
        submissionId: submission.id,
        templateId: template_id,
        templateVersion: resolvedVersion.version,
        inputsSnapshot: inputs,
        schemaSnapshot: resolvedVersion.schema,
        filePath: 'generated-in-memory',
        fileSizeBytes: pdf.length,
      });
    } catch (dbErr) {
      console.error('Failed to record submission/generated_pdf:', dbErr);
    }
```

Leave the rest of the file (the `@openapi` JSDoc comment, the response-header-writing tail) unchanged — optionally add `version`/`tag` to the JSDoc `requestBody` properties for documentation completeness, but this is not required for correctness.

- [ ] **Step 2: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

If a live server + DB is reachable, using the template created in Task 2's verification (with a published `v1`):
1. `POST /generate-pdf` with `{"template_id": "...", "inputs": [{}]}` (no version/tag) — confirm 200, PDF bytes returned (resolves to latest published).
2. `POST /generate-pdf` with `{"template_id": "...", "inputs": [{}], "tag": "v1"}` — confirm 200.
3. `POST /generate-pdf` with `{"template_id": "...", "inputs": [{}], "version": 999}` — confirm 404 `"No published version found"`.

If no live DB is reachable, reason through the resolution branching (version → tag → latest, in that priority order) against Task 1's function signatures and describe the walkthrough in your report.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/filledPdfs.ts
git commit -m "feat(server): resolve /generate-pdf against a specific or latest published version"
```

---

### Task 4: Client API and types

**Files:**
- Modify: `client/src/lib/api.ts`
- Modify: `client/src/types.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  export interface VersionRef { version: number }
  export interface TagRef { tag: string }
  export type PublishedVersionRef = VersionRef | TagRef;

  interface TemplateRecord {
    id: string; name: string; created_at: string; updated_at: string | null;
    draft: { schema: object; version: number } | null;
    latestPublished: { schema: object; version: number; tag: string | null } | null;
  }
  export interface PublishedVersionSummary { version: number; tag: string | null; created_at: string; }

  api.getTemplate(id: string, versionRef?: PublishedVersionRef): Promise<TemplateRecord>
  api.publishTemplate(id: string, schema: Template, tag: string, target: { mode: 'new' } | { mode: 'replace'; version: number }): Promise<{ schema: Template; version: number; tag: string }>
  api.listPublishedVersions(id: string): Promise<PublishedVersionSummary[]>
  api.createFilledPdf(templateId: string, inputs: Record<string, string>[], versionRef?: PublishedVersionRef): Promise<void>
  ```
  Tasks 5, 6, 7 (`TemplateDesigner.tsx`, `TemplateList.tsx`, `FormFill.tsx`) consume these directly.

- [ ] **Step 1: Update `TemplateRecord` in `types.ts`**

Modify `client/src/types.ts:3-9`:

```ts
export interface TemplateRecord {
  id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
  draft: { schema: object; version: number } | null;
  latestPublished: { schema: object; version: number; tag: string | null } | null;
}

export interface PublishedVersionSummary {
  version: number;
  tag: string | null;
  created_at: string;
}
```

(Removes the old `schema: object` top-level field — it's now nested under `draft`/`latestPublished`. `TemplateSummary` and `FilledPdfRecord` below this in the file are unaffected, leave them unchanged.)

- [ ] **Step 2: Add `PublishedVersionRef` type and update `api.ts`**

Modify `client/src/lib/api.ts`, replacing the full file:

```ts
import type {
  TemplateRecord,
  TemplateSummary,
  PublishedVersionSummary,
} from "../types.js";
import type { Template } from "@pdfme/common";

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiFormChatResponse {
  done: boolean;
  message: string;
  template?: Template;
}

export type PublishedVersionRef = { version: number } | { tag: string };

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

function versionRefToQuery(ref?: PublishedVersionRef): string {
  if (!ref) return "";
  if ("version" in ref) return `?version=${encodeURIComponent(ref.version)}`;
  return `?tag=${encodeURIComponent(ref.tag)}`;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + url, options);

  if (!res.ok) {
    const text = await res.text();
    let message = text;

    try {
      const body = JSON.parse(text) as { error?: string; message?: string };
      message = body.error ?? body.message ?? text;
    } catch {
      // Keep the raw response text when the server did not return JSON.
    }

    throw new Error(`${res.status} ${message}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listTemplates: () => request<TemplateSummary[]>("/templates"),

  getTemplate: (id: string, versionRef?: PublishedVersionRef) =>
    request<TemplateRecord>(`/templates/${id}${versionRefToQuery(versionRef)}`),

  createTemplate: (name: string, schema: Template) =>
    request<TemplateRecord>("/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, schema }),
    }),

  updateTemplate: (id: string, name: string, schema: Template) =>
    request<TemplateRecord>(`/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, schema }),
    }),

  publishTemplate: (
    id: string,
    schema: Template,
    tag: string,
    target: { mode: "new" } | { mode: "replace"; version: number }
  ) =>
    request<{ schema: Template; version: number; tag: string }>(`/templates/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema, tag, ...target }),
    }),

  listPublishedVersions: (id: string) =>
    request<PublishedVersionSummary[]>(`/templates/${id}/versions`),

  deleteTemplate: (id: string) =>
    request<void>(`/templates/${id}`, { method: "DELETE" }),

  createFilledPdf: async (
    template_id: string,
    inputs: Record<string, string>[],
    versionRef?: PublishedVersionRef
  ) => {
    const res = await fetch(API_BASE + "/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id,
        inputs,
        ...(versionRef && "version" in versionRef ? { version: versionRef.version } : {}),
        ...(versionRef && "tag" in versionRef ? { tag: versionRef.tag } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${text}`);
    }
  },

  aiFormChat: (messages: AiChatMessage[]) =>
    request<AiFormChatResponse>("/ai-form/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    }),
};
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: errors in `TemplateDesigner.tsx`/`FormFill.tsx` at this point are EXPECTED (they still reference the old `record.schema` shape) — Tasks 5 and 7 fix those. Confirm the errors are confined to those two files and `api.ts`/`types.ts` themselves compile clean.

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/api.ts client/src/types.ts
git commit -m "feat(client): add draft/publish API functions and types"
```

---

### Task 5: TemplateDesigner — draft-else-published load, Save Draft, Publish modal

**Files:**
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- Consumes: `api.getTemplate` (returns `draft`/`latestPublished`), `api.updateTemplate` (now draft-only server-side), `api.publishTemplate`, `api.listPublishedVersions` from `../lib/api.js` (Task 4).

- [ ] **Step 1: Update the load effect to pick draft, else latest published, else blank**

Modify `client/src/pages/TemplateDesigner.tsx:140-147` (inside the `init` function):

```ts
      let template: Template = BLANK_TEMPLATE;
      if (id) {
        const record = await api.getTemplate(id);
        template = (record.draft?.schema ?? record.latestPublished?.schema ?? BLANK_TEMPLATE) as Template;
        if (mounted) setName(record.name);
      }
```

- [ ] **Step 2: Relabel "Save"/"Save Project" to "Save Draft"**

Modify `client/src/pages/TemplateDesigner.tsx:392-403` (Row 1's Save button):

```tsx
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-black hover:bg-black/80 disabled:opacity-50 transition-all active:scale-[0.97]"
          style={{ borderRadius: 50 }}
        >
          {saving ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
          ) : (
            <><Save className="h-3.5 w-3.5" />Save Draft</>
          )}
        </button>
```

Modify `client/src/pages/TemplateDesigner.tsx:466-470` (the "Save Project" ToolbarBtn in the Project group):

```tsx
          <ToolbarBtn icon={<Save size={13} />} label="Save Draft" onClick={handleSave} accent />
```

- [ ] **Step 3: Add publish state and the `handlePublish`/`handleOpenPublish` handlers**

Add new state next to `apiPayloadOpen` at `client/src/pages/TemplateDesigner.tsx:125`:

```ts
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishedVersions, setPublishedVersions] = useState<{ version: number; tag: string | null; created_at: string }[]>([]);
  const [publishing, setPublishing] = useState(false);
```

Add a new handler after `handleSaveAs` (`client/src/pages/TemplateDesigner.tsx:188-199`):

```ts
  const handleOpenPublish = async () => {
    if (!id) { setError('Save the template before publishing.'); return; }
    try {
      const versions = await api.listPublishedVersions(id);
      setPublishedVersions(versions);
      setPublishOpen(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handlePublish = async (tag: string, target: { mode: 'new' } | { mode: 'replace'; version: number }) => {
    if (!designerRef.current || !id) return;
    setPublishing(true);
    setError(null);
    try {
      const schema = designerRef.current.getTemplate();
      await api.publishTemplate(id, schema, tag, target);
      setPublishOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };
```

- [ ] **Step 4: Add the "Publish" toolbar button**

Modify the Project group at `client/src/pages/TemplateDesigner.tsx:466-470`:

```tsx
        <Group label="Project">
          <ToolbarBtn icon={<Save size={13} />} label="Save Draft" onClick={handleSave} accent />
          <ToolbarBtn icon={<Copy size={13} />} label="Save As" onClick={handleSaveAs} />
          <ToolbarBtn icon={<RotateCcw size={13} />} label="Reset" onClick={handleReset} />
          <ToolbarBtn icon={<UploadCloud size={13} />} label="Publish" onClick={() => void handleOpenPublish()} disabled={!id} />
        </Group>
```

Add `UploadCloud` to the lucide-react import at `client/src/pages/TemplateDesigner.tsx:6-10`:

```tsx
import {
  AlertCircle, ArrowLeft, Save, Loader2,
  FileJson, FileDown, RotateCcw, Copy, FileUp, Layout, Sparkles, Printer,
  RectangleVertical, RectangleHorizontal, PanelTop, Code, UploadCloud,
} from 'lucide-react';
```

- [ ] **Step 5: Add the Publish modal JSX**

Add after the API payload modal block, before the "Designer canvas" comment (`client/src/pages/TemplateDesigner.tsx:557-565`):

```tsx
      {/* Publish modal */}
      {publishOpen && (
        <PublishModal
          publishedVersions={publishedVersions}
          publishing={publishing}
          onPublish={handlePublish}
          onClose={() => setPublishOpen(false)}
        />
      )}
```

- [ ] **Step 6: Add the `PublishModal` component**

Add a new component above `export default function TemplateDesigner()` (after the `Group` function, `client/src/pages/TemplateDesigner.tsx:91-109`):

```tsx
function PublishModal({
  publishedVersions, publishing, onPublish, onClose,
}: {
  publishedVersions: { version: number; tag: string | null; created_at: string }[];
  publishing: boolean;
  onPublish: (tag: string, target: { mode: 'new' } | { mode: 'replace'; version: number }) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'new' | 'replace'>('new');
  const [tag, setTag] = useState('');
  const [replaceVersion, setReplaceVersion] = useState<number | null>(publishedVersions[0]?.version ?? null);

  const handleReplaceVersionChange = (version: number) => {
    setReplaceVersion(version);
    const existing = publishedVersions.find(v => v.version === version);
    setTag(existing?.tag ?? '');
  };

  const canSubmit = tag.trim().length > 0 && (mode === 'new' || replaceVersion !== null);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.40)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: '480px',
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 16,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>Publish template</span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setMode('new')}
              style={{
                padding: '6px 14px', borderRadius: 50, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: mode === 'new' ? 'none' : '1px solid #e6e6e6',
                background: mode === 'new' ? '#000' : 'transparent',
                color: mode === 'new' ? '#fff' : 'rgba(0,0,0,0.55)',
              }}
            >
              New version
            </button>
            <button
              onClick={() => setMode('replace')}
              disabled={publishedVersions.length === 0}
              style={{
                padding: '6px 14px', borderRadius: 50, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: mode === 'replace' ? 'none' : '1px solid #e6e6e6',
                background: mode === 'replace' ? '#000' : 'transparent',
                color: mode === 'replace' ? '#fff' : 'rgba(0,0,0,0.55)',
                opacity: publishedVersions.length === 0 ? 0.4 : 1,
              }}
            >
              Replace existing
            </button>
          </div>

          {mode === 'replace' && (
            <select
              value={replaceVersion ?? ''}
              onChange={e => handleReplaceVersionChange(Number(e.target.value))}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e6e6e6', fontSize: 13 }}
            >
              {publishedVersions.map(v => (
                <option key={v.version} value={v.version}>
                  v{v.version} — {v.tag} ({new Date(v.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          )}

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.55)', display: 'block', marginBottom: 4 }}>
              Tag
            </label>
            <input
              type="text"
              value={tag}
              onChange={e => setTag(e.target.value)}
              placeholder="e.g. v1.2 - added tax field"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e6e6e6', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid #e6e6e6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: '6px 16px', borderRadius: 50, border: '1px solid #e6e6e6', background: 'transparent', color: 'rgba(0,0,0,0.55)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onPublish(tag.trim(), mode === 'new' ? { mode: 'new' } : { mode: 'replace', version: replaceVersion! })}
            disabled={!canSubmit || publishing}
            style={{
              padding: '6px 16px', borderRadius: 50, border: 'none',
              background: '#000', color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: canSubmit && !publishing ? 'pointer' : 'not-allowed',
              opacity: canSubmit && !publishing ? 1 : 0.5,
            }}
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors — this task resolves the `record.schema` errors Task 4 introduced for this file. This project's tsconfig has `noUnusedLocals`/`noUnusedParameters: true`.

- [ ] **Step 8: Manual verification**

Start the dev server (`nohup npm run dev > /tmp/task5-dev.log 2>&1 & disown`, `sleep 5 && cat /tmp/task5-dev.log` for the port, curl `/templates/new` for 200, stop by PID via `lsof -ti:<port> | xargs -r kill` when done — never a blanket `pkill -f vite`).

If a real browser AND live server+DB are both available: create a new template, save it (draft), reopen it (confirm draft loads), click Publish → New version with tag "v1" → confirm success and modal closes. Reopen the Designer for that template — confirm the draft (not the published version) still loads (they're identical right after publish, but this confirms the load-order logic picks draft first). Click Publish again → Replace existing → pick v1 → confirm the tag field pre-fills with "v1" → change schema slightly and republish → confirm success.

If a browser or live DB isn't available, reason through the code by inspection (state wiring, the `PublishModal` prop contract matching `handlePublish`'s signature, the disabled states) and describe the walkthrough in your report, consistent with how prior tasks in this project were verified.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/TemplateDesigner.tsx
git commit -m "feat(designer): draft-else-published load order, Save Draft, Publish modal"
```

---

### Task 6: TemplateList — version picker for sharing a Fill link

**Files:**
- Modify: `client/src/pages/TemplateList.tsx`

**Interfaces:**
- Consumes: `api.listPublishedVersions` from `../lib/api.js` (Task 4).

- [ ] **Step 1: Add a `FillVersionPicker` component**

Add above `export default function TemplateList()` (after the `Skeleton` function, `client/src/pages/TemplateList.tsx:13-27`):

```tsx
function FillVersionPicker({ templateId, onClose }: { templateId: string; onClose: () => void }) {
  const [versions, setVersions] = useState<{ version: number; tag: string | null; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedVersion, setCopiedVersion] = useState<number | null>(null);

  useEffect(() => {
    api.listPublishedVersions(templateId)
      .then(setVersions)
      .finally(() => setLoading(false));
  }, [templateId]);

  const copyLink = (version: number) => {
    const url = `${window.location.origin}/templates/${templateId}/fill?version=${version}`;
    void navigator.clipboard.writeText(url);
    setCopiedVersion(version);
    setTimeout(() => setCopiedVersion(v => (v === version ? null : v)), 1500);
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
          width: '420px',
          background: '#fff',
          border: '1px solid var(--nx-hairline)',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--nx-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--nx-ink)' }}>Share a version to fill</span>
          <button onClick={onClose} style={{ color: 'var(--nx-ink-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 16, maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && <p style={{ fontSize: 13, color: 'var(--nx-ink-muted)' }}>Loading…</p>}
          {!loading && versions.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--nx-ink-muted)' }}>No published versions yet.</p>
          )}
          {versions.map(v => (
            <div
              key={v.version}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--nx-hairline)' }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--nx-ink)' }}>v{v.version} — {v.tag}</div>
                <div style={{ fontSize: 11, color: 'var(--nx-ink-muted)' }}>{new Date(v.created_at).toLocaleDateString()}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => copyLink(v.version)}>
                {copiedVersion === v.version ? 'Copied!' : 'Copy link'}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add state and wire the picker in for Admin/Designer roles**

Add state inside `export default function TemplateList()` next to `viewMode` (`client/src/pages/TemplateList.tsx:35`):

```ts
  const [fillPickerTemplateId, setFillPickerTemplateId] = useState<string | null>(null);
```

Replace the grid-view "Fill Form" link (`client/src/pages/TemplateList.tsx:160-164`):

```tsx
                  {canFill && (
                    <Link to={`/templates/${t.id}/fill`} className="flex-1">
                      <Button size="sm" className="w-full">Fill Form</Button>
                    </Link>
                  )}
                  {canEdit && (
                    <Button size="sm" variant="secondary" className="flex-1" onClick={() => setFillPickerTemplateId(t.id)}>
                      Share Fill Link
                    </Button>
                  )}
```

Replace the list-view "Fill" link (`client/src/pages/TemplateList.tsx:222-226`):

```tsx
                        {canFill && (
                          <Link to={`/templates/${t.id}/fill`}>
                            <Button size="sm">Fill</Button>
                          </Link>
                        )}
                        {canEdit && (
                          <Button size="sm" variant="secondary" onClick={() => setFillPickerTemplateId(t.id)}>
                            Share Fill Link
                          </Button>
                        )}
```

(Note: `canEdit` already covers Admin + Designer, matching the brief's "sent by the admin or the designer" requirement — no new role check needed.)

- [ ] **Step 3: Render the picker modal**

Add after the closing `</div>` of the `p-6 space-y-5` container, before the closing `</AppLayout>` (`client/src/pages/TemplateList.tsx:254-255`):

```tsx
      </div>

      {fillPickerTemplateId && (
        <FillVersionPicker
          templateId={fillPickerTemplateId}
          onClose={() => setFillPickerTemplateId(null)}
        />
      )}
    </AppLayout>
```

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Reuse the dev server pattern from Task 5 Step 8. If a real browser + live server/DB are available: as Admin, click "Share Fill Link" on a template with at least one published version — confirm the picker lists versions, "Copy link" copies a `.../fill?version=N` URL and shows "Copied!" briefly. If a template has zero published versions, confirm the "No published versions yet." message shows instead of an empty list. If no browser/DB available, reason through the code by inspection.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/TemplateList.tsx
git commit -m "feat(templates): add version picker for sharing a specific Fill link"
```

---

### Task 7: FormFill — read version/tag from the URL

**Files:**
- Modify: `client/src/pages/FormFill.tsx`

**Interfaces:**
- Consumes: `useSearchParams` from `react-router-dom`, `api.getTemplate`/`api.createFilledPdf` with the new `versionRef` parameter (Task 4).

- [ ] **Step 1: Read the version ref from the URL and pass it through**

Modify `client/src/pages/FormFill.tsx:1-28`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Form, Viewer } from '@pdfme/ui';
import { generate } from '@pdfme/generator';
import { getInputFromTemplate, type Template } from '@pdfme/common';
import { ArrowLeft, Download, FileCheck, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { getFonts, getPlugins } from '../lib/pdfme.js';
import type { PublishedVersionRef } from '../lib/api.js';

type PageState = 'filling' | 'preview';

export default function FormFill() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const uiRef = useRef<Form | Viewer | null>(null);
  const [templateRecord, setTemplateRecord] = useState<{ name: string; schema: Template } | null>(null);
  const [pageState, setPageState] = useState<PageState>('filling');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const versionParam = searchParams.get('version');
  const tagParam = searchParams.get('tag');
  const versionRef: PublishedVersionRef | undefined = versionParam
    ? { version: Number(versionParam) }
    : tagParam
      ? { tag: tagParam }
      : undefined;

  useEffect(() => {
    if (!id) return;
    api.getTemplate(id, versionRef)
      .then((record) => {
        const schema = record.latestPublished?.schema;
        if (!schema) { setError('No published version available for this template.'); return; }
        setTemplateRecord({ name: record.name, schema: schema as Template });
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, versionParam, tagParam]);
```

(The `eslint-disable` comment matches an existing pattern already used elsewhere in this codebase for effects that intentionally omit a derived, non-primitive dependency — `versionRef` is recomputed every render from `versionParam`/`tagParam`, which are the actual primitive dependencies already listed.)

- [ ] **Step 2: Pass `versionRef` to `createFilledPdf`**

Modify `client/src/pages/FormFill.tsx:67` (inside `handleSubmit`, the `await api.createFilledPdf(id, inputs);` line):

```ts
      await api.createFilledPdf(id, inputs, versionRef);
```

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Reuse the dev server pattern from Task 5 Step 8. If a real browser + live server/DB are available: navigate to `/templates/:id/fill?version=1` for a template with a published v1 — confirm it loads that version's schema (not the draft, not a different published version). Navigate to `/templates/:id/fill` with no query params — confirm it falls back to latest published. Navigate to `/templates/:id/fill?version=999` (nonexistent) — confirm the "No published version available" error message shows instead of a crash. If no browser/DB available, reason through the code by inspection.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/FormFill.tsx
git commit -m "feat(form-fill): read version/tag from the URL to target a specific published version"
```

---

## Self-Review Notes

- **Spec coverage:** Every section of the spec has a corresponding task — schema/functions (Task 1), routes (Tasks 2-3), client API/types (Task 4), Designer draft/publish UI (Task 5), TemplateList version-sharing UI (Task 6), FormFill version-aware loading (Task 7).
- **Placeholder scan:** No TBD/TODO; every step contains complete code.
- **Type consistency:** `TemplateVersionRow`'s `status`/`tag` fields (Task 1) are consumed identically by Tasks 2-3's route handlers. `TemplateRecord`'s `draft`/`latestPublished` shape (Task 4) is consumed identically by Task 5's load effect and Task 7's schema-extraction logic. `PublishedVersionRef` (Task 4) is the same type name and shape used by `api.getTemplate`, `api.createFilledPdf` (Task 4), and `FormFill.tsx`'s derived `versionRef` (Task 7). `PublishedVersionSummary`/the inline `{version, tag, created_at}` shape used by `api.listPublishedVersions` (Task 4) matches what Task 5's `PublishModal` and Task 6's `FillVersionPicker` both consume.
- **Task ordering:** Strictly bottom-up (DB → routes → client API/types → 3 consuming pages) — Tasks 5-7 can be done in any relative order once Task 4 lands, but all three depend on Task 4, which depends on Tasks 1-3.
- **Retirement of old functions:** Task 1 explicitly removes `createTemplateVersion` and `getLatestTemplateVersion` (folded into the "replace the entire template_versions section" step) — Tasks 2 and 3 both stop importing them and use the new functions instead, so no dangling references remain after Task 3 completes.

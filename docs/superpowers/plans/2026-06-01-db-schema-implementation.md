# DB Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MSSQL `db.ts` with a PostgreSQL implementation backed by four migration files — `pdf_templates`, `template_versions`, `filled_submissions`, and `generated_pdfs`.

**Architecture:** Migration SQL files define the schema; `db.ts` is replaced wholesale with a `pg`-based module exporting typed CRUD functions for all four tables. Existing routes that import from `db.ts` continue to work because exported function signatures are preserved or extended, not broken.

**Tech Stack:** PostgreSQL, `pg` (node-postgres), TypeScript, Express (existing)

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `server/migrations/001_create_pdf_templates.sql` | `pdf_templates` table DDL |
| Create | `server/migrations/002_create_template_versions.sql` | `template_versions` table + index DDL |
| Create | `server/migrations/003_create_filled_submissions.sql` | `filled_submissions` table + index DDL |
| Create | `server/migrations/004_create_generated_pdfs.sql` | `generated_pdfs` table + indexes DDL |
| Replace | `server/src/db.ts` | PostgreSQL pool, `initDb()`, all typed CRUD functions |
| Modify | `server/package.json` | swap `mssql` → `pg` + `@types/pg` |

---

## Task 1: Swap `mssql` for `pg` in package.json

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install `pg` and remove `mssql`**

```bash
cd server
npm uninstall mssql @types/mssql
npm install pg
npm install --save-dev @types/pg
```

Expected: `package.json` now lists `"pg"` in dependencies and `"@types/pg"` in devDependencies. No `mssql` entries remain.

- [ ] **Step 2: Verify install**

```bash
cd server
node -e "import('pg').then(m => console.log('pg ok', Object.keys(m)))"
```

Expected output contains `pg ok` with exported keys.

- [ ] **Step 3: Commit**

```bash
cd server
git add package.json package-lock.json
git commit -m "chore(server): swap mssql for pg"
```

---

## Task 2: Write migration — `pdf_templates`

**Files:**
- Create: `server/migrations/001_create_pdf_templates.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- server/migrations/001_create_pdf_templates.sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS pdf_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  current_version INT         NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Run against your local Postgres to verify**

```bash
psql "$DATABASE_URL" -f server/migrations/001_create_pdf_templates.sql
```

Expected: `CREATE TABLE` (or `NOTICE: relation already exists` if re-run).

- [ ] **Step 3: Commit**

```bash
git add server/migrations/001_create_pdf_templates.sql
git commit -m "feat(db): migration 001 — pdf_templates"
```

---

## Task 3: Write migration — `template_versions`

**Files:**
- Create: `server/migrations/002_create_template_versions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- server/migrations/002_create_template_versions.sql
CREATE TABLE IF NOT EXISTS template_versions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        NOT NULL REFERENCES pdf_templates(id) ON DELETE CASCADE,
  version     INT         NOT NULL,
  schema      JSONB       NOT NULL,
  base_pdf    JSONB       NOT NULL,
  schemas     JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_template_version UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_template_versions_template_id
  ON template_versions(template_id);
```

- [ ] **Step 2: Run against local Postgres**

```bash
psql "$DATABASE_URL" -f server/migrations/002_create_template_versions.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`.

- [ ] **Step 3: Commit**

```bash
git add server/migrations/002_create_template_versions.sql
git commit -m "feat(db): migration 002 — template_versions"
```

---

## Task 4: Write migration — `filled_submissions`

**Files:**
- Create: `server/migrations/003_create_filled_submissions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- server/migrations/003_create_filled_submissions.sql
CREATE TABLE IF NOT EXISTS filled_submissions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      UUID        NOT NULL REFERENCES pdf_templates(id) ON DELETE CASCADE,
  template_version INT         NOT NULL,
  inputs           JSONB       NOT NULL,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_filled_submissions_template_id
  ON filled_submissions(template_id);
```

- [ ] **Step 2: Run against local Postgres**

```bash
psql "$DATABASE_URL" -f server/migrations/003_create_filled_submissions.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`.

- [ ] **Step 3: Commit**

```bash
git add server/migrations/003_create_filled_submissions.sql
git commit -m "feat(db): migration 003 — filled_submissions"
```

---

## Task 5: Write migration — `generated_pdfs`

**Files:**
- Create: `server/migrations/004_create_generated_pdfs.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- server/migrations/004_create_generated_pdfs.sql
CREATE TABLE IF NOT EXISTS generated_pdfs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id    UUID        NOT NULL REFERENCES filled_submissions(id) ON DELETE CASCADE,
  template_id      UUID        NOT NULL REFERENCES pdf_templates(id),
  template_version INT         NOT NULL,
  inputs_snapshot  JSONB       NOT NULL,
  schema_snapshot  JSONB       NOT NULL,
  file_path        TEXT        NOT NULL,
  file_size_bytes  BIGINT,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_pdfs_template_id
  ON generated_pdfs(template_id);

CREATE INDEX IF NOT EXISTS idx_generated_pdfs_submission_id
  ON generated_pdfs(submission_id);
```

- [ ] **Step 2: Run against local Postgres**

```bash
psql "$DATABASE_URL" -f server/migrations/004_create_generated_pdfs.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `CREATE INDEX`.

- [ ] **Step 3: Commit**

```bash
git add server/migrations/004_create_generated_pdfs.sql
git commit -m "feat(db): migration 004 — generated_pdfs"
```

---

## Task 6: Replace `server/src/db.ts` with PostgreSQL implementation

This is a full replacement of the file. The existing routes import `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `deleteTemplate` — all are preserved. New functions for `template_versions`, `filled_submissions`, and `generated_pdfs` are added.

**Files:**
- Replace: `server/src/db.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
// server/src/db.ts
import { Pool } from 'pg';

const pool = new Pool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME     ?? '',
  user:     process.env.DB_USER     ?? '',
  password: process.env.DB_PASSWORD ?? '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  min: Number(process.env.DB_POOL_MIN ?? 2),
  max: Number(process.env.DB_POOL_MAX ?? 10),
});

export async function initDb(): Promise<void> {
  await pool.query('SELECT 1');
  console.log('Connected to PostgreSQL');
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TemplateRow {
  id: string;
  name: string;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateSummaryRow {
  id: string;
  name: string;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateVersionRow {
  id: string;
  template_id: string;
  version: number;
  schema: unknown;
  base_pdf: unknown;
  schemas: unknown;
  created_at: string;
}

export interface FilledSubmissionRow {
  id: string;
  template_id: string;
  template_version: number;
  inputs: unknown;
  submitted_at: string;
}

export interface GeneratedPdfRow {
  id: string;
  submission_id: string;
  template_id: string;
  template_version: number;
  inputs_snapshot: unknown;
  schema_snapshot: unknown;
  file_path: string;
  file_size_bytes: number | null;
  generated_at: string;
}

// ─── pdf_templates ───────────────────────────────────────────────────────────

export async function listTemplates(): Promise<TemplateSummaryRow[]> {
  const { rows } = await pool.query<TemplateSummaryRow>(
    'SELECT id, name, current_version, created_at, updated_at FROM pdf_templates ORDER BY created_at DESC'
  );
  return rows;
}

export async function getTemplate(id: string): Promise<TemplateRow | null> {
  const { rows } = await pool.query<TemplateRow>(
    'SELECT id, name, current_version, created_at, updated_at FROM pdf_templates WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
}

export async function createTemplate(name: string): Promise<TemplateRow> {
  const { rows } = await pool.query<TemplateRow>(
    `INSERT INTO pdf_templates (name)
     VALUES ($1)
     RETURNING id, name, current_version, created_at, updated_at`,
    [name]
  );
  return rows[0];
}

export async function updateTemplate(id: string, name: string): Promise<TemplateRow | null> {
  const { rows } = await pool.query<TemplateRow>(
    `UPDATE pdf_templates
     SET name = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, name, current_version, created_at, updated_at`,
    [name, id]
  );
  return rows[0] ?? null;
}

export async function deleteTemplate(id: string): Promise<void> {
  await pool.query('DELETE FROM pdf_templates WHERE id = $1', [id]);
}

// ─── template_versions ───────────────────────────────────────────────────────

export async function createTemplateVersion(
  templateId: string,
  schema: unknown
): Promise<TemplateVersionRow> {
  // Increment current_version on the template and use the new value as version number
  const { rows: updated } = await pool.query<{ current_version: number }>(
    `UPDATE pdf_templates
     SET current_version = current_version + 1, updated_at = NOW()
     WHERE id = $1
     RETURNING current_version`,
    [templateId]
  );
  const version = updated[0].current_version;

  const schemaObj = schema as { basePdf?: unknown; schemas?: unknown };
  const { rows } = await pool.query<TemplateVersionRow>(
    `INSERT INTO template_versions (template_id, version, schema, base_pdf, schemas)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, template_id, version, schema, base_pdf, schemas, created_at`,
    [
      templateId,
      version,
      JSON.stringify(schema),
      JSON.stringify(schemaObj.basePdf ?? null),
      JSON.stringify(schemaObj.schemas ?? null),
    ]
  );
  return rows[0];
}

export async function listTemplateVersions(templateId: string): Promise<TemplateVersionRow[]> {
  const { rows } = await pool.query<TemplateVersionRow>(
    `SELECT id, template_id, version, schema, base_pdf, schemas, created_at
     FROM template_versions
     WHERE template_id = $1
     ORDER BY version DESC`,
    [templateId]
  );
  return rows;
}

export async function getTemplateVersion(
  templateId: string,
  version: number
): Promise<TemplateVersionRow | null> {
  const { rows } = await pool.query<TemplateVersionRow>(
    `SELECT id, template_id, version, schema, base_pdf, schemas, created_at
     FROM template_versions
     WHERE template_id = $1 AND version = $2`,
    [templateId, version]
  );
  return rows[0] ?? null;
}

export async function getLatestTemplateVersion(
  templateId: string
): Promise<TemplateVersionRow | null> {
  const { rows } = await pool.query<TemplateVersionRow>(
    `SELECT tv.id, tv.template_id, tv.version, tv.schema, tv.base_pdf, tv.schemas, tv.created_at
     FROM template_versions tv
     JOIN pdf_templates t ON t.id = tv.template_id
     WHERE tv.template_id = $1 AND tv.version = t.current_version`,
    [templateId]
  );
  return rows[0] ?? null;
}

// ─── filled_submissions ───────────────────────────────────────────────────────

export async function createFilledSubmission(
  templateId: string,
  templateVersion: number,
  inputs: unknown
): Promise<FilledSubmissionRow> {
  const { rows } = await pool.query<FilledSubmissionRow>(
    `INSERT INTO filled_submissions (template_id, template_version, inputs)
     VALUES ($1, $2, $3)
     RETURNING id, template_id, template_version, inputs, submitted_at`,
    [templateId, templateVersion, JSON.stringify(inputs)]
  );
  return rows[0];
}

export async function listFilledSubmissions(templateId: string): Promise<FilledSubmissionRow[]> {
  const { rows } = await pool.query<FilledSubmissionRow>(
    `SELECT id, template_id, template_version, inputs, submitted_at
     FROM filled_submissions
     WHERE template_id = $1
     ORDER BY submitted_at DESC`,
    [templateId]
  );
  return rows;
}

export async function getFilledSubmission(id: string): Promise<FilledSubmissionRow | null> {
  const { rows } = await pool.query<FilledSubmissionRow>(
    `SELECT id, template_id, template_version, inputs, submitted_at
     FROM filled_submissions WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

// ─── generated_pdfs ──────────────────────────────────────────────────────────

export async function createGeneratedPdf(opts: {
  submissionId: string;
  templateId: string;
  templateVersion: number;
  inputsSnapshot: unknown;
  schemaSnapshot: unknown;
  filePath: string;
  fileSizeBytes?: number;
}): Promise<GeneratedPdfRow> {
  const { rows } = await pool.query<GeneratedPdfRow>(
    `INSERT INTO generated_pdfs
       (submission_id, template_id, template_version, inputs_snapshot, schema_snapshot, file_path, file_size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, submission_id, template_id, template_version,
               inputs_snapshot, schema_snapshot, file_path, file_size_bytes, generated_at`,
    [
      opts.submissionId,
      opts.templateId,
      opts.templateVersion,
      JSON.stringify(opts.inputsSnapshot),
      JSON.stringify(opts.schemaSnapshot),
      opts.filePath,
      opts.fileSizeBytes ?? null,
    ]
  );
  return rows[0];
}

export async function listGeneratedPdfs(templateId: string): Promise<GeneratedPdfRow[]> {
  const { rows } = await pool.query<GeneratedPdfRow>(
    `SELECT id, submission_id, template_id, template_version,
            inputs_snapshot, schema_snapshot, file_path, file_size_bytes, generated_at
     FROM generated_pdfs
     WHERE template_id = $1
     ORDER BY generated_at DESC`,
    [templateId]
  );
  return rows;
}

export async function getGeneratedPdf(id: string): Promise<GeneratedPdfRow | null> {
  const { rows } = await pool.query<GeneratedPdfRow>(
    `SELECT id, submission_id, template_id, template_version,
            inputs_snapshot, schema_snapshot, file_path, file_size_bytes, generated_at
     FROM generated_pdfs WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
```

- [ ] **Step 2: Update `.env.example` — replace MSSQL vars with Postgres vars**

Open `server/.env.example` (or root `.env.example`) and replace:

```env
# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pdf_generator
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_SSL=false
DB_POOL_MIN=2
DB_POOL_MAX=10
```

Remove any `DB_SERVER`, `DB_ENCRYPT`, `DB_TRUST_CERT` lines.

- [ ] **Step 3: Build the server to check for TypeScript errors**

```bash
cd server
npx tsc --noEmit
```

Expected: zero errors. Fix any type errors before proceeding.

- [ ] **Step 4: Commit**

```bash
git add server/src/db.ts .env.example
git commit -m "feat(db): replace MSSQL db.ts with PostgreSQL implementation"
```

---

## Task 7: Update routes that consume `db.ts`

The existing routes import `getTemplate` with a `schema` property on `TemplateRow`. That property is gone — schema now lives on `template_versions`. Update the generate-pdf route to fetch the latest version.

**Files:**
- Modify: `server/src/routes/filledPdfs.ts` (this is the generate-pdf route)

- [ ] **Step 1: Update the generate-pdf route**

Open `server/src/routes/filledPdfs.ts` and replace its contents with:

```typescript
import { Router, Request, Response } from 'express';
import { generatePdf } from '../services/pdfService.js';
import {
  getTemplate,
  getLatestTemplateVersion,
  createFilledSubmission,
  createGeneratedPdf,
} from '../db.js';
import type { Template } from '@pdfme/common';

export const generatePdfRouter = Router();

generatePdfRouter.post('/', async (req: Request, res: Response) => {
  const { template_id, inputs } = req.body as {
    template_id?: string;
    inputs?: Record<string, string>[];
  };

  if (!template_id || !inputs) {
    res.status(400).json({ error: 'template_id and inputs are required' });
    return;
  }

  try {
    const template = await getTemplate(template_id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const version = await getLatestTemplateVersion(template_id);
    if (!version) {
      res.status(404).json({ error: 'Template has no versions' });
      return;
    }

    const schema = version.schema as Template;
    const pdf = await generatePdf(schema, inputs);

    // Record the submission and the generated PDF
    const submission = await createFilledSubmission(
      template_id,
      version.version,
      inputs
    );

    await createGeneratedPdf({
      submissionId: submission.id,
      templateId: template_id,
      templateVersion: version.version,
      inputsSnapshot: inputs,
      schemaSnapshot: version.schema,
      filePath: 'generated-in-memory',   // no file saved to disk yet; update when file storage is added
      fileSizeBytes: pdf.length,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="generated.pdf"');
    res.setHeader('Content-Length', pdf.length);
    res.status(200).send(pdf);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});
```

- [ ] **Step 2: Update `server/src/routes/templates.ts` — remove `schema` from TemplateRow references**

The templates route previously returned `schema` from the template row. It should now return metadata only (schema lives in versions). Open `server/src/routes/templates.ts` and ensure GET `/templates/:id` returns the template header row from `getTemplate()` — not a schema field. Remove any `JSON.parse(row.schema)` calls.

- [ ] **Step 3: Build to confirm no type errors**

```bash
cd server
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/filledPdfs.ts server/src/routes/templates.ts
git commit -m "feat(server): wire generate-pdf route to versions + submission tracking"
```

---

## Task 8: Smoke test end-to-end

- [ ] **Step 1: Run all migrations against your local Postgres**

```bash
psql "$DATABASE_URL" -f server/migrations/001_create_pdf_templates.sql
psql "$DATABASE_URL" -f server/migrations/002_create_template_versions.sql
psql "$DATABASE_URL" -f server/migrations/003_create_filled_submissions.sql
psql "$DATABASE_URL" -f server/migrations/004_create_generated_pdfs.sql
```

- [ ] **Step 2: Start the server**

```bash
cd server
npm run dev
```

Expected: `Connected to PostgreSQL` logged, no errors.

- [ ] **Step 3: Create a template**

```bash
curl -s -X POST http://localhost:3004/templates \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Template"}' | jq .
```

Expected: JSON with `id`, `name`, `current_version: 1`.

- [ ] **Step 4: Create a version for that template**

Use the `id` from the previous step (replace `<TEMPLATE_ID>`):

```bash
curl -s -X POST http://localhost:3004/templates/<TEMPLATE_ID>/versions \
  -H "Content-Type: application/json" \
  -d '{
    "schema": {
      "basePdf": {"width": 210, "height": 297, "padding": [0,0,0,0]},
      "schemas": [[{"name": "field1", "type": "text", "position": {"x":10,"y":10}, "width": 100, "height": 10}]]
    }
  }' | jq .
```

Expected: JSON with `version: 2` (1 was the initial default, this increments to 2).

- [ ] **Step 5: Generate a PDF and confirm submission + generated_pdf rows created**

```bash
curl -s -X POST http://localhost:3004/api/generate-pdf \
  -H "Content-Type: application/json" \
  -d "{\"template_id\": \"<TEMPLATE_ID>\", \"inputs\": [{\"field1\": \"Hello\"}]}" \
  --output /tmp/test.pdf

# Confirm rows written
psql "$DATABASE_URL" -c "SELECT id, template_version, submitted_at FROM filled_submissions ORDER BY submitted_at DESC LIMIT 1;"
psql "$DATABASE_URL" -c "SELECT id, file_path, file_size_bytes, generated_at FROM generated_pdfs ORDER BY generated_at DESC LIMIT 1;"
```

Expected: both queries return one row each.

- [ ] **Step 6: Commit**

```bash
git add -p   # review any remaining changes
git commit -m "chore: verify pg migration smoke test passes"
```

---

## Notes

- **Version number logic:** `current_version` starts at 1 on the template row. `createTemplateVersion()` increments it first (to 2, 3, …) before inserting the version row. This means version 1 on `pdf_templates` is a placeholder — the first real schema version is 2. If you want version 1 to be the first schema, seed an initial version row during `createTemplate()`.
- **File storage:** `file_path` is set to `'generated-in-memory'` until a file storage layer (disk, S3, Azure) is added. Update `createGeneratedPdf()` call site when that is implemented.
- **Old migration files:** `server/migrations/001_create_templates.sql` and `002_create_filled_pdfs.sql` are the old Postgres files from before the MSSQL migration. They are superseded by the new `001–004` files. Delete them or rename to `.bak` to avoid confusion.

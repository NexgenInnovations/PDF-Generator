# Company Assets Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared, company-wide library of uploadable image assets (logos, PNG/JPEG/SVG) with real filesystem storage, a browsable management page, and a picker usable from the Template Designer to insert a chosen asset as a new image field.

**Architecture:** Server: a new `company_assets` MSSQL table (metadata) + a new `server/assets/` directory (file bytes) + a new Express router using `multer` for multipart upload, following this codebase's existing `db.ts` CRUD conventions and route-file conventions exactly. Client: a new `/assets` page (role-gated like `/templates/new`), a new reusable `AssetPicker` modal, and a new "Pick from Assets" toolbar button in the Designer that inserts a chosen asset as a pdfme `image` schema field with base64 content — a one-time bake-in, not a live reference.

**Tech Stack:** Node.js + Express + TypeScript + MSSQL (`mssql` package) + `multer` (new dependency, multipart file upload) on the server; React 18 + TypeScript on the client. No test runner exists in either `client/` or `server/` — verification is manual: typecheck plus live server/browser testing.

## Global Constraints

- Assets are shared/global — no per-user scoping, no auth changes.
- Accepted file types: `image/png`, `image/jpeg`, `image/svg+xml` only — validated server-side by MIME type before accepting an upload.
- Files are stored on disk under `server/assets/`, named by a generated UUID + original extension (avoids collisions; the `company_assets.id` — an MSSQL `UNIQUEIDENTIFIER` generated via `NEWID()` at INSERT time — is NOT reused as the filename, since the filename must be known before the INSERT completes in order to write the file first, then record its path).
- `company_assets` table columns and conventions mirror the existing `generated_pdfs` table exactly: `id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID()`, `NVARCHAR`/`BIGINT`/`DATETIME2 DEFAULT GETUTCDATE()` typing, `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES ...)` guard in `ensureTables()`.
- Deleting an asset removes the DB row and the on-disk file — it has zero effect on any template that already picked and embedded that asset's base64 content (no live reference exists after pick-time).
- `name` is display metadata only, not a unique key — no uniqueness validation needed.
- pdfme's own `image` schema plugin (`packages/schemas/src/graphics/image.ts`) is not modified — this feature is fully additive, producing the same kind of `image`-type schema field pdfme's own upload UI produces, just via a different UI entry point.
- No changes to any existing table, route, or the PDF generation pipeline (`server/src/services/pdfService.ts`).

---

## File Structure

- **Modify:** `server/src/db.ts` — add `company_assets` table to `ensureTables()`, add `CompanyAssetRow` type and CRUD functions (`listAssets`, `createAsset`, `deleteAsset`, `getAsset`).
- **Create:** `server/src/routes/assets.ts` — new Express router: `POST /assets` (multipart upload via `multer`), `GET /assets` (list), `GET /assets/:id/file` (serve raw bytes), `DELETE /assets/:id` (remove row + file).
- **Modify:** `server/src/index.ts` — mount the new `assetsRouter` at `/assets`.
- **Modify:** `server/package.json` — add `multer` + `@types/multer` dependencies.
- **Modify:** `client/src/lib/api.ts` — add asset-related types and `api.listAssets`/`api.uploadAsset`/`api.deleteAsset`/asset file URL helper.
- **Modify:** `client/src/types.ts` — add `AssetRecord` type.
- **Create:** `client/src/pages/Assets.tsx` — the asset library management page.
- **Create:** `client/src/components/AssetPicker.tsx` — reusable picker modal.
- **Modify:** `client/src/App.tsx` — add the `/assets` route (role-gated).
- **Modify:** `client/src/components/layout/Sidebar.tsx` — add the "Assets" nav item.
- **Modify:** `client/src/pages/TemplateDesigner.tsx` — add "Pick from Assets" toolbar button + insert-as-image-field handler.

---

### Task 1: Server — `company_assets` table, storage directory, and CRUD

**Files:**
- Modify: `server/src/db.ts`
- Modify: `server/package.json`

**Interfaces:**
- Produces (for Task 2 to consume):
  ```ts
  export interface CompanyAssetRow {
    id: string;
    name: string;
    file_path: string;
    mime_type: string;
    file_size_bytes: number;
    created_at: string;
  }
  export async function listAssets(): Promise<CompanyAssetRow[]>
  export async function getAsset(id: string): Promise<CompanyAssetRow | null>
  export async function createAsset(input: { name: string; filePath: string; mimeType: string; fileSizeBytes: number }): Promise<CompanyAssetRow>
  export async function deleteAsset(id: string): Promise<CompanyAssetRow | null>
  ```
  `deleteAsset` returns the deleted row (so Task 2's route handler can read `file_path` to also delete the on-disk file) or `null` if no row existed with that id — mirrors the `OUTPUT DELETED.*` pattern needed for this, distinct from `deleteTemplate`'s existing void-returning delete (which doesn't need the deleted row's data).

- [ ] **Step 1: Add `multer` dependency**

Read `server/package.json` first to confirm its current exact contents (dependencies are alphabetically ordered in this file), then add to `dependencies`:
```json
"multer": "^2.2.0",
```
and to `devDependencies`:
```json
"@types/multer": "^2.2.0",
```
inserted alphabetically among the existing entries in each block.

Run: `cd server && npm install`
Expected: installs cleanly, `node_modules/multer` and `node_modules/@types/multer` present.

- [ ] **Step 2: Add the `company_assets` table to `ensureTables()`**

Read the current `server/src/db.ts` in full first (556+ lines, may have shifted slightly) to find the exact end of `ensureTables()` (currently ends with the `generated_pdfs` table creation followed by `console.log('Tables ready');` and the closing `}`). Insert a new table-creation block immediately before the `console.log('Tables ready');` line:

```ts
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'company_assets')
    CREATE TABLE company_assets (
      id               UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      name             NVARCHAR(255)    NOT NULL,
      file_path        NVARCHAR(1000)   NOT NULL,
      mime_type        NVARCHAR(100)    NOT NULL,
      file_size_bytes  BIGINT           NOT NULL,
      created_at       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
```

- [ ] **Step 3: Add the `CompanyAssetRow` type and CRUD functions**

Find the `// ─── Types ───` section (where `TemplateRow`, `TemplateVersionRow`, etc. are defined) and add:

```ts
export interface CompanyAssetRow {
  id: string;
  name: string;
  file_path: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
}
```

At the end of the file (after the last existing CRUD section, e.g. after the `generated_pdfs` functions), add a new section:

```ts
// ─── company_assets ──────────────────────────────────────────────────────────

export async function listAssets(): Promise<CompanyAssetRow[]> {
  const result = await getPool().request().query(
    'SELECT id, name, file_path, mime_type, file_size_bytes, created_at FROM company_assets ORDER BY created_at DESC'
  );
  return result.recordset;
}

export async function getAsset(id: string): Promise<CompanyAssetRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('SELECT id, name, file_path, mime_type, file_size_bytes, created_at FROM company_assets WHERE id = @id');
  return result.recordset[0] ?? null;
}

export async function createAsset(input: {
  name: string;
  filePath: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<CompanyAssetRow> {
  const result = await getPool()
    .request()
    .input('name', sql.NVarChar(255), input.name)
    .input('file_path', sql.NVarChar(1000), input.filePath)
    .input('mime_type', sql.NVarChar(100), input.mimeType)
    .input('file_size_bytes', sql.BigInt, input.fileSizeBytes)
    .query(`
      INSERT INTO company_assets (name, file_path, mime_type, file_size_bytes)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.file_path, INSERTED.mime_type,
             INSERTED.file_size_bytes, INSERTED.created_at
      VALUES (@name, @file_path, @mime_type, @file_size_bytes)
    `);
  return result.recordset[0];
}

export async function deleteAsset(id: string): Promise<CompanyAssetRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`
      DELETE FROM company_assets
      OUTPUT DELETED.id, DELETED.name, DELETED.file_path, DELETED.mime_type,
             DELETED.file_size_bytes, DELETED.created_at
      WHERE id = @id
    `);
  return result.recordset[0] ?? null;
}
```

- [ ] **Step 4: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Start the server (`cd server && npm run dev`, on an alternate port if 3004 is in use by another process — verify via `ps -p <pid> -o command` before assuming it's safe to reuse). Confirm the log shows `Connected to MSSQL` / `Tables ready` with no errors (confirms the new `CREATE TABLE` statement is valid MSSQL syntax and ran without error against the real database). If you have DB query access, optionally confirm the `company_assets` table now exists with `SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'company_assets'` — otherwise, a clean "Tables ready" log with no thrown error is sufficient evidence the table was created successfully (MSSQL's `IF NOT EXISTS` guard means a malformed `CREATE TABLE` would throw immediately on this startup, which did not happen).

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts server/package.json server/package-lock.json
git commit -m "feat(server): add company_assets table and CRUD functions"
```

---

### Task 2: Server — asset upload/list/serve/delete routes

**Files:**
- Create: `server/src/routes/assets.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `listAssets`, `getAsset`, `createAsset`, `deleteAsset`, `CompanyAssetRow` from `../db.js` (Task 1).
- Produces: mounted router `assetsRouter` at `/assets`, exposing:
  - `POST /assets` — multipart, fields: `file` (the image), `name` (string). Returns `201` with the created `CompanyAssetRow` as JSON, or `400` for missing/invalid file type.
  - `GET /assets` — returns `200` with `CompanyAssetRow[]` as JSON.
  - `GET /assets/:id/file` — streams the raw file with the correct `Content-Type`, or `404` if not found.
  - `DELETE /assets/:id` — `204` on success, `404` if not found.
  These exact shapes are what Task 3 (client `api.ts`) will call.

- [ ] **Step 1: Create the `server/assets/` storage directory placeholder**

Run:
```bash
mkdir -p server/assets
touch server/assets/.gitkeep
```

Check `server/.gitignore` (or the repo root `.gitignore` if `server/` has none) for an existing pattern like `outputs/` — if `server/outputs/` (or similar) is already gitignored, add `server/assets/*` with a `!server/assets/.gitkeep` exception following the same convention. If no such precedent exists, add:
```
server/assets/*
!server/assets/.gitkeep
```
to `server/.gitignore` (create the file if it doesn't exist) — uploaded asset files must never be committed to git.

- [ ] **Step 2: Create the assets route**

```ts
// server/src/routes/assets.ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listAssets, getAsset, createAsset, deleteAsset } from '../db.js';

export const assetsRouter = Router();

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/svg+xml': '.svg',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * @openapi
 * /assets:
 *   post:
 *     summary: Upload a company asset (logo/image)
 *     tags: [Company Assets]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, name]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: The created asset
 *       400:
 *         description: Missing file, missing name, or unsupported file type
 */
assetsRouter.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  const name = (req.body as { name?: string }).name;

  if (!file) {
    res.status(400).json({ error: 'file is required' });
    return;
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const ext = ALLOWED_MIME_TYPES[file.mimetype];
  if (!ext) {
    res.status(400).json({ error: `Unsupported file type: ${file.mimetype}. Allowed: PNG, JPEG, SVG.` });
    return;
  }

  const filename = `${randomUUID()}${ext}`;
  const filePath = path.join(ASSETS_DIR, filename);

  try {
    await fs.mkdir(ASSETS_DIR, { recursive: true });
    await fs.writeFile(filePath, file.buffer);

    const asset = await createAsset({
      name: name.trim(),
      filePath,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
    });
    res.status(201).json(asset);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /assets:
 *   get:
 *     summary: List all company assets
 *     tags: [Company Assets]
 *     responses:
 *       200:
 *         description: All assets (metadata only)
 */
assetsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const assets = await listAssets();
    res.json(assets);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /assets/{id}/file:
 *   get:
 *     summary: Download the raw file for an asset
 *     tags: [Company Assets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The raw file bytes
 *       404:
 *         description: Asset not found
 */
assetsRouter.get('/:id/file', async (req: Request, res: Response) => {
  try {
    const asset = await getAsset(req.params.id);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    const bytes = await fs.readFile(asset.file_path);
    res.setHeader('Content-Type', asset.mime_type);
    res.send(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /assets/{id}:
 *   delete:
 *     summary: Delete a company asset
 *     tags: [Company Assets]
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
 *       404:
 *         description: Asset not found
 */
assetsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await deleteAsset(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    try {
      await fs.unlink(deleted.file_path);
    } catch (fileErr) {
      console.warn(`Could not delete asset file at ${deleted.file_path}:`, fileErr);
    }
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});
```

Note: `multer.memoryStorage()` (buffering the whole file in memory, not `multer.diskStorage()`) is used because these are small logo-sized images (10MB cap) and this keeps the file-naming/extension logic in one place (this route handler) rather than split across a multer `diskStorage` filename callback and the route body — simpler to reason about for this scale. The 10MB `limits.fileSize` is a reasonable ceiling for a logo/image asset library (well above typical PNG/JPEG/SVG logo sizes) and independent of the unrelated 25mb JSON body limit used by the AI-vision route (`server/src/index.ts`'s `/ai-form/detect-from-pdf` — that limit is for base64-JSON payloads, not multipart file uploads, and multer's `limits.fileSize` is enforced separately from Express's `express.json()` body limit).

The file-deletion failure inside `DELETE /:id` is caught and logged but does NOT fail the request — the DB row is already gone by that point (matching the spec's "deleting only affects the library, never breaks anything downstream" principle: a leftover orphaned file on disk is a harmless cleanup gap, not a correctness issue, and shouldn't block the user from completing the delete they asked for).

- [ ] **Step 3: Mount the route in `server/src/index.ts`**

Read the current `server/src/index.ts` in full first (it has some non-obvious body-limit-ordering logic from prior work — do not disturb the existing `/ai-form/detect-from-pdf` / `/ai-form` mounting order). Add the import:
```ts
import { assetsRouter } from './routes/assets.js';
```
and mount it alongside the other routers (e.g. after `app.use('/generate-pdf', generatePdfRouter);`):
```ts
app.use('/assets', assetsRouter);
```

This route does NOT need `express.json()` for its `POST /assets` handler (multipart bodies are parsed by `multer`, not `express.json()`), so no body-limit interaction with the existing `/ai-form` routes' careful ordering — this mount can go in the normal `app.use(...)` block alongside `/templates`, `/generate-pdf`, `/ai-form` without needing to precede the global `express.json()` call.

- [ ] **Step 4: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Start the server (alternate port if needed, confirm process ownership before reusing/killing anything on a port). Run:
```bash
# Create a tiny real PNG for testing (1x1 transparent pixel)
python3 -c "
import base64
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
open('/tmp/test-asset.png', 'wb').write(png)
"

curl -s -X POST http://localhost:3004/assets -F "file=@/tmp/test-asset.png" -F "name=Test Logo" -w "\nHTTP %{http_code}\n"
```
Expected: `201` with a JSON body containing `id`, `name: "Test Logo"`, `file_path`, `mime_type: "image/png"`, `file_size_bytes`, `created_at`.

```bash
curl -s http://localhost:3004/assets -w "\nHTTP %{http_code}\n"
```
Expected: `200` with an array containing the just-created asset.

```bash
ASSET_ID="<id from the create response above>"
curl -s -o /tmp/downloaded-asset.png http://localhost:3004/assets/$ASSET_ID/file -w "HTTP %{http_code}\n"
diff /tmp/test-asset.png /tmp/downloaded-asset.png && echo "FILE MATCHES"
```
Expected: `200`, and the downloaded file is byte-identical to the uploaded one.

```bash
curl -s -X DELETE http://localhost:3004/assets/$ASSET_ID -w "\nHTTP %{http_code}\n"
curl -s http://localhost:3004/assets/$ASSET_ID/file -w "\nHTTP %{http_code}\n"
```
Expected: `204` on delete, then `404` confirming the file is genuinely gone (both the DB row via `getAsset` returning null, AND — separately — spot-check the actual file no longer exists on disk with `ls server/assets/`).

Also test rejection: `curl -X POST http://localhost:3004/assets -F "file=@server/package.json" -F "name=bad" -w "\nHTTP %{http_code}\n"` (uploading a non-image file) → expect `400` with the unsupported-file-type message.

Clean up: `rm -f /tmp/test-asset.png /tmp/downloaded-asset.png`. Kill the server process you started (verify PID ownership first).

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/assets.ts server/src/index.ts server/.gitignore server/assets/.gitkeep
git commit -m "feat(server): add company assets upload/list/serve/delete routes"
```

---

### Task 3: Client — API client methods, types, and Assets management page

**Files:**
- Modify: `client/src/lib/api.ts`
- Modify: `client/src/types.ts`
- Create: `client/src/pages/Assets.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: Task 2's routes (`POST /assets`, `GET /assets`, `GET /assets/:id/file`, `DELETE /assets/:id`).
- Produces:
  ```ts
  // client/src/types.ts
  export interface AssetRecord {
    id: string;
    name: string;
    mime_type: string;
    file_size_bytes: number;
    created_at: string;
  }
  // client/src/lib/api.ts
  export const api = {
    // ...existing...
    listAssets: () => Promise<AssetRecord[]>,
    uploadAsset: (file: File, name: string) => Promise<AssetRecord>,
    deleteAsset: (id: string) => Promise<void>,
    assetFileUrl: (id: string) => string,
  };
  ```
  `assetFileUrl` is consumed by both this task (for `<img>` thumbnails) and Task 4 (`AssetPicker`, for both thumbnails and fetching-to-base64).

- [ ] **Step 1: Add `AssetRecord` type**

In `client/src/types.ts`, add (note: deliberately omits `file_path`, since that's a server filesystem detail the client never needs):

```ts
export interface AssetRecord {
  id: string;
  name: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
}
```

- [ ] **Step 2: Add API client methods**

Read the current `client/src/lib/api.ts` in full first to confirm the exact current shape of the `request<T>` helper and `API_BASE` constant (both already exist and are reused, not redefined). Add the import:
```ts
import type { AssetRecord } from "../types.js";
```
(add `AssetRecord` to the existing `import type { TemplateRecord, TemplateSummary, PublishedVersionSummary } from "../types.js";` line instead of a separate import statement, if that's how the existing imports are structured — check the current file).

Add to the `api` object (the `request<T>` helper only supports JSON bodies, so `uploadAsset` uses `fetch` directly, matching the existing precedent set by `createFilledPdf`, which also bypasses `request<T>` for a non-standard response type):

```ts
  listAssets: () => request<AssetRecord[]>("/assets"),

  uploadAsset: async (file: File, name: string): Promise<AssetRecord> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name);
    const res = await fetch(API_BASE + "/assets", { method: "POST", body: formData });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${text}`);
    }
    return res.json() as Promise<AssetRecord>;
  },

  deleteAsset: (id: string) => request<void>(`/assets/${id}`, { method: "DELETE" }),

  assetFileUrl: (id: string) => `${API_BASE}/assets/${id}/file`,
```

Place these as a new block after the existing `aiDetectFieldsFromPdf` method, before the closing `};` of the `api` object.

Note: `FormData` uploads must NOT set a `Content-Type` header manually — the browser sets the correct `multipart/form-data; boundary=...` header automatically when `fetch`'s `body` is a `FormData` instance. Do not add `headers: { "Content-Type": ... }` to this fetch call.

- [ ] **Step 3: Create the Assets page**

```tsx
// client/src/pages/Assets.tsx
import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import type { AssetRecord } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';

export default function Assets() {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = () => {
    setLoading(true);
    api.listAssets()
      .then(setAssets)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      await api.uploadAsset(file, file.name);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteAsset(id);
      setAssets(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <AppLayout>
      <TopBar title="Assets" />
      <div className="p-6 space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm" style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}>
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--nx-ink-secondary)' }}>
            {assets.length} asset{assets.length === 1 ? '' : 's'}
          </p>
          <Button onClick={handleUploadClick} disabled={uploading}>
            <Upload className="h-4 w-4 mr-1.5" />
            {uploading ? 'Uploading…' : 'Upload asset'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>Loading…</p>
        ) : assets.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>No assets uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {assets.map(asset => (
              <Card key={asset.id} className="p-3 space-y-2">
                <div
                  className="flex items-center justify-center rounded-[var(--nx-radius-sm)] overflow-hidden"
                  style={{ background: 'var(--nx-surface)', aspectRatio: '1 / 1' }}
                >
                  <img
                    src={api.assetFileUrl(asset.id)}
                    alt={asset.name}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <p className="text-xs font-medium truncate" style={{ color: 'var(--nx-ink)' }} title={asset.name}>
                  {asset.name}
                </p>
                <button
                  onClick={() => handleDelete(asset.id)}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: 'var(--nx-destructive)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
```

Verified against the real source: `TopBar` (`client/src/components/layout/TopBar.tsx`) takes `{ title: string; ctaLabel?: string; onCtaClick?: () => void; className?: string }`, so `<TopBar title="Assets" />` above is correct as written. `Card` (`client/src/components/ui/card.tsx`) forwards standard `React.HTMLAttributes<HTMLDivElement>` (including `className`), and `Button` (`client/src/components/ui/button.tsx`) is a `cva`-based component accepting standard button props (`disabled`, `onClick`, children) — both used correctly above. No adjustment needed; write the file as shown.

- [ ] **Step 4: Add the `/assets` route**

In `client/src/App.tsx`, add the lazy import:
```tsx
const Assets = lazy(() => import('./pages/Assets.js'));
```
and a new route, following the same `RoleGuard` pattern as `/templates/new`:
```tsx
<Route
  path="/assets"
  element={
    <RoleGuard allowed={['Admin', 'Designer']}>
      <Assets />
    </RoleGuard>
  }
/>
```

- [ ] **Step 5: Add the "Assets" nav item**

In `client/src/components/layout/Sidebar.tsx`, add an icon import (e.g. `Image` from `lucide-react`, alongside the existing `LayoutDashboard, FileText, PlusCircle, Settings, LogOut` imports) and a new `NavItem`, placed after the existing "New Template" nav item (inside the same `{(role === 'Admin' || role === 'Designer') && (...)}` conditional block, or as its own separately-gated block using the same condition):

```tsx
{(role === 'Admin' || role === 'Designer') && (
  <NavItem to="/assets" icon={<Image className="h-4 w-4" />} label="Assets" />
)}
```

- [ ] **Step 6: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Start both server and client dev servers (alternate ports if needed, confirm process ownership before reusing any port). If a browser is available:
1. Navigate to `/assets` (as Admin or Designer role — check how role-switching works in this app's dev UI, likely via the role switcher visible in `Sidebar.tsx`'s footer). Confirm the page loads with "No assets uploaded yet."
2. Click "Upload asset", select a real PNG/JPEG file. Confirm it appears in the grid with a visible thumbnail and correct name.
3. Click "Delete" on that asset. Confirm it disappears from the grid.
4. Try uploading a non-image file (e.g. a `.txt` renamed to have no extension, or directly select a `.pdf`) if the file picker's `accept` filter can be bypassed, or use `curl` to attempt an invalid upload directly against the server and confirm the client's error banner would display the server's rejection message correctly if triggered through the UI (the `accept` attribute is a UI hint only, not a security boundary — Task 2's server-side MIME validation is the actual guard).

If no browser is available, perform a careful code-path walkthrough (upload success/failure, delete success/failure, empty-state rendering) and describe it in detail in your report.

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/api.ts client/src/types.ts client/src/pages/Assets.tsx client/src/App.tsx client/src/components/layout/Sidebar.tsx
git commit -m "feat(assets): add Assets management page and API client"
```

---

### Task 4: Client — AssetPicker modal and Designer integration

**Files:**
- Create: `client/src/components/AssetPicker.tsx`
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- Consumes: `api.listAssets`, `api.assetFileUrl` from `../lib/api.js` (Task 3); `AssetRecord` from `../types.js` (Task 3).
- Produces:
  ```tsx
  export default function AssetPicker(props: {
    onSelect: (dataUrl: string) => void;
    onClose: () => void;
  }): JSX.Element
  ```
  Consumed by `TemplateDesigner.tsx` in this same task. `onSelect` receives a base64 data URL (`data:image/png;base64,...` etc.) ready to drop directly into a pdfme `image` schema's `content` field — the picker itself fetches the chosen asset's raw bytes and does the base64 conversion before calling `onSelect`, so the caller never has to know about asset IDs or fetch URLs.

- [ ] **Step 1: Create the picker component**

```tsx
// client/src/components/AssetPicker.tsx
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import type { AssetRecord } from '../types.js';

async function fetchAssetAsDataUrl(id: string, mimeType: string): Promise<string> {
  const res = await fetch(api.assetFileUrl(id));
  if (!res.ok) throw new Error(`Failed to fetch asset: ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default function AssetPicker(props: {
  onSelect: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const { onSelect, onClose } = props;
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    api.listAssets()
      .then(setAssets)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const handlePick = async (asset: AssetRecord) => {
    setSelectingId(asset.id);
    setError(null);
    try {
      const dataUrl = await fetchAssetAsDataUrl(asset.id, asset.mime_type);
      onSelect(dataUrl);
    } catch (err) {
      setError((err as Error).message);
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
          width: '640px', maxWidth: '90vw', maxHeight: '80vh',
          background: '#fff',
          border: '1px solid #e6e6e6',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>Pick from Assets</span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 16, overflow: 'auto' }}>
          {error && (
            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{error}</div>
          )}
          {loading ? (
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 13 }}>Loading…</div>
          ) : assets.length === 0 ? (
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 13 }}>
              No assets uploaded yet. Upload one from the Assets page first.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {assets.map(asset => (
                <button
                  key={asset.id}
                  onClick={() => handlePick(asset)}
                  disabled={selectingId !== null}
                  style={{
                    border: '1px solid #e6e6e6', borderRadius: 12, padding: 8,
                    background: 'transparent', cursor: selectingId ? 'wait' : 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
                    opacity: selectingId && selectingId !== asset.id ? 0.5 : 1,
                  }}
                >
                  <div style={{
                    width: '100%', aspectRatio: '1 / 1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#f7f7f5', borderRadius: 8, overflow: 'hidden',
                  }}>
                    <img
                      src={api.assetFileUrl(asset.id)}
                      alt={asset.name}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.70)', textAlign: 'center', wordBreak: 'break-word' }}>
                    {selectingId === asset.id ? 'Loading…' : asset.name}
                  </span>
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
Expected: no errors (this file only depends on Task 3's already-typechecked `api.ts`/`types.ts`).

- [ ] **Step 3: Wire into `TemplateDesigner.tsx`**

Read the current `client/src/pages/TemplateDesigner.tsx` in full before editing. Add the import (alongside the other component imports like `AskAiPanel`, `HeaderFooterEditor`, `ApiPayloadModal`):
```tsx
import AssetPicker from '../components/AssetPicker.js';
```

Add new state alongside the existing modal-open booleans (e.g. near `apiPayloadOpen`):
```tsx
const [assetPickerOpen, setAssetPickerOpen] = useState(false);
```

Add a handler function (placed near the other `handle*` functions in this file) that inserts a new image field onto the current page:

```tsx
const handleAssetPicked = (dataUrl: string) => {
  if (!designerRef.current) return;
  const t = designerRef.current.getTemplate();
  const pageIndex = designerRef.current.getPageCursor?.() ?? 0;
  const schemas = t.schemas.map((page, i) =>
    i === pageIndex
      ? [
          ...page,
          {
            name: `image_${Date.now()}`,
            type: 'image',
            content: dataUrl,
            position: { x: 20, y: 20 },
            width: 40,
            height: 40,
          },
        ]
      : page
  );
  designerRef.current.updateTemplate({ ...t, schemas });
  setTemplateVersion(v => v + 1);
  setAssetPickerOpen(false);
};
```

Add a new toolbar button (alongside the existing "Change PDF"/"Ask AI" `ToolbarBtn`s — find their exact current JSX location and add this one in the same toolbar group):
```tsx
<ToolbarBtn icon={<ImageIcon size={13} />} label="Pick from Assets" onClick={() => setAssetPickerOpen(true)} />
```
(add `Image as ImageIcon` to this file's existing `lucide-react` import line — aliased to avoid colliding with the DOM global `Image` constructor, since this file may reference `Image` elsewhere for unrelated reasons; verify no collision exists before deciding whether the alias is actually necessary, but using it is always safe).

Add the modal's conditional render near the other modals (`aiOpen && <AskAiPanel .../>`, `apiPayloadOpen && <ApiPayloadModal .../>`, etc.):
```tsx
{assetPickerOpen && (
  <AssetPicker
    onSelect={handleAssetPicked}
    onClose={() => setAssetPickerOpen(false)}
  />
)}
```

Important: before finalizing `handleAssetPicked`, verify `designerRef.current`'s actual TypeScript type (`Designer` from `@pdfme/ui`) really exposes a way to know which page is currently being viewed/edited (the `getPageCursor?.()` call above is a guess at a possible API — check `packages/ui/src`'s `Designer` class for an actual method or property that exposes the current page index; if no such API exists, default to inserting onto page `0` unconditionally instead, i.e. `pageIndex = 0` with no `getPageCursor` call at all — simpler and still correct per the spec, which only requires inserting "onto the current page" as a nice-to-have, not "onto page 0 unconditionally" as a hard requirement, so prefer the page-aware version if a real API exists, and fall back to always-page-0 if it doesn't rather than inventing a non-existent method call that would fail typecheck).

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. If Step 3's `getPageCursor` guess doesn't typecheck, apply the documented fallback (page `0` unconditionally) and re-run.

- [ ] **Step 5: Manual verification**

Start both server and client dev servers (alternate ports if needed). If a browser is available:
1. Upload at least one asset via `/assets` first (per Task 3's verification).
2. Open the Designer (`/templates/new`), click "Pick from Assets". Confirm the picker modal shows the uploaded asset(s) with thumbnails.
3. Click an asset. Confirm the modal closes and a new image field appears on the canvas at the default position, showing the picked image.
4. Confirm the inserted field behaves like any normal pdfme image field afterward (draggable/resizable in the canvas) — this requires no special code since it's a real image schema field, just visual confirmation.
5. Delete the asset from `/assets` (per Task 3) and confirm the ALREADY-INSERTED image field in the template from step 3 is completely unaffected (still visible, still there) — this is the core "bake-in, not live reference" guarantee from the spec.

If no browser is available, perform a careful code-path walkthrough and describe it in detail in your report.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/AssetPicker.tsx client/src/pages/TemplateDesigner.tsx
git commit -m "feat(designer): add Pick from Assets picker and insert-as-image-field"
```

---

## Self-Review Notes

- **Spec coverage:** Every behavior in `docs/superpowers/specs/2026-07-30-company-assets-library-design.md` is covered — shared/global ownership (no auth/role scoping beyond the existing Admin/Designer route-gating already used for template creation), PNG/JPEG/SVG-only validation (Task 2's `ALLOWED_MIME_TYPES` map), filesystem storage with DB metadata (Task 1's table + Task 2's `fs.writeFile`/`fs.readFile`/`fs.unlink`), the Assets management page with upload/delete (Task 3), the reusable picker returning base64 (Task 4), Designer integration via a new separate toolbar button rather than modifying pdfme's own image plugin (Task 4), bake-in-not-live-reference semantics (Task 4's `handleAssetPicked` copies the data URL directly into the schema, with no asset ID retained anywhere in the template), and delete-has-no-effect-on-existing-templates (implicit — no reference exists to break, verified explicitly in Task 4 Step 5's manual verification).
- **Placeholder scan:** No TBD/TODO; all four tasks contain complete code. Task 4 Step 3 has one explicitly-flagged uncertainty (the `getPageCursor` API's real existence) with a concrete, typecheck-safe fallback instruction rather than a vague "figure it out" — this is a deliberate, bounded uncertainty about a third-party library's exact API surface, not a plan gap.
- **Type consistency:** `CompanyAssetRow` (Task 1) → `AssetRecord` (Task 3) intentionally drop `file_path` at the API boundary (server-internal detail); all other fields (`id`, `name`, `mime_type`, `file_size_bytes`, `created_at`) match exactly in name and type across `db.ts` → `assets.ts` route responses → `api.ts` → `types.ts` → `Assets.tsx`/`AssetPicker.tsx` usage. `AssetPicker`'s `onSelect: (dataUrl: string) => void` matches exactly how `TemplateDesigner.tsx`'s `handleAssetPicked(dataUrl: string)` is passed as that prop in Task 4 Step 3.
- **Task ordering:** Task 1 → Task 2 (needs Task 1's CRUD functions) → Task 3 (needs Task 2's routes) → Task 4 (needs Task 3's `api.ts`/`types.ts`) — strictly sequential, no parallelization possible.
- **Correction from spec:** the spec described `server/assets/` as storage "parallel to the existing `server/outputs/` convention" — research during planning confirmed `server/outputs/` and its DB precedent (`generated_pdfs.file_path`) are actually **never used** in current code (`filledPdfs.ts` always writes the literal string `'generated-in-memory'`, PDFs are streamed in-memory and never touch disk). This plan's Task 1/2 still follow the *column-naming and table-structure* conventions from `generated_pdfs` (which are real, working conventions), but does NOT assume any working filesystem-writing code already exists to copy from — Task 2 Step 2 implements `fs.writeFile`/`fs.readFile`/`fs.unlink` from scratch, correctly treating this as new infrastructure rather than reuse of a precedent that turned out not to actually function.

# MSSQL + Docker + Generate-PDF API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace JSON file storage with MSSQL (VRentsTest), add a single `POST /api/generate-pdf` endpoint that returns PDF bytes, and containerise the server with Docker.

**Architecture:** The Express server's storage layer (`storage.ts`) is replaced by an MSSQL connection pool in `db.ts` using the `mssql` npm package. The `filledPdfs` route is removed entirely; PDF generation now returns binary directly. A `Dockerfile` + `docker-compose.yml` containerise the server, connecting to the external MSSQL host via env vars.

**Tech Stack:** Node 20, TypeScript, Express, `mssql` (SQL Server driver), Docker + docker-compose, pdfme generator

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| **Replace** | `server/src/db.ts` | MSSQL pool init + all CRUD functions (replaces both old `db.ts` and `storage.ts`) |
| **Replace** | `server/src/services/pdfService.ts` | Generate PDF → return `Buffer` (no disk write) |
| **Replace** | `server/src/routes/filledPdfs.ts` | Single `POST /api/generate-pdf` route returning PDF binary |
| **Modify** | `server/src/routes/templates.ts` | Update import from `../storage.js` → `../db.js` |
| **Modify** | `server/src/index.ts` | Call `initDb()` on startup, mount new route at `/api`, remove outputs dir creation |
| **Modify** | `server/src/swagger.ts` | Remove FilledPdfRecord schema, add generate-pdf endpoint doc |
| **Delete** | `server/src/storage.ts` | Replaced by `db.ts` |
| **Create** | `server/Dockerfile` | Node 20 Alpine image, build + run server |
| **Create** | `docker-compose.yml` | Single service, port 3004, env_file |
| **Create** | `.env.example` | Placeholder credentials (committed) |
| **Create** | `.env` | Real credentials (gitignored) |
| **Modify** | `server/package.json` | Add `mssql` + `@types/mssql`, remove `pg` + `@types/pg` |
| **Modify** | `.gitignore` | Add `.env` |

---

## Task 1: Install mssql, remove pg

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install mssql and remove pg**

```bash
cd server
npm install mssql
npm remove pg
npm install --save-dev @types/mssql
npm remove @types/pg
```

- [ ] **Step 2: Verify package.json has mssql and no pg**

```bash
grep -E '"mssql|"pg"' package.json
```
Expected output: only `"mssql"` lines, no `"pg"` lines.

- [ ] **Step 3: Commit**

```bash
cd ..
git add server/package.json server/package-lock.json
git commit -m "chore(server): swap pg for mssql driver"
```

---

## Task 2: Replace db.ts with MSSQL pool + CRUD

**Files:**
- Replace: `server/src/db.ts`
- Delete: `server/src/storage.ts`

- [ ] **Step 1: Replace server/src/db.ts entirely**

```typescript
// server/src/db.ts
import sql from 'mssql';

const config: sql.config = {
  server: process.env.DB_SERVER ?? '',
  port: Number(process.env.DB_PORT ?? 1433),
  database: process.env.DB_NAME ?? '',
  user: process.env.DB_USER ?? '',
  password: process.env.DB_PASSWORD ?? '',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
  },
  pool: {
    min: Number(process.env.DB_POOL_MIN ?? 2),
    max: Number(process.env.DB_POOL_MAX ?? 10),
  },
};

let pool: sql.ConnectionPool | null = null;

export async function initDb(): Promise<void> {
  pool = await new sql.ConnectionPool(config).connect();
  console.log('Connected to MSSQL');

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'pdf_templates'
    )
    CREATE TABLE pdf_templates (
      id         UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      name       NVARCHAR(255)    NOT NULL,
      schema     NVARCHAR(MAX)    NOT NULL,
      created_at DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      updated_at DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('pdf_templates table ready');
}

function getPool(): sql.ConnectionPool {
  if (!pool) throw new Error('DB not initialised — call initDb() first');
  return pool;
}

export interface TemplateRow {
  id: string;
  name: string;
  schema: unknown;
  created_at: string;
  updated_at: string | null;
}

export interface TemplateSummaryRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
}

export async function listTemplates(): Promise<TemplateSummaryRow[]> {
  const result = await getPool().request().query(
    'SELECT id, name, created_at, updated_at FROM pdf_templates ORDER BY created_at DESC'
  );
  return result.recordset;
}

export async function getTemplate(id: string): Promise<TemplateRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('SELECT id, name, schema, created_at, updated_at FROM pdf_templates WHERE id = @id');
  const row = result.recordset[0];
  if (!row) return null;
  return { ...row, schema: JSON.parse(row.schema as string) };
}

export async function createTemplate(name: string, schema: unknown): Promise<TemplateRow> {
  const result = await getPool()
    .request()
    .input('name', sql.NVarChar(255), name)
    .input('schema', sql.NVarChar(sql.MAX), JSON.stringify(schema))
    .query(`
      INSERT INTO pdf_templates (name, schema)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.schema,
             INSERTED.created_at, INSERTED.updated_at
      VALUES (@name, @schema)
    `);
  const row = result.recordset[0];
  return { ...row, schema: JSON.parse(row.schema as string) };
}

export async function updateTemplate(
  id: string,
  name: string,
  schema: unknown
): Promise<TemplateRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar(255), name)
    .input('schema', sql.NVarChar(sql.MAX), JSON.stringify(schema))
    .query(`
      UPDATE pdf_templates
      SET name = @name, schema = @schema, updated_at = GETUTCDATE()
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.schema,
             INSERTED.created_at, INSERTED.updated_at
      WHERE id = @id
    `);
  const row = result.recordset[0];
  if (!row) return null;
  return { ...row, schema: JSON.parse(row.schema as string) };
}

export async function deleteTemplate(id: string): Promise<void> {
  await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('DELETE FROM pdf_templates WHERE id = @id');
}
```

- [ ] **Step 2: Delete storage.ts**

```bash
rm server/src/storage.ts
```

- [ ] **Step 3: Commit**

```bash
git add server/src/db.ts server/src/storage.ts
git commit -m "feat(server): replace JSON file storage with MSSQL via mssql driver"
```

---

## Task 3: Update templates route to import from db.ts

**Files:**
- Modify: `server/src/routes/templates.ts`

- [ ] **Step 1: Change the import line at the top of templates.ts**

Old:
```typescript
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from '../storage.js';
```

New:
```typescript
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from '../db.js';
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/templates.ts
git commit -m "fix(server): update templates route to import from db.ts"
```

---

## Task 4: Replace pdfService — return Buffer instead of writing to disk

**Files:**
- Replace: `server/src/services/pdfService.ts`

- [ ] **Step 1: Replace pdfService.ts**

```typescript
// server/src/services/pdfService.ts
import { generate } from '@pdfme/generator';
import { getDefaultFont, type Template } from '@pdfme/common';
import {
  text, multiVariableText, image, barcodes, line, rectangle, ellipse,
  table, list, dateTime, date, time, select, checkbox, radioGroup, signature, svg,
} from '@pdfme/schemas';

const getPlugins = () => ({
  Text: text,
  'Multi-Variable Text': multiVariableText,
  Table: table,
  List: list,
  Line: line,
  Rectangle: rectangle,
  Ellipse: ellipse,
  Image: image,
  SVG: svg,
  Signature: signature,
  QR: barcodes.qrcode,
  DateTime: dateTime,
  Date: date,
  Time: time,
  Select: select,
  Checkbox: checkbox,
  RadioGroup: radioGroup,
  EAN13: barcodes.ean13,
  Code128: barcodes.code128,
});

export async function generatePdf(
  template: Template,
  inputs: Record<string, string>[],
): Promise<Buffer> {
  const pdf = await generate({
    template,
    inputs,
    options: { font: getDefaultFont() },
    plugins: getPlugins(),
  });
  return Buffer.from(pdf);
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/services/pdfService.ts
git commit -m "feat(server): pdfService returns Buffer instead of writing to disk"
```

---

## Task 5: Replace filledPdfs route with single generate-pdf endpoint

**Files:**
- Replace: `server/src/routes/filledPdfs.ts`

- [ ] **Step 1: Replace filledPdfs.ts entirely**

```typescript
// server/src/routes/filledPdfs.ts
import { Router, Request, Response } from 'express';
import { generatePdf } from '../services/pdfService.js';
import { getTemplate } from '../db.js';
import type { Template } from '@pdfme/common';

export const generatePdfRouter = Router();

/**
 * @openapi
 * /api/generate-pdf:
 *   post:
 *     summary: Generate a PDF from a template and return it as a binary file
 *     tags: [PDF Generation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [template_id, inputs]
 *             properties:
 *               template_id:
 *                 type: string
 *                 format: uuid
 *                 example: "527f8122-2009-4e84-b56b-dad77675da08"
 *               inputs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   additionalProperties:
 *                     type: string
 *                 example: [{"field1": "NEXGEN", "field2": "123"}]
 *     responses:
 *       200:
 *         description: PDF file binary
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Template not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
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
    const record = await getTemplate(template_id);
    if (!record) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const pdf = await generatePdf(record.schema as Template, inputs);

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

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/filledPdfs.ts
git commit -m "feat(server): replace filled-pdf CRUD with single generate-pdf binary endpoint"
```

---

## Task 6: Update index.ts — call initDb, mount new routes, remove outputs dir

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Replace index.ts**

```typescript
// server/src/index.ts
import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { templatesRouter } from './routes/templates.js';
import { generatePdfRouter } from './routes/filledPdfs.js';
import { swaggerSpec, swaggerUi } from './swagger.js';
import { initDb } from './db.js';

await initDb();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
app.use('/templates', templatesRouter);
app.use('/api/generate-pdf', generatePdfRouter);

app.get('/docs/swagger.json', (_req, res) => res.json(swaggerSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const PORT = process.env.PORT ?? 3004;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/docs`);
});
```

- [ ] **Step 2: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): wire initDb on startup, mount /api/generate-pdf, default port 3004"
```

---

## Task 7: Update Swagger spec

**Files:**
- Modify: `server/src/swagger.ts`

- [ ] **Step 1: Read current swagger.ts**

```bash
cat server/src/swagger.ts
```

- [ ] **Step 2: Update swagger.ts**

Replace the full file with:

```typescript
// server/src/swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PDF Template Manager API',
      version: '1.0.0',
      description: 'REST API for managing PDF templates and generating PDFs',
    },
    servers: [{ url: `http://localhost:${process.env.PORT ?? 3004}`, description: 'Local dev server' }],
    components: {
      schemas: {
        TemplateSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        TemplateRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            schema: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
export { swaggerUi };
```

- [ ] **Step 3: Commit**

```bash
git add server/src/swagger.ts
git commit -m "chore(server): update Swagger spec — remove FilledPdfRecord, add generate-pdf tag"
```

---

## Task 8: Create .env files and update .gitignore

**Files:**
- Create: `.env` (gitignored)
- Create: `.env.example` (committed)
- Modify: `.gitignore`

- [ ] **Step 1: Create .env at repo root**

```bash
cat > .env << 'EOF'
DB_SERVER=172.31.16.206
DB_PORT=49684
DB_NAME=VRentsTest
DB_USER=achintha
DB_PASSWORD=achintha!123
DB_ENCRYPT=false
DB_TRUST_CERT=true
DB_POOL_MIN=2
DB_POOL_MAX=10
PORT=3004
EOF
```

- [ ] **Step 2: Create .env.example at repo root**

```bash
cat > .env.example << 'EOF'
DB_SERVER=your-mssql-host
DB_PORT=1433
DB_NAME=your-database-name
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_ENCRYPT=false
DB_TRUST_CERT=true
DB_POOL_MIN=2
DB_POOL_MAX=10
PORT=3004
EOF
```

- [ ] **Step 3: Add .env to .gitignore (it may already be there — check first)**

```bash
grep "^\.env$" .gitignore || echo ".env" >> .gitignore
```

- [ ] **Step 4: Commit .env.example and .gitignore only**

```bash
git add .env.example .gitignore
git commit -m "chore: add .env.example and ensure .env is gitignored"
```

---

## Task 9: Create Dockerfile for the server

**Files:**
- Create: `server/Dockerfile`

The Dockerfile must copy the local pdfme packages because `server/package.json` references them as `file:../packages/*`. We build them into the image.

- [ ] **Step 1: Create server/Dockerfile**

```dockerfile
# server/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root package files
COPY package.json package-lock.json ./

# Copy all pdfme packages (server depends on them via file: references)
COPY packages/common ./packages/common
COPY packages/generator ./packages/generator
COPY packages/schemas ./packages/schemas
COPY packages/pdf-lib ./packages/pdf-lib
COPY packages/converter ./packages/converter

# Copy server source
COPY server ./server

# Install all workspace deps from root
RUN npm install --workspace=server --include-workspace-root

# Build server TypeScript
WORKDIR /app/server
RUN npm run build

# --- Runtime image ---
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/package.json

WORKDIR /app/server

EXPOSE 3004

CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Commit**

```bash
git add server/Dockerfile
git commit -m "feat(docker): add server Dockerfile using Node 20 Alpine"
```

---

## Task 10: Create docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create docker-compose.yml at repo root**

```yaml
# docker-compose.yml
services:
  server:
    build:
      context: .
      dockerfile: server/Dockerfile
    ports:
      - "3004:3004"
    env_file:
      - .env
    restart: unless-stopped
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker): add docker-compose.yml exposing server on port 3004"
```

---

## Task 11: Smoke test locally with tsx (before Docker)

This verifies the DB connection and generate endpoint work before building the image.

- [ ] **Step 1: Load .env and start server in dev mode**

```bash
cd server
export $(cat ../.env | xargs)
npm run dev
```

Expected console output:
```
Connected to MSSQL
pdf_templates table ready
Server running on port 3004
Swagger UI: http://localhost:3004/docs
```

If connection fails, check that `172.31.16.206:49684` is reachable from your machine (firewall/VPN).

- [ ] **Step 2: Create a template**

```bash
curl -s -X POST http://localhost:3004/templates \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Docker Test",
    "schema": {
      "schemas": [[{"name":"field1","type":"text","content":"","position":{"x":10,"y":10},"width":100,"height":10}]],
      "basePdf": {"width":210,"height":297,"padding":[10,10,10,10]}
    }
  }' | jq .
```

Expected: JSON with `id`, `name`, `created_at`.

- [ ] **Step 3: Copy the id from step 2 and generate a PDF**

```bash
curl -s -X POST http://localhost:3004/api/generate-pdf \
  -H 'Content-Type: application/json' \
  -d '{"template_id": "<id-from-step-2>", "inputs": [{"field1": "NEXGEN"}]}' \
  --output test-output.pdf

file test-output.pdf
```

Expected: `test-output.pdf: PDF document, version 1.x`

- [ ] **Step 4: Stop the dev server (Ctrl+C)**

---

## Task 12: Build and run Docker image

- [ ] **Step 1: Build the Docker image from repo root**

```bash
cd ..  # back to repo root if in server/
docker compose build
```

Expected: image builds successfully with no errors.

- [ ] **Step 2: Start the container**

```bash
docker compose up -d
docker compose logs -f server
```

Expected logs:
```
Connected to MSSQL
pdf_templates table ready
Server running on port 3004
```

- [ ] **Step 3: Test the health endpoint**

```bash
curl http://localhost:3004/health
```

Expected: `{"status":"ok"}` or similar.

- [ ] **Step 4: Test generate-pdf via the container**

```bash
# List templates (should include the one created in Task 11)
curl -s http://localhost:3004/templates | jq '.[0].id'

# Generate PDF (use id from above)
curl -s -X POST http://localhost:3004/api/generate-pdf \
  -H 'Content-Type: application/json' \
  -d '{"template_id": "<id>", "inputs": [{"field1": "NEXGEN DOCKER"}]}' \
  --output docker-test.pdf

file docker-test.pdf
```

Expected: `docker-test.pdf: PDF document, version 1.x`

- [ ] **Step 5: Commit any final tweaks, then push**

```bash
git add -A
git status   # confirm only expected files
git push origin main
```

---

## Self-Review Notes

- All CRUD functions in `db.ts` use `sql.input()` parameterisation — no injection risk
- `generatePdfRouter` export name matches the import in `index.ts`
- `getTemplate` parses `schema` from JSON string before returning — matches what `generatePdf` expects as `Template`
- Old `filledPdfsRouter` name replaced with `generatePdfRouter` — Swagger `@openapi` tag updated to `[PDF Generation]`
- Port default changed from `3001` → `3004` in both `index.ts` and `swagger.ts`
- Docker build context is repo root (not `./server`) because packages are `file:` references outside `server/`

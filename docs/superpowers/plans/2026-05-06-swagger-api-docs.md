# Swagger API Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Swagger UI at `http://localhost:3001/docs` documenting all existing and new API endpoints using `swagger-jsdoc` + `swagger-ui-express`.

**Architecture:** JSDoc `@openapi` comments on each route handler auto-generate the OpenAPI 3.0 spec via `swagger-jsdoc`. `swagger-ui-express` serves the interactive UI at `/docs` and the raw JSON at `/docs/swagger.json`. Three missing filled-PDFs endpoints are added to `storage.ts`, `filledPdfs.ts`, and documented in the same pass.

**Tech Stack:** Express 4, swagger-jsdoc, swagger-ui-express, @types/swagger-ui-express, @types/swagger-jsdoc, TypeScript ESM

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/swagger.ts` | **Create** | Builds swagger-jsdoc spec, exports `swaggerUi` middleware and `swaggerSpec` |
| `server/src/routes/templates.ts` | **Modify** | Add `@openapi` JSDoc comments to all 5 route handlers |
| `server/src/routes/filledPdfs.ts` | **Modify** | Add 3 missing endpoints + `@openapi` JSDoc comments |
| `server/src/storage.ts` | **Modify** | Add `listFilledPdfs`, `getFilledPdf` functions |
| `server/src/index.ts` | **Modify** | Mount `/docs` route using swagger middleware |

---

### Task 1: Install dependencies

**Files:**
- Modify: `server/package.json` (via npm install)

- [ ] **Step 1: Install swagger packages**

```bash
cd "server"
npm install swagger-jsdoc swagger-ui-express
npm install --save-dev @types/swagger-jsdoc @types/swagger-ui-express
```

Expected output: packages added to `node_modules`, `package.json` updated with new deps.

- [ ] **Step 2: Verify install**

```bash
ls node_modules/swagger-jsdoc && ls node_modules/swagger-ui-express && echo "OK"
```

Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add server/package.json server/package-lock.json
git commit -m "chore(server): install swagger-jsdoc and swagger-ui-express"
```

---

### Task 2: Create swagger.ts

**Files:**
- Create: `server/src/swagger.ts`

- [ ] **Step 1: Create the file**

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
      description: 'REST API for managing PDF templates and generated filled PDFs',
    },
    servers: [{ url: 'http://localhost:3001', description: 'Local dev server' }],
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
          allOf: [
            { $ref: '#/components/schemas/TemplateSummary' },
            {
              type: 'object',
              properties: {
                schema: { type: 'object', description: 'Full pdfme Template object' },
              },
            },
          ],
        },
        FilledPdfRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            template_id: { type: 'string', format: 'uuid' },
            inputs: {
              type: 'array',
              items: { type: 'object', additionalProperties: { type: 'string' } },
            },
            file_path: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
export { swaggerUi };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "server"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to swagger.ts).

- [ ] **Step 3: Commit**

```bash
cd ..
git add server/src/swagger.ts
git commit -m "feat(server): add swagger spec builder"
```

---

### Task 3: Mount Swagger UI in index.ts

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Update index.ts**

Replace the contents of `server/src/index.ts` with:

```typescript
import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { templatesRouter } from './routes/templates.js';
import { filledPdfsRouter } from './routes/filledPdfs.js';
import { swaggerSpec, swaggerUi } from './swagger.js';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await mkdir(join(__dirname, '..', 'outputs'), { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
app.use('/templates', templatesRouter);
app.use('/filled-pdfs', filledPdfsRouter);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/docs/swagger.json', (_req, res) => res.json(swaggerSpec));

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/docs`);
});
```

- [ ] **Step 2: Restart server and verify /docs loads**

```bash
cd "server"
npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/docs
```

Expected: `301` or `200` (swagger-ui-express redirects `/docs` to `/docs/`).

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/docs/swagger.json
```

Expected: `200`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add server/src/index.ts
git commit -m "feat(server): mount Swagger UI at /docs"
```

---

### Task 4: Add @openapi comments to templates.ts

**Files:**
- Modify: `server/src/routes/templates.ts`

- [ ] **Step 1: Replace templates.ts with annotated version**

```typescript
import { Router, Request, Response } from 'express';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from '../storage.js';

export const templatesRouter = Router();

const handleError = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  console.error(error);
  res.status(500).json({ error: message });
};

/**
 * @openapi
 * /templates:
 *   get:
 *     summary: List all templates
 *     tags: [Templates]
 *     responses:
 *       200:
 *         description: Array of template summaries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TemplateSummary'
 */
templatesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(await listTemplates());
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /templates/{id}:
 *   get:
 *     summary: Get a template by ID
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
 *         description: Full template record including schema
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TemplateRecord'
 *       404:
 *         description: Template not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
templatesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /templates:
 *   post:
 *     summary: Create a new template
 *     tags: [Templates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, schema]
 *             properties:
 *               name:
 *                 type: string
 *               schema:
 *                 type: object
 *                 description: pdfme Template object
 *     responses:
 *       201:
 *         description: Created template record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TemplateRecord'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
templatesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, schema } = req.body as { name: string; schema: unknown };
    if (!name || !schema) {
      res.status(400).json({ error: 'name and schema are required' });
      return;
    }
    res.status(201).json(await createTemplate(name, schema));
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /templates/{id}:
 *   put:
 *     summary: Update a template
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
 *             required: [name, schema]
 *             properties:
 *               name:
 *                 type: string
 *               schema:
 *                 type: object
 *     responses:
 *       200:
 *         description: Updated template record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TemplateRecord'
 *       404:
 *         description: Template not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
templatesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, schema } = req.body as { name: string; schema: unknown };
    const template = await updateTemplate(req.params.id, name, schema);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /templates/{id}:
 *   delete:
 *     summary: Delete a template
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Template deleted
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
templatesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteTemplate(req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
});
```

- [ ] **Step 2: Verify swagger.json includes template paths**

```bash
curl -s http://localhost:3001/docs/swagger.json | grep -o '"\/templates"' | head -3
```

Expected: `"/templates"` printed at least once.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/templates.ts
git commit -m "docs(server): add OpenAPI annotations to templates routes"
```

---

### Task 5: Add missing storage functions for filled PDFs

**Files:**
- Modify: `server/src/storage.ts`

- [ ] **Step 1: Add `listFilledPdfs` and `getFilledPdf` to storage.ts**

Append these two functions to the end of `server/src/storage.ts`:

```typescript
export const listFilledPdfs = async (): Promise<FilledPdfRow[]> => {
  if (usePostgres) {
    const result = await pool!.query(
      'SELECT * FROM filled_pdfs ORDER BY created_at DESC'
    );
    return result.rows;
  }

  const store = await readDevStore();
  return [...store.filledPdfs].sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export const getFilledPdf = async (id: string): Promise<FilledPdfRow | null> => {
  if (usePostgres) {
    const result = await pool!.query('SELECT * FROM filled_pdfs WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  }

  const store = await readDevStore();
  return store.filledPdfs.find((f) => f.id === id) ?? null;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "server"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd ..
git add server/src/storage.ts
git commit -m "feat(server): add listFilledPdfs and getFilledPdf to storage"
```

---

### Task 6: Add missing endpoints + @openapi comments to filledPdfs.ts

**Files:**
- Modify: `server/src/routes/filledPdfs.ts`

- [ ] **Step 1: Replace filledPdfs.ts with full annotated version**

```typescript
import { Router, Request, Response } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateAndSavePdf } from '../services/pdfService.js';
import type { Template } from '@pdfme/common';
import { createFilledPdf, getFilledPdf, getTemplate, listFilledPdfs } from '../storage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS_DIR = join(__dirname, '..', '..', 'outputs');

export const filledPdfsRouter = Router();

const handleError = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  console.error(error);
  res.status(500).json({ error: message });
};

/**
 * @openapi
 * /filled-pdfs:
 *   get:
 *     summary: List all filled PDF records
 *     tags: [Filled PDFs]
 *     responses:
 *       200:
 *         description: Array of filled PDF records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FilledPdfRecord'
 */
filledPdfsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(await listFilledPdfs());
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /filled-pdfs/{id}:
 *   get:
 *     summary: Get a filled PDF record by ID
 *     tags: [Filled PDFs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Filled PDF record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FilledPdfRecord'
 *       404:
 *         description: Record not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
filledPdfsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const record = await getFilledPdf(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Filled PDF not found' });
      return;
    }
    res.json(record);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /filled-pdfs/{id}/download:
 *   get:
 *     summary: Download the generated PDF file
 *     tags: [Filled PDFs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: PDF file stream
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Record or file not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
filledPdfsRouter.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const record = await getFilledPdf(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Filled PDF not found' });
      return;
    }

    const filePath = join(OUTPUTS_DIR, record.file_path.replace(/^outputs\//, ''));

    try {
      await stat(filePath);
    } catch {
      res.status(404).json({ error: 'PDF file not found on disk' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${record.id}.pdf"`);
    createReadStream(filePath).pipe(res);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /filled-pdfs:
 *   post:
 *     summary: Generate a PDF from a template and save it
 *     tags: [Filled PDFs]
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
 *               inputs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   additionalProperties:
 *                     type: string
 *     responses:
 *       201:
 *         description: Created filled PDF record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FilledPdfRecord'
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
filledPdfsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { template_id, inputs } = req.body as {
      template_id: string;
      inputs: Record<string, string>[];
    };

    if (!template_id || !inputs) {
      res.status(400).json({ error: 'template_id and inputs are required' });
      return;
    }

    const templateRecord = await getTemplate(template_id);
    if (!templateRecord) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const template = templateRecord.schema as Template;
    const filePath = await generateAndSavePdf(template, inputs);

    res.status(201).json(await createFilledPdf(template_id, inputs, filePath));
  } catch (error) {
    handleError(res, error);
  }
});
```

- [ ] **Step 2: Verify new endpoints respond**

Restart the server first, then:

```bash
curl -s -w "\n%{http_code}" http://localhost:3001/filled-pdfs
```

Expected: `[]\n200`

```bash
curl -s -w "\n%{http_code}" http://localhost:3001/filled-pdfs/nonexistent-id
```

Expected: `{"error":"Filled PDF not found"}\n404`

- [ ] **Step 3: Verify swagger.json includes filled-pdfs paths**

```bash
curl -s http://localhost:3001/docs/swagger.json | grep -o '"\/filled-pdfs"' | head -2
```

Expected: `"/filled-pdfs"` printed.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/filledPdfs.ts
git commit -m "feat(server): add list/get/download filled-pdf endpoints with OpenAPI docs"
```

---

### Task 7: Smoke test Swagger UI in browser

- [ ] **Step 1: Open Swagger UI**

Navigate to `http://localhost:3001/docs` in a browser. Verify:
- Page loads with "PDF Template Manager API" title
- Two tag sections visible: **Templates** and **Filled PDFs**
- All 8 endpoints listed (5 template + 3 filled-pdf routes)

- [ ] **Step 2: Try a live request in Swagger UI**

In the UI, expand `GET /templates`, click "Try it out", click "Execute". Verify response body is `[]` or a list of templates, status 200.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(server): complete Swagger UI integration with all endpoints documented"
```

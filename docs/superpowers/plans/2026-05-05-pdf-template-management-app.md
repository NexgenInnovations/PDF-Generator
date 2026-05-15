# PDF Template Management App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack PDF template management app on top of the pdfme monorepo with a React+Vite frontend and Express+PostgreSQL backend.

**Architecture:** The `/client` Vite app references local pdfme packages via `file:` workspace links (same pattern as `playground/`). The `/server` Express app uses `@pdfme/generator` server-side to regenerate PDFs for persistence. Role gating is purely frontend via localStorage.

**Tech Stack:** React 18, Vite, TypeScript strict, React Router v7, Express, PostgreSQL (raw SQL), `@pdfme/ui`, `@pdfme/generator`, `@pdfme/common`, `@pdfme/schemas`

---

## File Map

```
/client
  package.json                  — Vite app deps, file: links to monorepo packages
  vite.config.ts                — Vite config with @vitejs/plugin-react
  tsconfig.json                 — strict TypeScript
  index.html
  src/
    main.tsx                    — entry, BrowserRouter
    App.tsx                     — route definitions
    types.ts                    — shared TS types (Template, FilledPdf, Role)
    context/
      RoleContext.tsx           — Role context + provider + useRole hook
    components/
      NavBar.tsx                — role switcher UI (persists to localStorage)
      RoleGuard.tsx             — wrapper that redirects if role not allowed
    pages/
      TemplateList.tsx          — / route
      TemplateDesigner.tsx      — /templates/new and /templates/:id/edit
      FormFill.tsx              — /templates/:id/fill
    lib/
      api.ts                    — typed fetch wrappers for all API calls
      pdfme.ts                  — shared pdfme helpers (fonts, plugins, generate)

/server
  package.json                  — Express deps, ts-node/tsx, pg
  tsconfig.json                 — strict TypeScript
  src/
    index.ts                    — Express app entry, middleware, route mounting
    db.ts                       — pg Pool setup
    routes/
      health.ts                 — GET /health
      templates.ts              — GET/POST/PUT/DELETE /templates
      filledPdfs.ts             — POST /filled-pdfs
    services/
      pdfService.ts             — server-side PDF generation + file write
  outputs/                      — generated PDF files written here (gitignored)

/server/migrations/
  001_create_templates.sql
  002_create_filled_pdfs.sql
```

---

## Task 1: Server — Project Scaffold & PostgreSQL Connection

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/db.ts`
- Create: `server/src/index.ts`
- Create: `server/migrations/001_create_templates.sql`
- Create: `server/migrations/002_create_filled_pdfs.sql`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "pdf-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "migrate": "node --input-type=module <<'EOF'\nimport { readFileSync } from 'fs';\nimport { Pool } from 'pg';\nconst pool = new Pool({ connectionString: process.env.DATABASE_URL });\nconst files = ['migrations/001_create_templates.sql','migrations/002_create_filled_pdfs.sql'];\nfor (const f of files) { await pool.query(readFileSync(f, 'utf8')); console.log('ran', f); }\nawait pool.end();\nEOF"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.0",
    "@types/pg": "^8.11.0",
    "@types/uuid": "^9.0.7",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `server/src/db.ts`**

```typescript
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/pdfgen',
});
```

- [ ] **Step 4: Create `server/src/index.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { templatesRouter } from './routes/templates.js';
import { filledPdfsRouter } from './routes/filledPdfs.js';
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

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

- [ ] **Step 5: Create `server/migrations/001_create_templates.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  schema JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

- [ ] **Step 6: Create `server/migrations/002_create_filled_pdfs.sql`**

```sql
CREATE TABLE IF NOT EXISTS filled_pdfs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES templates(id),
  inputs JSONB NOT NULL,
  file_path TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

- [ ] **Step 7: Install server dependencies**

```bash
cd server && npm install
```

- [ ] **Step 8: Run migrations (requires PostgreSQL running)**

```bash
cd server
# Create DB if needed:
createdb pdfgen
# Run migrations:
DATABASE_URL=postgresql://localhost:5432/pdfgen npx tsx -e "
import { readFileSync } from 'fs';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
for (const f of ['migrations/001_create_templates.sql','migrations/002_create_filled_pdfs.sql']) {
  await pool.query(readFileSync(f, 'utf8'));
  console.log('ran', f);
}
await pool.end();
"
```

Expected output:
```
ran migrations/001_create_templates.sql
ran migrations/002_create_filled_pdfs.sql
```

- [ ] **Step 9: Commit**

```bash
git add server/
git commit -m "feat: scaffold server with PostgreSQL connection and migrations"
```

---

## Task 2: Server — Health & Templates Routes

**Files:**
- Create: `server/src/routes/health.ts`
- Create: `server/src/routes/templates.ts`

- [ ] **Step 1: Create `server/src/routes/health.ts`**

```typescript
import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});
```

- [ ] **Step 2: Create `server/src/routes/templates.ts`**

```typescript
import { Router, Request, Response } from 'express';
import { pool } from '../db.js';

export const templatesRouter = Router();

templatesRouter.get('/', async (_req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT id, name, created_at, updated_at FROM templates ORDER BY created_at DESC'
  );
  res.json(result.rows);
});

templatesRouter.get('/:id', async (req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM templates WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(result.rows[0]);
});

templatesRouter.post('/', async (req: Request, res: Response) => {
  const { name, schema } = req.body as { name: string; schema: unknown };
  if (!name || !schema) {
    res.status(400).json({ error: 'name and schema are required' });
    return;
  }
  const result = await pool.query(
    'INSERT INTO templates (name, schema) VALUES ($1, $2) RETURNING *',
    [name, JSON.stringify(schema)]
  );
  res.status(201).json(result.rows[0]);
});

templatesRouter.put('/:id', async (req: Request, res: Response) => {
  const { name, schema } = req.body as { name: string; schema: unknown };
  const result = await pool.query(
    'UPDATE templates SET name = $1, schema = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
    [name, JSON.stringify(schema), req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(result.rows[0]);
});

templatesRouter.delete('/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM templates WHERE id = $1', [req.params.id]);
  res.status(204).send();
});
```

- [ ] **Step 3: Start server and verify**

```bash
cd server && DATABASE_URL=postgresql://localhost:5432/pdfgen npm run dev
```

In a second terminal:
```bash
curl http://localhost:3001/health
# Expected: {"status":"ok"}

curl -X POST http://localhost:3001/templates \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","schema":{"basePdf":{"width":210,"height":297,"padding":[0,0,0,0]},"schemas":[]}}'
# Expected: JSON with id, name, schema, created_at, updated_at

curl http://localhost:3001/templates
# Expected: array with the template above
```

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/
git commit -m "feat: add health and templates CRUD routes"
```

---

## Task 3: Server — PDF Service & Filled PDFs Route

**Files:**
- Create: `server/src/services/pdfService.ts`
- Create: `server/src/routes/filledPdfs.ts`

**Important:** The server uses `@pdfme/generator` from the local monorepo. Add it to `server/package.json` as a `file:` link pointing to `../packages/generator` and also add `@pdfme/common`, `@pdfme/schemas`, `@pdfme/pdf-lib`, and `@pdfme/converter`.

- [ ] **Step 1: Add local pdfme packages to `server/package.json` dependencies**

Add these entries to the `"dependencies"` object in `server/package.json`:

```json
"@pdfme/common": "file:../packages/common",
"@pdfme/converter": "file:../packages/converter",
"@pdfme/generator": "file:../packages/generator",
"@pdfme/pdf-lib": "file:../packages/pdf-lib",
"@pdfme/schemas": "file:../packages/schemas"
```

Then run:
```bash
cd server && npm install
```

- [ ] **Step 2: Create `server/src/services/pdfService.ts`**

```typescript
import { generate } from '@pdfme/generator';
import { getDefaultFont, type Template } from '@pdfme/common';
import {
  text, multiVariableText, image, barcodes, line, rectangle, ellipse,
  table, list, dateTime, date, time, select, checkbox, radioGroup, signature, svg,
} from '@pdfme/schemas';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS_DIR = join(__dirname, '..', '..', 'outputs');

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

export async function generateAndSavePdf(
  template: Template,
  inputs: Record<string, string>[],
): Promise<string> {
  const pdf = await generate({
    template,
    inputs,
    options: { font: getDefaultFont() },
    plugins: getPlugins(),
  });

  const filename = `${uuidv4()}.pdf`;
  const filePath = join(OUTPUTS_DIR, filename);
  await writeFile(filePath, pdf);
  return `outputs/${filename}`;
}
```

- [ ] **Step 3: Create `server/src/routes/filledPdfs.ts`**

```typescript
import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { generateAndSavePdf } from '../services/pdfService.js';
import type { Template } from '@pdfme/common';

export const filledPdfsRouter = Router();

filledPdfsRouter.post('/', async (req: Request, res: Response) => {
  const { template_id, inputs } = req.body as {
    template_id: string;
    inputs: Record<string, string>[];
  };

  if (!template_id || !inputs) {
    res.status(400).json({ error: 'template_id and inputs are required' });
    return;
  }

  const templateResult = await pool.query('SELECT * FROM templates WHERE id = $1', [template_id]);
  if (templateResult.rows.length === 0) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  const template = templateResult.rows[0].schema as Template;
  const filePath = await generateAndSavePdf(template, inputs);

  const result = await pool.query(
    'INSERT INTO filled_pdfs (template_id, inputs, file_path) VALUES ($1, $2, $3) RETURNING *',
    [template_id, JSON.stringify(inputs), filePath]
  );

  res.status(201).json(result.rows[0]);
});
```

- [ ] **Step 4: Mount `filledPdfsRouter` in `server/src/index.ts`** (already there from Task 1 Step 4 — verify it's present)

- [ ] **Step 5: Test the filled-pdfs endpoint**

First create a template via POST /templates, capture its `id`, then:

```bash
curl -X POST http://localhost:3001/filled-pdfs \
  -H "Content-Type: application/json" \
  -d '{
    "template_id": "<id-from-above>",
    "inputs": [{"field1": "Hello World"}]
  }'
```

Expected: JSON with `id`, `template_id`, `inputs`, `file_path`, `created_at`. Verify the file exists at `server/outputs/<uuid>.pdf`.

- [ ] **Step 6: Add `server/outputs/` to `.gitignore`**

```bash
echo "server/outputs/*.pdf" >> .gitignore
```

- [ ] **Step 7: Commit**

```bash
git add server/ .gitignore
git commit -m "feat: add PDF generation service and filled-pdfs route"
```

---

## Task 4: Client — Project Scaffold

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/vite-env.d.ts`

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "pdf-client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@pdfme/common": "file:../packages/common",
    "@pdfme/converter": "file:../packages/converter",
    "@pdfme/generator": "file:../packages/generator",
    "@pdfme/pdf-lib": "file:../packages/pdf-lib",
    "@pdfme/schemas": "file:../packages/schemas",
    "@pdfme/ui": "file:../packages/ui",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.15",
    "@types/react-dom": "^18.2.7",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.3.3",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `client/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/templates': 'http://localhost:3001',
      '/filled-pdfs': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
});
```

- [ ] **Step 4: Create `client/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PDF Template Manager</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `client/src/vite-env.d.ts`**

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 6: Install client dependencies**

```bash
cd client && npm install
```

Expected: installs successfully, `node_modules/@pdfme/ui` symlinked from `../packages/ui`.

- [ ] **Step 7: Commit**

```bash
git add client/
git commit -m "feat: scaffold client Vite/React/TypeScript app"
```

---

## Task 5: Client — Types, API Layer, pdfme Helpers

**Files:**
- Create: `client/src/types.ts`
- Create: `client/src/lib/api.ts`
- Create: `client/src/lib/pdfme.ts`

- [ ] **Step 1: Create `client/src/types.ts`**

```typescript
export type Role = 'Admin' | 'Designer' | 'FormFiller';

export interface TemplateRecord {
  id: string;
  name: string;
  schema: object;
  created_at: string;
  updated_at: string | null;
}

export interface TemplateSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
}

export interface FilledPdfRecord {
  id: string;
  template_id: string;
  inputs: Record<string, string>[];
  file_path: string;
  created_at: string;
}
```

- [ ] **Step 2: Create `client/src/lib/api.ts`**

```typescript
import type { TemplateRecord, TemplateSummary, FilledPdfRecord } from '../types.js';
import type { Template } from '@pdfme/common';

const BASE = '';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listTemplates: () => request<TemplateSummary[]>('/templates'),

  getTemplate: (id: string) => request<TemplateRecord>(`/templates/${id}`),

  createTemplate: (name: string, schema: Template) =>
    request<TemplateRecord>('/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, schema }),
    }),

  updateTemplate: (id: string, name: string, schema: Template) =>
    request<TemplateRecord>(`/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, schema }),
    }),

  deleteTemplate: (id: string) => request<void>(`/templates/${id}`, { method: 'DELETE' }),

  createFilledPdf: (template_id: string, inputs: Record<string, string>[]) =>
    request<FilledPdfRecord>('/filled-pdfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id, inputs }),
    }),
};
```

- [ ] **Step 3: Create `client/src/lib/pdfme.ts`**

```typescript
import { getDefaultFont, type Font } from '@pdfme/common';
import {
  text, multiVariableText, image, barcodes, line, rectangle, ellipse,
  table, list, dateTime, date, time, select, checkbox, radioGroup, signature, svg,
} from '@pdfme/schemas';

export const getFonts = (): Font => ({
  ...getDefaultFont(),
});

export const getPlugins = () => ({
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
```

- [ ] **Step 4: Commit**

```bash
git add client/src/types.ts client/src/lib/
git commit -m "feat: add client types, API layer, and pdfme helpers"
```

---

## Task 6: Client — Role Context & NavBar

**Files:**
- Create: `client/src/context/RoleContext.tsx`
- Create: `client/src/components/NavBar.tsx`
- Create: `client/src/components/RoleGuard.tsx`

- [ ] **Step 1: Create `client/src/context/RoleContext.tsx`**

```tsx
import React, { createContext, useContext, useState, type ReactNode } from 'react';
import type { Role } from '../types.js';

const STORAGE_KEY = 'pdf_manager_role';

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(
    () => (localStorage.getItem(STORAGE_KEY) as Role | null) ?? 'FormFiller'
  );

  const setRole = (r: Role) => {
    localStorage.setItem(STORAGE_KEY, r);
    setRoleState(r);
  };

  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
}
```

- [ ] **Step 2: Create `client/src/components/NavBar.tsx`**

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useRole } from '../context/RoleContext.js';
import type { Role } from '../types.js';

const ROLES: Role[] = ['Admin', 'Designer', 'FormFiller'];

export function NavBar() {
  const { role, setRole } = useRole();

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 24px', borderBottom: '1px solid #e0e0e0', background: '#fff' }}>
      <Link to="/" style={{ fontWeight: 700, fontSize: 18, textDecoration: 'none', color: '#1a1a1a' }}>
        PDF Manager
      </Link>
      <span style={{ flex: 1 }} />
      <label htmlFor="role-select" style={{ fontWeight: 600, fontSize: 14 }}>Role:</label>
      <select
        id="role-select"
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </nav>
  );
}
```

- [ ] **Step 3: Create `client/src/components/RoleGuard.tsx`**

```tsx
import React, { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext.js';
import type { Role } from '../types.js';

interface RoleGuardProps {
  allowed: Role[];
  children: ReactNode;
}

export function RoleGuard({ allowed, children }: RoleGuardProps) {
  const { role } = useRole();
  if (!allowed.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/context/ client/src/components/
git commit -m "feat: add RoleContext, NavBar with role switcher, and RoleGuard"
```

---

## Task 7: Client — App Entry, Routing

**Files:**
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`

- [ ] **Step 1: Create `client/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { RoleProvider } from './context/RoleContext.js';
import App from './App.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <RoleProvider>
        <App />
      </RoleProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 2: Create `client/src/App.tsx`**

```tsx
import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { NavBar } from './components/NavBar.js';
import { RoleGuard } from './components/RoleGuard.js';

const TemplateList = lazy(() => import('./pages/TemplateList.js'));
const TemplateDesigner = lazy(() => import('./pages/TemplateDesigner.js'));
const FormFill = lazy(() => import('./pages/FormFill.js'));

export default function App() {
  return (
    <div style={{ minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <NavBar />
      <Suspense fallback={<div style={{ padding: 32 }}>Loading…</div>}>
        <Routes>
          <Route path="/" element={<TemplateList />} />
          <Route
            path="/templates/new"
            element={
              <RoleGuard allowed={['Admin', 'Designer']}>
                <TemplateDesigner />
              </RoleGuard>
            }
          />
          <Route
            path="/templates/:id/edit"
            element={
              <RoleGuard allowed={['Admin', 'Designer']}>
                <TemplateDesigner />
              </RoleGuard>
            }
          />
          <Route path="/templates/:id/fill" element={<FormFill />} />
        </Routes>
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/main.tsx client/src/App.tsx
git commit -m "feat: add React app entry and route definitions"
```

---

## Task 8: Client — Template List Page

**Files:**
- Create: `client/src/pages/TemplateList.tsx`

- [ ] **Step 1: Create `client/src/pages/TemplateList.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useRole } from '../context/RoleContext.js';
import type { TemplateSummary } from '../types.js';

export default function TemplateList() {
  const { role } = useRole();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listTemplates()
      .then(setTemplates)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    await api.deleteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  if (loading) return <div style={{ padding: 32 }}>Loading templates…</div>;
  if (error) return <div style={{ padding: 32, color: 'red' }}>Error: {error}</div>;

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Templates</h1>
        {(role === 'Admin' || role === 'Designer') && (
          <button
            onClick={() => navigate('/templates/new')}
            style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            + Create Template
          </button>
        )}
      </div>

      {templates.length === 0 && <p>No templates yet.</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Created</th>
            <th style={{ textAlign: 'left', padding: '8px 12px' }}>Updated</th>
            <th style={{ padding: '8px 12px' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '10px 12px', fontWeight: 600 }}>{t.name}</td>
              <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: 13 }}>
                {new Date(t.created_at).toLocaleDateString()}
              </td>
              <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: 13 }}>
                {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—'}
              </td>
              <td style={{ padding: '10px 12px', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {role === 'FormFiller' && (
                  <Link
                    to={`/templates/${t.id}/fill`}
                    style={{ padding: '6px 12px', background: '#059669', color: '#fff', borderRadius: 5, textDecoration: 'none', fontSize: 13 }}
                  >
                    Fill
                  </Link>
                )}
                {(role === 'Admin' || role === 'Designer') && (
                  <Link
                    to={`/templates/${t.id}/edit`}
                    style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', borderRadius: 5, textDecoration: 'none', fontSize: 13 }}
                  >
                    Edit
                  </Link>
                )}
                {role === 'Admin' && (
                  <button
                    onClick={() => handleDelete(t.id)}
                    style={{ padding: '6px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13 }}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/TemplateList.tsx
git commit -m "feat: add template list page with role-gated actions"
```

---

## Task 9: Client — Template Designer Page

**Files:**
- Create: `client/src/pages/TemplateDesigner.tsx`

**Key pdfme API facts:**
- `Designer` is a class imported from `@pdfme/ui`
- Instantiate with `new Designer({ domContainer, template, options, plugins })`
- `designer.getTemplate()` returns current template JSON
- `designer.destroy()` must be called in the useEffect cleanup
- The container `div` must have a defined height (e.g. `calc(100vh - 60px)`)

- [ ] **Step 1: Create `client/src/pages/TemplateDesigner.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Designer } from '@pdfme/ui';
import { Template, getDefaultFont } from '@pdfme/common';
import { api } from '../lib/api.js';
import { getFonts, getPlugins } from '../lib/pdfme.js';

const BLANK_TEMPLATE: Template = {
  basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
  schemas: [[]],
};

export default function TemplateDesigner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const designerRef = useRef<Designer | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!containerRef.current) return;

      let template: Template = BLANK_TEMPLATE;

      if (id) {
        const record = await api.getTemplate(id);
        template = record.schema as Template;
        if (mounted) setName(record.name);
      }

      if (!mounted || !containerRef.current) return;

      designerRef.current = new Designer({
        domContainer: containerRef.current,
        template,
        options: {
          font: getFonts(),
          lang: 'en',
        },
        plugins: getPlugins(),
      });
    };

    init().catch((e: Error) => setError(e.message));

    return () => {
      mounted = false;
      designerRef.current?.destroy();
      designerRef.current = null;
    };
  }, [id]);

  const handleSave = async () => {
    if (!designerRef.current) return;
    if (!name.trim()) {
      setError('Template name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const schema = designerRef.current.getTemplate();
      if (id) {
        await api.updateTemplate(id, name.trim(), schema);
      } else {
        await api.createTemplate(name.trim(), schema);
      }
      navigate('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 57px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <input
          type="text"
          placeholder="Template name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 1, maxWidth: 320, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }}
        />
        {error && <span style={{ color: '#dc2626', fontSize: 13 }}>{error}</span>}
        <button
          onClick={() => navigate('/')}
          style={{ padding: '6px 12px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/TemplateDesigner.tsx
git commit -m "feat: add template designer page with pdfme Designer component"
```

---

## Task 10: Client — Form Fill Page

**Files:**
- Create: `client/src/pages/FormFill.tsx`

**Key pdfme API facts:**
- `Form` and `Viewer` are classes from `@pdfme/ui`
- `form.getInputs()` returns current field values as `Record<string, string>[]`
- `generate({ template, inputs, options, plugins })` returns `Promise<Uint8Array>`
- Create a `Blob` from the `Uint8Array` to make a data URL for display or download
- Switch from `Form` to `Viewer` after generating by destroying Form and creating Viewer with the same inputs
- `getInputFromTemplate(template)` returns blank inputs shaped correctly for the template

- [ ] **Step 1: Create `client/src/pages/FormFill.tsx`**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Form, Viewer } from '@pdfme/ui';
import { generate } from '@pdfme/generator';
import { getInputFromTemplate, type Template } from '@pdfme/common';
import { api } from '../lib/api.js';
import { getFonts, getPlugins } from '../lib/pdfme.js';

type PageState = 'filling' | 'preview';

export default function FormFill() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const uiRef = useRef<Form | Viewer | null>(null);
  const [templateRecord, setTemplateRecord] = useState<{ name: string; schema: Template } | null>(null);
  const [pageState, setPageState] = useState<PageState>('filling');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getTemplate(id).then((record) => {
      setTemplateRecord({ name: record.name, schema: record.schema as Template });
    }).catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!templateRecord || !containerRef.current) return;

    uiRef.current?.destroy();
    uiRef.current = null;

    const template = templateRecord.schema;
    const inputs = getInputFromTemplate(template);

    uiRef.current = new Form({
      domContainer: containerRef.current,
      template,
      inputs,
      options: { font: getFonts(), lang: 'en' },
      plugins: getPlugins(),
    });

    return () => {
      uiRef.current?.destroy();
      uiRef.current = null;
    };
  }, [templateRecord]);

  const handleSubmit = async () => {
    if (!uiRef.current || !templateRecord || !id) return;

    setSubmitting(true);
    setError(null);

    try {
      const inputs = (uiRef.current as Form).getInputs();
      const template = templateRecord.schema;

      const pdfBytes = await generate({
        template,
        inputs,
        options: { font: getFonts() },
        plugins: getPlugins(),
      });

      const blob = new Blob([pdfBytes.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);

      // Destroy Form and mount Viewer
      uiRef.current.destroy();
      uiRef.current = null;

      if (containerRef.current) {
        uiRef.current = new Viewer({
          domContainer: containerRef.current,
          template,
          inputs,
          options: { font: getFonts(), lang: 'en' },
          plugins: getPlugins(),
        });
      }

      setPageState('preview');

      // Save to backend
      await api.createFilledPdf(id, inputs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = () => {
    if (!pdfUrl || !templateRecord) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = `${templateRecord.name}.pdf`;
    a.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 57px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{templateRecord?.name ?? 'Loading…'}</span>
        {error && <span style={{ color: '#dc2626', fontSize: 13 }}>{error}</span>}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => navigate('/')}
          style={{ padding: '6px 12px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Back
        </button>
        {pageState === 'filling' && (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ padding: '6px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            {submitting ? 'Generating…' : 'Generate PDF'}
          </button>
        )}
        {pageState === 'preview' && (
          <button
            onClick={handleDownload}
            style={{ padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >
            Download PDF
          </button>
        )}
      </div>
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/FormFill.tsx
git commit -m "feat: add form fill page with PDF generation and Viewer preview"
```

---

## Task 11: Build Monorepo Packages

Before the client can start, the local pdfme packages must be built so their `dist/` folders exist.

- [ ] **Step 1: Install root monorepo dependencies**

```bash
cd "/Users/achintha/Desktop/Nexgen/PDF_generator " && npm install
```

- [ ] **Step 2: Build all pdfme packages**

```bash
npm run build
```

Expected: each package under `packages/*/dist/` is populated. This may take 1-2 minutes.

- [ ] **Step 3: Verify key dist files exist**

```bash
ls packages/ui/dist/index.js packages/generator/dist/index.js packages/common/dist/index.js
```

Expected: all three files listed without errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: note that monorepo packages must be built before running client/server" --allow-empty
```

---

## Task 12: End-to-End Smoke Test

- [ ] **Step 1: Start the server**

```bash
cd server && DATABASE_URL=postgresql://localhost:5432/pdfgen npm run dev
```

Expected: `Server running on port 3001`

- [ ] **Step 2: Start the client (new terminal)**

```bash
cd client && npm run dev
```

Expected: `Local: http://localhost:5173/`

- [ ] **Step 3: Open browser and verify Template List page**

Navigate to `http://localhost:5173/`. Expected: NavBar with role switcher showing "FormFiller", empty template list with no Create button.

- [ ] **Step 4: Switch role to Admin, verify Create button appears**

- [ ] **Step 5: Create a template**

Click Create Template → fill in a name → add a Text field in the Designer → click Save. Expected: redirect to `/` with new template in list.

- [ ] **Step 6: Switch role to FormFiller, fill the template**

Click Fill on the template → fill the text field → click Generate PDF. Expected: pdfme Viewer renders the filled PDF, Download PDF button appears.

- [ ] **Step 7: Verify backend record**

```bash
curl http://localhost:3001/templates
# Should list the created template

psql pdfgen -c "SELECT id, file_path FROM filled_pdfs;"
# Should show a row with outputs/<uuid>.pdf

ls server/outputs/
# Should contain the .pdf file
```

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: complete PDF template management app scaffold"
```

---

## Self-Review — Spec Coverage Check

| Spec requirement | Covered in task |
|---|---|
| GET /health | Task 2 |
| GET /templates | Task 2 |
| GET /templates/:id | Task 2 |
| POST /templates | Task 2 |
| PUT /templates/:id | Task 2 |
| DELETE /templates/:id | Task 2 |
| POST /filled-pdfs | Task 3 |
| templates DB schema | Task 1 |
| filled_pdfs DB schema | Task 1 |
| Server PDF generation + file write | Task 3 |
| /client scaffold | Task 4 |
| Types + API layer | Task 5 |
| pdfme helpers (fonts, plugins) | Task 5 |
| Role switcher (localStorage) | Task 6 |
| NavBar | Task 6 |
| RoleGuard | Task 6 |
| Routing (all 4 routes) | Task 7 |
| Template List with role-gated buttons | Task 8 |
| Template Designer (create + edit) | Task 9 |
| Form Fill with generate + Viewer preview | Task 10 |
| Download button | Task 10 |
| POST /filled-pdfs from client | Task 10 |
| Build monorepo packages | Task 11 |
| End-to-end smoke test | Task 12 |

All spec requirements are covered.

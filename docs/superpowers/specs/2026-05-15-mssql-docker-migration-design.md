# Design: MSSQL Migration + Docker + Single Generate API

**Date:** 2026-05-15
**Status:** Approved

---

## Overview

Migrate the PDF Template Manager server from JSON file-based storage to MSSQL (VRentsTest), containerise it with Docker, and simplify the PDF generation API to a single endpoint that returns a PDF binary directly.

---

## Architecture

```
┌─────────────────────────────────────────┐
│              Docker Container           │
│                                         │
│  Express Server (port 3004)             │
│  ├── GET  /templates                    │
│  ├── POST /templates                    │
│  ├── GET  /templates/:id                │
│  ├── PUT  /templates/:id                │
│  ├── DELETE /templates/:id              │
│  ├── POST /api/generate-pdf  ← NEW      │
│  ├── GET  /health                       │
│  └── GET  /docs  (Swagger UI)           │
│                                         │
│  MSSQL connection pool (mssql)          │
└────────────────┬────────────────────────┘
                 │
                 ▼
     172.31.16.206:49684 / VRentsTest
```

---

## Database

**Connection config** (from environment variables):
- `DB_SERVER=172.31.16.206`
- `DB_PORT=49684`
- `DB_NAME=VRentsTest`
- `DB_USER=achintha`
- `DB_PASSWORD=achintha!123`
- `DB_ENCRYPT=false`
- `DB_TRUST_CERT=true`

**Table: `pdf_templates`**

```sql
CREATE TABLE pdf_templates (
  id           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  name         NVARCHAR(255)    NOT NULL,
  schema       NVARCHAR(MAX)    NOT NULL,   -- JSON stored as text
  created_at   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
  updated_at   DATETIME2        NOT NULL DEFAULT GETUTCDATE()
);
```

- Server creates the table on startup using `IF NOT EXISTS` guard — no manual migration step needed.
- `schema` column stores the full pdfme template JSON as a serialised string.
- No `filled_pdfs` table — generated PDFs are returned as binary response, never persisted.

---

## Server Changes

### Storage layer (`server/src/db.ts`)
Replace the current JSON file functions with MSSQL equivalents:
- `initDb()` — create connection pool + create table if not exists; called on server startup
- `listTemplates()` → `SELECT id, name, created_at, updated_at FROM pdf_templates`
- `getTemplate(id)` → `SELECT * FROM pdf_templates WHERE id = @id`
- `createTemplate(name, schema)` → `INSERT ... OUTPUT INSERTED.*`
- `updateTemplate(id, data)` → `UPDATE ... SET updated_at = GETUTCDATE() OUTPUT INSERTED.*`
- `deleteTemplate(id)` → `DELETE WHERE id = @id`

All queries use parameterised inputs (`request.input(...)`) — no string interpolation.

### Remove entirely
- `server/src/storage.ts` — JSON file storage
- `server/src/routes/filledPdfs.ts` — old filled-pdf list/get/download endpoints
- `server/outputs/` directory (no longer writing PDFs to disk)

### New endpoint: `POST /api/generate-pdf`

**Request:**
```json
{
  "template_id": "uuid-here",
  "inputs": [{ "field1": "NEXGEN", "field2": "123" }]
}
```

**Response:** `200 OK`, `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="generated.pdf"` — raw PDF bytes in the body.

**Error responses:**
- `400` — missing `template_id` or `inputs`
- `404` — template not found
- `500` — PDF generation failure

### Keep unchanged
- `server/src/routes/templates.ts` — all CRUD routes (frontend needs them)
- `server/src/services/pdfService.ts` — PDF generation logic
- `server/src/swagger.ts` — update to document new endpoint, remove filled-pdf docs
- `server/src/routes/health.ts`

---

## Docker

### `server/Dockerfile`
- Base: `node:20-alpine`
- Copy server source, install deps, build TypeScript
- `CMD ["node", "dist/index.js"]`
- Expose port `3004`

### `docker-compose.yml` (repo root)
```yaml
services:
  server:
    build: ./server
    ports:
      - "3004:3004"
    env_file: .env
```

### `.env` (gitignored)
```
DB_SERVER=172.31.16.206
DB_PORT=49684
DB_NAME=VRentsTest
DB_USER=achintha
DB_PASSWORD=achintha!123
DB_ENCRYPT=false
DB_TRUST_CERT=true
PORT=3004
```

### `.env.example` (committed)
Same keys, values replaced with placeholders.

---

## API Surface (final)

| Method | Path | Description |
|---|---|---|
| GET | /templates | List all templates |
| POST | /templates | Create template |
| GET | /templates/:id | Get template by ID |
| PUT | /templates/:id | Update template |
| DELETE | /templates/:id | Delete template |
| POST | /api/generate-pdf | Generate PDF → binary response |
| GET | /health | Health check |
| GET | /docs | Swagger UI |

---

## Error Handling

- DB connection failure on startup → log error and exit process (fail fast; Docker will restart)
- SQL errors in request handlers → `500` with `{ error: "Internal server error" }`
- Template not found → `404` with `{ error: "Template not found" }`
- All SQL inputs parameterised — no injection risk

---

## Out of Scope

- Authentication / API keys
- Storing generated PDFs
- Frontend changes (client continues to call `/templates/*` as before)
- `pdfme` → `nexgendoc` CSS rename (deferred, noted by supervisor)

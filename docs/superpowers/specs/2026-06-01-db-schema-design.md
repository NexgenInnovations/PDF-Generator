# DB Schema Design — PDF Generator

**Date:** 2026-06-01  
**Status:** Approved  
**Database:** PostgreSQL  

---

## Overview

Four tables to support:
- Template storage with immutable version history (audit log, no restore)
- Client-filled field submissions tied to a specific template version
- Generated PDF records with file path reference and full JSON snapshots

---

## Tables

### `pdf_templates`

The template header. One row per template. Tracks the latest version number.

```sql
CREATE TABLE pdf_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  current_version INT         NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### `template_versions`

Immutable audit log of schema changes. Every save appends a new row — rows are never updated or deleted. The full schema is stored whole and also split into `base_pdf` and `schemas` for convenient direct access without parsing the full blob.

```sql
CREATE TABLE template_versions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        NOT NULL REFERENCES pdf_templates(id) ON DELETE CASCADE,
  version     INT         NOT NULL,
  schema      JSONB       NOT NULL,  -- full pdfme template JSON (basePdf + schemas + staticSchemas)
  base_pdf    JSONB       NOT NULL,  -- extracted basePdf for quick access
  schemas     JSONB       NOT NULL,  -- extracted schemas 2D array for quick access
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_template_version UNIQUE (template_id, version)
);

CREATE INDEX idx_template_versions_template_id ON template_versions(template_id);
```

---

### `filled_submissions`

One row per client form submission. Records which template version the client was shown and the exact inputs they provided.

```sql
CREATE TABLE filled_submissions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      UUID        NOT NULL REFERENCES pdf_templates(id) ON DELETE CASCADE,
  template_version INT         NOT NULL,
  inputs           JSONB       NOT NULL,  -- [{"field1": "val", "field2": "val"}, ...]
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_filled_submissions_template_id ON filled_submissions(template_id);
```

---

### `generated_pdfs`

One row per generated PDF. Links back to the submission and snapshots both the inputs and the full schema at generation time — preserving exactly what was used to produce the file, independent of future template changes.

```sql
CREATE TABLE generated_pdfs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id    UUID        NOT NULL REFERENCES filled_submissions(id) ON DELETE CASCADE,
  template_id      UUID        NOT NULL REFERENCES pdf_templates(id),         -- denormalized for fast lookup
  template_version INT         NOT NULL,                                       -- denormalized for fast lookup
  inputs_snapshot  JSONB       NOT NULL,  -- copy of inputs at generation time
  schema_snapshot  JSONB       NOT NULL,  -- copy of full schema at generation time
  file_path        TEXT        NOT NULL,  -- disk path or cloud storage URL
  file_size_bytes  BIGINT,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_generated_pdfs_template_id  ON generated_pdfs(template_id);
CREATE INDEX idx_generated_pdfs_submission_id ON generated_pdfs(submission_id);
```

---

## Relationships

```
pdf_templates
  └── template_versions       (one template → many versions)
  └── filled_submissions      (one template → many submissions)
        └── generated_pdfs    (one submission → one generated PDF)
                              (also directly references pdf_templates for fast lookup)
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| `template_versions` rows are immutable | Version history is audit-only; no restore path needed |
| `version` auto-increments per template | Application layer increments `current_version` on `pdf_templates` and writes the new row |
| `base_pdf` and `schemas` split out on versions | Avoids parsing the full `schema` blob when only one part is needed |
| `inputs_snapshot` + `schema_snapshot` on `generated_pdfs` | Preserves the exact state used to produce a PDF, independent of future edits |
| `template_id` denormalized on `generated_pdfs` | Allows querying "all PDFs for template X" without joining through submissions |
| `file_path` is TEXT | Supports both local disk paths and cloud storage URLs (S3, Azure Blob, etc.) |

---

## Migration File Naming Convention

```
server/migrations/
  001_create_pdf_templates.sql
  002_create_template_versions.sql
  003_create_filled_submissions.sql
  004_create_generated_pdfs.sql
```

---

## Out of Scope

- User authentication / ownership of templates
- Soft deletes (CASCADE delete is used)
- PDF file storage implementation (file_path is a pointer only)
- API route changes (separate plan)

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

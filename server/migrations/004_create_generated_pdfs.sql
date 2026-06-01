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

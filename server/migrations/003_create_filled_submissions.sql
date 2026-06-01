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

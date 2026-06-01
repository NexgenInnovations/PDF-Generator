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

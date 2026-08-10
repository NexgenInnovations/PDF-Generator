// server/src/db.ts
import pg from 'pg';

const { Pool, types } = pg;

// bigint columns (file_size_bytes) are returned by node-postgres as strings
// by default, to avoid precision loss above Number.MAX_SAFE_INTEGER. The
// original MSSQL driver returned BIGINT columns as native JS numbers, and
// db.ts's exported row types declare file_size_bytes as `number` — so parse
// OID 20 (bigint) as an integer to match that behavior exactly. File sizes
// stay far below Number.MAX_SAFE_INTEGER, so this is safe.
types.setTypeParser(20, (val: string) => parseInt(val, 10));

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL ?? '',
});

// An idle client can emit an 'error' event (e.g. the DB restarting or the
// connection being dropped by the server). Without a listener, that event
// crashes the Node process — this keeps it a logged, non-fatal event.
pool.on('error', (err) => console.error('Unexpected Postgres pool error', err));

export async function initDb(): Promise<void> {
  await pool.query('select 1');
  console.log('Connected to Postgres (Supabase)');
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TemplateRow {
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
  status: 'draft' | 'published';
  tag: string | null;
  schema: unknown;
  base_pdf: unknown;
  schemas: unknown;
  created_at: string;
}

interface TemplateVersionDbRow {
  id: string;
  template_id: string;
  version: number;
  status: 'draft' | 'published';
  tag: string | null;
  schema: string;
  base_pdf: string;
  schemas: string;
  created_at: string;
}

export interface FilledSubmissionRow {
  id: string;
  template_id: string;
  template_version: number;
  inputs: unknown;
  submitted_at: string;
}

interface FilledSubmissionDbRow extends Omit<FilledSubmissionRow, 'inputs'> {
  inputs: string;
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

interface GeneratedPdfDbRow extends Omit<GeneratedPdfRow, 'inputs_snapshot' | 'schema_snapshot'> {
  inputs_snapshot: string;
  schema_snapshot: string;
}

export interface SignatureEventRow {
  id: string;
  submission_id: string;
  field_name: string;
  signer_name: string;
  signer_email: string;
  signed_at: string;
  ip_address: string | null;
  document_hash: string;
}

export interface CompanyAssetRow {
  id: string;
  name: string;
  file_path: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
}

export interface LetterheadRow {
  id: string;
  name: string;
  type: 'fields' | 'pdf';
  static_schema: unknown | null;
  page_width: number | null;
  page_height: number | null;
  base_pdf: string | null;
  created_at: string;
  updated_at: string;
}

export interface LetterheadSummaryRow {
  id: string;
  name: string;
  type: 'fields' | 'pdf';
  page_width: number | null;
  page_height: number | null;
  created_at: string;
  updated_at: string;
}

interface LetterheadDbRow extends Omit<LetterheadRow, 'static_schema'> {
  static_schema: string | null;
}

// ─── pdf_templates ───────────────────────────────────────────────────────────

export async function listTemplates(): Promise<TemplateRow[]> {
  const { rows } = await pool.query<TemplateRow>(
    `SELECT id, name, current_version, created_at, updated_at FROM pdf_templates ORDER BY created_at DESC`
  );
  return rows;
}

export async function getTemplate(id: string): Promise<TemplateRow | null> {
  const { rows } = await pool.query<TemplateRow>(
    `SELECT id, name, current_version, created_at, updated_at FROM pdf_templates WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createTemplate(name: string): Promise<TemplateRow> {
  const { rows } = await pool.query<TemplateRow>(`INSERT INTO pdf_templates (name) VALUES ($1) RETURNING *`, [name]);
  return rows[0];
}

export async function updateTemplate(id: string, name: string): Promise<TemplateRow | null> {
  const { rows } = await pool.query<TemplateRow>(
    `UPDATE pdf_templates SET name = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [name, id]
  );
  return rows[0] ?? null;
}

export async function deleteTemplate(id: string): Promise<void> {
  await pool.query(`DELETE FROM pdf_templates WHERE id = $1`, [id]);
}

// ─── template_versions ───────────────────────────────────────────────────────

function parseVersionRow(row: TemplateVersionDbRow): TemplateVersionRow {
  return { ...row, schema: JSON.parse(row.schema), base_pdf: JSON.parse(row.base_pdf), schemas: JSON.parse(row.schemas) };
}

export async function saveDraft(templateId: string, schema: unknown): Promise<TemplateVersionRow> {
  const schemaObj = schema as { basePdf?: unknown; schemas?: unknown };
  const schemaStr = JSON.stringify(schema);
  const basePdfStr = JSON.stringify(schemaObj.basePdf ?? null);
  const schemasStr = JSON.stringify(schemaObj.schemas ?? null);

  const { rows: existing } = await pool.query<{ id: string }>(
    `SELECT id FROM template_versions WHERE template_id = $1 AND status = 'draft'`,
    [templateId]
  );

  if (existing[0]) {
    const { rows } = await pool.query<TemplateVersionDbRow>(
      `UPDATE template_versions SET schema = $1, base_pdf = $2, schemas = $3, created_at = now() WHERE id = $4 RETURNING *`,
      [schemaStr, basePdfStr, schemasStr, existing[0].id]
    );
    return parseVersionRow(rows[0]);
  }

  const { rows: templateRows } = await pool.query(`SELECT id FROM pdf_templates WHERE id = $1`, [templateId]);
  if (!templateRows[0]) throw new Error('Template not found');

  // Drafts always use the reserved sentinel version 0 — never a real
  // published version number — so a template's first-ever publish can
  // start at version 1 without colliding with the draft row under the
  // UNIQUE (template_id, version) constraint.
  const { rows } = await pool.query<TemplateVersionDbRow>(
    `INSERT INTO template_versions (template_id, version, status, tag, schema, base_pdf, schemas)
     VALUES ($1, 0, 'draft', NULL, $2, $3, $4) RETURNING *`,
    [templateId, schemaStr, basePdfStr, schemasStr]
  );
  return parseVersionRow(rows[0]);
}

export async function getDraft(templateId: string): Promise<TemplateVersionRow | null> {
  const { rows } = await pool.query<TemplateVersionDbRow>(
    `SELECT * FROM template_versions WHERE template_id = $1 AND status = 'draft'`,
    [templateId]
  );
  return rows[0] ? parseVersionRow(rows[0]) : null;
}

export async function publishVersion(
  templateId: string,
  schema: unknown,
  tag: string,
  target: { mode: 'new' } | { mode: 'replace'; version: number }
): Promise<TemplateVersionRow> {
  const schemaObj = schema as { basePdf?: unknown; schemas?: unknown };
  const schemaStr = JSON.stringify(schema);
  const basePdfStr = JSON.stringify(schemaObj.basePdf ?? null);
  const schemasStr = JSON.stringify(schemaObj.schemas ?? null);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let row: TemplateVersionDbRow;
    if (target.mode === 'new') {
      const { rows: updated } = await client.query<{ current_version: number }>(
        `UPDATE pdf_templates SET current_version = current_version + 1, updated_at = now() WHERE id = $1 RETURNING current_version`,
        [templateId]
      );
      if (!updated[0]) throw new Error('Template not found');
      const version = updated[0].current_version;

      const { rows } = await client.query<TemplateVersionDbRow>(
        `INSERT INTO template_versions (template_id, version, status, tag, schema, base_pdf, schemas)
         VALUES ($1, $2, 'published', $3, $4, $5, $6) RETURNING *`,
        [templateId, version, tag, schemaStr, basePdfStr, schemasStr]
      );
      row = rows[0];
    } else {
      const { rows } = await client.query<TemplateVersionDbRow>(
        `UPDATE template_versions SET tag = $1, schema = $2, base_pdf = $3, schemas = $4, created_at = now()
         WHERE template_id = $5 AND version = $6 AND status = 'published' RETURNING *`,
        [tag, schemaStr, basePdfStr, schemasStr, templateId, target.version]
      );
      if (!rows[0]) throw new Error('Published version not found');
      row = rows[0];
    }

    await client.query('COMMIT');
    return parseVersionRow(row);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listPublishedVersions(templateId: string): Promise<TemplateVersionRow[]> {
  const { rows } = await pool.query<TemplateVersionDbRow>(
    `SELECT * FROM template_versions WHERE template_id = $1 AND status = 'published' ORDER BY version DESC`,
    [templateId]
  );
  return rows.map(parseVersionRow);
}

export async function getPublishedVersion(
  templateId: string,
  ref: { version: number } | { tag: string }
): Promise<TemplateVersionRow | null> {
  const { rows } =
    'version' in ref
      ? await pool.query<TemplateVersionDbRow>(
          `SELECT * FROM template_versions WHERE template_id = $1 AND version = $2 AND status = 'published'`,
          [templateId, ref.version]
        )
      : await pool.query<TemplateVersionDbRow>(
          `SELECT * FROM template_versions WHERE template_id = $1 AND tag = $2 AND status = 'published'`,
          [templateId, ref.tag]
        );
  return rows[0] ? parseVersionRow(rows[0]) : null;
}

export async function getLatestPublishedVersion(templateId: string): Promise<TemplateVersionRow | null> {
  const { rows } = await pool.query<TemplateVersionDbRow>(
    `SELECT * FROM template_versions WHERE template_id = $1 AND status = 'published' ORDER BY version DESC LIMIT 1`,
    [templateId]
  );
  return rows[0] ? parseVersionRow(rows[0]) : null;
}

// ─── filled_submissions ───────────────────────────────────────────────────────

export async function createFilledSubmission(
  templateId: string,
  templateVersion: number,
  inputs: unknown
): Promise<FilledSubmissionRow> {
  const { rows } = await pool.query<FilledSubmissionDbRow>(
    `INSERT INTO filled_submissions (template_id, template_version, inputs) VALUES ($1, $2, $3) RETURNING *`,
    [templateId, templateVersion, JSON.stringify(inputs)]
  );
  return { ...rows[0], inputs: JSON.parse(rows[0].inputs) };
}

export async function getFilledSubmission(id: string): Promise<FilledSubmissionRow | null> {
  const { rows } = await pool.query<FilledSubmissionDbRow>(`SELECT * FROM filled_submissions WHERE id = $1`, [id]);
  return rows[0] ? { ...rows[0], inputs: JSON.parse(rows[0].inputs) } : null;
}

export async function listSubmissionsForTemplate(templateId: string): Promise<FilledSubmissionRow[]> {
  const { rows } = await pool.query<FilledSubmissionDbRow>(
    `SELECT * FROM filled_submissions WHERE template_id = $1 ORDER BY submitted_at DESC`,
    [templateId]
  );
  return rows.map((row) => ({ ...row, inputs: JSON.parse(row.inputs) }));
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
  const { rows } = await pool.query<GeneratedPdfDbRow>(
    `INSERT INTO generated_pdfs
       (submission_id, template_id, template_version, inputs_snapshot, schema_snapshot, file_path, file_size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
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
  const row = rows[0];
  return { ...row, inputs_snapshot: JSON.parse(row.inputs_snapshot), schema_snapshot: JSON.parse(row.schema_snapshot) };
}

// ─── company_assets ──────────────────────────────────────────────────────────

export async function listAssets(): Promise<CompanyAssetRow[]> {
  const { rows } = await pool.query<CompanyAssetRow>(
    `SELECT id, name, file_path, mime_type, file_size_bytes, created_at FROM company_assets ORDER BY created_at DESC`
  );
  return rows;
}

export async function getAsset(id: string): Promise<CompanyAssetRow | null> {
  const { rows } = await pool.query<CompanyAssetRow>(`SELECT * FROM company_assets WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createAsset(input: {
  name: string;
  filePath: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<CompanyAssetRow> {
  const { rows } = await pool.query<CompanyAssetRow>(
    `INSERT INTO company_assets (name, file_path, mime_type, file_size_bytes) VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.name, input.filePath, input.mimeType, input.fileSizeBytes]
  );
  return rows[0];
}

export async function deleteAsset(id: string): Promise<CompanyAssetRow | null> {
  const { rows } = await pool.query<CompanyAssetRow>(`DELETE FROM company_assets WHERE id = $1 RETURNING *`, [id]);
  return rows[0] ?? null;
}

// ─── letterheads ──────────────────────────────────────────────────────────────

function parseLetterheadRow(row: LetterheadDbRow): LetterheadRow {
  return { ...row, static_schema: row.static_schema ? JSON.parse(row.static_schema) : null };
}

export async function listLetterheads(): Promise<LetterheadSummaryRow[]> {
  const { rows } = await pool.query<LetterheadSummaryRow>(
    `SELECT id, name, type, page_width, page_height, created_at, updated_at FROM letterheads ORDER BY updated_at DESC`
  );
  return rows;
}

export async function getLetterhead(id: string): Promise<LetterheadRow | null> {
  const { rows } = await pool.query<LetterheadDbRow>(
    `SELECT id, name, type, static_schema, page_width, page_height, base_pdf, created_at, updated_at FROM letterheads WHERE id = $1`,
    [id]
  );
  return rows[0] ? parseLetterheadRow(rows[0]) : null;
}

export async function createLetterhead(input: {
  name: string;
  type: 'fields' | 'pdf';
  staticSchema?: unknown;
  pageWidth?: number;
  pageHeight?: number;
  basePdf?: string;
}): Promise<LetterheadRow> {
  const { rows } = await pool.query<LetterheadDbRow>(
    `INSERT INTO letterheads (name, type, static_schema, page_width, page_height, base_pdf)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, type, static_schema, page_width, page_height, base_pdf, created_at, updated_at`,
    [
      input.name,
      input.type,
      input.staticSchema !== undefined ? JSON.stringify(input.staticSchema) : null,
      input.pageWidth ?? null,
      input.pageHeight ?? null,
      input.basePdf ?? null,
    ]
  );
  return parseLetterheadRow(rows[0]);
}

export async function updateLetterhead(
  id: string,
  input: { name?: string; staticSchema?: unknown; pageWidth?: number; pageHeight?: number; basePdf?: string }
): Promise<LetterheadRow | null> {
  const existing = await getLetterhead(id);
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const staticSchema = input.staticSchema !== undefined ? input.staticSchema : existing.static_schema;
  const pageWidth = input.pageWidth ?? existing.page_width;
  const pageHeight = input.pageHeight ?? existing.page_height;
  const basePdf = input.basePdf ?? existing.base_pdf;

  const { rows } = await pool.query<LetterheadDbRow>(
    `UPDATE letterheads SET name = $1, static_schema = $2, page_width = $3, page_height = $4, base_pdf = $5, updated_at = now()
     WHERE id = $6
     RETURNING id, name, type, static_schema, page_width, page_height, base_pdf, created_at, updated_at`,
    [name, staticSchema !== null && staticSchema !== undefined ? JSON.stringify(staticSchema) : null, pageWidth, pageHeight, basePdf, id]
  );
  return rows[0] ? parseLetterheadRow(rows[0]) : null;
}

export async function deleteLetterhead(id: string): Promise<void> {
  await pool.query(`DELETE FROM letterheads WHERE id = $1`, [id]);
}

// ─── signature_events ───────────────────────────────────────────────────────

export async function createSignatureEvent(input: {
  submissionId: string;
  fieldName: string;
  signerName: string;
  signerEmail: string;
  ipAddress: string | null;
  documentHash: string;
}): Promise<SignatureEventRow> {
  const { rows } = await pool.query<SignatureEventRow>(
    `INSERT INTO signature_events (submission_id, field_name, signer_name, signer_email, ip_address, document_hash)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.submissionId, input.fieldName, input.signerName, input.signerEmail, input.ipAddress, input.documentHash]
  );
  return rows[0];
}

export async function listSignatureEventsForSubmission(submissionId: string): Promise<SignatureEventRow[]> {
  const { rows } = await pool.query<SignatureEventRow>(
    `SELECT * FROM signature_events WHERE submission_id = $1 ORDER BY signed_at ASC`,
    [submissionId]
  );
  return rows;
}

export async function createWaitlistSignup(name: string, email: string): Promise<{ alreadyOnList: boolean }> {
  try {
    await pool.query(`INSERT INTO waitlist_signups (name, email) VALUES ($1, $2)`, [name, email]);
    return { alreadyOnList: false };
  } catch (error) {
    if (isUniqueViolation(error)) return { alreadyOnList: true };
    throw error;
  }
}

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
  await ensureTables();
}

function getPool(): sql.ConnectionPool {
  if (!pool) throw new Error('DB not initialised — call initDb() first');
  return pool;
}

async function ensureTables(): Promise<void> {
  const p = getPool();

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'pdf_templates')
    CREATE TABLE pdf_templates (
      id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      name            NVARCHAR(255)    NOT NULL,
      current_version INT              NOT NULL DEFAULT 0,
      created_at      DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      updated_at      DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);

  // current_version now means "last version number assigned to a published
  // row" (0 = nothing published yet), not "the table's DEFAULT NEWID()-style
  // starting number" — drafts use a fixed sentinel version (0) instead of
  // reading current_version, so publishing the first version always yields
  // version 1. Re-point the column default on databases created before this
  // change (existing rows keep their real current_version value, which
  // already correctly means "last published version number" under the old
  // model too — no data migration needed, only new templates need the new
  // default).
  await p.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.default_constraints dc
      JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
      WHERE dc.parent_object_id = OBJECT_ID('pdf_templates') AND c.name = 'current_version' AND dc.definition = '((1))'
    )
    BEGIN
      DECLARE @constraintName NVARCHAR(200);
      SELECT @constraintName = dc.name
      FROM sys.default_constraints dc
      JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
      WHERE dc.parent_object_id = OBJECT_ID('pdf_templates') AND c.name = 'current_version' AND dc.definition = '((1))';
      EXEC('ALTER TABLE pdf_templates DROP CONSTRAINT ' + @constraintName);
      EXEC('ALTER TABLE pdf_templates ADD CONSTRAINT df_pdf_templates_current_version DEFAULT 0 FOR current_version');
    END
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'template_versions')
    CREATE TABLE template_versions (
      id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      template_id UNIQUEIDENTIFIER NOT NULL REFERENCES pdf_templates(id) ON DELETE CASCADE,
      version     INT              NOT NULL,
      status      NVARCHAR(20)     NOT NULL DEFAULT 'published',
      tag         NVARCHAR(255)    NULL,
      [schema]    NVARCHAR(MAX)    NOT NULL,
      base_pdf    NVARCHAR(MAX)    NOT NULL,
      [schemas]   NVARCHAR(MAX)    NOT NULL,
      created_at  DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT uq_template_version UNIQUE (template_id, version)
    )
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('template_versions') AND name = 'status')
    ALTER TABLE template_versions ADD status NVARCHAR(20) NOT NULL DEFAULT 'published'
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('template_versions') AND name = 'tag')
    ALTER TABLE template_versions ADD tag NVARCHAR(255) NULL
  `);

  // Backfill a synthetic tag for pre-existing published rows saved before
  // tags existed (version numbers are already unique per template, so this
  // is guaranteed collision-free and lets the uniqueness index below be
  // created without manual data cleanup).
  await p.request().query(`
    UPDATE template_versions
    SET tag = 'v' + CAST(version AS NVARCHAR(20))
    WHERE status = 'published' AND tag IS NULL
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_template_versions_tag' AND object_id = OBJECT_ID('template_versions'))
    CREATE UNIQUE INDEX uq_template_versions_tag
      ON template_versions(template_id, tag)
      WHERE status = 'published'
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'filled_submissions')
    CREATE TABLE filled_submissions (
      id               UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      template_id      UNIQUEIDENTIFIER NOT NULL REFERENCES pdf_templates(id) ON DELETE CASCADE,
      template_version INT              NOT NULL,
      [inputs]         NVARCHAR(MAX)    NOT NULL,
      submitted_at     DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'generated_pdfs')
    CREATE TABLE generated_pdfs (
      id               UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      submission_id    UNIQUEIDENTIFIER NOT NULL REFERENCES filled_submissions(id),
      template_id      UNIQUEIDENTIFIER NOT NULL REFERENCES pdf_templates(id),
      template_version INT              NOT NULL,
      inputs_snapshot  NVARCHAR(MAX)    NOT NULL,
      schema_snapshot  NVARCHAR(MAX)    NOT NULL,
      file_path        NVARCHAR(1000)   NOT NULL,
      file_size_bytes  BIGINT,
      generated_at     DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'company_assets')
    CREATE TABLE company_assets (
      id               UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      name             NVARCHAR(255)    NOT NULL,
      file_path        NVARCHAR(1000)   NOT NULL,
      mime_type        NVARCHAR(100)    NOT NULL,
      file_size_bytes  BIGINT           NOT NULL,
      created_at       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'letterheads')
    CREATE TABLE letterheads (
      id               UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      name             NVARCHAR(255)    NOT NULL,
      static_schema    NVARCHAR(MAX)    NOT NULL,
      page_width       FLOAT            NOT NULL,
      page_height      FLOAT            NOT NULL,
      created_at       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      updated_at       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('letterheads') AND name = 'type')
    ALTER TABLE letterheads ADD type NVARCHAR(10) NOT NULL DEFAULT 'fields'
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('letterheads') AND name = 'base_pdf')
    ALTER TABLE letterheads ADD base_pdf NVARCHAR(MAX) NULL
  `);

  await p.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('letterheads') AND name = 'static_schema' AND is_nullable = 0
    )
    ALTER TABLE letterheads ALTER COLUMN static_schema NVARCHAR(MAX) NULL
  `);

  await p.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('letterheads') AND name = 'page_width' AND is_nullable = 0
    )
    ALTER TABLE letterheads ALTER COLUMN page_width FLOAT NULL
  `);

  await p.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('letterheads') AND name = 'page_height' AND is_nullable = 0
    )
    ALTER TABLE letterheads ALTER COLUMN page_height FLOAT NULL
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'signature_events')
    CREATE TABLE signature_events (
      id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      submission_id   UNIQUEIDENTIFIER NOT NULL REFERENCES filled_submissions(id),
      field_name      NVARCHAR(255)    NOT NULL,
      signer_name     NVARCHAR(255)    NOT NULL,
      signer_email    NVARCHAR(320)    NOT NULL,
      signed_at       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      ip_address      NVARCHAR(45)     NULL,
      document_hash   NVARCHAR(64)     NOT NULL
    )
  `);

  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'waitlist_signups')
    CREATE TABLE waitlist_signups (
      id              INT IDENTITY(1,1) PRIMARY KEY,
      name            NVARCHAR(200)    NOT NULL,
      email           NVARCHAR(320)    NOT NULL,
      created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT uq_waitlist_signups_email UNIQUE (email)
    )
  `);

  console.log('Tables ready');
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

// ─── pdf_templates ───────────────────────────────────────────────────────────

export async function listTemplates(): Promise<TemplateRow[]> {
  const result = await getPool().request().query(
    'SELECT id, name, current_version, created_at, updated_at FROM pdf_templates ORDER BY created_at DESC'
  );
  return result.recordset;
}

export async function getTemplate(id: string): Promise<TemplateRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('SELECT id, name, current_version, created_at, updated_at FROM pdf_templates WHERE id = @id');
  return result.recordset[0] ?? null;
}

export async function createTemplate(name: string): Promise<TemplateRow> {
  const result = await getPool()
    .request()
    .input('name', sql.NVarChar(255), name)
    .query(`
      INSERT INTO pdf_templates (name)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.current_version,
             INSERTED.created_at, INSERTED.updated_at
      VALUES (@name)
    `);
  return result.recordset[0];
}

export async function updateTemplate(id: string, name: string): Promise<TemplateRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar(255), name)
    .query(`
      UPDATE pdf_templates
      SET name = @name, updated_at = GETUTCDATE()
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.current_version,
             INSERTED.created_at, INSERTED.updated_at
      WHERE id = @id
    `);
  return result.recordset[0] ?? null;
}

export async function deleteTemplate(id: string): Promise<void> {
  await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('DELETE FROM pdf_templates WHERE id = @id');
}

// ─── template_versions ───────────────────────────────────────────────────────

function parseVersionRow(row: Record<string, unknown>): TemplateVersionRow {
  return {
    ...row,
    schema: JSON.parse(row.schema as string),
    base_pdf: JSON.parse(row.base_pdf as string),
    schemas: JSON.parse(row.schemas as string),
  } as TemplateVersionRow;
}

export async function saveDraft(templateId: string, schema: unknown): Promise<TemplateVersionRow> {
  const p = getPool();
  const schemaObj = schema as { basePdf?: unknown; schemas?: unknown };
  const schemaVal = JSON.stringify(schema);
  const basePdfVal = JSON.stringify(schemaObj.basePdf ?? null);
  const schemasVal = JSON.stringify(schemaObj.schemas ?? null);

  const existing = await p.request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query(`SELECT id FROM template_versions WHERE template_id = @tid AND status = 'draft'`);

  if (existing.recordset[0]) {
    const result = await p.request()
      .input('id', sql.UniqueIdentifier, existing.recordset[0].id)
      .input('schema_val', sql.NVarChar(sql.MAX), schemaVal)
      .input('base_pdf', sql.NVarChar(sql.MAX), basePdfVal)
      .input('schemas_val', sql.NVarChar(sql.MAX), schemasVal)
      .query(`
        UPDATE template_versions
        SET [schema] = @schema_val, base_pdf = @base_pdf, [schemas] = @schemas_val, created_at = GETUTCDATE()
        OUTPUT INSERTED.id, INSERTED.template_id, INSERTED.version, INSERTED.status, INSERTED.tag,
               INSERTED.[schema], INSERTED.base_pdf, INSERTED.[schemas], INSERTED.created_at
        WHERE id = @id
      `);
    return parseVersionRow(result.recordset[0]);
  }

  const templateExists = await p.request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query('SELECT id FROM pdf_templates WHERE id = @tid');
  if (!templateExists.recordset[0]) throw new Error('Template not found');

  // Drafts always use the reserved sentinel version 0 — never a real
  // published version number — so a template's first-ever publish can
  // start at version 1 without colliding with the draft row under the
  // UNIQUE (template_id, version) constraint.
  const insertResult = await p.request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .input('version', sql.Int, 0)
    .input('schema_val', sql.NVarChar(sql.MAX), schemaVal)
    .input('base_pdf', sql.NVarChar(sql.MAX), basePdfVal)
    .input('schemas_val', sql.NVarChar(sql.MAX), schemasVal)
    .query(`
      INSERT INTO template_versions (template_id, version, status, tag, [schema], base_pdf, [schemas])
      OUTPUT INSERTED.id, INSERTED.template_id, INSERTED.version, INSERTED.status, INSERTED.tag,
             INSERTED.[schema], INSERTED.base_pdf, INSERTED.[schemas], INSERTED.created_at
      VALUES (@tid, @version, 'draft', NULL, @schema_val, @base_pdf, @schemas_val)
    `);
  return parseVersionRow(insertResult.recordset[0]);
}

export async function getDraft(templateId: string): Promise<TemplateVersionRow | null> {
  const result = await getPool()
    .request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query(`
      SELECT id, template_id, version, status, tag, [schema], base_pdf, [schemas], created_at
      FROM template_versions
      WHERE template_id = @tid AND status = 'draft'
    `);
  const row = result.recordset[0];
  return row ? parseVersionRow(row) : null;
}

export async function publishVersion(
  templateId: string,
  schema: unknown,
  tag: string,
  target: { mode: 'new' } | { mode: 'replace'; version: number }
): Promise<TemplateVersionRow> {
  const p = getPool();
  const transaction = new sql.Transaction(p);
  await transaction.begin();
  try {
    const schemaObj = schema as { basePdf?: unknown; schemas?: unknown };
    const schemaVal = JSON.stringify(schema);
    const basePdfVal = JSON.stringify(schemaObj.basePdf ?? null);
    const schemasVal = JSON.stringify(schemaObj.schemas ?? null);

    let row: Record<string, unknown>;

    if (target.mode === 'new') {
      const versionResult = await transaction.request()
        .input('tid', sql.UniqueIdentifier, templateId)
        .query(`
          UPDATE pdf_templates
          SET current_version = current_version + 1, updated_at = GETUTCDATE()
          OUTPUT INSERTED.current_version
          WHERE id = @tid
        `);
      if (!versionResult.recordset[0]) throw new Error('Template not found');
      const version = versionResult.recordset[0].current_version as number;

      const insertResult = await transaction.request()
        .input('tid', sql.UniqueIdentifier, templateId)
        .input('version', sql.Int, version)
        .input('tag', sql.NVarChar(255), tag)
        .input('schema_val', sql.NVarChar(sql.MAX), schemaVal)
        .input('base_pdf', sql.NVarChar(sql.MAX), basePdfVal)
        .input('schemas_val', sql.NVarChar(sql.MAX), schemasVal)
        .query(`
          INSERT INTO template_versions (template_id, version, status, tag, [schema], base_pdf, [schemas])
          OUTPUT INSERTED.id, INSERTED.template_id, INSERTED.version, INSERTED.status, INSERTED.tag,
                 INSERTED.[schema], INSERTED.base_pdf, INSERTED.[schemas], INSERTED.created_at
          VALUES (@tid, @version, 'published', @tag, @schema_val, @base_pdf, @schemas_val)
        `);
      row = insertResult.recordset[0];
    } else {
      const updateResult = await transaction.request()
        .input('tid', sql.UniqueIdentifier, templateId)
        .input('version', sql.Int, target.version)
        .input('tag', sql.NVarChar(255), tag)
        .input('schema_val', sql.NVarChar(sql.MAX), schemaVal)
        .input('base_pdf', sql.NVarChar(sql.MAX), basePdfVal)
        .input('schemas_val', sql.NVarChar(sql.MAX), schemasVal)
        .query(`
          UPDATE template_versions
          SET tag = @tag, [schema] = @schema_val, base_pdf = @base_pdf, [schemas] = @schemas_val, created_at = GETUTCDATE()
          OUTPUT INSERTED.id, INSERTED.template_id, INSERTED.version, INSERTED.status, INSERTED.tag,
                 INSERTED.[schema], INSERTED.base_pdf, INSERTED.[schemas], INSERTED.created_at
          WHERE template_id = @tid AND version = @version AND status = 'published'
        `);
      if (!updateResult.recordset[0]) throw new Error('Published version not found');
      row = updateResult.recordset[0];
    }

    await transaction.commit();
    return parseVersionRow(row);
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}

export async function listPublishedVersions(templateId: string): Promise<TemplateVersionRow[]> {
  const result = await getPool()
    .request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query(`
      SELECT id, template_id, version, status, tag, [schema], base_pdf, [schemas], created_at
      FROM template_versions
      WHERE template_id = @tid AND status = 'published'
      ORDER BY version DESC
    `);
  return result.recordset.map(parseVersionRow);
}

export async function getPublishedVersion(
  templateId: string,
  ref: { version: number } | { tag: string }
): Promise<TemplateVersionRow | null> {
  const request = getPool().request().input('tid', sql.UniqueIdentifier, templateId);
  let result;
  if ('version' in ref) {
    result = await request
      .input('version', sql.Int, ref.version)
      .query(`
        SELECT id, template_id, version, status, tag, [schema], base_pdf, [schemas], created_at
        FROM template_versions WHERE template_id = @tid AND version = @version AND status = 'published'
      `);
  } else {
    result = await request
      .input('tag', sql.NVarChar(255), ref.tag)
      .query(`
        SELECT id, template_id, version, status, tag, [schema], base_pdf, [schemas], created_at
        FROM template_versions WHERE template_id = @tid AND tag = @tag AND status = 'published'
      `);
  }
  const row = result.recordset[0];
  return row ? parseVersionRow(row) : null;
}

export async function getLatestPublishedVersion(templateId: string): Promise<TemplateVersionRow | null> {
  const result = await getPool()
    .request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query(`
      SELECT TOP 1 id, template_id, version, status, tag, [schema], base_pdf, [schemas], created_at
      FROM template_versions
      WHERE template_id = @tid AND status = 'published'
      ORDER BY version DESC
    `);
  const row = result.recordset[0];
  return row ? parseVersionRow(row) : null;
}

// ─── filled_submissions ───────────────────────────────────────────────────────

export async function createFilledSubmission(
  templateId: string,
  templateVersion: number,
  inputs: unknown
): Promise<FilledSubmissionRow> {
  const result = await getPool()
    .request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .input('version', sql.Int, templateVersion)
    .input('inputs_val', sql.NVarChar(sql.MAX), JSON.stringify(inputs))
    .query(`
      INSERT INTO filled_submissions (template_id, template_version, [inputs])
      OUTPUT INSERTED.id, INSERTED.template_id, INSERTED.template_version,
             INSERTED.[inputs], INSERTED.submitted_at
      VALUES (@tid, @version, @inputs_val)
    `);
  const row = result.recordset[0];
  return { ...row, inputs: JSON.parse(row.inputs as string) };
}

export async function listFilledSubmissions(templateId: string): Promise<FilledSubmissionRow[]> {
  const result = await getPool()
    .request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query(`
      SELECT id, template_id, template_version, [inputs], submitted_at
      FROM filled_submissions
      WHERE template_id = @tid
      ORDER BY submitted_at DESC
    `);
  return result.recordset.map(row => ({ ...row, inputs: JSON.parse(row.inputs as string) }));
}

export async function getFilledSubmission(id: string): Promise<FilledSubmissionRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`
      SELECT id, template_id, template_version, [inputs], submitted_at
      FROM filled_submissions WHERE id = @id
    `);
  const row = result.recordset[0];
  if (!row) return null;
  return { ...row, inputs: JSON.parse(row.inputs as string) };
}

export async function listSubmissionsForTemplate(templateId: string): Promise<FilledSubmissionRow[]> {
  const result = await getPool()
    .request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query(`
      SELECT id, template_id, template_version, [inputs], submitted_at
      FROM filled_submissions
      WHERE template_id = @tid
      ORDER BY submitted_at DESC
    `);
  return result.recordset.map(row => ({
    ...row,
    inputs: JSON.parse(row.inputs as string),
  }));
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
  const result = await getPool()
    .request()
    .input('sid', sql.UniqueIdentifier, opts.submissionId)
    .input('tid', sql.UniqueIdentifier, opts.templateId)
    .input('version', sql.Int, opts.templateVersion)
    .input('inputs_snapshot', sql.NVarChar(sql.MAX), JSON.stringify(opts.inputsSnapshot))
    .input('schema_snapshot', sql.NVarChar(sql.MAX), JSON.stringify(opts.schemaSnapshot))
    .input('file_path', sql.NVarChar(1000), opts.filePath)
    .input('file_size_bytes', sql.BigInt, opts.fileSizeBytes ?? null)
    .query(`
      INSERT INTO generated_pdfs
        (submission_id, template_id, template_version, inputs_snapshot, schema_snapshot, file_path, file_size_bytes)
      OUTPUT INSERTED.id, INSERTED.submission_id, INSERTED.template_id, INSERTED.template_version,
             INSERTED.inputs_snapshot, INSERTED.schema_snapshot, INSERTED.file_path,
             INSERTED.file_size_bytes, INSERTED.generated_at
      VALUES (@sid, @tid, @version, @inputs_snapshot, @schema_snapshot, @file_path, @file_size_bytes)
    `);
  const row = result.recordset[0];
  return {
    ...row,
    inputs_snapshot: JSON.parse(row.inputs_snapshot as string),
    schema_snapshot: JSON.parse(row.schema_snapshot as string),
  };
}

export async function listGeneratedPdfs(templateId: string): Promise<GeneratedPdfRow[]> {
  const result = await getPool()
    .request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query(`
      SELECT id, submission_id, template_id, template_version,
             inputs_snapshot, schema_snapshot, file_path, file_size_bytes, generated_at
      FROM generated_pdfs
      WHERE template_id = @tid
      ORDER BY generated_at DESC
    `);
  return result.recordset.map(row => ({
    ...row,
    inputs_snapshot: JSON.parse(row.inputs_snapshot as string),
    schema_snapshot: JSON.parse(row.schema_snapshot as string),
  }));
}

export async function getGeneratedPdf(id: string): Promise<GeneratedPdfRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`
      SELECT id, submission_id, template_id, template_version,
             inputs_snapshot, schema_snapshot, file_path, file_size_bytes, generated_at
      FROM generated_pdfs WHERE id = @id
    `);
  const row = result.recordset[0];
  if (!row) return null;
  return {
    ...row,
    inputs_snapshot: JSON.parse(row.inputs_snapshot as string),
    schema_snapshot: JSON.parse(row.schema_snapshot as string),
  };
}

// ─── company_assets ──────────────────────────────────────────────────────────

export async function listAssets(): Promise<CompanyAssetRow[]> {
  const result = await getPool().request().query(
    'SELECT id, name, file_path, mime_type, file_size_bytes, created_at FROM company_assets ORDER BY created_at DESC'
  );
  return result.recordset;
}

export async function getAsset(id: string): Promise<CompanyAssetRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('SELECT id, name, file_path, mime_type, file_size_bytes, created_at FROM company_assets WHERE id = @id');
  return result.recordset[0] ?? null;
}

export async function createAsset(input: {
  name: string;
  filePath: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<CompanyAssetRow> {
  const result = await getPool()
    .request()
    .input('name', sql.NVarChar(255), input.name)
    .input('file_path', sql.NVarChar(1000), input.filePath)
    .input('mime_type', sql.NVarChar(100), input.mimeType)
    .input('file_size_bytes', sql.BigInt, input.fileSizeBytes)
    .query(`
      INSERT INTO company_assets (name, file_path, mime_type, file_size_bytes)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.file_path, INSERTED.mime_type,
             INSERTED.file_size_bytes, INSERTED.created_at
      VALUES (@name, @file_path, @mime_type, @file_size_bytes)
    `);
  return result.recordset[0];
}

export async function deleteAsset(id: string): Promise<CompanyAssetRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query(`
      DELETE FROM company_assets
      OUTPUT DELETED.id, DELETED.name, DELETED.file_path, DELETED.mime_type,
             DELETED.file_size_bytes, DELETED.created_at
      WHERE id = @id
    `);
  return result.recordset[0] ?? null;
}

// ─── letterheads ──────────────────────────────────────────────────────────────

export async function listLetterheads(): Promise<LetterheadSummaryRow[]> {
  const result = await getPool().request().query(
    'SELECT id, name, type, page_width, page_height, created_at, updated_at FROM letterheads ORDER BY updated_at DESC'
  );
  return result.recordset;
}

function parseLetterheadRow(row: Record<string, unknown>): LetterheadRow {
  return {
    ...row,
    static_schema: row.static_schema ? JSON.parse(row.static_schema as string) : null,
  } as LetterheadRow;
}

export async function getLetterhead(id: string): Promise<LetterheadRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('SELECT id, name, type, static_schema, page_width, page_height, base_pdf, created_at, updated_at FROM letterheads WHERE id = @id');
  const row = result.recordset[0];
  return row ? parseLetterheadRow(row) : null;
}

export async function createLetterhead(input: {
  name: string;
  type: 'fields' | 'pdf';
  staticSchema?: unknown;
  pageWidth?: number;
  pageHeight?: number;
  basePdf?: string;
}): Promise<LetterheadRow> {
  const result = await getPool()
    .request()
    .input('name', sql.NVarChar(255), input.name)
    .input('type', sql.NVarChar(10), input.type)
    .input('static_schema', sql.NVarChar(sql.MAX), input.staticSchema !== undefined ? JSON.stringify(input.staticSchema) : null)
    .input('page_width', sql.Float, input.pageWidth ?? null)
    .input('page_height', sql.Float, input.pageHeight ?? null)
    .input('base_pdf', sql.NVarChar(sql.MAX), input.basePdf ?? null)
    .query(`
      INSERT INTO letterheads (name, type, static_schema, page_width, page_height, base_pdf)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.type, INSERTED.static_schema, INSERTED.page_width,
             INSERTED.page_height, INSERTED.base_pdf, INSERTED.created_at, INSERTED.updated_at
      VALUES (@name, @type, @static_schema, @page_width, @page_height, @base_pdf)
    `);
  return parseLetterheadRow(result.recordset[0]);
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

  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar(255), name)
    .input('static_schema', sql.NVarChar(sql.MAX), staticSchema !== null ? JSON.stringify(staticSchema) : null)
    .input('page_width', sql.Float, pageWidth)
    .input('page_height', sql.Float, pageHeight)
    .input('base_pdf', sql.NVarChar(sql.MAX), basePdf)
    .query(`
      UPDATE letterheads
      SET name = @name, static_schema = @static_schema, page_width = @page_width,
          page_height = @page_height, base_pdf = @base_pdf, updated_at = GETUTCDATE()
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.type, INSERTED.static_schema, INSERTED.page_width,
             INSERTED.page_height, INSERTED.base_pdf, INSERTED.created_at, INSERTED.updated_at
      WHERE id = @id
    `);
  const row = result.recordset[0];
  return row ? parseLetterheadRow(row) : null;
}

export async function deleteLetterhead(id: string): Promise<void> {
  await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('DELETE FROM letterheads WHERE id = @id');
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
  const result = await getPool()
    .request()
    .input('submission_id', sql.UniqueIdentifier, input.submissionId)
    .input('field_name', sql.NVarChar(255), input.fieldName)
    .input('signer_name', sql.NVarChar(255), input.signerName)
    .input('signer_email', sql.NVarChar(320), input.signerEmail)
    .input('ip_address', sql.NVarChar(45), input.ipAddress)
    .input('document_hash', sql.NVarChar(64), input.documentHash)
    .query(`
      INSERT INTO signature_events (submission_id, field_name, signer_name, signer_email, ip_address, document_hash)
      OUTPUT INSERTED.id, INSERTED.submission_id, INSERTED.field_name, INSERTED.signer_name,
             INSERTED.signer_email, INSERTED.signed_at, INSERTED.ip_address, INSERTED.document_hash
      VALUES (@submission_id, @field_name, @signer_name, @signer_email, @ip_address, @document_hash)
    `);
  return result.recordset[0];
}

export async function listSignatureEventsForSubmission(submissionId: string): Promise<SignatureEventRow[]> {
  const result = await getPool()
    .request()
    .input('submission_id', sql.UniqueIdentifier, submissionId)
    .query(`
      SELECT id, submission_id, field_name, signer_name, signer_email, signed_at, ip_address, document_hash
      FROM signature_events
      WHERE submission_id = @submission_id
      ORDER BY signed_at ASC
    `);
  return result.recordset;
}

export async function createWaitlistSignup(
  name: string,
  email: string
): Promise<{ alreadyOnList: boolean }> {
  try {
    await getPool()
      .request()
      .input('name', sql.NVarChar(200), name)
      .input('email', sql.NVarChar(320), email)
      .query(`
        INSERT INTO waitlist_signups (name, email)
        VALUES (@name, @email)
      `);
    return { alreadyOnList: false };
  } catch (error) {
    const err = error as { number?: number };
    // MSSQL error 2627 (PK/UNIQUE constraint) or 2601 (unique index) — the
    // email already exists. Treat as a friendly duplicate, not a failure.
    if (err.number === 2627 || err.number === 2601) {
      return { alreadyOnList: true };
    }
    throw error;
  }
}

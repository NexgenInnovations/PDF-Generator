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

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'pdf_templates'
    )
    CREATE TABLE pdf_templates (
      id         UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      name       NVARCHAR(255)    NOT NULL,
      schema     NVARCHAR(MAX)    NOT NULL,
      created_at DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      updated_at DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('pdf_templates table ready');
}

function getPool(): sql.ConnectionPool {
  if (!pool) throw new Error('DB not initialised — call initDb() first');
  return pool;
}

export interface TemplateRow {
  id: string;
  name: string;
  schema: unknown;
  created_at: string;
  updated_at: string | null;
}

export interface TemplateSummaryRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
}

export async function listTemplates(): Promise<TemplateSummaryRow[]> {
  const result = await getPool().request().query(
    'SELECT id, name, created_at, updated_at FROM pdf_templates ORDER BY created_at DESC'
  );
  return result.recordset;
}

export async function getTemplate(id: string): Promise<TemplateRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('SELECT id, name, schema, created_at, updated_at FROM pdf_templates WHERE id = @id');
  const row = result.recordset[0];
  if (!row) return null;
  return { ...row, schema: JSON.parse(row.schema as string) };
}

export async function createTemplate(name: string, schema: unknown): Promise<TemplateRow> {
  const result = await getPool()
    .request()
    .input('name', sql.NVarChar(255), name)
    .input('schema', sql.NVarChar(sql.MAX), JSON.stringify(schema))
    .query(`
      INSERT INTO pdf_templates (name, schema)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.schema,
             INSERTED.created_at, INSERTED.updated_at
      VALUES (@name, @schema)
    `);
  const row = result.recordset[0];
  return { ...row, schema: JSON.parse(row.schema as string) };
}

export async function updateTemplate(
  id: string,
  name: string,
  schema: unknown
): Promise<TemplateRow | null> {
  const result = await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .input('name', sql.NVarChar(255), name)
    .input('schema', sql.NVarChar(sql.MAX), JSON.stringify(schema))
    .query(`
      UPDATE pdf_templates
      SET name = @name, schema = @schema, updated_at = GETUTCDATE()
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.schema,
             INSERTED.created_at, INSERTED.updated_at
      WHERE id = @id
    `);
  const row = result.recordset[0];
  if (!row) return null;
  return { ...row, schema: JSON.parse(row.schema as string) };
}

export async function deleteTemplate(id: string): Promise<void> {
  await getPool()
    .request()
    .input('id', sql.UniqueIdentifier, id)
    .query('DELETE FROM pdf_templates WHERE id = @id');
}

import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

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

export interface FilledPdfRow {
  id: string;
  template_id: string;
  inputs: Record<string, string>[];
  file_path: string;
  created_at: string;
}

interface DevStore {
  templates: TemplateRow[];
  filledPdfs: FilledPdfRow[];
}

const usePostgres = Boolean(process.env.DATABASE_URL) && pool !== null;
const __dirname = dirname(fileURLToPath(import.meta.url));
const devStorePath = join(__dirname, '..', 'data', 'dev-db.json');

const emptyStore = (): DevStore => ({
  templates: [],
  filledPdfs: [],
});

const readDevStore = async (): Promise<DevStore> => {
  try {
    return JSON.parse(await readFile(devStorePath, 'utf8')) as DevStore;
  } catch {
    return emptyStore();
  }
};

const writeDevStore = async (store: DevStore) => {
  await mkdir(dirname(devStorePath), { recursive: true });
  await writeFile(devStorePath, JSON.stringify(store, null, 2));
};

export const listTemplates = async (): Promise<TemplateSummaryRow[]> => {
  if (usePostgres) {
    const result = await pool!.query(
      'SELECT id, name, created_at, updated_at FROM templates ORDER BY created_at DESC'
    );
    return result.rows;
  }

  const store = await readDevStore();
  return store.templates
    .map(({ id, name, created_at, updated_at }) => ({ id, name, created_at, updated_at }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export const getTemplate = async (id: string): Promise<TemplateRow | null> => {
  if (usePostgres) {
    const result = await pool!.query('SELECT * FROM templates WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  }

  const store = await readDevStore();
  return store.templates.find((template) => template.id === id) ?? null;
};

export const createTemplate = async (name: string, schema: unknown): Promise<TemplateRow> => {
  if (usePostgres) {
    const result = await pool!.query(
      'INSERT INTO templates (name, schema) VALUES ($1, $2) RETURNING *',
      [name, JSON.stringify(schema)]
    );
    return result.rows[0];
  }

  const store = await readDevStore();
  const now = new Date().toISOString();
  const template = {
    id: randomUUID(),
    name,
    schema,
    created_at: now,
    updated_at: now,
  };
  store.templates.push(template);
  await writeDevStore(store);
  return template;
};

export const updateTemplate = async (
  id: string,
  name: string,
  schema: unknown
): Promise<TemplateRow | null> => {
  if (usePostgres) {
    const result = await pool!.query(
      'UPDATE templates SET name = $1, schema = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, JSON.stringify(schema), id]
    );
    return result.rows[0] ?? null;
  }

  const store = await readDevStore();
  const template = store.templates.find((item) => item.id === id);

  if (!template) return null;

  template.name = name;
  template.schema = schema;
  template.updated_at = new Date().toISOString();
  await writeDevStore(store);
  return template;
};

export const deleteTemplate = async (id: string): Promise<void> => {
  if (usePostgres) {
    await pool!.query('DELETE FROM templates WHERE id = $1', [id]);
    return;
  }

  const store = await readDevStore();
  store.templates = store.templates.filter((template) => template.id !== id);
  store.filledPdfs = store.filledPdfs.filter((filledPdf) => filledPdf.template_id !== id);
  await writeDevStore(store);
};

export const createFilledPdf = async (
  template_id: string,
  inputs: Record<string, string>[],
  file_path: string
): Promise<FilledPdfRow> => {
  if (usePostgres) {
    const result = await pool!.query(
      'INSERT INTO filled_pdfs (template_id, inputs, file_path) VALUES ($1, $2, $3) RETURNING *',
      [template_id, JSON.stringify(inputs), file_path]
    );
    return result.rows[0];
  }

  const store = await readDevStore();
  const filledPdf = {
    id: randomUUID(),
    template_id,
    inputs,
    file_path,
    created_at: new Date().toISOString(),
  };
  store.filledPdfs.push(filledPdf);
  await writeDevStore(store);
  return filledPdf;
};

export const listFilledPdfs = async (): Promise<FilledPdfRow[]> => {
  if (usePostgres) {
    const result = await pool!.query(
      'SELECT * FROM filled_pdfs ORDER BY created_at DESC'
    );
    return result.rows;
  }

  const store = await readDevStore();
  return [...store.filledPdfs].sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export const getFilledPdf = async (id: string): Promise<FilledPdfRow | null> => {
  if (usePostgres) {
    const result = await pool!.query('SELECT * FROM filled_pdfs WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  }

  const store = await readDevStore();
  return store.filledPdfs.find((f) => f.id === id) ?? null;
};

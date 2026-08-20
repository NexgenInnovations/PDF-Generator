// server/src/db.ts
import { supabaseAdmin } from './lib/supabaseAdmin.js';

// PostgrestError objects are plain objects, not `instanceof Error` — but
// every route handler in this codebase does `error instanceof Error ?
// error.message : 'Unexpected server error'`. Wrapping preserves both that
// check and the `.code` field isUniqueViolation() (and templates.ts's own
// duplicate-tag check) rely on.
function toError(pgError: { message: string; code?: string }): Error {
  const err = new Error(pgError.message) as Error & { code?: string };
  err.code = pgError.code;
  return err;
}

export async function initDb(): Promise<void> {
  const { error } = await supabaseAdmin.from('pdf_templates').select('id').limit(1);
  if (error) throw toError(error);
  console.log('Connected to Supabase (Data API)');
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
  submitter_name: string;
  submitter_email: string;
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

export interface SubmissionFolderRow {
  template_id: string;
  template_name: string;
  submission_count: number;
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

// A null orgId is only ever passed by the unauthenticated /generate-pdf
// route (a template's published output is intentionally reachable by
// anyone with its UUID, e.g. a public form-fill link) — every
// authenticated management route below passes the caller's real orgId.
async function assertTemplateOwnedByOrg(templateId: string, orgId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('pdf_templates')
    .select('id')
    .eq('id', templateId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw toError(error);
  if (!data) throw new Error('Template not found');
}

export async function listTemplates(orgId: string): Promise<TemplateRow[]> {
  const { data, error } = await supabaseAdmin
    .from('pdf_templates')
    .select('id, name, current_version, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw toError(error);
  return data as TemplateRow[];
}

export async function getTemplate(id: string, orgId: string | null): Promise<TemplateRow | null> {
  let query = supabaseAdmin
    .from('pdf_templates')
    .select('id, name, current_version, created_at, updated_at')
    .eq('id', id);
  if (orgId !== null) query = query.eq('org_id', orgId);
  const { data, error } = await query.maybeSingle();
  if (error) throw toError(error);
  return data as TemplateRow | null;
}

// Used by the unauthenticated /generate-pdf route to stamp the org that
// owns a submission — the request itself carries no orgId, but the
// template it's filling always belongs to one.
export async function getTemplateOrgId(id: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('pdf_templates').select('org_id').eq('id', id).maybeSingle();
  if (error) throw toError(error);
  return (data as { org_id: string | null } | null)?.org_id ?? null;
}

export async function createTemplate(name: string, orgId: string): Promise<TemplateRow> {
  const { data, error } = await supabaseAdmin.from('pdf_templates').insert({ name, org_id: orgId }).select().single();
  if (error) throw toError(error);
  return data as TemplateRow;
}

export async function updateTemplate(id: string, name: string, orgId: string): Promise<TemplateRow | null> {
  const { data, error } = await supabaseAdmin
    .from('pdf_templates')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .maybeSingle();
  if (error) throw toError(error);
  return data as TemplateRow | null;
}

export async function deleteTemplate(id: string, orgId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('pdf_templates').delete().eq('id', id).eq('org_id', orgId);
  if (error) throw toError(error);
}

// ─── template_versions ───────────────────────────────────────────────────────

function parseVersionRow(row: TemplateVersionDbRow): TemplateVersionRow {
  return { ...row, schema: JSON.parse(row.schema), base_pdf: JSON.parse(row.base_pdf), schemas: JSON.parse(row.schemas) };
}

export async function saveDraft(templateId: string, schema: unknown, orgId: string): Promise<TemplateVersionRow> {
  await assertTemplateOwnedByOrg(templateId, orgId);

  const schemaObj = schema as { basePdf?: unknown; schemas?: unknown };
  const schemaStr = JSON.stringify(schema);
  const basePdfStr = JSON.stringify(schemaObj.basePdf ?? null);
  const schemasStr = JSON.stringify(schemaObj.schemas ?? null);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('template_versions')
    .select('id')
    .eq('template_id', templateId)
    .eq('status', 'draft')
    .maybeSingle();
  if (existingError) throw toError(existingError);

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('template_versions')
      .update({ schema: schemaStr, base_pdf: basePdfStr, schemas: schemasStr, created_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw toError(error);
    return parseVersionRow(data as TemplateVersionDbRow);
  }

  // Drafts always use the reserved sentinel version 0 — never a real
  // published version number — so a template's first-ever publish can
  // start at version 1 without colliding with the draft row under the
  // UNIQUE (template_id, version) constraint.
  const { data, error } = await supabaseAdmin
    .from('template_versions')
    .insert({ template_id: templateId, version: 0, status: 'draft', tag: null, schema: schemaStr, base_pdf: basePdfStr, schemas: schemasStr })
    .select()
    .single();
  if (error) throw toError(error);
  return parseVersionRow(data as TemplateVersionDbRow);
}

export async function getDraft(templateId: string, orgId: string): Promise<TemplateVersionRow | null> {
  await assertTemplateOwnedByOrg(templateId, orgId);

  const { data, error } = await supabaseAdmin
    .from('template_versions')
    .select('*')
    .eq('template_id', templateId)
    .eq('status', 'draft')
    .maybeSingle();
  if (error) throw toError(error);
  return data ? parseVersionRow(data as TemplateVersionDbRow) : null;
}

export async function publishVersion(
  templateId: string,
  schema: unknown,
  tag: string,
  target: { mode: 'new' } | { mode: 'replace'; version: number },
  orgId: string
): Promise<TemplateVersionRow> {
  const schemaObj = schema as { basePdf?: unknown; schemas?: unknown };
  const schemaStr = JSON.stringify(schema);
  const basePdfStr = JSON.stringify(schemaObj.basePdf ?? null);
  const schemasStr = JSON.stringify(schemaObj.schemas ?? null);

  // Ownership is checked inside the RPC itself (against p_org_id), not via a
  // separate query beforehand — that would leave a check-then-act gap
  // between the check and this atomic update.
  const { data, error } = await supabaseAdmin.rpc('publish_template_version', {
    p_template_id: templateId,
    p_org_id: orgId,
    p_schema: schemaStr,
    p_base_pdf: basePdfStr,
    p_schemas: schemasStr,
    p_tag: tag,
    p_mode: target.mode,
    p_target_version: target.mode === 'replace' ? target.version : null,
  });
  if (error) throw toError(error);
  return parseVersionRow(data as TemplateVersionDbRow);
}

export async function listPublishedVersions(templateId: string, orgId: string): Promise<TemplateVersionRow[]> {
  await assertTemplateOwnedByOrg(templateId, orgId);

  const { data, error } = await supabaseAdmin
    .from('template_versions')
    .select('*')
    .eq('template_id', templateId)
    .eq('status', 'published')
    .order('version', { ascending: false });
  if (error) throw toError(error);
  return (data as TemplateVersionDbRow[]).map(parseVersionRow);
}

export async function getPublishedVersion(
  templateId: string,
  ref: { version: number } | { tag: string },
  orgId: string | null
): Promise<TemplateVersionRow | null> {
  if (orgId !== null) await assertTemplateOwnedByOrg(templateId, orgId);

  const base = supabaseAdmin.from('template_versions').select('*').eq('template_id', templateId).eq('status', 'published');
  const { data, error } = await ('version' in ref ? base.eq('version', ref.version) : base.eq('tag', ref.tag)).maybeSingle();
  if (error) throw toError(error);
  return data ? parseVersionRow(data as TemplateVersionDbRow) : null;
}

export async function getLatestPublishedVersion(templateId: string, orgId: string | null): Promise<TemplateVersionRow | null> {
  if (orgId !== null) await assertTemplateOwnedByOrg(templateId, orgId);

  const { data, error } = await supabaseAdmin
    .from('template_versions')
    .select('*')
    .eq('template_id', templateId)
    .eq('status', 'published')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toError(error);
  return data ? parseVersionRow(data as TemplateVersionDbRow) : null;
}

// ─── filled_submissions ───────────────────────────────────────────────────────

export async function createFilledSubmission(
  templateId: string,
  templateVersion: number,
  inputs: unknown,
  orgId: string | null,
  submitterName: string,
  submitterEmail: string
): Promise<FilledSubmissionRow> {
  const { data, error } = await supabaseAdmin
    .from('filled_submissions')
    .insert({
      template_id: templateId,
      template_version: templateVersion,
      inputs: JSON.stringify(inputs),
      org_id: orgId,
      submitter_name: submitterName,
      submitter_email: submitterEmail,
    })
    .select()
    .single();
  if (error) throw toError(error);
  const row = data as FilledSubmissionDbRow;
  return { ...row, inputs: JSON.parse(row.inputs) };
}

export async function getFilledSubmission(id: string): Promise<FilledSubmissionRow | null> {
  const { data, error } = await supabaseAdmin.from('filled_submissions').select('*').eq('id', id).maybeSingle();
  if (error) throw toError(error);
  if (!data) return null;
  const row = data as FilledSubmissionDbRow;
  return { ...row, inputs: JSON.parse(row.inputs) };
}

export async function listSubmissionsForTemplate(templateId: string): Promise<FilledSubmissionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('filled_submissions')
    .select('*')
    .eq('template_id', templateId)
    .order('submitted_at', { ascending: false });
  if (error) throw toError(error);
  return (data as FilledSubmissionDbRow[]).map((row) => ({ ...row, inputs: JSON.parse(row.inputs) }));
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
  orgId: string | null;
}): Promise<GeneratedPdfRow> {
  const { data, error } = await supabaseAdmin
    .from('generated_pdfs')
    .insert({
      submission_id: opts.submissionId,
      template_id: opts.templateId,
      template_version: opts.templateVersion,
      inputs_snapshot: JSON.stringify(opts.inputsSnapshot),
      schema_snapshot: JSON.stringify(opts.schemaSnapshot),
      file_path: opts.filePath,
      file_size_bytes: opts.fileSizeBytes ?? null,
      org_id: opts.orgId,
    })
    .select()
    .single();
  if (error) throw toError(error);
  const row = data as GeneratedPdfDbRow;
  return { ...row, inputs_snapshot: JSON.parse(row.inputs_snapshot), schema_snapshot: JSON.parse(row.schema_snapshot) };
}

export async function getGeneratedPdf(id: string, orgId: string): Promise<GeneratedPdfRow | null> {
  const { data, error } = await supabaseAdmin
    .from('generated_pdfs')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw toError(error);
  if (!data) return null;
  const row = data as GeneratedPdfDbRow;
  return { ...row, inputs_snapshot: JSON.parse(row.inputs_snapshot), schema_snapshot: JSON.parse(row.schema_snapshot) };
}

export async function getGeneratedPdfBySubmissionId(submissionId: string): Promise<{ id: string; file_size_bytes: number | null } | null> {
  const { data, error } = await supabaseAdmin
    .from('generated_pdfs')
    .select('id, file_size_bytes')
    .eq('submission_id', submissionId)
    .maybeSingle();
  if (error) throw toError(error);
  return data as { id: string; file_size_bytes: number | null } | null;
}

// One "folder" per template that's been published at least once — the
// global admin "Submissions" view. A folder exists the moment a template is
// published, even with zero submissions yet; it's derived live from
// template_versions/generated_pdfs rather than a separate table, so there's
// nothing to keep in sync when a template is published or filled.
export async function listSubmissionFoldersForOrg(orgId: string): Promise<SubmissionFolderRow[]> {
  const { data: templates, error: templatesError } = await supabaseAdmin
    .from('pdf_templates')
    .select('id, name')
    .eq('org_id', orgId);
  if (templatesError) throw toError(templatesError);
  const templateRows = templates as { id: string; name: string }[];
  if (templateRows.length === 0) return [];
  const templateIds = templateRows.map(t => t.id);

  const { data: publishedRows, error: publishedError } = await supabaseAdmin
    .from('template_versions')
    .select('template_id')
    .eq('status', 'published')
    .in('template_id', templateIds);
  if (publishedError) throw toError(publishedError);
  const publishedTemplateIds = new Set((publishedRows as { template_id: string }[]).map(r => r.template_id));

  const { data: pdfRows, error: pdfError } = await supabaseAdmin
    .from('generated_pdfs')
    .select('template_id')
    .eq('org_id', orgId);
  if (pdfError) throw toError(pdfError);
  const submissionCounts = new Map<string, number>();
  for (const row of pdfRows as { template_id: string }[]) {
    submissionCounts.set(row.template_id, (submissionCounts.get(row.template_id) ?? 0) + 1);
  }

  return templateRows
    .filter(t => publishedTemplateIds.has(t.id))
    .map(t => ({ template_id: t.id, template_name: t.name, submission_count: submissionCounts.get(t.id) ?? 0 }))
    .sort((a, b) => a.template_name.localeCompare(b.template_name));
}

// ─── company_assets ──────────────────────────────────────────────────────────

export async function listAssets(orgId: string): Promise<CompanyAssetRow[]> {
  const { data, error } = await supabaseAdmin
    .from('company_assets')
    .select('id, name, file_path, mime_type, file_size_bytes, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw toError(error);
  return data as CompanyAssetRow[];
}

export async function getAsset(id: string, orgId: string): Promise<CompanyAssetRow | null> {
  const { data, error } = await supabaseAdmin
    .from('company_assets')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw toError(error);
  return data as CompanyAssetRow | null;
}

export async function createAsset(input: {
  name: string;
  filePath: string;
  mimeType: string;
  fileSizeBytes: number;
  orgId: string;
}): Promise<CompanyAssetRow> {
  const { data, error } = await supabaseAdmin
    .from('company_assets')
    .insert({
      name: input.name,
      file_path: input.filePath,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      org_id: input.orgId,
    })
    .select()
    .single();
  if (error) throw toError(error);
  return data as CompanyAssetRow;
}

export async function deleteAsset(id: string, orgId: string): Promise<CompanyAssetRow | null> {
  const { data, error } = await supabaseAdmin
    .from('company_assets')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .maybeSingle();
  if (error) throw toError(error);
  return data as CompanyAssetRow | null;
}

// ─── letterheads ──────────────────────────────────────────────────────────────

function parseLetterheadRow(row: LetterheadDbRow): LetterheadRow {
  return { ...row, static_schema: row.static_schema ? JSON.parse(row.static_schema) : null };
}

export async function listLetterheads(orgId: string): Promise<LetterheadSummaryRow[]> {
  const { data, error } = await supabaseAdmin
    .from('letterheads')
    .select('id, name, type, page_width, page_height, created_at, updated_at')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false });
  if (error) throw toError(error);
  return data as LetterheadSummaryRow[];
}

export async function getLetterhead(id: string, orgId: string): Promise<LetterheadRow | null> {
  const { data, error } = await supabaseAdmin
    .from('letterheads')
    .select('id, name, type, static_schema, page_width, page_height, base_pdf, created_at, updated_at')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw toError(error);
  return data ? parseLetterheadRow(data as LetterheadDbRow) : null;
}

export async function createLetterhead(input: {
  name: string;
  type: 'fields' | 'pdf';
  staticSchema?: unknown;
  pageWidth?: number;
  pageHeight?: number;
  basePdf?: string;
  orgId: string;
}): Promise<LetterheadRow> {
  const { data, error } = await supabaseAdmin
    .from('letterheads')
    .insert({
      name: input.name,
      type: input.type,
      static_schema: input.staticSchema !== undefined ? JSON.stringify(input.staticSchema) : null,
      page_width: input.pageWidth ?? null,
      page_height: input.pageHeight ?? null,
      base_pdf: input.basePdf ?? null,
      org_id: input.orgId,
    })
    .select('id, name, type, static_schema, page_width, page_height, base_pdf, created_at, updated_at')
    .single();
  if (error) throw toError(error);
  return parseLetterheadRow(data as LetterheadDbRow);
}

export async function updateLetterhead(
  id: string,
  input: { name?: string; staticSchema?: unknown; pageWidth?: number; pageHeight?: number; basePdf?: string },
  orgId: string
): Promise<LetterheadRow | null> {
  const existing = await getLetterhead(id, orgId);
  if (!existing) return null;

  const name = input.name ?? existing.name;
  const staticSchema = input.staticSchema !== undefined ? input.staticSchema : existing.static_schema;
  const pageWidth = input.pageWidth ?? existing.page_width;
  const pageHeight = input.pageHeight ?? existing.page_height;
  const basePdf = input.basePdf ?? existing.base_pdf;

  const { data, error } = await supabaseAdmin
    .from('letterheads')
    .update({
      name,
      static_schema: staticSchema !== null && staticSchema !== undefined ? JSON.stringify(staticSchema) : null,
      page_width: pageWidth,
      page_height: pageHeight,
      base_pdf: basePdf,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id, name, type, static_schema, page_width, page_height, base_pdf, created_at, updated_at')
    .maybeSingle();
  if (error) throw toError(error);
  return data ? parseLetterheadRow(data as LetterheadDbRow) : null;
}

export async function deleteLetterhead(id: string, orgId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('letterheads').delete().eq('id', id).eq('org_id', orgId);
  if (error) throw toError(error);
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
  const { data, error } = await supabaseAdmin
    .from('signature_events')
    .insert({
      submission_id: input.submissionId,
      field_name: input.fieldName,
      signer_name: input.signerName,
      signer_email: input.signerEmail,
      ip_address: input.ipAddress,
      document_hash: input.documentHash,
    })
    .select()
    .single();
  if (error) throw toError(error);
  return data as SignatureEventRow;
}

export async function listSignatureEventsForSubmission(submissionId: string): Promise<SignatureEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from('signature_events')
    .select('*')
    .eq('submission_id', submissionId)
    .order('signed_at', { ascending: true });
  if (error) throw toError(error);
  return data as SignatureEventRow[];
}

export async function createWaitlistSignup(name: string, email: string): Promise<{ alreadyOnList: boolean }> {
  const { error } = await supabaseAdmin.from('waitlist_signups').insert({ name, email });
  if (!error) return { alreadyOnList: false };
  if (isUniqueViolation(error)) return { alreadyOnList: true };
  throw toError(error);
}

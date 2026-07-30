export type Role = 'Admin' | 'Designer' | 'FormFiller';

export interface TemplateRecord {
  id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
  draft: { schema: object; version: number } | null;
  latestPublished: { schema: object; version: number; tag: string | null } | null;
}

export interface PublishedVersionSummary {
  version: number;
  tag: string | null;
  created_at: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
}

export interface FilledPdfRecord {
  id: string;
  template_id: string;
  inputs: Record<string, string>[];
  file_path: string;
  created_at: string;
}

export interface AssetRecord {
  id: string;
  name: string;
  mime_type: string;
  file_size_bytes: number;
  created_at: string;
}

export interface LetterheadSummary {
  id: string;
  name: string;
  page_width: number;
  page_height: number;
  created_at: string;
  updated_at: string;
}

export interface LetterheadRecord extends LetterheadSummary {
  static_schema: unknown[];
}

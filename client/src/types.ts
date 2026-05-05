export type Role = 'Admin' | 'Designer' | 'FormFiller';

export interface TemplateRecord {
  id: string;
  name: string;
  schema: object;
  created_at: string;
  updated_at: string | null;
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

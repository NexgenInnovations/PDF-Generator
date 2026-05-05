import type { TemplateRecord, TemplateSummary, FilledPdfRecord } from '../types.js';
import type { Template } from '@pdfme/common';

const BASE = '';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listTemplates: () => request<TemplateSummary[]>('/templates'),

  getTemplate: (id: string) => request<TemplateRecord>(`/templates/${id}`),

  createTemplate: (name: string, schema: Template) =>
    request<TemplateRecord>('/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, schema }),
    }),

  updateTemplate: (id: string, name: string, schema: Template) =>
    request<TemplateRecord>(`/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, schema }),
    }),

  deleteTemplate: (id: string) => request<void>(`/templates/${id}`, { method: 'DELETE' }),

  createFilledPdf: (template_id: string, inputs: Record<string, string>[]) =>
    request<FilledPdfRecord>('/filled-pdfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id, inputs }),
    }),
};

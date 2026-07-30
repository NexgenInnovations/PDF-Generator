import type {
  TemplateRecord,
  TemplateSummary,
  PublishedVersionSummary,
  AssetRecord,
  LetterheadSummary,
  LetterheadRecord,
} from "../types.js";
import type { Template } from "@pdfme/common";

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiFormChatResponse {
  done: boolean;
  message: string;
  template?: Template;
}

export interface AiPdfVisionResponse {
  template: Template;
}

export type PublishedVersionRef = { version: number } | { tag: string };

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

function versionRefToQuery(ref?: PublishedVersionRef): string {
  if (!ref) return "";
  if ("version" in ref) return `?version=${encodeURIComponent(ref.version)}`;
  return `?tag=${encodeURIComponent(ref.tag)}`;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + url, options);

  if (!res.ok) {
    const text = await res.text();
    let message = text;

    try {
      const body = JSON.parse(text) as { error?: string; message?: string };
      message = body.error ?? body.message ?? text;
    } catch {
      // Keep the raw response text when the server did not return JSON.
    }

    throw new Error(`${res.status} ${message}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listTemplates: () => request<TemplateSummary[]>("/templates"),

  getTemplate: (id: string, versionRef?: PublishedVersionRef) =>
    request<TemplateRecord>(`/templates/${id}${versionRefToQuery(versionRef)}`),

  createTemplate: (name: string, schema: Template) =>
    request<TemplateRecord>("/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, schema }),
    }),

  updateTemplate: (id: string, name: string, schema: Template) =>
    request<TemplateRecord>(`/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, schema }),
    }),

  publishTemplate: (
    id: string,
    schema: Template,
    tag: string,
    target: { mode: "new" } | { mode: "replace"; version: number }
  ) =>
    request<{ schema: Template; version: number; tag: string }>(`/templates/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema, tag, ...target }),
    }),

  listPublishedVersions: (id: string) =>
    request<PublishedVersionSummary[]>(`/templates/${id}/versions`),

  deleteTemplate: (id: string) =>
    request<void>(`/templates/${id}`, { method: "DELETE" }),

  createFilledPdf: async (
    template_id: string,
    inputs: Record<string, string>[],
    versionRef?: PublishedVersionRef
  ) => {
    const res = await fetch(API_BASE + "/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id,
        inputs,
        ...(versionRef && "version" in versionRef ? { version: versionRef.version } : {}),
        ...(versionRef && "tag" in versionRef ? { tag: versionRef.tag } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${text}`);
    }
  },

  aiFormChat: (messages: AiChatMessage[]) =>
    request<AiFormChatResponse>("/ai-form/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    }),

  aiDetectFieldsFromPdf: (images: string[]) =>
    request<AiPdfVisionResponse>("/ai-form/detect-from-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
    }),

  listAssets: () => request<AssetRecord[]>("/assets"),

  uploadAsset: async (file: File, name: string): Promise<AssetRecord> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name);
    const res = await fetch(API_BASE + "/assets", { method: "POST", body: formData });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${text}`);
    }
    return res.json() as Promise<AssetRecord>;
  },

  deleteAsset: (id: string) => request<void>(`/assets/${id}`, { method: "DELETE" }),

  assetFileUrl: (id: string) => `${API_BASE}/assets/${id}/file`,

  listLetterheads: () => request<LetterheadSummary[]>("/letterheads"),

  getLetterhead: (id: string) => request<LetterheadRecord>(`/letterheads/${id}`),

  createLetterhead: (input: {
    name: string;
    type: "fields" | "pdf";
    staticSchema?: unknown[];
    pageWidth?: number;
    pageHeight?: number;
    basePdf?: string;
  }) =>
    request<LetterheadRecord>("/letterheads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),

  updateLetterhead: (
    id: string,
    patch: { name?: string; staticSchema?: unknown[]; pageWidth?: number; pageHeight?: number; basePdf?: string }
  ) =>
    request<LetterheadRecord>(`/letterheads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),

  deleteLetterhead: (id: string) => request<void>(`/letterheads/${id}`, { method: "DELETE" }),
};

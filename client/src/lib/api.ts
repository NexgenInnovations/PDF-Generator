import type {
  Role,
  TemplateRecord,
  TemplateSummary,
  PublishedVersionSummary,
  AssetRecord,
  LetterheadSummary,
  LetterheadRecord,
  SubmissionRecord,
  SubmissionFolderRecord,
} from "../types.js";
import type { Template } from "@pdfme/common";
import { supabase } from "./supabase.js";

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiOccupiedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AiFieldSpec {
  name: string;
  label: string;
  type: "text" | "date" | "select" | "checkbox" | "checkbox_group" | "static_text";
  options?: string[];
}

export interface AiFormChatResponse {
  done: boolean;
  message: string;
  template?: Template;
  fields?: AiFieldSpec[];
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

export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// The download endpoints require an auth header, so a bare <a href> can't be
// used directly — fetch the bytes with the token, then trigger the browser's
// save dialog via a throwaway object URL.
export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = { ...(await authHeaders()), ...(options?.headers ?? {}) };
  const res = await fetch(API_BASE + url, { ...options, headers });

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
    versionRef?: PublishedVersionRef,
    signatureEvents?: { fieldName: string; signerName: string; signerEmail: string }[],
    signAnywhere?: { page: number; x: number; y: number; content: string; signerName: string; signerEmail: string }
  ): Promise<Uint8Array> => {
    const res = await fetch(API_BASE + "/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        template_id,
        inputs,
        ...(versionRef && "version" in versionRef ? { version: versionRef.version } : {}),
        ...(versionRef && "tag" in versionRef ? { tag: versionRef.tag } : {}),
        ...(signatureEvents && signatureEvents.length > 0 ? { signatureEvents } : {}),
        ...(signAnywhere ? { signAnywhere } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${text}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  },

  aiFormChat: (messages: AiChatMessage[], occupiedRegions?: AiOccupiedRegion[], currentFields?: AiFieldSpec[]) =>
    request<AiFormChatResponse>("/ai-form/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        ...(occupiedRegions && occupiedRegions.length > 0 ? { occupiedRegions } : {}),
        ...(currentFields && currentFields.length > 0 ? { currentFields } : {}),
      }),
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
    const res = await fetch(API_BASE + "/assets", { method: "POST", headers: await authHeaders(), body: formData });
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

  listSubmissions: (templateId: string) => request<SubmissionRecord[]>(`/templates/${templateId}/submissions`),

  listSubmissionFolders: () => request<SubmissionFolderRecord[]>("/submissions"),

  generatedPdfFileUrl: (id: string) => `${API_BASE}/generated-pdfs/${id}/file`,

  submitWaitlist: (name: string, email: string) =>
    request<{ alreadyOnList: boolean }>("/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    }),

  getInvite: (code: string) => request<{ orgName: string; role: Role }>(`/auth/invites/${code}`),

  acceptInvite: (code: string) =>
    request<{ orgId: string; role: Role }>(`/auth/invites/${code}/accept`, { method: "POST" }),

  createOrganization: (name: string) =>
    request<{ orgId: string; orgName: string; role: Role }>("/auth/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  createInvite: (role: Role) =>
    request<{ code: string; expiresAt: string }>("/auth/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    }),
};

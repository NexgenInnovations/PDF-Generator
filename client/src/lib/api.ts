import type {
  TemplateRecord,
  TemplateSummary,
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

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

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

  getTemplate: (id: string) => request<TemplateRecord>(`/templates/${id}`),

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

  deleteTemplate: (id: string) =>
    request<void>(`/templates/${id}`, { method: "DELETE" }),

  createFilledPdf: async (template_id: string, inputs: Record<string, string>[]) => {
    const res = await fetch(API_BASE + "/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id, inputs }),
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
};

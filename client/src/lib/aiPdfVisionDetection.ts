import { pdf2img } from '@pdfme/converter';
import type { Template } from '@pdfme/common';
import { api } from './api.js';

function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export async function detectFieldsWithAiVision(pdfBytes: ArrayBuffer): Promise<Template | null> {
  try {
    const pageBuffers = await pdf2img(pdfBytes, { imageType: 'jpeg', scale: 1.5 });
    if (pageBuffers.length === 0) return null;

    const images = pageBuffers.map(buf => arrayBufferToDataUrl(buf, 'image/jpeg'));
    const result = await api.aiDetectFieldsFromPdf(images);
    return result.template;
  } catch (err) {
    console.warn('AI vision field detection failed:', err);
    return null;
  }
}

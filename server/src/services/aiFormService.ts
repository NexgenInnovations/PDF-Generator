import OpenAI from 'openai';
import type { Template } from '@pdfme/common';

type TemplateSchema = Template['schemas'][number][number];

const MODEL = 'gpt-4o';

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    client = new OpenAI({ apiKey });
  }
  return client;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OccupiedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AiFormResult {
  done: boolean;
  message: string;
  template?: unknown;
}

// ─── AI-facing: field definitions only, no layout ──────────────────────────

type FieldType = 'text' | 'date' | 'select' | 'checkbox';

interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  options?: string[];
}

const SYSTEM_PROMPT = `You help a user design a PDF form by chatting with them.

You can only use these field types: text, date, select, checkbox.

Ask short clarifying questions one or two at a time until you know:
- the form's purpose/title
- every field needed, its label, and its type
- for "select" fields, the list of options

Once you have enough information, stop asking questions and output the final field list by calling the "submit_fields" tool. Do not call the tool until you are confident the field list is complete.

You do NOT decide layout, position, sizing, or pagination — that is handled automatically. You only decide WHAT fields the form needs, in a sensible order (the order you list them in is the order they'll appear on the page).

For each field, provide:
- name: a unique snake_case key (e.g. "full_name", "date_of_birth")
- label: a short, human-readable label (e.g. "Full Name", "Date of Birth")
- type: one of "text", "date", "select", "checkbox"
- options: required for "select" fields — an array of the choices as strings; omit for other types

Also provide a short, clear form title.`;

const SUBMIT_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'submit_fields',
    description: 'Submit the final list of form fields once the field list is fully known. Layout and positioning are computed automatically — do not include any position/size/page information.',
    parameters: {
      type: 'object',
      required: ['title', 'fields'],
      properties: {
        title: {
          type: 'string',
          description: 'A short, human-readable title for the form.',
        },
        fields: {
          type: 'array',
          description: 'The ordered list of fields the form needs.',
          items: {
            type: 'object',
            required: ['name', 'label', 'type'],
            properties: {
              name: { type: 'string', description: 'Unique snake_case key, e.g. "full_name".' },
              label: { type: 'string', description: 'Human-readable label, e.g. "Full Name".' },
              type: { type: 'string', enum: ['text', 'date', 'select', 'checkbox'] },
              options: {
                type: 'array',
                items: { type: 'string' },
                description: 'Required for "select" fields: the list of choices.',
              },
            },
          },
        },
      },
    },
  },
};

function isFieldSpec(f: unknown): f is FieldSpec {
  if (!f || typeof f !== 'object') return false;
  const rec = f as Record<string, unknown>;
  if (typeof rec.name !== 'string' || rec.name.trim().length === 0) return false;
  if (typeof rec.label !== 'string' || rec.label.trim().length === 0) return false;
  if (rec.type !== 'text' && rec.type !== 'date' && rec.type !== 'select' && rec.type !== 'checkbox') return false;
  if (rec.type === 'select' && !(Array.isArray(rec.options) && rec.options.every(o => typeof o === 'string'))) return false;
  return true;
}

// ─── Layout engine: deterministic, code-computed positioning ───────────────

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const CONTENT_LEFT_X = 20;
const CONTENT_WIDTH = 160;
const HALF_WIDTH = 75;
const RIGHT_COLUMN_X = 105;
const ROW_HEIGHT = 18;
const LABEL_HEIGHT = 5;
const LABEL_FONT_SIZE = 8;
const INPUT_Y_OFFSET = 6;
const INPUT_HEIGHT = 9;
const INPUT_FONT_SIZE = 11;
const FIRST_PAGE_START_Y = 22;
const LATER_PAGE_START_Y = 15;
const PAGE_BOTTOM_Y = 270;
const TITLE_HEIGHT = 10;
const TITLE_FONT_SIZE = 16;

const LONG_FIELD_LABEL_KEYWORDS = [
  'address', 'notes', 'note', 'description', 'comments', 'comment',
  'message', 'bio', 'summary', 'details', 'remarks', 'reason',
];

/** checkbox/date are always short; select is short unless it has many/long options;
 *  text is short unless its label suggests a long-form answer. */
function isShortField(field: FieldSpec): boolean {
  if (field.type === 'checkbox' || field.type === 'date') return true;
  if (field.type === 'select') {
    const options = field.options ?? [];
    const hasManyOptions = options.length > 4;
    const hasLongOption = options.some(o => o.length > 20);
    return !hasManyOptions && !hasLongOption;
  }
  const labelLower = field.label.toLowerCase();
  return !LONG_FIELD_LABEL_KEYWORDS.some(kw => labelLower.includes(kw));
}

function buildLabelElement(field: FieldSpec, x: number, y: number, width: number): TemplateSchema {
  return {
    name: `label_${field.name}`,
    type: 'text',
    position: { x, y },
    width,
    height: LABEL_HEIGHT,
    fontSize: LABEL_FONT_SIZE,
    readOnly: true,
    content: field.label,
  };
}

function buildInputElement(field: FieldSpec, x: number, y: number, width: number): TemplateSchema {
  const base = {
    name: field.name,
    type: field.type,
    position: { x, y },
    width,
    height: INPUT_HEIGHT,
    fontSize: INPUT_FONT_SIZE,
  };
  return field.type === 'select' ? { ...base, options: field.options ?? [] } : base;
}

/** Packs fields into rows: consecutive "short" fields pair up two-per-row;
 *  "long" fields (and any leftover unpaired short field) get a full-width row alone. */
function packRows(fields: FieldSpec[]): FieldSpec[][] {
  const rows: FieldSpec[][] = [];
  let i = 0;
  while (i < fields.length) {
    const field = fields[i];
    if (isShortField(field) && i + 1 < fields.length && isShortField(fields[i + 1])) {
      rows.push([field, fields[i + 1]]);
      i += 2;
    } else {
      rows.push([field]);
      i += 1;
    }
  }
  return rows;
}

function rowElements(row: FieldSpec[], rowY: number): TemplateSchema[] {
  if (row.length === 1) {
    const [field] = row;
    return [
      buildLabelElement(field, CONTENT_LEFT_X, rowY, CONTENT_WIDTH),
      buildInputElement(field, CONTENT_LEFT_X, rowY + INPUT_Y_OFFSET, CONTENT_WIDTH),
    ];
  }
  const [left, right] = row;
  return [
    buildLabelElement(left, CONTENT_LEFT_X, rowY, HALF_WIDTH),
    buildInputElement(left, CONTENT_LEFT_X, rowY + INPUT_Y_OFFSET, HALF_WIDTH),
    buildLabelElement(right, RIGHT_COLUMN_X, rowY, HALF_WIDTH),
    buildInputElement(right, RIGHT_COLUMN_X, rowY + INPUT_Y_OFFSET, HALF_WIDTH),
  ];
}

function rectanglesOverlap(a: OccupiedRegion, b: OccupiedRegion): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** The lowest y a row can start at on page 1 without overlapping any occupied region,
 *  given the row would occupy [candidateY, candidateY + rowHeight) across its full width. */
function clearStartY(candidateY: number, rowHeight: number, occupiedRegions: OccupiedRegion[]): number {
  const rowRect = (y: number): OccupiedRegion => ({ x: 0, y, width: PAGE_WIDTH_MM, height: rowHeight });
  let y = candidateY;
  let blocking = occupiedRegions.filter(r => rectanglesOverlap(rowRect(y), r));
  while (blocking.length > 0) {
    y = Math.max(...blocking.map(r => r.y + r.height)) + 5;
    blocking = occupiedRegions.filter(r => rectanglesOverlap(rowRect(y), r));
  }
  return y;
}

function buildTemplate(title: string, fields: FieldSpec[], occupiedRegions: OccupiedRegion[]): Template {
  const rows = packRows(fields);
  const pages: TemplateSchema[][] = [[]];
  let pageIndex = 0;
  let rowY = clearStartY(FIRST_PAGE_START_Y, ROW_HEIGHT, occupiedRegions);

  const titleY = clearStartY(8, TITLE_HEIGHT, occupiedRegions);
  pages[0].push({
    name: 'form_title',
    type: 'text',
    position: { x: CONTENT_LEFT_X, y: titleY },
    width: 170,
    height: TITLE_HEIGHT,
    fontSize: TITLE_FONT_SIZE,
    readOnly: true,
    content: title,
  });
  rowY = Math.max(rowY, titleY + TITLE_HEIGHT + 4);
  if (pageIndex === 0) {
    rowY = clearStartY(rowY, ROW_HEIGHT, occupiedRegions);
  }

  for (const row of rows) {
    if (rowY + ROW_HEIGHT > PAGE_BOTTOM_Y) {
      pageIndex += 1;
      pages.push([]);
      rowY = LATER_PAGE_START_Y;
    } else if (pageIndex === 0) {
      // Re-check clearance each row on page 1: a later row might start past all
      // occupied regions already, so this is a no-op then, but stays correct if a
      // region were to reappear lower (defensive; occupiedRegions is currently
      // page-1 only and doesn't grow mid-loop).
      rowY = clearStartY(rowY, ROW_HEIGHT, occupiedRegions);
      if (rowY + ROW_HEIGHT > PAGE_BOTTOM_Y) {
        pageIndex += 1;
        pages.push([]);
        rowY = LATER_PAGE_START_Y;
      }
    }

    pages[pageIndex].push(...rowElements(row, rowY));
    rowY += ROW_HEIGHT;
  }

  return {
    basePdf: { width: PAGE_WIDTH_MM, height: PAGE_HEIGHT_MM, padding: [10, 10, 10, 10] },
    schemas: pages,
  };
}

export async function runAiFormChat(
  messages: ChatMessage[],
  occupiedRegions?: OccupiedRegion[]
): Promise<AiFormResult> {
  const openai = getClient();

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ],
    tools: [SUBMIT_TOOL],
  });

  const choice = completion.choices[0];
  const toolCall = choice.message.tool_calls?.find(
    (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
      tc.type === 'function' && tc.function.name === 'submit_fields'
  );

  if (toolCall) {
    const args = JSON.parse(toolCall.function.arguments) as { title?: unknown; fields?: unknown };
    const title = typeof args.title === 'string' && args.title.trim().length > 0 ? args.title : 'Form';
    const fields = Array.isArray(args.fields) ? args.fields.filter(isFieldSpec) : [];

    return {
      done: true,
      message: choice.message.content ?? 'Your form is ready.',
      template: buildTemplate(title, fields, occupiedRegions ?? []),
    };
  }

  return {
    done: false,
    message: choice.message.content ?? '',
  };
}

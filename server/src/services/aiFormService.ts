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
  fields?: FieldSpec[];
}

// ─── AI-facing: field definitions only, no layout ──────────────────────────

type FieldType = 'text' | 'date' | 'select' | 'checkbox' | 'checkbox_group' | 'static_text';

export interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  options?: string[];
}

const SYSTEM_PROMPT = `You help a user design a PDF form by chatting with them, or by directly reproducing a survey/questionnaire they paste in full.

You can use these field types:
- "text": a single free-text input (used for open-ended questions and short answers).
- "date": a date picker input.
- "select": a single-answer dropdown. Only use this for a genuine dropdown-style choice, not for a list of options written out with checkbox glyphs (☐, □, [ ]) in the source text.
- "checkbox": ONE standalone yes/no or single toggle box. Do not use this for a question that lists multiple options — use "checkbox_group" instead.
- "checkbox_group": a question that offers a list of choices the respondent can select from — whether the source says "select one", "select up to N", or "select all that apply". Put the full question text in "label" and every one of its choices in "options". List every option exactly as given — do not summarize, merge, truncate, or drop any of them, no matter how many there are.
- "static_text": non-question text that should appear on the form as-is — an introductory paragraph, instructions, a section heading (e.g. "Part 1 — Your Business & Technology"), or any other body copy that isn't itself an input. Put the exact text in "label".

CRITICAL — when the user pastes or describes a complete, fully-specified survey or questionnaire (intro text, numbered questions, and their options already written out):
- Do NOT ask clarifying questions about it. Go straight to calling "submit_fields".
- Reproduce it exhaustively and in the same order: the intro message as one or more "static_text" fields, every section heading as a "static_text" field, every question (using its full question text as the label, in order), and every listed option for every question. Never skip, summarize, merge, or drop a question or an option — even if there are many questions or many options per question. A long field list is expected and fine.
- Open-ended / free-response questions become "text" fields.

If the user's request is NOT a fully-specified survey (e.g. they're describing a form informally, or asking for just a few fields), ask short clarifying questions one or two at a time until you know:
- the form's purpose/title
- every field needed, its label, and its type
- for "select" and "checkbox_group" fields, the full list of options

Once you have enough information, stop asking questions and output the final field list by calling the "submit_fields" tool. Do not call the tool until you are confident the field list is complete.

If a "Fields currently on the form" block appears below, the form already has those fields — the user is asking you to modify it, not start over. Treat their message as a change to that existing list (add fields, remove ones they no longer want, edit a label/type/options they asked to change), and call "submit_fields" with the COMPLETE resulting field list: keep every field they didn't ask to change exactly as-is (same name), drop any they asked to remove, apply their edits, and append any new ones. Never ask them to re-describe fields that already exist.

You do NOT decide layout, position, sizing, or pagination — that is handled automatically. You only decide WHAT fields the form needs, in a sensible order (the order you list them in is the order they'll appear on the page).

For each field, provide:
- name: a unique snake_case key (e.g. "full_name", "date_of_birth")
- label: for most types, a short human-readable label (e.g. "Full Name"); for "static_text", the exact text to display; for "checkbox_group", the full question text
- type: one of "text", "date", "select", "checkbox", "checkbox_group", "static_text"
- options: required for "select" and "checkbox_group" — an array with every choice as its own string; omit for other types

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
              label: {
                type: 'string',
                description: 'Human-readable label; for "static_text" the exact text to display; for "checkbox_group" the full question text.',
              },
              type: { type: 'string', enum: ['text', 'date', 'select', 'checkbox', 'checkbox_group', 'static_text'] },
              options: {
                type: 'array',
                items: { type: 'string' },
                description: 'Required for "select" and "checkbox_group" fields: the full list of choices, each as its own string — do not summarize or omit any.',
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
  const validTypes: FieldType[] = ['text', 'date', 'select', 'checkbox', 'checkbox_group', 'static_text'];
  if (!validTypes.includes(rec.type as FieldType)) return false;
  const needsOptions = rec.type === 'select' || rec.type === 'checkbox_group';
  if (needsOptions && !(Array.isArray(rec.options) && rec.options.length > 0 && rec.options.every(o => typeof o === 'string'))) {
    return false;
  }
  return true;
}

function buildCurrentFieldsContext(fields: FieldSpec[]): string {
  return `Fields currently on the form (JSON, in order):\n${JSON.stringify(fields)}`;
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

const STATIC_TEXT_FONT_SIZE = 10;
const STATIC_TEXT_LINE_HEIGHT_MM = 5;
const STATIC_TEXT_CHARS_PER_LINE = 95;
const STATIC_TEXT_BLOCK_PADDING = 4;

const GROUP_HEADER_FONT_SIZE = 10;
const GROUP_HEADER_HEIGHT = 6;
const GROUP_HEADER_GAP = 2;
const CHECKBOX_OPTION_SIZE = 5;
const CHECKBOX_OPTION_ROW_HEIGHT = 7;
const CHECKBOX_OPTION_FONT_SIZE = 9;
const CHECKBOX_OPTION_GAP = 3;
const BLOCK_BOTTOM_GAP = 3;

const LONG_FIELD_LABEL_KEYWORDS = [
  'address', 'notes', 'note', 'description', 'comments', 'comment',
  'message', 'bio', 'summary', 'details', 'remarks', 'reason',
];

/** checkbox/date are always short; select is short unless it has many/long options;
 *  text is short unless its label suggests a long-form answer. Only called with
 *  "simple" field types (text/date/select/checkbox) — checkbox_group/static_text
 *  are laid out separately in buildTemplate. */
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

/** Rough height estimate for a wrapped, read-only paragraph so it gets enough
 *  room before pagination is decided. dynamicFontSize (vertical fit) on the
 *  element itself is the safety net if this estimate runs short. */
function estimateStaticTextHeight(text: string): number {
  const paragraphs = text.split(/\n+/).filter(p => p.length > 0);
  const lineCount = paragraphs.reduce(
    (sum, p) => sum + Math.max(1, Math.ceil(p.length / STATIC_TEXT_CHARS_PER_LINE)),
    0
  );
  return Math.max(lineCount, 1) * STATIC_TEXT_LINE_HEIGHT_MM + STATIC_TEXT_BLOCK_PADDING;
}

function buildStaticTextElement(field: FieldSpec, y: number, height: number): TemplateSchema {
  return {
    name: field.name,
    type: 'text',
    position: { x: CONTENT_LEFT_X, y },
    width: CONTENT_WIDTH,
    height,
    fontSize: STATIC_TEXT_FONT_SIZE,
    lineHeight: 1.35,
    readOnly: true,
    dynamicFontSize: { min: 6, max: STATIC_TEXT_FONT_SIZE, fit: 'vertical' },
    content: field.label,
  };
}

function buildGroupHeaderElement(field: FieldSpec, y: number): TemplateSchema {
  return {
    name: `${field.name}_question`,
    type: 'text',
    position: { x: CONTENT_LEFT_X, y },
    width: CONTENT_WIDTH,
    height: GROUP_HEADER_HEIGHT,
    fontSize: GROUP_HEADER_FONT_SIZE,
    lineHeight: 1.3,
    readOnly: true,
    dynamicFontSize: { min: 7, max: GROUP_HEADER_FONT_SIZE, fit: 'vertical' },
    content: field.label,
  };
}

function buildGroupOptionElements(field: FieldSpec, optionIndex: number, option: string, y: number): TemplateSchema[] {
  return [
    {
      name: `${field.name}_opt_${optionIndex}`,
      type: 'checkbox',
      position: { x: CONTENT_LEFT_X, y },
      width: CHECKBOX_OPTION_SIZE,
      height: CHECKBOX_OPTION_SIZE,
    },
    {
      name: `${field.name}_opt_${optionIndex}_label`,
      type: 'text',
      position: { x: CONTENT_LEFT_X + CHECKBOX_OPTION_SIZE + CHECKBOX_OPTION_GAP, y: y - 0.5 },
      width: CONTENT_WIDTH - CHECKBOX_OPTION_SIZE - CHECKBOX_OPTION_GAP,
      height: CHECKBOX_OPTION_ROW_HEIGHT,
      fontSize: CHECKBOX_OPTION_FONT_SIZE,
      readOnly: true,
      content: option,
    },
  ];
}

function rectanglesOverlap(a: OccupiedRegion, b: OccupiedRegion): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** The lowest y a block can start at on page 1 without overlapping any occupied region,
 *  given the block would occupy [candidateY, candidateY + blockHeight) across its full width. */
function clearStartY(candidateY: number, blockHeight: number, occupiedRegions: OccupiedRegion[]): number {
  const rowRect = (y: number): OccupiedRegion => ({ x: 0, y, width: PAGE_WIDTH_MM, height: blockHeight });
  let y = candidateY;
  let blocking = occupiedRegions.filter(r => rectanglesOverlap(rowRect(y), r));
  while (blocking.length > 0) {
    y = Math.max(...blocking.map(r => r.y + r.height)) + 5;
    blocking = occupiedRegions.filter(r => rectanglesOverlap(rowRect(y), r));
  }
  return y;
}

function isSimpleField(field: FieldSpec): boolean {
  return field.type === 'text' || field.type === 'date' || field.type === 'select' || field.type === 'checkbox';
}

function buildTemplate(title: string, fields: FieldSpec[], occupiedRegions: OccupiedRegion[]): Template {
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
  rowY = clearStartY(rowY, ROW_HEIGHT, occupiedRegions);

  /** Advances to a new page if `height` doesn't fit below rowY; re-checks
   *  occupied-region clearance on page 1. Shared by every block type below. */
  function ensureRoom(height: number) {
    if (rowY + height > PAGE_BOTTOM_Y) {
      pageIndex += 1;
      pages.push([]);
      rowY = LATER_PAGE_START_Y;
      return;
    }
    if (pageIndex === 0) {
      rowY = clearStartY(rowY, height, occupiedRegions);
      if (rowY + height > PAGE_BOTTOM_Y) {
        pageIndex += 1;
        pages.push([]);
        rowY = LATER_PAGE_START_Y;
      }
    }
  }

  let simpleBuffer: FieldSpec[] = [];
  function flushSimpleBuffer() {
    if (simpleBuffer.length === 0) return;
    for (const row of packRows(simpleBuffer)) {
      ensureRoom(ROW_HEIGHT);
      pages[pageIndex].push(...rowElements(row, rowY));
      rowY += ROW_HEIGHT;
    }
    simpleBuffer = [];
  }

  for (const field of fields) {
    if (isSimpleField(field)) {
      simpleBuffer.push(field);
      continue;
    }
    flushSimpleBuffer();

    if (field.type === 'static_text') {
      const height = estimateStaticTextHeight(field.label);
      ensureRoom(height);
      pages[pageIndex].push(buildStaticTextElement(field, rowY, height));
      rowY += height + BLOCK_BOTTOM_GAP;
      continue;
    }

    // checkbox_group: a header row, then one row per option (each individually
    // paginated so long option lists can flow across pages cleanly).
    ensureRoom(GROUP_HEADER_HEIGHT);
    pages[pageIndex].push(buildGroupHeaderElement(field, rowY));
    rowY += GROUP_HEADER_HEIGHT + GROUP_HEADER_GAP;

    for (const [i, option] of (field.options ?? []).entries()) {
      ensureRoom(CHECKBOX_OPTION_ROW_HEIGHT);
      pages[pageIndex].push(...buildGroupOptionElements(field, i, option, rowY));
      rowY += CHECKBOX_OPTION_ROW_HEIGHT;
    }
    rowY += BLOCK_BOTTOM_GAP;
  }
  flushSimpleBuffer();

  return {
    basePdf: { width: PAGE_WIDTH_MM, height: PAGE_HEIGHT_MM, padding: [10, 10, 10, 10] },
    schemas: pages,
  };
}

export async function runAiFormChat(
  messages: ChatMessage[],
  occupiedRegions?: OccupiedRegion[],
  currentFields?: unknown
): Promise<AiFormResult> {
  const openai = getClient();

  const validatedCurrentFields = Array.isArray(currentFields) ? currentFields.filter(isFieldSpec) : [];

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(validatedCurrentFields.length > 0
        ? [{ role: 'system' as const, content: buildCurrentFieldsContext(validatedCurrentFields) }]
        : []),
      ...messages,
    ],
    tools: [SUBMIT_TOOL],
    max_tokens: 16384,
  });

  const choice = completion.choices[0];
  const toolCall = choice.message.tool_calls?.find(
    (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
      tc.type === 'function' && tc.function.name === 'submit_fields'
  );

  if (toolCall) {
    let args: { title?: unknown; fields?: unknown };
    try {
      args = JSON.parse(toolCall.function.arguments) as { title?: unknown; fields?: unknown };
    } catch {
      return {
        done: false,
        message:
          choice.finish_reason === 'length'
            ? "That's a lot of content for one pass — could you split the survey into two messages (e.g. send Part 1, then Part 2) and send them one after another?"
            : 'Something went wrong building the field list from that. Could you try resending it?',
      };
    }
    const title = typeof args.title === 'string' && args.title.trim().length > 0 ? args.title : 'Form';
    const fields = Array.isArray(args.fields) ? args.fields.filter(isFieldSpec) : [];

    return {
      done: true,
      message: choice.message.content ?? 'Your form is ready.',
      template: buildTemplate(title, fields, occupiedRegions ?? []),
      fields,
    };
  }

  return {
    done: false,
    message: choice.message.content ?? '',
  };
}

# AI-Based Field Detection for Flat PDFs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a PDF with no real AcroForm fields (a flat/scanned document like an invoice) is uploaded as a template's base PDF, use AI vision to infer what fields it should have and generate a fresh, editable pdfme template with those fields — extending the existing "Change PDF" flow's fallback behavior.

**Architecture:** A new server-side AI vision service (`server/src/services/aiPdfVisionService.ts`) mirrors the existing `aiFormService.ts` chat feature's layout conventions and forced-tool-call pattern, but takes page images instead of chat messages. A new route (`POST /ai-form/detect-from-pdf`) exposes it. On the client, a new module (`client/src/lib/aiPdfVisionDetection.ts`) rasterizes the uploaded PDF's pages via `@pdfme/converter`'s `pdf2img` (already an unused dependency) and calls the new endpoint. `TemplateDesigner.tsx`'s existing `handleBasePdfFile` — which already tries AcroForm detection first — gets a second fallback tier: if AcroForm detection finds nothing, try AI vision detection before falling back to today's background-only behavior.

**Tech Stack:** React 18 + TypeScript (client), Node.js + Express + TypeScript (server), OpenAI SDK (`gpt-4o`, already a server dependency), `@pdfme/converter` (already a client+server dependency, `pdf2img` unused today), `@pdfme/common` (`Template`, `Schema`, `checkTemplate`). No test runner exists in `client/` or `server/` — verification is manual: typecheck plus live server/browser testing.

## Global Constraints

- AcroForm detection (existing `detectFields`) always takes priority — AI vision only runs when AcroForm detection finds zero fields. No change to the AcroForm path's behavior (PDF stays as background, fields overlay it).
- The AI-generated template does NOT use the uploaded PDF as its background — it produces a fresh blank-page template (`basePdf: {width, height, padding}`) containing only the AI-inferred fields, laid out top-to-bottom using the same row-based convention as the existing AI chat feature (`aiFormService.ts`'s `SYSTEM_PROMPT`).
- Only these field types may be used: `text`, `date`, `select`, `checkbox` — same restriction as the existing AI chat feature.
- All pages of the uploaded PDF are rasterized and sent to the AI in one call; fields found across all pages are merged into one template.
- On any AI failure (API error, timeout, or the model finds nothing to extract): fall back to today's background-only behavior (`basePdf` updated, `schemas` untouched) and surface an explanatory message via the existing `error` state banner in `TemplateDesigner.tsx`.
- No new npm dependencies — `@pdfme/converter` (client + server) and `openai` (server) are already present.
- The new large-body route (`/ai-form/detect-from-pdf`) needs a larger JSON body limit (25mb, for base64 page images) than the app's existing global default (10mb) — but the existing global 10mb limit must remain unchanged for every other route.
- While AI vision detection is in flight, the "Change PDF" toolbar button must be disabled and its label changed to "Detecting…", since (unlike the instant client-side AcroForm parse) this is a real network round-trip.

---

## File Structure

- **Create:** `server/src/services/aiPdfVisionService.ts` — the new AI vision service (system prompt + OpenAI call + tool-call extraction).
- **Create:** `server/src/routes/aiPdfVision.ts` — new Express router exposing `POST /ai-form/detect-from-pdf`, mounted with its own larger JSON body-size limit.
- **Modify:** `server/src/index.ts` — mount the new route with a route-specific larger body limit, registered before the existing global JSON body parser so the two limits don't conflict.
- **Create:** `client/src/lib/aiPdfVisionDetection.ts` — rasterizes a PDF's pages and calls the new endpoint.
- **Modify:** `client/src/lib/api.ts` — add `api.aiDetectFieldsFromPdf`.
- **Modify:** `client/src/pages/TemplateDesigner.tsx` — extend `handleBasePdfFile` with the new AI-vision fallback tier, and add the `isDetectingAi` loading state.

---

### Task 1: Server — AI vision service and route

**Files:**
- Create: `server/src/services/aiPdfVisionService.ts`
- Create: `server/src/routes/aiPdfVision.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `OpenAI` SDK (already used in `server/src/services/aiFormService.ts`, same `OPENAI_API_KEY` env var pattern).
- Produces:
  ```ts
  export async function runAiPdfVisionDetection(pageImages: string[]): Promise<{ template: unknown }>
  ```
  Consumed by the new route in this same task. The route exposes `POST /ai-form/detect-from-pdf` with request body `{ images: string[] }` and response `{ template: unknown }` (200) or `{ error: string }` (500) — this exact shape is what Task 3 (client) will call.

- [ ] **Step 1: Create the AI vision service**

```ts
// server/src/services/aiPdfVisionService.ts
import OpenAI from 'openai';

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

export interface AiPdfVisionResult {
  template: unknown;
}

const SYSTEM_PROMPT = `You are looking at one or more images of pages from a real-world document (such as an invoice, receipt, application form, or letter). Identify every distinct piece of information a person would need to fill in or reference on a NEW, similar document — e.g. "Invoice Number", "Date", "Bill To", "Total Amount", "Item Description". Do not try to reproduce the exact text/values visible in the image; instead, generate the FIELD (its label and appropriate input type) that would capture that kind of information on a blank version of this document.

You can only use these field types: text, date, select, checkbox.

Work out the complete field list from the image(s) alone — do not ask questions. If multiple images are provided, they are consecutive pages of the same document; combine fields found across all of them into one template.

Once you have identified the fields, call the "submit_template" tool. Do not call the tool until you have identified every field you can find across all provided pages.

When calling submit_template, produce a pdfme Template object:
{
  "basePdf": { "width": 210, "height": 297, "padding": [10, 10, 10, 10] },
  "schemas": [[ ...elements... ]]
}

IMPORTANT: For every input field, you MUST also include a label element immediately before it in the schemas array. Labels are read-only text that tell the user what to fill in.

Layout rules (all measurements in millimeters, A4 page = 210 x 297):
- "schemas" is an array of pages. Each page is an array of elements: [ [page1elements...], [page2elements...], ... ]
- Include as many fields as you found — use multiple pages if required.
- On the FIRST page, start at y:22 (after the title). On subsequent pages, start at y:15.
- Each row = a label + an input field:
  - Label:      y = rowY,     height = 5,  fontSize = 8,  readOnly = true
  - Input:      y = rowY + 6, height = 9,  fontSize = 11
  - Next rowY = rowY + 18
- When rowY + 18 would exceed 270, start a new page and reset rowY to 15.
- Every element must have x=20, width=160.
- EVERY element must have all required fields: name, type, position ({x, y}), width, height, fontSize.
- Label elements must also have: readOnly=true, content="Human Readable Label".
- Input elements of type "select" must also have: options: string[].
- Do NOT leave any element with undefined or missing fields.

Add a title only on page 1, describing the kind of document this appears to be (e.g. "Invoice", "Application Form"):
{ "name": "form_title", "type": "text", "position": {"x":20,"y":8}, "width":170, "height":10, "fontSize":16, "readOnly":true, "content":"<Form Title Here>" }

Label element shape:
{
  "name": "label_<field_name>",
  "type": "text",
  "position": { "x": 20, "y": <rowY> },
  "width": 160, "height": 5, "fontSize": 8,
  "readOnly": true,
  "content": "Human Readable Label"
}

Input element shape:
{
  "name": "unique_snake_case_key",
  "type": "text" | "date" | "select" | "checkbox",
  "position": { "x": 20, "y": <rowY + 6> },
  "width": 160, "height": 9, "fontSize": 11
}

Work through every field one by one, computing rowY carefully before writing each element. Double-check that no element is missing any required property before calling submit_template.`;

const SUBMIT_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'submit_template',
    description: 'Submit the final pdfme template once every field has been identified from the document image(s).',
    parameters: {
      type: 'object',
      required: ['template'],
      properties: {
        template: {
          type: 'object',
          description: 'A pdfme Template object with basePdf and schemas.',
        },
      },
    },
  },
};

export async function runAiPdfVisionDetection(pageImages: string[]): Promise<AiPdfVisionResult> {
  const openai = getClient();

  const imageParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = pageImages.map((url) => ({
    type: 'image_url',
    image_url: { url },
  }));

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Here are the page images of the document. Identify its fields and submit the template.' },
          ...imageParts,
        ],
      },
    ],
    tools: [SUBMIT_TOOL],
  });

  const choice = completion.choices[0];
  const toolCall = choice.message.tool_calls?.find(
    (tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
      tc.type === 'function' && tc.function.name === 'submit_template'
  );

  if (!toolCall) {
    throw new Error(choice.message.content ?? 'The AI could not identify any fields in this document.');
  }

  const args = JSON.parse(toolCall.function.arguments) as { template: unknown };
  return { template: args.template };
}
```

- [ ] **Step 2: Create the route**

```ts
// server/src/routes/aiPdfVision.ts
import { Router, Request, Response } from 'express';
import { runAiPdfVisionDetection } from '../services/aiPdfVisionService.js';

export const aiPdfVisionRouter = Router();

/**
 * @openapi
 * /ai-form/detect-from-pdf:
 *   post:
 *     summary: Detect form fields from page images of a flat PDF using AI vision, and generate a pdfme template
 *     tags: [AI Form Builder]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [images]
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   description: A data URL (data:image/jpeg;base64,...) for one page, in page order
 *     responses:
 *       200:
 *         description: The generated template
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 template:
 *                   type: object
 *       400:
 *         description: Missing or invalid images array
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: AI detection failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiPdfVisionRouter.post('/detect-from-pdf', async (req: Request, res: Response) => {
  const { images } = req.body as { images?: string[] };

  if (!Array.isArray(images) || images.length === 0 || !images.every(i => typeof i === 'string')) {
    res.status(400).json({ error: 'images is required and must be a non-empty array of strings' });
    return;
  }

  try {
    const result = await runAiPdfVisionDetection(images);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});
```

- [ ] **Step 3: Mount the route with a larger body-size limit, without changing the existing global limit**

Express body-parser middleware cannot have its limit "raised" by a second `express.json()` running later in the chain — once the earlier, stricter parser has consumed (or rejected) the request stream, a later parser is either never reached or is a no-op. The only correct way to give one route a larger limit than the app's default is to register that route's own `express.json({limit})` BEFORE the app-level default parser, since Express matches routes in registration order and a matched handler does not fall through to later middleware.

Read the current `server/src/index.ts` in full before editing — do not guess at surrounding lines. Replace it with:

```ts
import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { templatesRouter } from './routes/templates.js';
import { generatePdfRouter } from './routes/filledPdfs.js';
import { aiFormRouter } from './routes/aiForm.js';
import { aiPdfVisionRouter } from './routes/aiPdfVision.js';
import { swaggerSpec, swaggerUi } from './swagger.js';
import { initDb } from './db.js';

await initDb();

const app = express();
app.use(cors());

// This route needs a larger body limit (base64 page images) than the rest
// of the app. It must be registered, with its own express.json(), BEFORE
// the app-wide express.json() below — Express does not allow a later,
// larger-limit body parser to override an earlier, stricter one on the
// same request, since the earlier one already consumes (or rejects) the
// request stream. Keep this route registered above the global parser.
app.use('/ai-form', express.json({ limit: '25mb' }), aiPdfVisionRouter);

app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
app.use('/templates', templatesRouter);
app.use('/generate-pdf', generatePdfRouter);
app.use('/ai-form', aiFormRouter);

app.get('/docs/swagger.json', (_req, res) => res.json(swaggerSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const PORT = process.env.PORT ?? 3004;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/docs`);
});
```

Note both `app.use('/ai-form', ...)` calls are intentional and both needed: the first (with `aiPdfVisionRouter`, mounted with the 25mb parser) only exposes `/ai-form/detect-from-pdf` since that's the only route `aiPdfVisionRouter` defines; the second (with `aiFormRouter`, relying on the global 10mb parser registered after it) continues to expose `/ai-form/chat` exactly as before. A request to `/ai-form/chat` does not match any route inside `aiPdfVisionRouter` (which only has `/detect-from-pdf`), so Express falls through past the first `app.use('/ai-form', ...)` and reaches the second one normally — the existing chat route's body-size limit (10mb) is unchanged.

- [ ] **Step 4: Typecheck**

Run: `cd server && npx tsc --noEmit -p tsconfig.json` (check `server/package.json` for the exact typecheck command/tsconfig path first — mirror whatever the existing `build`/typecheck script uses).
Expected: no errors.

- [ ] **Step 5: Manual verification**

Start the server (`cd server && npm run dev`, confirm `Connected to MSSQL` / `Server running on port 3004` in the log — if the DB is unreachable, note that in your report but this task's own routes do not depend on the DB, only `initDb()` at startup does, which is unchanged). Then:

```bash
curl -X POST http://localhost:3004/ai-form/detect-from-pdf \
  -H "Content-Type: application/json" \
  -d '{"images": []}'
```
Expected: `400` with `{"error":"images is required and must be a non-empty array of strings"}` (empty array correctly rejected).

```bash
curl -X POST http://localhost:3004/ai-form/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}'
```
Expected: `200`, confirming the existing `/ai-form/chat` route (going through the global 10mb parser) still works unaffected by this task's changes.

If you have a real small JPEG/PNG on hand, base64-encode it and confirm a real `images: ["data:image/jpeg;base64,..."]` payload reaches `runAiPdfVisionDetection` and either returns `200` with a `template` object, or a `500` with a clear error if `OPENAI_API_KEY` is invalid/missing in this environment's `server/.env` — either outcome confirms the route and service wiring is correct; a live OpenAI call succeeding is not required to consider this task done, only that the request reaches the service and the service calls OpenAI correctly (no TypeError, no wrong-shape request).

- [ ] **Step 6: Commit**

```bash
git add server/src/services/aiPdfVisionService.ts server/src/routes/aiPdfVision.ts server/src/index.ts
git commit -m "feat(server): add AI vision field detection endpoint for flat PDFs"
```

---

### Task 2: Client — PDF rasterization module and API client method

**Files:**
- Create: `client/src/lib/aiPdfVisionDetection.ts`
- Modify: `client/src/lib/api.ts`

**Interfaces:**
- Consumes: `pdf2img` from `@pdfme/converter` (signature: `pdf2img(pdf: ArrayBuffer | Uint8Array, options?: {scale?: number, imageType?: 'jpeg'|'png', range?: {start?: number, end?: number}}): Promise<ArrayBuffer[]>`, browser build resolved automatically via package `exports`). Consumes Task 1's route: `POST /ai-form/detect-from-pdf` with `{images: string[]}` → `{template: unknown}` (200) or `{error: string}` (non-200).
- Produces:
  ```ts
  export async function detectFieldsWithAiVision(pdfBytes: ArrayBuffer): Promise<Template | null>
  ```
  Consumed by Task 3 (`TemplateDesigner.tsx`).

- [ ] **Step 1: Add the API client method**

In `client/src/lib/api.ts`, add a new response type near the existing `AiFormChatResponse` (after line 17):

```ts
export interface AiPdfVisionResponse {
  template: Template;
}
```

Add a new method to the `api` object, after `aiFormChat` (after line 114, before the closing `};` at line 115):

```ts
  aiDetectFieldsFromPdf: (images: string[]) =>
    request<AiPdfVisionResponse>("/ai-form/detect-from-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
    }),
```

This reuses the existing `request<T>` helper (`client/src/lib/api.ts:29-48`), which already throws an `Error` on any non-2xx response (parsing the server's `{error: string}` body into the thrown error's message) — so callers do not need their own status-code handling.

- [ ] **Step 2: Create the rasterization + detection module**

```ts
// client/src/lib/aiPdfVisionDetection.ts
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
```

Note: `arrayBufferToDataUrl` avoids spreading the byte array into `String.fromCharCode(...bytes)` (which can exceed JS's max call-stack argument count on large images) by building the binary string incrementally instead — required here since page images at `scale: 1.5` can be several hundred KB to a few MB each.

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Since this module isn't wired into any page yet (Task 3 does that), verify by reasoning: confirm `@pdfme/converter`'s package.json `exports` field resolves `"browser"`/`"default"` to a build that doesn't require Node-only APIs (e.g. `@napi-rs/canvas`) — run:
```bash
cd client && node -e "console.log(require.resolve('@pdfme/converter'))"
```
and confirm the resolved path points at a browser-safe build (not `index.node.js`), or check `packages/converter/package.json`'s `exports` map directly and confirm `"default"`/`"browser"` conditions point at `dist/index.js` (the browser build), not `dist/index.node.js`. Describe what you found in your report — this is a load-bearing assumption for the whole feature (if it resolved the Node build in a Vite/browser bundle, the app would crash at runtime), so verify it explicitly rather than assuming from the plan text.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/aiPdfVisionDetection.ts client/src/lib/api.ts
git commit -m "feat(designer): add client-side AI vision PDF field detection"
```

---

### Task 3: Wire AI vision detection into the upload flow, with loading state

**Files:**
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- Consumes: `detectFieldsWithAiVision` from `../lib/aiPdfVisionDetection.js` (Task 2).

- [ ] **Step 1: Import the new module**

Add to the imports at the top of `client/src/pages/TemplateDesigner.tsx`, after the existing `import { detectFields } from '../lib/pdfFieldDetection.js';` (line 17):

```tsx
import { detectFieldsWithAiVision } from '../lib/aiPdfVisionDetection.js';
```

- [ ] **Step 2: Add the loading state**

Find the existing state declarations near the top of the `TemplateDesigner` component — as of this plan's writing, at `client/src/pages/TemplateDesigner.tsx:252-264` (`const [name, setName] = useState('');` through `const [, setTemplateVersion] = useState(0);`), but confirm the exact current lines by reading the file first since they may have shifted. Add the new state alongside `saving`/`generating`/`error` (e.g. right after line 254's `const [generating, setGenerating] = useState(false);`):

```tsx
const [isDetectingAi, setIsDetectingAi] = useState(false);
```

- [ ] **Step 3: Extend `handleBasePdfFile` with the AI vision fallback tier**

Read the current full `handleBasePdfFile` function in `client/src/pages/TemplateDesigner.tsx` before editing (it was last modified in a prior session's error-boundary fixes — confirm exact current line numbers rather than assuming). Replace it with:

```tsx
  const handleBasePdfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !designerRef.current) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const t = designerRef.current!.getTemplate();

      let detectedSchemas: import('@pdfme/common').Schema[][] | null = null;
      let arrayBuffer: ArrayBuffer | null = null;
      try {
        arrayBuffer = await file.arrayBuffer();
        const schemas = await detectFields(arrayBuffer);
        const hasAnyFields = schemas.some(page => page.length > 0);
        if (hasAnyFields) detectedSchemas = schemas;
      } catch (err) {
        console.warn('PDF field detection failed, falling back to background-only update:', err);
      }

      if (detectedSchemas) {
        const candidate = { ...t, basePdf: dataUrl, schemas: detectedSchemas };
        try {
          checkTemplate(candidate);
          designerRef.current!.updateTemplate(candidate);
          setTemplateVersion(v => v + 1);
          e.target.value = '';
          return;
        } catch (err) {
          setError(`Detected fields could not be applied: ${(err as Error).message}`);
        }
      } else if (arrayBuffer) {
        setIsDetectingAi(true);
        try {
          const aiTemplate = await detectFieldsWithAiVision(arrayBuffer);
          if (aiTemplate) {
            try {
              checkTemplate(aiTemplate);
              designerRef.current!.updateTemplate(aiTemplate);
              setTemplateVersion(v => v + 1);
              e.target.value = '';
              return;
            } catch (err) {
              setError(`AI-generated template could not be applied: ${(err as Error).message}`);
            }
          } else {
            setError("Couldn't detect fields from this PDF automatically — the PDF has been set as the background.");
          }
        } finally {
          setIsDetectingAi(false);
        }
      }

      designerRef.current!.updateTemplate({ ...t, basePdf: dataUrl });
      setTemplateVersion(v => v + 1);
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };
```

This preserves the existing AcroForm-first branch exactly as before (unchanged priority, unchanged background-stays behavior), and adds the AI vision branch only in the `else if` — reached only when `detectedSchemas` is `null` (zero AcroForm fields found) AND the file was successfully read into `arrayBuffer` (guards against the rare case where even the initial `file.arrayBuffer()` call itself failed). Both `checkTemplate` failure and `detectFieldsWithAiVision` returning `null` degrade to the same final background-only fallback at the bottom of the function.

- [ ] **Step 4: Update the "Change PDF" toolbar button to reflect the loading state**

Find the existing `ToolbarBtn` for "Change PDF" (around line 634, may have shifted):
```tsx
<ToolbarBtn icon={<FileUp size={13} />} label="Change PDF" onClick={handleChangePdf} />
```
Replace with:
```tsx
<ToolbarBtn
  icon={<FileUp size={13} />}
  label={isDetectingAi ? 'Detecting…' : 'Change PDF'}
  onClick={handleChangePdf}
  disabled={isDetectingAi}
/>
```

- [ ] **Step 5: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Start both the server (`cd server && npm run dev`) and client (`cd client && npm run dev`) dev servers (use alternate ports if the default ones are already in use by another process — check with `lsof -ti:3004` / `lsof -ti:5173` first, per this project's established convention of never blindly killing a process without confirming its command path via `ps -p <pid> -o command`).

If a browser is available:
1. On `/templates/new`, click "Change PDF" and upload a real fillable PDF (one with AcroForm fields, e.g. reuse `packages/pdf-lib/assets/pdfs/fancy_fields.pdf` if convertible to a real upload, or any known fillable PDF). Confirm: existing AcroForm behavior is completely unchanged (fields detected, PDF stays as background, no AI call is made — check the Network tab to confirm `/ai-form/detect-from-pdf` is NOT called in this case).
2. Upload a flat PDF with no form fields (e.g. any plain document, or a printed/scanned-looking invoice-style PDF). Confirm: the "Change PDF" button becomes disabled and shows "Detecting…" while the request is in flight, then either (a) on success, a new blank-page template appears with AI-inferred fields (uploaded PDF is NOT the background), or (b) on failure (e.g. missing/invalid `OPENAI_API_KEY`), the background updates to the uploaded PDF and an error banner explains detection failed — either outcome is a correctly-working fallback path, confirm whichever one actually occurs in this environment and describe it in your report.
3. Confirm the button returns to its normal "Change PDF" label and re-enables after the request completes (success or failure).

If no browser is available, perform a careful code-path walkthrough of all three branches (AcroForm success / AI vision success / AI vision failure-fallback) and describe it in your report, consistent with how prior tasks in this project were verified when a browser wasn't available.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/TemplateDesigner.tsx
git commit -m "feat(designer): fall back to AI vision field detection for flat PDFs"
```

---

## Self-Review Notes

- **Spec coverage:** Every behavior in `docs/superpowers/specs/2026-07-28-ai-pdf-field-detection-design.md` is covered — AcroForm-first priority (Task 3 Step 3's `else if`), blank-template-not-background output (AI template applied directly via `updateTemplate(aiTemplate)`, not merged with `dataUrl`), fully-automatic single-call interaction (no chat/clarifying-questions loop, mirrors `aiFormService.ts`'s tool-call pattern but single-turn), all-pages-sent multi-page handling (`pdf2img` with no `range` restriction rasterizes every page), failure fallback to background-only + error banner (both the `checkTemplate` catch and the `aiTemplate === null` branch), and the loading-state addition from the spec's self-review (`isDetectingAi` + button label/disabled swap).
- **Placeholder scan:** No TBD/TODO; all three tasks contain complete code, including the full adapted system prompt (not a "same as before" reference).
- **Type consistency:** `detectFieldsWithAiVision(pdfBytes: ArrayBuffer): Promise<Template | null>` (Task 2) is called with exactly that signature in Task 3 (`await detectFieldsWithAiVision(arrayBuffer)`, where `arrayBuffer` is the same `ArrayBuffer` already produced earlier in the same function for the AcroForm path — reused, not re-read). `api.aiDetectFieldsFromPdf(images: string[]): Promise<AiPdfVisionResponse>` (Task 2) matches the route's exact request/response shape defined in Task 1 (`{images: string[]}` → `{template: unknown}`, narrowed to `Template` client-side by the `AiPdfVisionResponse` type — consistent with how `AiFormChatResponse` already narrows `template?: Template` from the existing chat route's looser `unknown`). `runAiPdfVisionDetection(pageImages: string[]): Promise<{template: unknown}>` (Task 1) matches what the Task 1 route handler calls it with and returns.
- **Task ordering:** Task 2 depends on Task 1's route existing (though it could technically be typechecked independently since it only calls `api.aiDetectFieldsFromPdf`, a client-side fetch wrapper with no compile-time dependency on the server). Task 3 depends on Task 2's exported `detectFieldsWithAiVision`. Strictly sequential: 1 → 2 → 3.
- **Correction from spec:** the spec's "Payload size" section said to "apply the larger limit only to this route" without specifying the mechanism; research during planning confirmed a naive later-middleware override does not work in Express (an earlier global body parser already consumes/rejects the stream before a later, larger-limit parser would run). Task 1 Step 3 uses the correct pattern instead: the large-body route is registered with its own `express.json({limit:'25mb'})` BEFORE the existing global `express.json({limit:'10mb'})`, relying on Express's registration-order route matching — the existing `/ai-form/chat` route's 10mb limit is unaffected, verified in Task 1 Step 5's manual verification.

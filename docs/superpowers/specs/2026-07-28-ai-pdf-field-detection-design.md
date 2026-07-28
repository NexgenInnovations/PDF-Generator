# AI-based field detection for flat PDFs (invoices, etc.)

Date: 2026-07-28
Status: Approved for planning

## Context

The existing "Change PDF" flow in the Designer (`client/src/pages/TemplateDesigner.tsx`'s
`handleBasePdfFile`) already auto-detects real AcroForm form fields from an
uploaded PDF (`client/src/lib/pdfFieldDetection.ts`, shipped in a prior
session). That feature only works for PDFs that already contain
interactive, structural form fields — it does nothing for flat/scanned
documents like a typical invoice, receipt, or letter, which have no
AcroForm data at all.

The user wants: when a flat PDF like an invoice is uploaded, the app should
use AI vision to look at the document, figure out what fields it contains
(e.g. "Invoice #", "Date", "Total", "Bill To"), and generate a new,
editable pdfme template with those fields — so uploading a real-world
document quickly produces a usable form.

This builds on infrastructure that already exists in the codebase:
- `server/src/services/aiFormService.ts` — the existing AI **chat** feature
  (`AskAiPanel` → `POST /ai-form/chat`) that has a user describe a form in
  conversation, and uses OpenAI's `gpt-4o` model with a forced tool-call
  (`submit_template`) to produce a validated pdfme `Template` object. Its
  system prompt encodes exact layout rules (label+input row pairs, mm
  positions, row height increments) that this new feature reuses directly.
- `@pdfme/converter`'s `pdf2img` — already a dependency of both `client/`
  and `server/`, but currently unused anywhere in application code. It
  rasterizes PDF pages to images (browser build via `<canvas>` +
  pdfjs-dist), which is exactly what's needed to feed pages to a vision
  model.

## Feature behavior

**Trigger**: automatic, as part of the existing "Change PDF" upload flow —
no new button. `handleBasePdfFile` already tries AcroForm detection first;
this feature adds a fallback step when that finds nothing.

**Priority order** (extends the existing flow):
1. Try AcroForm detection (`detectFields`, existing). If it finds ≥1
   field: apply exactly as today (PDF stays as the template's visual
   background, fields overlay it at their real positions). **No behavior
   change for PDFs that already have real form fields.**
2. If AcroForm detection finds zero fields: this is the new path. Rasterize
   every page of the uploaded PDF to images, send them to a new
   AI-vision-backed server endpoint, and get back a full pdfme `Template`.
3. Apply that template — but unlike the AcroForm path, **do NOT use the
   uploaded PDF as the background**. The result is a fresh, blank-page
   template containing only the AI-inferred fields, laid out top-to-bottom
   in the same clean label+input style the existing AI chat feature
   already produces. The original invoice's visual layout/positions are
   not preserved — only its content and structure are captured as fields.
4. If the AI call fails for any reason (API error, timeout, or it
   determines there's nothing to extract), fall back to today's
   background-only behavior: `basePdf` is updated but `schemas` is left
   untouched, and the existing `error` state banner in
   `TemplateDesigner.tsx` surfaces a message explaining detection failed.
   This exactly mirrors the AcroForm feature's own failure-fallback
   pattern — no new UI needed.

**Interaction model**: fully automatic, no back-and-forth. Unlike the
existing `AskAiPanel` chat feature (which asks clarifying questions before
finalizing), this flow makes a single vision call and applies its best
result immediately — consistent with "upload and go."

**Multi-page PDFs**: every page is rasterized and sent to the AI in one
call, so fields spread across multiple pages (e.g. an invoice with
itemized charges on page 2) can all be captured into the generated
template.

## Server: new AI vision service and route

New file: `server/src/services/aiPdfVisionService.ts`, exporting:

```ts
export interface AiPdfVisionResult {
  template: unknown;
}

export async function runAiPdfVisionDetection(pageImages: string[]): Promise<AiPdfVisionResult>
```

- `pageImages` is an array of data URLs (`data:image/jpeg;base64,...` or
  `data:image/png;base64,...`), one per PDF page, in page order.
- Uses the same `OpenAI` client singleton pattern as
  `aiFormService.ts`'s `getClient()` (same `OPENAI_API_KEY` env var,
  same `gpt-4o` model — already vision-capable, just not exercised
  today).
- Sends a single-turn request: one `system` message (new prompt, below)
  and one `user` message whose `content` is a multi-part array — one
  `{ type: 'text', text: '...' }` instruction plus one
  `{ type: 'image_url', image_url: { url } }` entry per page image (the
  multi-part content format `gpt-4o` supports for vision input; the
  existing chat service only ever sends plain string `content`, so this
  is new).
- Forces the same `submit_template` tool-call pattern as
  `aiFormService.ts` (reuse the identical `SUBMIT_TOOL` definition,
  duplicated into this file to keep the two services independent — no
  shared abstraction needed for one constant).
- If the model doesn't call `submit_template` (e.g. it explicitly can't
  find any fields), throw an `Error` with the model's text response as
  the message — the route below turns this into a failure response, and
  the client's fallback (background-only + error banner) handles it.

**New system prompt** (adapted from `aiFormService.ts`'s `SYSTEM_PROMPT`,
same layout rules, different task framing):

```
You are looking at an image of a real-world document (such as an invoice,
receipt, application form, or letter). Identify every distinct piece of
information a person would need to fill in or reference on a NEW, similar
document — e.g. "Invoice Number", "Date", "Bill To", "Total Amount",
"Item Description". Do not try to reproduce the exact text/values visible
in the image; instead, generate the FIELD (its label and appropriate input
type) that would capture that kind of information on a blank version of
this document.

You can only use these field types: text, date, select, checkbox.

Work out the complete field list from the image(s) alone — do not ask
questions. If multiple images are provided, they are consecutive pages of
the same document; combine fields found across all of them into one
template.

Once you have identified the fields, call the "submit_template" tool.

[... identical Layout rules / element shape / title rules text as
aiFormService.ts's SYSTEM_PROMPT, verbatim ...]
```

New file: `server/src/routes/aiPdfVision.ts`:

```ts
POST /ai-form/detect-from-pdf
Request body: { images: string[] }   // data URLs, one per page, page order
Response: { template: unknown }      // 200 on success
Response: { error: string }          // 500 on failure (AI error, or no fields found)
```

Validates `images` is a non-empty array of strings before calling
`runAiPdfVisionDetection`. Mounted in `server/src/index.ts` alongside the
existing `/ai-form` router (same path prefix, new sub-route — reuse the
existing router file/mount point rather than adding a second top-level
mount).

**Payload size**: multi-page PDFs rasterized to images and base64-encoded
can be large. `server/src/index.ts` already sets
`express.json({ limit: '10mb' })` for the existing routes — this limit
needs raising for this route specifically (e.g. `25mb`) since multiple
page images in one JSON body can exceed 10mb; apply the larger limit only
to this route (`express.json({ limit: '25mb' })` as router-level
middleware on the new route, not globally) to avoid loosening the limit
for unrelated endpoints.

## Client: rasterization and wiring

**New client dependency usage** (no new package — `@pdfme/converter` is
already installed): import `pdf2img` from `@pdfme/converter` in
`client/src/lib/pdfFieldDetection.ts` or a new sibling file
`client/src/lib/aiPdfVisionDetection.ts` (new file, to keep the AcroForm
module focused — per this project's file-per-responsibility convention).

New file: `client/src/lib/aiPdfVisionDetection.ts`, exporting:

```ts
export async function detectFieldsWithAiVision(pdfBytes: ArrayBuffer): Promise<Template | null>
```

- Calls `pdf2img(pdfBytes, { imageType: 'jpeg', scale: 1.5 })` (browser
  build resolves automatically via `@pdfme/converter`'s package
  `exports` field) to get one image `ArrayBuffer` per page.
- Converts each page's `ArrayBuffer` to a base64 data URL.
- Calls a new `api.aiDetectFieldsFromPdf(images)` client function (added
  to `client/src/lib/api.ts`, following the existing `api.aiFormChat`
  pattern) which POSTs to `/ai-form/detect-from-pdf` and returns
  `{ template }` or throws on a non-2xx response.
- Returns the parsed `Template`, or `null` if the server call fails —
  callers treat `null` as "fall back to background-only", matching the
  AcroForm module's own null-on-failure convention.

**Wiring into `handleBasePdfFile`** (`client/src/pages/TemplateDesigner.tsx`):
extends the function's existing logic (which already tries `detectFields`
first) with a new branch:

1. If `detectFields` found ≥1 field (existing branch): unchanged — apply
   `{ basePdf: dataUrl, schemas: detectedSchemas }` after `checkTemplate`
   validation, exactly as today.
2. Else (zero AcroForm fields — new branch): call
   `detectFieldsWithAiVision(arrayBuffer)`.
   - If it returns a `Template`: validate with `checkTemplate` (same
     validate-before-apply pattern used everywhere else in this file);
     on success, call `designerRef.current.updateTemplate(aiTemplate)`
     directly — note this REPLACES `basePdf` too (unlike the AcroForm
     path), since the AI-generated template has its own blank
     `basePdf: { width, height, padding }`, not the uploaded PDF's data
     URL. On `checkTemplate` failure, fall back to background-only
     (today's uploaded-PDF-as-background behavior) and surface the
     validation error via `setError`.
   - If it returns `null` (AI call failed): fall back to background-only
     update (today's behavior), matching the AcroForm module's own
     silent-fallback convention — but since this is a more expensive,
     more visible operation than a client-side parse failure, also
     surface a message via `setError` (e.g. "Couldn't detect fields from
     this PDF automatically — the PDF has been set as the background.")
     so the user understands why nothing was auto-filled.
3. Zero-fields-found-by-AI-either case (AI legitimately determines the
   document has nothing to extract): the server route returns a 500 with
   an error message (per the service's `throw` behavior above); this is
   handled identically to "AI call failed" in step 2 — background-only
   fallback with an explanatory error message.

This keeps the AcroForm path's behavior completely unchanged (same
priority, same background-PDF-stays result) while adding a new fallback
tier for flat documents.

## Out of scope

- Preserving the uploaded document's original visual layout/positions in
  the generated template — the AI produces a clean top-to-bottom layout
  using the existing chat feature's row-based convention, not a
  position-accurate recreation.
- Conversational back-and-forth / clarifying questions — this is a single
  automatic vision call per upload.
- Running AI vision when the PDF already has ≥1 real AcroForm field —
  AcroForm detection always takes priority when it finds anything.
- New field types beyond the existing set (text, date, select, checkbox) —
  no image/table/signature inference for this pass.
- Any change to the existing `/ai-form/chat` conversational feature or its
  `AskAiPanel` UI — this is a fully separate code path that happens to
  reuse the same AI service infrastructure and layout conventions.
- Streaming/progress UI (e.g. per-page progress, cancel button) while the
  AI call is in flight — see the new "Loading feedback" section below for
  the minimum feedback this pass does include.

## Loading feedback

`handleBasePdfFile` today has no loading/busy state at all — the AcroForm
path is a fast, synchronous-feeling client-side parse, so its absence is
unnoticeable. The AI vision path is a real network round-trip (image
rasterization + an OpenAI vision call) that can take several seconds, so
some minimal feedback is needed to avoid the upload looking hung:

- Add a new `isDetectingAi` boolean state to `TemplateDesigner.tsx`, set
  `true` right before calling `detectFieldsWithAiVision` and `false` in a
  `finally` block after it resolves/rejects.
- While `isDetectingAi` is `true`, disable the "Change PDF" `ToolbarBtn`
  (pass `disabled={isDetectingAi}`, following the same pattern already
  used for the `saving`/`generating`-driven disables on other toolbar
  buttons) and swap its label text to something like "Detecting…" so the
  user has a clear signal work is happening. No spinner icon or progress
  bar — a disabled button with changed label text is the minimum viable
  feedback and matches this codebase's existing toolbar button
  conventions.

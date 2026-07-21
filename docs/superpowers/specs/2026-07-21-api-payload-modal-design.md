# API payload modal

Date: 2026-07-21
Status: Approved for planning

## Context

The user shared a screenshot of the stock pdfme playground toolbar's "API"
feature: a modal titled "API payload" with a "Full template" / "By ID"
toggle, showing a `POST` request against `/api/generate` with the full
template JSON inline, plus "Copy body" and "Copy as curl" buttons.

This app's actual PDF-generation endpoint is different from the stock
playground's: `POST /generate-pdf` (mounted under `API_BASE`, currently
`/api` by default — see `client/src/lib/api.ts:18`) accepts
`{ template_id: string, inputs: Record<string, string>[] }` and looks the
template up server-side by ID (`server/src/routes/filledPdfs.ts`). There is
no endpoint that accepts a full inline template — building one is out of
scope; instead this feature documents the real endpoint's shape.

## Feature: API payload modal

**Trigger**: A new "API" button in `TemplateDesigner.tsx`'s existing Output
toolbar group, alongside "Generate PDF" and "Template JSON".

**Component**: New file `client/src/components/ApiPayloadModal.tsx`, a
self-contained modal following the existing visual pattern used by the JSON
editor and Header/Footer editor modals in `TemplateDesigner.tsx` (white
card, `border-radius: 16`, `#e6e6e6` borders, backdrop blur, `boxShadow: '0
24px 64px rgba(0,0,0,0.15)'`).

**Props**:
```tsx
{
  templateId: string | null;   // from the existing `id` route param
  template: Template;          // designerRef.current.getTemplate()
  onClose: () => void;
}
```

**Contents**:
- Title: "API payload"
- A two-way toggle: **Full template** / **By ID**. Both modes hit the same
  real endpoint and produce the same `{ template_id, inputs }` shape — they
  differ only in how the `inputs` array is populated for display:
  - **Full template**: `inputs` is `getInputFromTemplate(template)` (from
    `@pdfme/common`, already used by the existing Generate PDF button in
    `TemplateDesigner.tsx:311`) — every field in the template appears with
    its real name and default/sample content.
  - **By ID**: `inputs` is a minimal placeholder example — the first field
    from `getInputFromTemplate(template)`'s result if any fields exist
    (`Object.fromEntries(Object.entries(inputs[0]).slice(0, 2))`, i.e. at
    most the first 2 key/value pairs), or `[{}]` if the template has no
    fields. This keeps the documented example short.
- A `POST` badge and the absolute URL:
  `window.location.origin + API_BASE + '/generate-pdf'`, where `API_BASE`
  is imported/re-derived the same way `client/src/lib/api.ts` computes it
  (`import.meta.env.VITE_API_BASE_URL ?? "/api"`, trailing slash stripped).
- A scrollable, syntax-styled JSON body preview (monospace, same styling
  as the existing JSON editor modal's `<textarea>` but read-only — a `<pre>`
  is sufficient since this is a preview, not an editable field) showing:
  ```json
  {
    "template_id": "<templateId or placeholder>",
    "inputs": [ ...per mode above... ]
  }
  ```
  If `templateId` is `null` (template never saved), the displayed
  `template_id` value is the literal string `"<save the template first>"`,
  and a small inline warning line appears above the body preview: "Save
  this template to get a real template_id."
- Two buttons at the bottom: **Copy body** and **Copy as curl**, both using
  `navigator.clipboard.writeText`.
  - **Copy body** copies the JSON body only (pretty-printed,
    `JSON.stringify(body, null, 2)`).
  - **Copy as curl** copies:
    ```
    curl -X POST <url> \
      -H 'Content-Type: application/json' \
      -d '<JSON body, compact or pretty — pretty for readability>'
    ```
- A close button (✕), matching the existing modal pattern.

**Integration**: `TemplateDesigner.tsx` gains an `apiPayloadOpen` boolean
state (mirroring the existing `jsonOpen`/`aiOpen`/`headerFooterOpen`
pattern) and conditionally renders `<ApiPayloadModal>` when true, passing
`templateId={id ?? null}` (the existing `useParams` route id),
`template={designerRef.current?.getTemplate() ?? BLANK_TEMPLATE}` (guarding
the null-ref case the same way other handlers do), and
`onClose={() => setApiPayloadOpen(false)}`.

## Out of scope

- No new server endpoint that accepts a full inline template — the modal
  documents the real, existing `/generate-pdf` endpoint only.
- No live "Try it" / send-request-from-the-modal button — copy-paste only,
  matching the screenshot's actual functionality (Copy body / Copy as curl,
  no "Send" button shown).
- No persistence of the toggle selection (Full template vs By ID) across
  modal opens — resets to a default (Full template) each time.

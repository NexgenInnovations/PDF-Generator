# Click-to-Place Signature ("Sign Document") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Sign Document" button to the fill flow that lets a signer click anywhere on the rendered PDF (any page) to drop a new signature field at that spot, sign it inline, and have it included in the generated PDF with the same name/email capture and audit-trail recording (server-computed hash/IP/timestamp) that pre-placed signature fields already get.

**Architecture:** Server: `POST /generate-pdf` accepts an optional `signAnywhere: {page, x, y, content, signerName, signerEmail}` object of primitives only (never a client-built schema); the server validates it, clamps the position to the page bounds, builds a real pdfme `Schema` object itself, merges it into a deep-cloned copy of the resolved template (the stored/published template is never mutated), generates the PDF from that clone, and records the signature in the same `signature_events` table as any other signature field. Client: a new toolbar button in `FormFill.tsx` toggles a click-placement mode with a transparent overlay over the rendered pages; a click computes the page and mm position from the clicked page's actual rendered `getBoundingClientRect()` (not pdfme internals), splices a new `type: 'signature'` schema into the live `Form` via its already-public, inherited `updateTemplate()`, and the existing `SignerDetailsPanel`/submit-validation logic picks it up automatically since it scans the template for `type: 'signature'` fields.

**Tech Stack:** React 18 + TypeScript (client), Node.js + Express + TypeScript (server), `@pdfme/common`/`@pdfme/ui` (unmodified). No new npm dependencies. No test runner exists in either `client/` or `server/` — verification is manual: typecheck plus live server/browser testing.

## Global Constraints

- `packages/schemas/src/graphics/signature.ts` is never modified.
- The server never trusts a client-constructed `Schema` object for the click-placed signature — only primitive values (`page`, `x`, `y`, `content`, `signerName`, `signerEmail`). The server builds the `Schema` itself.
- The stored/published template in the database is never mutated by this feature — a deep clone of the resolved template is modified in memory for one PDF generation, then discarded.
- `x`/`y` are clamped server-side so the fixed-size signature box (62.5×37.5mm, pdfme's own default signature field size) stays fully within the page's bounds. `page` is validated to be a real page index in the resolved template.
- Exactly one click-placed signature per submission — the client sends zero or one `signAnywhere` object; the server merges at most one extra schema.
- Purely additive: a submission that doesn't use "Sign Document" must behave identically to today — no change to existing signature fields, `inputs`, or `signatureEvents` handling when `signAnywhere` is absent.
- No new DB schema — a click-placed signature is recorded as an ordinary `signature_events` row via the existing `createSignatureEvent` function, with a server-generated `field_name`.

---

## File Structure

- **Modify:** `server/src/routes/filledPdfs.ts` — accept, validate, and clamp an optional `signAnywhere` object; build its `Schema` server-side; merge into a cloned template before generating; fold its signer info into the existing `signature_events` recording loop.
- **Modify:** `client/src/lib/api.ts` — extend `createFilledPdf` to accept and send an optional `signAnywhere` payload.
- **Modify:** `client/src/pages/FormFill.tsx` — add the "Sign Document" button, click-placement overlay, coordinate math, template splicing, and submit-time payload construction.

---

### Task 1: Server — accept, validate, and merge `signAnywhere` into `POST /generate-pdf`

**Files:**
- Modify: `server/src/routes/filledPdfs.ts`

**Interfaces:**
- Consumes: `resolvedVersion.schema` (already available in the handler, an untyped value cast to `Template`), `createSignatureEvent` from `../db.js` (already imported).
- Produces (for Task 2's client to send):
  ```ts
  // Request body addition, all fields required if signAnywhere is present at all:
  signAnywhere?: {
    page?: number;
    x?: number;
    y?: number;
    content?: string;
    signerName?: string;
    signerEmail?: string;
  }
  ```
  No new exports — this is entirely internal to the route handler.

- [ ] **Step 1: Read the current file in full**

Read `server/src/routes/filledPdfs.ts` in full (180 lines) to confirm current line numbers and see the exact surrounding context — the existing `signatureEvents` validation block, the `try { ... } catch (dbErr)` best-effort recording block, and the `generatePdf` call — before editing.

- [ ] **Step 2: Add the `crypto.randomUUID` import**

Update the top-of-file import line. Current:
```ts
import { createHash } from 'crypto';
```
Change to:
```ts
import { createHash, randomUUID } from 'crypto';
```

- [ ] **Step 3: Destructure and validate `signAnywhere` from the request body**

Find the current destructuring:
```ts
const { template_id, inputs, version, tag, signatureEvents } = req.body as {
  template_id?: string;
  inputs?: Record<string, string>[];
  version?: number;
  tag?: string;
  signatureEvents?: { fieldName?: string; signerName?: string; signerEmail?: string }[];
};
```
Replace with:
```ts
const { template_id, inputs, version, tag, signatureEvents, signAnywhere } = req.body as {
  template_id?: string;
  inputs?: Record<string, string>[];
  version?: number;
  tag?: string;
  signatureEvents?: { fieldName?: string; signerName?: string; signerEmail?: string }[];
  signAnywhere?: { page?: number; x?: number; y?: number; content?: string; signerName?: string; signerEmail?: string };
};
```

Immediately after the existing `signatureEvents` validation block (the `for (const event of signatureEvents) { ... }` loop that builds `validatedSignatureEvents`), add a new validation block:

```ts
  let validatedSignAnywhere: { page: number; x: number; y: number; content: string; signerName: string; signerEmail: string } | undefined;
  if (signAnywhere !== undefined) {
    if (
      typeof signAnywhere.page !== 'number' || !Number.isInteger(signAnywhere.page) || signAnywhere.page < 0 ||
      typeof signAnywhere.x !== 'number' || !Number.isFinite(signAnywhere.x) ||
      typeof signAnywhere.y !== 'number' || !Number.isFinite(signAnywhere.y) ||
      typeof signAnywhere.content !== 'string' || signAnywhere.content.trim().length === 0 ||
      typeof signAnywhere.signerName !== 'string' || signAnywhere.signerName.trim().length === 0 ||
      typeof signAnywhere.signerEmail !== 'string' || signAnywhere.signerEmail.trim().length === 0
    ) {
      res.status(400).json({ error: 'signAnywhere requires a non-negative integer page, finite x/y, and non-empty content, signerName, signerEmail' });
      return;
    }
    validatedSignAnywhere = {
      page: signAnywhere.page,
      x: signAnywhere.x,
      y: signAnywhere.y,
      content: signAnywhere.content,
      signerName: signAnywhere.signerName.trim(),
      signerEmail: signAnywhere.signerEmail.trim(),
    };
  }
```

This mirrors the existing `signatureEvents` validation style already in this file (trim, reject on missing/empty, single combined `if` per entry). `page` is validated for shape here only — the actual bounds check against the resolved template's real page count happens in Step 4, since `resolvedVersion` isn't fetched yet at this point in the handler.

- [ ] **Step 4: Build the merged template and generate from it**

Find the current PDF generation line:
```ts
    const pdf = await generatePdf(resolvedVersion.schema as Template, inputs);
```

Replace it with logic that validates `validatedSignAnywhere.page` against the real template, clamps the position, builds the schema, and generates from a cloned+merged template when `signAnywhere` was provided:

```ts
    let templateForGeneration = resolvedVersion.schema as Template;
    let signAnywhereFieldName: string | undefined;

    if (validatedSignAnywhere) {
      if (validatedSignAnywhere.page >= templateForGeneration.schemas.length) {
        res.status(400).json({ error: `signAnywhere.page ${validatedSignAnywhere.page} is out of range for this template's ${templateForGeneration.schemas.length} page(s)` });
        return;
      }

      const basePdf = templateForGeneration.basePdf;
      const pageWidthMm = typeof basePdf === 'object' && 'width' in basePdf ? basePdf.width : 210;
      const pageHeightMm = typeof basePdf === 'object' && 'height' in basePdf ? basePdf.height : 297;
      const SIGN_ANYWHERE_WIDTH_MM = 62.5;
      const SIGN_ANYWHERE_HEIGHT_MM = 37.5;
      const clampedX = Math.min(Math.max(validatedSignAnywhere.x, 0), Math.max(0, pageWidthMm - SIGN_ANYWHERE_WIDTH_MM));
      const clampedY = Math.min(Math.max(validatedSignAnywhere.y, 0), Math.max(0, pageHeightMm - SIGN_ANYWHERE_HEIGHT_MM));

      signAnywhereFieldName = `sign_anywhere_${randomUUID()}`;
      const clonedTemplate: Template = JSON.parse(JSON.stringify(templateForGeneration));
      clonedTemplate.schemas[validatedSignAnywhere.page].push({
        name: signAnywhereFieldName,
        type: 'signature',
        content: validatedSignAnywhere.content,
        position: { x: clampedX, y: clampedY },
        width: SIGN_ANYWHERE_WIDTH_MM,
        height: SIGN_ANYWHERE_HEIGHT_MM,
      });
      templateForGeneration = clonedTemplate;
    }

    const pdf = await generatePdf(templateForGeneration, inputs);
```

`JSON.parse(JSON.stringify(...))` is used for the deep clone rather than `structuredClone` because `Template.basePdf` can be a `Uint8Array`/`ArrayBuffer` for custom-PDF templates in this codebase's actual runtime data (per `BasePdf`'s union type in `@pdfme/common`) — `JSON.stringify` naturally serializes those consistently with how the rest of this file already treats `resolvedVersion.schema` as JSON-shaped data (compare `createGeneratedPdf`'s `schemaSnapshot: resolvedVersion.schema` a few lines below, which stores it directly as JSON). Note: `basePdf` itself is never mutated here — only `schemas` is spliced into — so this clone is only there to avoid the push mutating whatever cached/shared object `resolvedVersion.schema` might reference.

When `signAnywhere` is absent, `templateForGeneration` stays exactly `resolvedVersion.schema as Template` and the generated PDF is byte-for-byte identical to today's behavior — confirm this by inspecting the diff: the only change on the no-`signAnywhere` path is the added `let`/reassignment scaffolding, not any behavior change.

- [ ] **Step 5: Record the click-placed signature in `signature_events`**

Find the existing signature-recording block inside the best-effort `try { ... } catch (dbErr)`:
```ts
      if (validatedSignatureEvents.length > 0) {
        const documentHash = createHash('sha256').update(pdf).digest('hex');
        const ipAddress = req.ip ?? null;
        for (const event of validatedSignatureEvents) {
          await createSignatureEvent({
            submissionId: submission.id,
            fieldName: event.fieldName,
            signerName: event.signerName,
            signerEmail: event.signerEmail,
            ipAddress,
            documentHash,
          });
        }
      }
```

Replace with a version that also includes the click-placed signature (if any) in the same loop, so it gets the identical `documentHash`/`ipAddress` treatment:

```ts
      const allSignatureEvents = [
        ...validatedSignatureEvents,
        ...(validatedSignAnywhere && signAnywhereFieldName
          ? [{ fieldName: signAnywhereFieldName, signerName: validatedSignAnywhere.signerName, signerEmail: validatedSignAnywhere.signerEmail }]
          : []),
      ];

      if (allSignatureEvents.length > 0) {
        const documentHash = createHash('sha256').update(pdf).digest('hex');
        const ipAddress = req.ip ?? null;
        for (const event of allSignatureEvents) {
          await createSignatureEvent({
            submissionId: submission.id,
            fieldName: event.fieldName,
            signerName: event.signerName,
            signerEmail: event.signerEmail,
            ipAddress,
            documentHash,
          });
        }
      }
```

`documentHash` is computed from `pdf` — the bytes generated in Step 4 from `templateForGeneration`, which already includes the click-placed signature when present — so the hash correctly reflects the final document contents including that signature, satisfying the same "hash reflects what was actually generated" principle the original signature-audit-trail feature established.

- [ ] **Step 6: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Start the server (`cd server && npm run dev` — NOT `npm start`, which serves a stale compiled build; use an alternate port if 3004 is in use, verifying process ownership first via `ps -p <pid> -o command`). Confirm `Connected to MSSQL` / `Tables ready` logs with no error.

Find a real published template ID and its actual page count/dimensions via `curl http://localhost:<port>/templates` and `curl http://localhost:<port>/templates/<id>`, then test:

```bash
curl -s -X POST http://localhost:<port>/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"template_id":"<a real template id>","inputs":[{}],"signAnywhere":{"page":0,"x":20,"y":20,"content":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","signerName":"Test Signer","signerEmail":"test@example.com"}}' \
  -o /tmp/test-sign-anywhere.pdf -w "\nHTTP %{http_code}\n"
```

Expected: `200`, and `/tmp/test-sign-anywhere.pdf` is a valid PDF (open it or run `file /tmp/test-sign-anywhere.pdf` to confirm it's PDF data) containing a tiny signature-image near the top-left of page 1, in addition to the template's normal content.

Test the out-of-range page case:
```bash
curl -s -X POST http://localhost:<port>/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"template_id":"<a real template id>","inputs":[{}],"signAnywhere":{"page":999,"x":20,"y":20,"content":"data:image/png;base64,...","signerName":"Test","signerEmail":"test@example.com"}}' \
  -w "\nHTTP %{http_code}\n"
```
Expected: `400` with an error mentioning the page is out of range.

Test that omitting `signAnywhere` entirely still works exactly as before (regression check):
```bash
curl -s -X POST http://localhost:<port>/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"template_id":"<a real template id>","inputs":[{}]}' \
  -o /tmp/test-no-sign-anywhere.pdf -w "\nHTTP %{http_code}\n"
```
Expected: `200`, valid PDF, no signature_events row inserted (this matches pre-existing behavior for a request with no signature-related fields at all).

If you have DB query access, confirm a `signature_events` row exists for the first test's submission with `field_name` starting `sign_anywhere_`, a 64-character `document_hash`, and the correct `signer_name`/`signer_email`. If you don't have direct DB access, note in your report what you were able to confirm via HTTP responses alone.

Kill the server process you started (verify PID ownership first).

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/filledPdfs.ts
git commit -m "feat(server): accept click-placed signature in POST /generate-pdf"
```

---

### Task 2: Client — "Sign Document" button, click-placement, and submit wiring

**Files:**
- Modify: `client/src/lib/api.ts`
- Modify: `client/src/pages/FormFill.tsx`

**Interfaces:**
- Consumes: Task 1's extended `POST /generate-pdf` (accepts optional `signAnywhere`).
- Produces:
  ```ts
  // client/src/lib/api.ts
  createFilledPdf(
    template_id, inputs, versionRef?,
    signatureEvents?: { fieldName: string; signerName: string; signerEmail: string }[],
    signAnywhere?: { page: number; x: number; y: number; content: string; signerName: string; signerEmail: string }
  ): Promise<Uint8Array>
  ```

- [ ] **Step 1: Extend `api.createFilledPdf` to accept an optional `signAnywhere` argument**

Read the current `client/src/lib/api.ts` in full (around 155 lines) to confirm the exact current shape of `createFilledPdf` before editing. Replace it:

```ts
  createFilledPdf: async (
    template_id: string,
    inputs: Record<string, string>[],
    versionRef?: PublishedVersionRef,
    signatureEvents?: { fieldName: string; signerName: string; signerEmail: string }[],
    signAnywhere?: { page: number; x: number; y: number; content: string; signerName: string; signerEmail: string }
  ): Promise<Uint8Array> => {
    const res = await fetch(API_BASE + "/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
```

The only change from the current implementation is the new 5th parameter and the `...(signAnywhere ? { signAnywhere } : {})` spread — everything else is unchanged, so a call site that never passes the new argument sends the exact same request body as today.

- [ ] **Step 2: Read the current `FormFill.tsx` in full**

Read `client/src/pages/FormFill.tsx` in full (239 lines) to confirm current line numbers and see full context — the `getSignatureFields` helper, the `handleSubmit` function, the toolbar JSX, and the `SignerDetailsPanel` rendering block — before making any edits.

- [ ] **Step 3: Add the `PenLine` icon import and new state**

Update the `lucide-react` import line. Current:
```ts
import { ArrowLeft, Download, FileCheck, Loader2, AlertCircle } from 'lucide-react';
```
Change to:
```ts
import { ArrowLeft, Download, FileCheck, Loader2, AlertCircle, PenLine, X } from 'lucide-react';
```

Add a `pageWidthMm`/`pageHeightMm` helper and new state, placed near the top of the file (module scope for the helper, matching this file's existing `getSignatureFields` pattern; component-scope `useState` calls placed alongside the existing `signerDetails` state declaration):

Module-scope helper, added right after the existing `getSignatureFields` function:
```ts
function getPageSizeMm(template: Template, pageIndex: number): { width: number; height: number } {
  const basePdf = template.basePdf;
  if (typeof basePdf === 'object' && 'width' in basePdf && 'height' in basePdf) {
    return { width: basePdf.width, height: basePdf.height };
  }
  return { width: 210, height: 297 }; // A4 fallback for custom-PDF basePdf with no explicit dimensions
}
```

New component state, added directly after the existing `const [signerDetails, setSignerDetails] = useState<...>({});` line:
```ts
  const [placementMode, setPlacementMode] = useState(false);
  const [signAnywhereFieldName, setSignAnywhereFieldName] = useState<string | null>(null);
```

- [ ] **Step 4: Add the click-placement handler**

Add a new function after `handleDownload` (or any other handler — placement in the file doesn't matter functionally, but keep it grouped with other handlers for readability):

```ts
  const handlePlacementClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!placementMode || !uiRef.current || !templateRecord || !containerRef.current) return;

    const pageEls = containerRef.current.querySelectorAll<HTMLElement>('div[style*="background-image"]');
    let targetPageIndex = -1;
    let pageRect: DOMRect | null = null;
    for (let i = 0; i < pageEls.length; i++) {
      const rect = pageEls[i].getBoundingClientRect();
      if (event.clientY >= rect.top && event.clientY <= rect.bottom && event.clientX >= rect.left && event.clientX <= rect.right) {
        targetPageIndex = i;
        pageRect = rect;
        break;
      }
    }
    if (targetPageIndex === -1 || !pageRect) return;

    const { width: pageWidthMm, height: pageHeightMm } = getPageSizeMm(templateRecord.schema, targetPageIndex);
    const pxPerMm = pageRect.width / pageWidthMm;
    const rawMmX = (event.clientX - pageRect.left) / pxPerMm;
    const rawMmY = (event.clientY - pageRect.top) / pxPerMm;
    const SIGN_ANYWHERE_WIDTH_MM = 62.5;
    const SIGN_ANYWHERE_HEIGHT_MM = 37.5;
    const mmX = Math.min(Math.max(rawMmX, 0), Math.max(0, pageWidthMm - SIGN_ANYWHERE_WIDTH_MM));
    const mmY = Math.min(Math.max(rawMmY, 0), Math.max(0, pageHeightMm - SIGN_ANYWHERE_HEIGHT_MM));

    const fieldName = `sign_anywhere_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const t = uiRef.current.getTemplate();
    const schemas = t.schemas.map((page, i) =>
      i === targetPageIndex
        ? [...page, { name: fieldName, type: 'signature', content: '', position: { x: mmX, y: mmY }, width: SIGN_ANYWHERE_WIDTH_MM, height: SIGN_ANYWHERE_HEIGHT_MM }]
        : page
    );
    uiRef.current.updateTemplate({ ...t, schemas });
    setSignAnywhereFieldName(fieldName);
    setPlacementMode(false);
  };

  const handleRemoveSignAnywhere = () => {
    if (!uiRef.current || !signAnywhereFieldName) return;
    const t = uiRef.current.getTemplate();
    const schemas = t.schemas.map(page => page.filter(schema => schema.name !== signAnywhereFieldName));
    uiRef.current.updateTemplate({ ...t, schemas });
    setSignAnywhereFieldName(null);
  };
```

Note on the page-detection mechanism (the `querySelectorAll` call above): pdfme's `Form`/`Preview` component does not expose its internal per-page DOM refs on the public class API (confirmed during design research — `paperRefs` lives inside `packages/ui/src/components/Preview.tsx`, not on `Form`). Since there is no ref to hook into, `handlePlacementClick` queries rendered page elements by their pdfme-assigned structure at click time instead.

The actual DOM nesting between `containerRef.current` (the div passed as `domContainer` to `new Form({...})`) and each page's div is **5 levels deep**, confirmed by reading the chain of components pdfme mounts: `containerRef.current` → `Root`'s outer div (`packages/ui/src/components/Root.tsx:32-36`, class `pdfme-designer-root`) → `Root`'s inner "background" div (`Root.tsx:37`, class `pdfme-designer-background`) → `Preview`'s own internal `containerRef` div (`packages/ui/src/components/Preview.tsx:237`, `overflow: auto`) → `Paper`'s outer scale-transform wrapper div (`packages/ui/src/components/Paper.tsx:36-45`) → one `<div>` per page (`Paper.tsx:69-95`). **Do not assume a fixed child-index path** (e.g. `:scope > div > div`) — it is fragile against any of these intermediate components changing their own wrapper structure in a future pdfme version bump, and this plan's earlier draft got the depth wrong by assuming only 2 levels.

Instead, use `containerRef.current.querySelectorAll<HTMLElement>('div[style*="background-image"]')` — a plain (non-scoped-to-depth) descendant selector. Per `Paper.tsx:86-94`, each page div (and ONLY page divs — no other pdfme-rendered element in this component tree sets an inline `backgroundImage`) has `style={{ ..., backgroundImage: \`url(${background})\`, ...paperSize }}`. This selector is robust to intermediate wrapper depth changes since it doesn't encode a path, only "some descendant div with this specific inline style."

**This must still be verified in a real browser before relying on it** — during Step 9's manual verification, before doing anything else, open browser devtools on the rendered fill page and run `document.querySelectorAll('div[style*="background-image"]')` in the console (or inspect the elements directly) to confirm it returns exactly one element per page, in page order, and that each element's `getBoundingClientRect()` corresponds to the visually-rendered page boundary. If it does not match cleanly (e.g. matches zero elements, matches elements that aren't pages, or returns them out of DOM/visual order), inspect the actual live DOM tree via devtools, determine the correct selector for the pdfme version actually installed in this repo, and use that instead — document what you found and why the selector needed to change (if it did) in your report.

- [ ] **Step 5: Wire the click-catching overlay**

Add the click-catching overlay to the JSX. Find the final line of the component's return JSX:
```tsx
      <div ref={containerRef} className="flex-1 overflow-hidden" />
```
Replace with:
```tsx
      <div className="flex-1 overflow-hidden relative">
        <div ref={containerRef} className="h-full w-full overflow-auto" />
        {placementMode && (
          <div
            onClick={handlePlacementClick}
            style={{
              position: 'absolute', inset: 0, cursor: 'crosshair',
              background: 'rgba(0,0,0,0.03)', zIndex: 10,
            }}
          />
        )}
      </div>
```

This wraps the existing `containerRef` div in a new positioned parent, and overlays a transparent click-catcher on top of it only while `placementMode` is true — the overlay disappears (and normal Form interaction resumes) as soon as a click places the signature (`handlePlacementClick` calls `setPlacementMode(false)`) or the user cancels via the toolbar button (Step 6).

- [ ] **Step 6: Add the "Sign Document" / "Remove Signature" toolbar button**

Find the existing "Generate PDF" button block:
```tsx
        {pageState === 'filling' && (
          <button
            onClick={handleSubmit}
            disabled={submitting || !allSignerDetailsFilled}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-black hover:bg-black/80 disabled:opacity-50 transition-all active:scale-[0.97]"
            style={{ borderRadius: 50 }}
          >
            {submitting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
            ) : 'Generate PDF'}
          </button>
        )}
```

Add a new button immediately before it (still inside the `pageState === 'filling'` conditional area — place this new block directly above the existing one, both remain siblings inside the toolbar's flex row):

```tsx
        {pageState === 'filling' && (
          <button
            onClick={() => {
              if (signAnywhereFieldName) {
                handleRemoveSignAnywhere();
              } else {
                setPlacementMode(prev => !prev);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all"
            style={{
              borderRadius: 50,
              border: '1px solid #e6e6e6',
              background: placementMode ? '#000' : 'transparent',
              color: placementMode ? '#fff' : 'rgba(0,0,0,0.55)',
            }}
          >
            {signAnywhereFieldName ? (
              <><X className="h-3.5 w-3.5" />Remove Signature</>
            ) : placementMode ? (
              <><PenLine className="h-3.5 w-3.5" />Click page to sign…</>
            ) : (
              <><PenLine className="h-3.5 w-3.5" />Sign Document</>
            )}
          </button>
        )}
```

Button label/state cycle: "Sign Document" (idle, nothing placed) → click → "Click page to sign…" (active placement mode, button itself also toggles placement mode off if clicked again, per the confirmed toggle-to-cancel behavior — clicking this button while `placementMode` is true and `signAnywhereFieldName` is null calls `setPlacementMode(prev => !prev)`, flipping it back to `false`) → clicking the page places the signature and the button becomes "Remove Signature" → clicking that removes it and returns to "Sign Document".

- [ ] **Step 7: Update `handleSubmit` to include the click-placed signature**

Read the current `handleSubmit` in full (it already exists in the file — do not guess at its current content, re-read it fresh since Steps 3-6 may have shifted line numbers). Locate the line:
```ts
      const template = templateRecord.schema;
      const pdfBytes = await api.createFilledPdf(id, inputs, versionRef, signatureEvents);
```

Immediately before it, add logic to extract the click-placed signature's data (if present) and build the `signAnywhere` payload:

```ts
      let signAnywherePayload: { page: number; x: number; y: number; content: string; signerName: string; signerEmail: string } | undefined;
      if (signAnywhereFieldName) {
        const content = inputs[0]?.[signAnywhereFieldName];
        if (typeof content !== 'string' || content.trim().length === 0) {
          setError('Please draw your signature in the field you placed before submitting.');
          setSubmitting(false);
          return;
        }
        const currentTemplate = (uiRef.current as Form).getTemplate();
        let foundPage = -1;
        let foundSchema: { position: { x: number; y: number } } | undefined;
        currentTemplate.schemas.forEach((page, pageIndex) => {
          const match = page.find(schema => schema.name === signAnywhereFieldName);
          if (match) {
            foundPage = pageIndex;
            foundSchema = match;
          }
        });
        if (foundPage === -1 || !foundSchema) {
          setError('The placed signature could not be found. Please remove and re-place it.');
          setSubmitting(false);
          return;
        }
        const details = signerDetails[signAnywhereFieldName];
        if (!details?.name.trim() || !details?.email.trim()) {
          setError('Please fill in the signer details for the signature you placed before submitting.');
          setSubmitting(false);
          return;
        }
        signAnywherePayload = {
          page: foundPage,
          x: foundSchema.position.x,
          y: foundSchema.position.y,
          content,
          signerName: details.name.trim(),
          signerEmail: details.email.trim(),
        };
      }

      const template = templateRecord.schema;
      const pdfBytes = await api.createFilledPdf(id, inputs, versionRef, signatureEvents, signAnywherePayload);
```

Note: `signatureEvents` (built a few lines above from `signatureFields.map(...)`) will already include an entry for `signAnywhereFieldName`, because `signatureFields` is derived from `getSignatureFields(templateRecord.schema)` which scans `templateRecord.schema` — the STATE variable holding the originally-loaded template, NOT the live Form's current template (which has the click-placed field spliced in via `uiRef.current.updateTemplate(...)`, a call that does not update React state). **Verify this assumption directly by re-reading how `signatureFields` is computed** (`const signatureFields = templateRecord ? getSignatureFields(templateRecord.schema) : [];`) — since it reads from `templateRecord.schema` (React state, set once on load and never updated when the click-placed field is spliced into the live Form instance), `signatureFields` will NOT include the click-placed field, and therefore `signatureEvents` will NOT include it either. This means **no filtering/exclusion step is needed** — the two arrays (`signatureEvents` for template-defined fields, `signAnywherePayload` for the click-placed one) are naturally disjoint given this file's existing state-vs-live-Form-instance split. Confirm this reasoning holds by inspecting the actual current code during Step 2's full read, and adjust this step's approach if `signatureFields`/`signatureEvents` turn out to be computed differently than described here (e.g. if a future change makes `signatureFields` re-derive from the live Form instance instead of state).

- [ ] **Step 8: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. The `Schema` object literal built in `handlePlacementClick` (Step 4) — `{ name, type, content, position, width, height }` — matches `@pdfme/common`'s `Schema` zod object exactly (`packages/common/src/schema.ts:124-140`): `name`, `type`, `position`, `width`, `height` are the only required fields; everything else (`rotate`, `opacity`, `readOnly`, `required`, etc.) is optional, and `content` is included anyway since the signature plugin's own `defaultSchema` always sets it. `Template.schemas` is typed as `Schema[][]`, not `SchemaForUI[][]` (the internal UI-only type that adds a required `id` field) — so no extra `id` property is needed. If `tsc` still reports an error here, re-check `packages/common/src/schema.ts`'s current `Schema` definition directly rather than assuming this note is still accurate for whatever version is installed.

- [ ] **Step 9: Manual verification**

Start both server (`cd server && npm run dev`) and client (`cd client && npm run dev`) dev servers (alternate ports if needed, confirming you're not killing someone else's process). If a browser is available:
1. Open the fill link (`/templates/:id/fill`) for any published template (with or without pre-placed signature fields — test both).
2. Confirm the "Sign Document" button is visible in the toolbar regardless.
3. Click it — confirm the button changes to "Click page to sign…" with an active/highlighted style, and the cursor becomes a crosshair when hovering the rendered PDF.
4. Click somewhere on the rendered page (not on an existing field). Confirm: a signature pad box appears exactly where clicked, sized ~62.5×37.5mm (visually compare to any existing signature field's size on the same template if one exists), the button changes to "Remove Signature", and a `SignerDetailsPanel` for it appears above the form (check it's labeled with the generated field name).
5. Draw a signature in the newly-placed pad. Fill in the new panel's name/email.
6. If the template has other required fields/signature fields, fill/sign those too. Click "Generate PDF". Confirm it succeeds — download/preview the resulting PDF and visually confirm the click-placed signature appears at the correct position and page.
7. Click "Remove Signature" on a fresh load (before generating) — confirm the placed field disappears from the canvas and its `SignerDetailsPanel` disappears, and the button reverts to "Sign Document".
8. Test the cancel path: click "Sign Document" to enter placement mode, then click the button again (not the page) — confirm it exits placement mode without anything being placed.
9. Test submitting WITHOUT ever using "Sign Document" on a template that has no pre-placed signature fields either — confirm the page behaves exactly as before this feature (no crash, normal submission).
10. Test clicking on a multi-page template's second/third page while in placement mode — confirm the signature lands on the correct page (verify in the downloaded PDF).

If no browser is available, perform a careful code-path walkthrough instead (the coordinate math, the DOM selector from Step 4/5, the template splicing, and the submit-time payload construction) and describe it in detail in your report, being explicit that this was a walkthrough and not live testing — flag clearly that the DOM selector approach in Step 4 is the single highest-risk, least-verifiable-without-a-browser part of this task, since it depends on pdfme's actual rendered DOM structure which can only be confirmed by inspecting a live page.

- [ ] **Step 10: Commit**

```bash
git add client/src/lib/api.ts client/src/pages/FormFill.tsx
git commit -m "feat(form-fill): add click-to-place signature (Sign Document)"
```

---

## Self-Review Notes

- **Spec coverage:** every behavior in `docs/superpowers/specs/2026-08-03-sign-anywhere-design.md` is covered — the always-visible "Sign Document" button (Task 2 Step 6, unconditional on existing signature fields), toggle-to-cancel placement mode (Step 6's button `onClick` flips `placementMode` when nothing is placed yet), inline signing at the clicked spot with no separate modal (Step 4 splices the field directly, Form renders it as a live drawable pad immediately), signer details via the existing `SignerDetailsPanel` mechanism (Task 2 Step 7's note explaining `signatureFields`/panels pick up the spliced field automatically via the existing template-scanning `useEffect`), exactly one click-placed signature (the `signAnywhereFieldName` state is a single value, not an array, and the button becomes disabled-via-relabeling to "Remove Signature" once set), any page (Task 1 Step 4 validates `page` generically against `schemas.length`, Task 2 Step 4 detects whichever page div was actually clicked), server clamps rather than trusts position (Task 1 Step 4's `clampedX`/`clampedY`), server builds the schema itself from primitives only (Task 1 Step 4 constructs the object inline from `validatedSignAnywhere.x/y/content`, never accepting a schema shape from the client), stored template never mutated (Task 1 Step 4's `JSON.parse(JSON.stringify(...))` clone), same audit-trail treatment (Task 1 Step 5 folds it into the existing `createSignatureEvent` loop with the same server-computed hash/IP).
- **Placeholder scan:** no TBD/TODO; both tasks contain complete, concrete code, including the click-detection DOM selector (`div[style*="background-image"]`), which is derived from actually reading pdfme's component chain (`Root.tsx` → `Preview.tsx` → `Paper.tsx`) rather than left as a guess — the plan's first draft assumed a shallower DOM structure and was corrected during this authoring pass after re-verifying the real nesting depth. Task 2 Step 4's note still requires a live-browser confirmation of this selector during Step 9 (the one part of this plan that genuinely cannot be 100% verified by reading source, since it depends on pdfme's actual rendered output) — this is a verification step on an already-reasoned-through answer, not an open unknown left for the implementer to solve from scratch.
- **Type consistency:** `signAnywhere`'s shape (`{page, x, y, content, signerName, signerEmail}`) is identical across Task 1's server-side destructuring/validation, Task 2's `api.createFilledPdf` parameter, and Task 2's `handleSubmit`-constructed payload. The server's response contract (`Uint8Array` from `createFilledPdf`) is unchanged from before this plan.
- **Task ordering:** Task 1 (server) before Task 2 (client) — the client's Step 9 manual verification needs Task 1's endpoint already accepting `signAnywhere`, and Task 2's `api.createFilledPdf` change references the exact request shape Task 1 defines.
- **Constraint verified during planning, not assumed:** confirmed `Form`/`BaseUIClass`'s `getTemplate()`/`updateTemplate()` are public, unmodified-signature methods (`packages/ui/src/class.ts:107-119`) that `Form` inherits without override — this was independently re-verified in this plan's authoring, not just carried over from the design doc's claim. Confirmed `isBlankPdf`/`BasePdf`/`BlankPdf` are exported from `@pdfme/common` for the page-dimension fallback logic used in both tasks.
- **Deliberate scope boundary respected:** no task modifies `packages/schemas/src/graphics/signature.ts`, the `signature_events` table schema, or `createSignatureEvent`'s signature — the click-placed signature reuses 100% of the existing evidentiary/storage machinery, only adding a new *source* of a signature event (a runtime-placed field) rather than a new *kind* of one.

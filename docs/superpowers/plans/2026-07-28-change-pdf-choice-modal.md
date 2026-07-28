# Change PDF Choice Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "Change PDF"'s automatic AcroForm-first/AI-vision-fallback detection logic with an explicit modal, shown immediately after file selection, letting the user choose between "Write on the PDF" (today's AcroForm-only behavior) and "Recreate with AI" (today's AI-vision behavior, run unconditionally).

**Architecture:** A new presentational modal component (`ChangePdfChoiceModal`, styled like the existing `ApiPayloadModal`) is added. `TemplateDesigner.tsx`'s `handleBasePdfFile` is split: file selection now only reads the file and opens the choice modal (storing the selected `File` in new state), and two new handler functions — one per choice — perform the actual detection/apply logic, each reusing the exact same underlying detection functions (`detectFields`, `detectFieldsWithAiVision`) and validate-then-apply pattern that exist today.

**Tech Stack:** React 18 + TypeScript. No new dependencies, no server changes. No test runner exists in `client/` — verification is manual: typecheck plus live browser testing.

## Global Constraints

- No changes to `client/src/lib/pdfFieldDetection.ts`, `client/src/lib/aiPdfVisionDetection.ts`, or any server-side code — both detection functions are called exactly as today, just from new call sites.
- The modal appears every time a PDF is selected via "Change PDF" — no remembered preference, no conditional skipping.
- Dismissing the modal (backdrop click, explicit close button, or Escape) aborts the upload entirely: no template change, file input value reset, no error shown (this is a normal cancel, not a failure).
- "Write on the PDF": runs `detectFields`; PDF stays as background; if zero AcroForm fields found, background-only update with no error/popup (unchanged from today's existing behavior for that case).
- "Recreate with AI": runs `detectFieldsWithAiVision` unconditionally (no longer gated on AcroForm finding zero fields); on success, applies the AI template directly (its own blank `basePdf`, not merged with the uploaded PDF); on failure (AI error or `checkTemplate` validation failure), falls back to background-only update with an error message via the existing `error` state banner — same fallback shape already used today.
- The existing `isDetectingAi` loading state (Change PDF button → disabled, label "Detecting…") is reused for the "Recreate with AI" choice's in-flight period; unaffected for "Write on the PDF" (still instant, no loading state, matching today's AcroForm path).

---

## File Structure

- **Create:** `client/src/components/ChangePdfChoiceModal.tsx` — the new choice modal, presentational only (two callback props, no detection logic inside it).
- **Modify:** `client/src/pages/TemplateDesigner.tsx` — replace `handleBasePdfFile` with a file-selection handler that opens the modal, plus two new handlers (`handleWriteOnPdf`, `handleRecreateWithAi`) containing the actual detection logic; add new state (`pendingPdfFile`, `changePdfChoiceOpen`); render the new modal.

---

### Task 1: Create the choice modal component

**Files:**
- Create: `client/src/components/ChangePdfChoiceModal.tsx`

**Interfaces:**
- Consumes: nothing from other new code — pure presentational component.
- Produces:
  ```tsx
  export default function ChangePdfChoiceModal(props: {
    onWriteOnPdf: () => void;
    onRecreateWithAi: () => void;
    onClose: () => void;
  }): JSX.Element
  ```
  Consumed by Task 2 (`TemplateDesigner.tsx`).

- [ ] **Step 1: Create the component**

```tsx
// client/src/components/ChangePdfChoiceModal.tsx
export default function ChangePdfChoiceModal(props: {
  onWriteOnPdf: () => void;
  onRecreateWithAi: () => void;
  onClose: () => void;
}) {
  const { onWriteOnPdf, onRecreateWithAi, onClose } = props;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.40)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '480px', maxWidth: '90vw',
          background: '#fff',
          border: '1px solid #e6e6e6',
          borderRadius: 16,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>How should this PDF be used?</span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onWriteOnPdf}
            style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 12,
              border: '1px solid #e6e6e6', background: 'transparent', cursor: 'pointer',
            }}
          >
            <div style={{ color: '#000', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Write on the PDF</div>
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 12 }}>
              Keeps the real PDF and overlays any fillable fields it already has.
            </div>
          </button>

          <button
            onClick={onRecreateWithAi}
            style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 12,
              border: '1px solid #e6e6e6', background: 'transparent', cursor: 'pointer',
            }}
          >
            <div style={{ color: '#000', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Recreate with AI</div>
            <div style={{ color: 'rgba(0,0,0,0.55)', fontSize: 12 }}>
              Generates a new form inspired by this document's content.
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note: both option buttons use a plain `border` hover-free style (unlike `ApiPayloadModal`'s pill-shaped mode toggle) since these are one-shot action buttons, not a persistent mode switch — clicking either immediately triggers its callback and the modal closes (closing is the caller's responsibility in Task 2, not this component's).

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors — this file has no logic depending on other new code, so it typechecks independently of Task 2.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ChangePdfChoiceModal.tsx
git commit -m "feat(designer): add Change PDF choice modal component"
```

---

### Task 2: Wire the choice modal into the upload flow

**Files:**
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- Consumes: `ChangePdfChoiceModal` from `../components/ChangePdfChoiceModal.js` (Task 1); `detectFields` from `../lib/pdfFieldDetection.js` (existing, unchanged); `detectFieldsWithAiVision` from `../lib/aiPdfVisionDetection.js` (existing, unchanged).

- [ ] **Step 1: Import the new modal**

Add to the imports at the top of `client/src/pages/TemplateDesigner.tsx`, after the existing `import { detectFieldsWithAiVision } from '../lib/aiPdfVisionDetection.js';`:

```tsx
import ChangePdfChoiceModal from '../components/ChangePdfChoiceModal.js';
```

- [ ] **Step 2: Add new state**

Read the current file first to confirm exact line numbers (state block is around lines 253-266 as of this plan's writing, but may have shifted). Add two new state variables alongside the existing `isDetectingAi` (line 256):

```tsx
const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
const [changePdfChoiceOpen, setChangePdfChoiceOpen] = useState(false);
```

- [ ] **Step 3: Replace `handleBasePdfFile` with a file-selection handler and two choice handlers**

Read the CURRENT full `handleBasePdfFile` function in `client/src/pages/TemplateDesigner.tsx` before editing (it currently spans the AcroForm-first/AI-fallback logic described in this plan's Global Constraints — confirm exact current line numbers rather than assuming, since it was last touched in a prior session). Replace the entire function with:

```tsx
  const handleBasePdfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !designerRef.current) return;
    setPendingPdfFile(file);
    setChangePdfChoiceOpen(true);
  };

  const closeChangePdfChoice = () => {
    setChangePdfChoiceOpen(false);
    setPendingPdfFile(null);
  };

  const handleWriteOnPdf = () => {
    const file = pendingPdfFile;
    if (!file || !designerRef.current) return;
    setChangePdfChoiceOpen(false);
    setPendingPdfFile(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const t = designerRef.current!.getTemplate();

      let detectedSchemas: import('@pdfme/common').Schema[][] | null = null;
      try {
        const arrayBuffer = await file.arrayBuffer();
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
          return;
        } catch (err) {
          setError(`Detected fields could not be applied: ${(err as Error).message}`);
        }
      }

      designerRef.current!.updateTemplate({ ...t, basePdf: dataUrl });
      setTemplateVersion(v => v + 1);
    };
    reader.readAsDataURL(file);
  };

  const handleRecreateWithAi = () => {
    const file = pendingPdfFile;
    if (!file || !designerRef.current) return;
    setChangePdfChoiceOpen(false);
    setPendingPdfFile(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const t = designerRef.current!.getTemplate();

      setIsDetectingAi(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const aiTemplate = await detectFieldsWithAiVision(arrayBuffer);
        if (aiTemplate) {
          try {
            checkTemplate(aiTemplate);
            designerRef.current!.updateTemplate(aiTemplate);
            setTemplateVersion(v => v + 1);
            return;
          } catch (err) {
            setError(`AI-generated template could not be applied: ${(err as Error).message}`);
          }
        } else {
          setError("Couldn't detect fields from this PDF automatically — the PDF has been set as the background.");
        }
      } catch (err) {
        console.warn('AI vision field detection failed, falling back to background-only update:', err);
        setError("Couldn't detect fields from this PDF automatically — the PDF has been set as the background.");
      } finally {
        setIsDetectingAi(false);
      }

      designerRef.current!.updateTemplate({ ...t, basePdf: dataUrl });
      setTemplateVersion(v => v + 1);
    };
    reader.readAsDataURL(file);
  };
```

Notes on this restructuring:
- `handleBasePdfFile` (the `<input onChange>` handler) now only stashes the selected `File` in `pendingPdfFile` state and opens the modal — `e.target.value = ''` moves to the top of this handler (synchronous, immediate) since the file no longer needs to stay attached to the input element while async work happens elsewhere; the `File` object itself is preserved independently in React state, which remains valid regardless of the input's own value.
- Both `handleWriteOnPdf` and `handleRecreateWithAi` independently create their own `FileReader` and read `pendingPdfFile` — reading the same file twice (once per potential choice) is unnecessary here since only one is ever invoked per upload (the modal's two buttons are mutually exclusive user actions), so there's no duplicate-read concern.
- `handleWriteOnPdf` is a straight extraction of the previous `handleBasePdfFile`'s AcroForm-only branch (the `if (detectedSchemas) {...}` block) plus its trailing background-only fallback — the AI-vision `else if` branch that previously lived in the same function is entirely removed from this path, since choosing "Write on the PDF" must never trigger any AI call, per the spec.
- `handleRecreateWithAi` is a straight extraction of the previous AI-vision `else if` branch, but with its trigger condition removed (`detectFields` is not called at all in this path — it doesn't matter whether the PDF has AcroForm fields, "Recreate with AI" always calls `detectFieldsWithAiVision` unconditionally). The `catch` block around `file.arrayBuffer()`/`detectFieldsWithAiVision` is new here (previously this call was inside a `try` that only wrapped the AcroForm detection call, with `detectFieldsWithAiVision`'s own internal try/catch handling its own failures and returning `null`) — added defensively so that if `file.arrayBuffer()` itself throws (not `detectFieldsWithAiVision`, which cannot throw per Task 2 of the prior plan), the same background-only fallback still applies rather than leaving `isDetectingAi` stuck or the function crashing silently.

- [ ] **Step 4: Update the file input's `onChange` and add the choice modal to the render tree**

The hidden file input at (originally) line 663 doesn't need to change — it already calls `handleBasePdfFile` via `onChange`, which now has the new (simpler) body from Step 3.

Find the existing modal-rendering block for `apiPayloadOpen && <ApiPayloadModal ... />` (originally around lines 774-781, may have shifted) and add the new modal's conditional render immediately after it:

```tsx
      {/* Change PDF choice modal */}
      {changePdfChoiceOpen && (
        <ChangePdfChoiceModal
          onWriteOnPdf={handleWriteOnPdf}
          onRecreateWithAi={handleRecreateWithAi}
          onClose={closeChangePdfChoice}
        />
      )}
```

- [ ] **Step 5: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Start both the server (`cd server && npm run dev`) and client (`cd client && npm run dev`) dev servers (use alternate ports if the defaults are in use by another process — check with `lsof -ti:3004` / `lsof -ti:5173` and confirm process ownership via `ps -p <pid> -o command` before assuming it's safe to reuse or that a different port is needed).

If a browser is available:
1. On `/templates/new`, click "Change PDF" and select any PDF. Confirm the choice modal appears immediately (no detection has run yet — check the Network tab shows no `/ai-form/detect-from-pdf` call yet).
2. Click outside the modal (backdrop) to dismiss it. Confirm: no template change occurred, and clicking "Change PDF" again re-opens the file picker cleanly (not stuck in some broken state from the aborted attempt).
3. Repeat file selection, this time click "Write on the PDF". For a fillable PDF (with real AcroForm fields): confirm the PDF becomes the background with fields overlaid, exactly as before this change. For a flat PDF (no AcroForm fields): confirm only the background changes, no fields, no error, no AI call in the Network tab.
4. Repeat file selection, this time click "Recreate with AI" — try this on a PDF that HAS real AcroForm fields (e.g. `packages/pdf-lib/assets/pdfs/fancy_fields.pdf` if usable as a real upload, or any known fillable PDF), confirming that even though it has AcroForm fields, the AI path still runs (button shows "Detecting…", disables, and the eventual result is a fresh blank-page AI-generated template, NOT the AcroForm-overlaid result) — this is the core behavior change this whole feature exists to enable.
5. Confirm the "Change PDF" button correctly disables/re-enables and its label reflects "Detecting…" only during the "Recreate with AI" path's in-flight period, never during "Write on the PDF" (which should remain instant with no loading state, matching today's AcroForm-only behavior).

If no browser is available, perform a careful code-path walkthrough of all handlers (file-selection → modal open; modal dismiss → abort; Write on the PDF → AcroForm-only with/without fields found; Recreate with AI → AI success/failure) and describe it in detail in your report, consistent with how prior tasks in this project were verified when a browser wasn't available.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/TemplateDesigner.tsx
git commit -m "feat(designer): let user choose write-on-PDF vs recreate-with-AI on upload"
```

---

## Self-Review Notes

- **Spec coverage:** Every behavior in `docs/superpowers/specs/2026-07-28-change-pdf-choice-modal-design.md` is covered — modal shown every time (Task 2 Step 3's `handleBasePdfFile` unconditionally opens the modal, no skip-logic), two explicit choices matching the spec's button labels/descriptions exactly (Task 1), dismiss-aborts-entirely (Task 2's `closeChangePdfChoice` clears `pendingPdfFile` with no template mutation), "Write on the PDF" unchanged AcroForm-only behavior including the zero-fields-no-error edge case explicitly called out in the spec's "Edge case" section, "Recreate with AI" running unconditionally regardless of AcroForm field count (no `detectFields` call at all in `handleRecreateWithAi`), and the existing `isDetectingAi` loading state reused only for the AI path.
- **Placeholder scan:** No TBD/TODO; both tasks contain complete code.
- **Type consistency:** `ChangePdfChoiceModal`'s props (`onWriteOnPdf: () => void`, `onRecreateWithAi: () => void`, `onClose: () => void`) exactly match how Task 2 Step 4 invokes it (`handleWriteOnPdf`, `handleRecreateWithAi`, `closeChangePdfChoice` — all zero-arg functions returning `void`, consistent with the modal's declared prop types). `pendingPdfFile: File | null` state is read identically by both `handleWriteOnPdf` and `handleRecreateWithAi` via the same `const file = pendingPdfFile; if (!file || ...) return;` guard pattern.
- **Task ordering:** Task 2 depends on Task 1's exported `ChangePdfChoiceModal` component — strictly sequential, no parallelization possible.
- **Regression check (added during self-review):** confirmed the previous `handleBasePdfFile`'s single `e.target.value = ''` reset (previously placed inside the async `reader.onload`, per a prior session's explicit correctness fix ensuring the input stays valid during `file.arrayBuffer()`) is preserved correctly in this restructuring — it now happens synchronously in the new, much simpler `handleBasePdfFile` (Step 3), before any async work begins, which is safe here because the `File` object is captured into `pendingPdfFile` state immediately and no code path in this plan re-reads `e.target.files` after that point — the earlier fix's concern (input reset racing an in-flight read of the SAME input's `.files`) doesn't apply once the `File` object itself has been extracted into independent state.

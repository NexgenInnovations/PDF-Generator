# PDF Field Auto-Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a PDF with existing AcroForm fields is uploaded as a template's base PDF, automatically detect those fields and recreate them as pdfme Designer schema fields at the same position and size, so the template is immediately fillable — matching the source PDF exactly.

**Architecture:** One new pure client-side module (`client/src/lib/pdfFieldDetection.ts`) built on `@pdfme/pdf-lib` (already a client dependency) that converts a PDF's AcroForm fields into a pdfme `Schema[][]` (one sub-array per page). `TemplateDesigner.tsx`'s existing `handleBasePdfFile` handler (used by both "Change PDF" and new-template PDF upload — both paths share this one handler) is extended to call the detector and, if fields are found, replace the template's `schemas` entirely (validated via `checkTemplate` before applying, same pattern as the existing AI-template-apply path in this file).

**Tech Stack:** React 18 + TypeScript, `@pdfme/pdf-lib` (already installed, browser-compatible), `@pdfme/common` (`Schema`, `Template`, `checkTemplate`, `pt2mm`). No test runner exists in `client/` — verification is manual: typecheck plus starting the dev server and exercising the feature with a real fillable PDF in a browser, per this project's established practice for frontend work.

## Global Constraints

- Pure client-side feature — no server route changes, no new npm dependencies (`@pdfme/pdf-lib` is already present in `client/package.json`).
- Structural AcroForm extraction only — no AI/vision fallback for flat or scanned PDFs with no real form fields.
- `PDFDocument.getForm().getFields()` returning `[]` (no exception) is how "no fields" is signaled — this must never be treated as an error.
- Field type mapping: `PDFTextField`→`text`, `PDFCheckBox`→`checkbox`, `PDFDropdown`/`PDFOptionList`→`select`, `PDFRadioGroup`→`radioGroup` (one schema entry per widget), `PDFSignature`→`signature`. `PDFButton` is skipped (no pdfme equivalent).
- Field `name` reuses the PDF's own field name directly (`field.getName()`); on same-page name collisions, every entry after the first gets a numeric suffix (`_2`, `_3`, ...), the first occurrence keeps its clean name.
- Position/size conversion: `pt2mm(pt) = pt * 0.3528` (from `@pdfme/common`), Y-axis flip `position.y = pt2mm(pageHeightPt - rect.y - rect.height)`, `position.x = pt2mm(rect.x)`, `width = pt2mm(rect.width)`, `height = pt2mm(rect.height)`.
- On successful detection with ≥1 field found: replace the template's entire `schemas` array (no confirmation prompt — matches existing "Change PDF" behavior of silently replacing content).
- On zero fields detected: only `basePdf` changes, exactly like today's behavior — no popup, no schema change.
- On extraction producing an invalid `Template` (fails `checkTemplate`): fall back to only updating `basePdf`, surface the error via the existing `error` state banner, never corrupt the canvas.
- Per-field extraction errors are caught and logged via `console.warn`, skipping that field — detection continues rather than aborting entirely.

---

## File Structure

- **Create:** `client/src/lib/pdfFieldDetection.ts` — the field-detection module, one exported function.
- **Modify:** `client/src/pages/TemplateDesigner.tsx` — extend `handleBasePdfFile` to call the detector and apply results.

---

### Task 1: PDF field detection module

**Files:**
- Create: `client/src/lib/pdfFieldDetection.ts`

**Interfaces:**
- Consumes: `PDFDocument`, `PDFTextField`, `PDFCheckBox`, `PDFDropdown`, `PDFOptionList`, `PDFRadioGroup`, `PDFSignature` from `@pdfme/pdf-lib`; `Schema`, `pt2mm` from `@pdfme/common`.
- Produces:
  ```ts
  export async function detectFields(pdfBytes: ArrayBuffer): Promise<Schema[][]>
  ```
  Task 2 (`TemplateDesigner.tsx`) imports and calls this directly.

- [ ] **Step 1: Create the module with page-resolution and coordinate-conversion helpers**

```ts
import { PDFDocument, PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFSignature, PDFTextField } from '@pdfme/pdf-lib';
import type { PDFField, PDFPage, PDFWidgetAnnotation } from '@pdfme/pdf-lib';
import { pt2mm, type Schema } from '@pdfme/common';

function resolveWidgetPage(doc: PDFDocument, pages: PDFPage[], widget: PDFWidgetAnnotation): PDFPage | undefined {
  const pageRef = widget.P();
  if (pageRef) {
    const byRef = pages.find(p => p.ref === pageRef);
    if (byRef) return byRef;
  }
  const widgetRef = doc.context.getObjectRef(widget.dict);
  if (!widgetRef) return undefined;
  return doc.findPageForAnnotationRef(widgetRef);
}

function rectToPosition(rect: { x: number; y: number; width: number; height: number }, pageHeightPt: number) {
  return {
    position: {
      x: pt2mm(rect.x),
      y: pt2mm(pageHeightPt - rect.y - rect.height),
    },
    width: pt2mm(rect.width),
    height: pt2mm(rect.height),
  };
}
```

- [ ] **Step 2: Add the per-field-type mapping function**

```ts
function makeUniqueName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  let suffix = 2;
  let candidate = `${name}_${suffix}`;
  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${name}_${suffix}`;
  }
  usedNames.add(candidate);
  return candidate;
}

function mapFieldWidget(
  field: PDFField,
  widget: PDFWidgetAnnotation,
  pageHeightPt: number,
  usedNames: Set<string>,
): Schema | null {
  const rect = widget.getRectangle();
  const { position, width, height } = rectToPosition(rect, pageHeightPt);
  const fieldName = field.getName();

  try {
    if (field instanceof PDFTextField) {
      return {
        name: makeUniqueName(fieldName, usedNames),
        type: 'text',
        content: field.getText() ?? '',
        position, width, height,
      };
    }
    if (field instanceof PDFCheckBox) {
      return {
        name: makeUniqueName(fieldName, usedNames),
        type: 'checkbox',
        content: field.isChecked() ? 'true' : 'false',
        position, width, height,
        color: '#000000',
      };
    }
    if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const options = field.getOptions();
      const selected = field.getSelected();
      return {
        name: makeUniqueName(fieldName, usedNames),
        type: 'select',
        content: selected[0] ?? options[0] ?? '',
        options,
        position, width, height,
      };
    }
    if (field instanceof PDFRadioGroup) {
      const selected = field.getSelected();
      const onValue = widget.getOnValue()?.decodeText();
      return {
        name: makeUniqueName(fieldName, usedNames),
        type: 'radioGroup',
        group: fieldName,
        content: onValue !== undefined && onValue === selected ? 'true' : 'false',
        position, width, height,
        color: '#000000',
      };
    }
    if (field instanceof PDFSignature) {
      return {
        name: makeUniqueName(fieldName, usedNames),
        type: 'signature',
        content: '',
        position, width, height,
      };
    }
  } catch (e) {
    console.warn(`[pdfFieldDetection] Skipping field "${fieldName}": ${(e as Error).message}`);
    return null;
  }
  // PDFButton and any other unrecognized field type: no pdfme equivalent.
  return null;
}
```

- [ ] **Step 3: Add the top-level `detectFields` export**

```ts
export async function detectFields(pdfBytes: ArrayBuffer): Promise<Schema[][]> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const schemas: Schema[][] = pages.map(() => []);
  const usedNamesPerPage = pages.map(() => new Set<string>());

  const fields = doc.getForm().getFields();

  for (const field of fields) {
    let widgets: PDFWidgetAnnotation[];
    try {
      widgets = field.acroField.getWidgets();
    } catch (e) {
      console.warn(`[pdfFieldDetection] Skipping field "${field.getName()}": ${(e as Error).message}`);
      continue;
    }

    for (const widget of widgets) {
      const page = resolveWidgetPage(doc, pages, widget);
      if (!page) {
        console.warn(`[pdfFieldDetection] Skipping a widget of field "${field.getName()}": could not resolve its page`);
        continue;
      }
      const pageIndex = pages.indexOf(page);
      const pageHeightPt = page.getHeight();
      const schema = mapFieldWidget(field, widget, pageHeightPt, usedNamesPerPage[pageIndex]);
      if (schema) {
        schemas[pageIndex].push(schema);
      }
    }
  }

  return schemas;
}
```

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. This project's tsconfig has `noUnusedLocals`/`noUnusedParameters: true` — confirm no unused imports.

- [ ] **Step 5: Manual verification**

Since this module isn't wired into any page yet (Task 2 does that), verify by writing a short throwaway Node/browser-console script that isn't committed, OR reason through it by inspection if a real fillable PDF isn't easily available in this environment:

1. Obtain or construct a simple test PDF with at least one text field, one checkbox, and one radio group (many free "fillable PDF form" samples exist, or generate one with `@pdfme/generator`/Acrobat). If you have one, run:
   ```ts
   import { detectFields } from './pdfFieldDetection.js';
   const bytes = await fetch('/path/to/test.pdf').then(r => r.arrayBuffer());
   const schemas = await detectFields(bytes);
   console.log(JSON.stringify(schemas, null, 2));
   ```
   Confirm: field names match the PDF's own field names, `position`/`width`/`height` values are plausible (positive numbers roughly matching the field's visible on-page location — a field near the top of the page should have a small `position.y`, matching pdfme's top-left-origin convention), checkbox `content` is `'true'`/`'false'`, radio group entries share the same `group` value.
2. If no test PDF is available, reason through the coordinate math by hand with a concrete example: a page 297mm tall (A4, ≈841.89pt), a text field widget at PDF-points rect `{x: 56.7, y: 700, width: 200, height: 20}` (near the top of the page in PDF's bottom-left-origin coords) — confirm `rectToPosition` produces `position.y ≈ pt2mm(841.89 - 700 - 20) = pt2mm(121.89) ≈ 43mm` (a small value, correctly indicating "near the top" in pdfme's top-left-origin system) and `position.x ≈ pt2mm(56.7) ≈ 20mm`. Describe this trace in your report.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/pdfFieldDetection.ts
git commit -m "feat(designer): add PDF AcroForm field detection module"
```

---

### Task 2: Wire detection into the Change PDF / upload flow

**Files:**
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- Consumes: `detectFields` from `../lib/pdfFieldDetection.js` (Task 1).

- [ ] **Step 1: Import `detectFields`**

Add to the imports at the top of `client/src/pages/TemplateDesigner.tsx` (after the existing `HeaderFooterEditor`/`ApiPayloadModal` imports, around line 15-16):

```tsx
import { detectFields } from '../lib/pdfFieldDetection.js';
```

- [ ] **Step 2: Extend `handleBasePdfFile` to detect and apply fields**

Replace `client/src/pages/TemplateDesigner.tsx:495-507` (the full `handleBasePdfFile` function):

```tsx
  const handleBasePdfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !designerRef.current) return;
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
          e.target.value = '';
          return;
        } catch (err) {
          setError(`Detected fields could not be applied: ${(err as Error).message}`);
        }
      }

      designerRef.current!.updateTemplate({ ...t, basePdf: dataUrl });
      setTemplateVersion(v => v + 1);
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };
```

Note: `e.target.value = ''` is moved inside the async `reader.onload` callback (both success and fallback paths) instead of running synchronously right after `reader.readAsDataURL(file)`, since the file input's value must stay valid while `file.arrayBuffer()` reads from it — clearing it immediately (the previous synchronous placement) risks the read happening after the input was already reset in some browsers. This is a required correctness fix, not just a refactor.

- [ ] **Step 3: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the dev server (`nohup npm run dev > /tmp/task2-dev.log 2>&1 & disown`, `sleep 5 && cat /tmp/task2-dev.log` for the port, curl `/templates/new` for 200, stop by PID via `lsof -ti:<port> | xargs -r kill` when done — never a blanket `pkill -f vite`).

If a real browser is available:
1. Open a new template, click "Change PDF", upload a real fillable PDF (one with text/checkbox/radio fields). Confirm: the canvas background updates to the uploaded PDF, AND the Designer's field list now shows the detected fields, correctly positioned on top of the PDF's own visible blanks/boxes.
2. Upload a second, different fillable PDF on the same template. Confirm the schema is fully replaced with the new PDF's fields (old fields gone, no leftover).
3. Upload a plain PDF with no form fields (e.g. any regular document). Confirm only the background changes — no error, no popup, existing schema (if any) is untouched.
4. If possible, test a malformed/corrupt "PDF" (e.g. rename a .txt file to .pdf) — confirm `detectFields` throwing is caught gracefully (background-only fallback per Step 2's try/catch), no crash.

If no browser is available in this environment, reason through the code path by inspection (both the success-with-fields branch and the zero-fields/error fallback branch) and describe the walkthrough in your report, consistent with how prior tasks in this project were verified.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/TemplateDesigner.tsx
git commit -m "feat(designer): auto-detect and apply PDF form fields on upload"
```

---

## Self-Review Notes

- **Spec coverage:** The spec's single feature (detect AcroForm fields on PDF upload, map to pdfme schema types, apply via the existing Change PDF flow) is fully covered — Task 1 builds the detection module per every spec requirement (all 5 field-type mappings, naming/collision rule, coordinate conversion, per-field error resilience), Task 2 wires it into `handleBasePdfFile` exactly as the spec's "Wiring into TemplateDesigner" section describes (apply-with-validation-and-fallback, replace-entire-schemas-on-success, background-only-on-zero-fields).
- **Placeholder scan:** No TBD/TODO; both tasks contain complete code.
- **Type consistency:** `detectFields(pdfBytes: ArrayBuffer): Promise<Schema[][]>` (Task 1) is called with exactly that signature in Task 2 (`await detectFields(arrayBuffer)` where `arrayBuffer` comes from `file.arrayBuffer()`, a native `ArrayBuffer`). The `Schema` type import path (`@pdfme/common`) is consistent between Task 1's module and Task 2's inline `import('@pdfme/common').Schema[][]` type annotation (matching the existing inline-import-type pattern already used elsewhere in this file, e.g. `handleHeaderFooterSave`'s `staticSchema: import('@pdfme/common').Schema[]` parameter).
- **Task ordering:** Task 2 depends on Task 1's exported `detectFields` function — strictly sequential, no parallelization possible.

# PDF field auto-detection

Date: 2026-07-27
Status: Approved for planning

## Context

Today, uploading a base PDF in the Designer ("Change PDF", used both when
creating a new template and editing an existing one — both paths go
through `handleBasePdfFile` in `client/src/pages/TemplateDesigner.tsx`)
only replaces the visual background; the schema (field layout) is left
untouched. The user wants uploaded PDFs that already contain real,
interactive form fields (AcroForm fields — e.g. PDFs exported from Adobe
Acrobat, DocuSign, or government form generators) to be automatically
scanned, with each field recreated as a pdfme Designer schema field at the
exact same position and size, so the result is immediately a working,
fillable pdfme template that mirrors the source PDF.

This only targets PDFs with genuine structural AcroForm fields — not
flat/scanned documents (which would require AI vision to guess field
locations, explicitly out of scope for this pass).

`@pdfme/pdf-lib` (already a `client/` dependency, browser-compatible) can
load an arbitrary PDF and call `.getForm().getFields()` to extract every
AcroForm field's name, type, and per-page widget position/size in PDF
points. `PDFDocument.getForm()` never throws for a PDF with no form
fields — it auto-creates an empty `AcroForm`, so "no fields" is signaled
by `getFields()` returning `[]`, not an exception.

## Field detection module

New file: `client/src/lib/pdfFieldDetection.ts`, exporting:

```ts
export async function detectFields(pdfBytes: ArrayBuffer): Promise<Schema[][]>
```

Returns a multi-page schema array matching pdfme's `Template.schemas:
Schema[][]` shape (one sub-array per PDF page, in document order,
including empty sub-arrays for pages with no detected fields — this
matches how a template's `schemas` array is always indexed by page).
Returns `[[]]`-per-page (all-empty) when the PDF has no AcroForm fields
at all.

**Extraction algorithm**, per field returned by `form.getFields()`:

1. Get the field's widgets via `field.acroField.getWidgets()` — each
   widget represents one on-page appearance of the field (radio groups
   commonly have multiple widgets, one per visible button; text/checkbox/
   dropdown/signature fields normally have exactly one).
2. For each widget, resolve its page index: read `widget.P()` (the
   widget's `/P` page reference) and match it against `doc.getPages()` by
   reference equality; if `/P` is absent (some malformed/older PDFs omit
   it), fall back to `doc.findPageForAnnotationRef(widgetRef)`. Skip the
   widget (log a console warning, continue with the rest of the field's
   widgets) if neither resolves to a page.
3. Convert the widget's rectangle (`widget.getRectangle()` → `{x, y,
   width, height}` in PDF points, bottom-left origin) to a pdfme
   `position`/`width`/`height` in mm, top-left origin, using
   `pt2mm` (from `@pdfme/common`, `pt2mm(pt) = pt * 0.3528`) and the same
   Y-flip formula pdfme's own text renderer uses in reverse
   (`packages/schemas/src/text/pdfRender.ts`: rendering does `pageHeightPt
   - mm2pt(position.y) - heightPt`; extraction inverts this):
   ```
   position.x = pt2mm(rect.x)
   position.y = pt2mm(pageHeightPt - rect.y - rect.height)
   width       = pt2mm(rect.width)
   height      = pt2mm(rect.height)
   ```
   where `pageHeightPt` is that widget's resolved page's `.getHeight()`
   (in PDF points).
4. Map the field to a pdfme schema object by its pdf-lib class
   (`instanceof` checks against `PDFTextField`, `PDFCheckBox`,
   `PDFDropdown`, `PDFOptionList`, `PDFRadioGroup`, `PDFSignature`;
   `PDFButton` — a push-button/submit control with no user data — is
   skipped entirely, it has no pdfme equivalent):

   - **Text** (`PDFTextField`) →
     ```ts
     { name, type: 'text', content: field.getText() ?? '', position, width, height }
     ```
     No font-size/alignment/color overrides are set — pdfme's text
     renderer defaults every styling field safely when omitted (confirmed:
     `DEFAULT_FONT_SIZE`, `DEFAULT_ALIGNMENT`, etc. all apply via `??`
     fallback), so the detected field is visually plain but functionally
     correct and fully editable afterward in the Designer.

   - **Checkbox** (`PDFCheckBox`) →
     ```ts
     { name, type: 'checkbox', content: field.isChecked() ? 'true' : 'false', position, width, height, color: '#000000' }
     ```
     `color` has no runtime fallback in pdfme's checkbox renderer (an
     omitted value produces an invalid SVG stroke), so it is always set
     explicitly to black.

   - **Dropdown** (`PDFDropdown`) or **OptionList** (`PDFOptionList`) →
     ```ts
     { name, type: 'select', content: field.getSelected()[0] ?? field.getOptions()[0] ?? '', options: field.getOptions(), position, width, height }
     ```

   - **RadioGroup** (`PDFRadioGroup`) → one pdfme schema entry **per
     widget** (radio buttons are visually separate on-page elements, and
     pdfme models them as separate schema entries linked by a shared
     `group` value, not one entry for the whole group):
     ```ts
     {
       name: widgetName, // see naming rule below
       type: 'radioGroup',
       group: field.getName(),
       content: widgetExportValue === field.getSelected() ? 'true' : 'false',
       position, width, height,
       color: '#000000',
     }
     ```
     Each widget's own export value comes from `widget.getOnValue()`
     (the same widget-level API `PDFRadioGroup`'s internal implementation
     uses, mirroring `PDFCheckBox.getOnValue()`) and determines which
     option that specific widget represents; `color` is set explicitly
     for the same reason as checkbox.

   - **Signature** (`PDFSignature`) →
     ```ts
     { name, type: 'signature', content: '', position, width, height }
     ```
     Always starts blank — PDF signature fields don't carry a reusable
     source image to seed pdfme's signature pad with.

5. **Naming**: `name` is the PDF field's own name
   (`field.getName()`, pdf-lib's fully-qualified field name) reused
   directly as the pdfme schema field name — this preserves a meaningful,
   1:1-mapped identifier back to the source form. Radio group widgets use
   `${field.getName()}_${widgetIndex}` (1-based) as their individual
   `name`, since each widget needs its own unique schema-array name while
   `group` carries the shared field name. If any two entries on the same
   page end up with an identical `name` (e.g. a malformed PDF, or two
   distinct top-level fields that happen to collide), every entry after
   the first gets a numeric suffix (`_2`, `_3`, ...) appended to its name
   to keep the page's schema array valid — the first occurrence keeps its
   clean, unsuffixed name.

6. Any single-field extraction error (e.g. an unexpected widget shape) is
   caught, logged via `console.warn`, and that field is skipped —
   detection continues with the remaining fields rather than aborting.

## Wiring into TemplateDesigner

`client/src/pages/TemplateDesigner.tsx`'s `handleBasePdfFile` (used by
both the "Change PDF" toolbar button and new-template PDF upload, since
both paths share this one handler) is extended:

1. Read the uploaded `File` as both a data URL (existing behavior, for
   `basePdf`) and an `ArrayBuffer` (new, for detection).
2. Call `detectFields(arrayBuffer)`.
3. If the result has at least one field across all pages, construct the
   candidate new `Template` as `{ basePdf: dataUrl, schemas: detectedSchemas
   }`, validate it with `checkTemplate` (from `@pdfme/common`, the same
   validate-before-apply pattern already used for AI-generated templates
   in this file), and:
   - **On success**: apply via `designerRef.current.updateTemplate(...)`
     — this **replaces the entire existing `schemas` array**, discarding
     whatever fields were there before (matches "recreate it exactly as
     it" — the newly uploaded PDF becomes the new source of truth; no
     confirmation prompt, consistent with how "Change PDF" already
     silently replaces the background today).
   - **On validation failure**: fall back to only updating `basePdf`
     (today's existing behavior) and surface the validation error via the
     existing `error` state banner, so a malformed extraction never
     corrupts the canvas or blocks the upload.
4. If detection finds zero fields (flat/scanned PDF, or a PDF with no
   AcroForm at all), only `basePdf` changes — no schema change, no
   popup, no interruption. This is identical to today's behavior for any
   PDF upload.

This is a pure client-side feature — no server route changes, no new
npm dependencies (`@pdfme/pdf-lib` is already present).

## Out of scope

- AI/vision-based field detection for flat or scanned PDFs with no real
  AcroForm data.
- Preserving PDF field validation rules, tooltips, calculated values, or
  embedded JavaScript actions — none have a pdfme equivalent.
- Preserving an already-filled-in signature image from the source PDF —
  detected signature fields always start blank.
- Push-button/submit AcroForm fields (`PDFButton`) — skipped, no pdfme
  equivalent.
- A user-facing choice/prompt to opt out of detection — it always runs
  automatically on upload, per the approved design.
- Changes to the existing `staticSchema` (header/footer) feature, page
  size controls, or any other Designer toolbar functionality.

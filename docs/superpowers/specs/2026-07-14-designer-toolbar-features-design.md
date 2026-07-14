# Designer toolbar features: page size, header/footer, generate preview

Date: 2026-07-14
Status: Approved for planning

## Context

`client/src/pages/TemplateDesigner.tsx` renders a custom two-row toolbar around
pdfme's `Designer` component. The user wants three features inspired by the
stock pdfme playground toolbar, adapted to this app's existing custom UI:

1. Page size (A4 / Letter / Legal) and Portrait/Landscape controls.
2. Header & footer editing.
3. A "Generate PDF" preview button.

Research into pdfme internals (`packages/common`, `packages/ui`) found:

- `BlankPdf` (`packages/common/src/schema.ts`) has `width`, `height`,
  `padding`, and an optional `staticSchema: Schema[]` field. Only `BLANK_A4_PDF`
  (210×297mm) is predefined anywhere in the codebase — no Letter/Legal presets
  or orientation-swap helper exist.
- `Designer.updateTemplate(template)` (`packages/ui/src/Designer.tsx`) replaces
  the whole template; there is no partial-update API. Callers must spread the
  existing template and only change the fields they intend to change.
- `staticSchema` is a **display-only, config-only** field. pdfme's own UI
  (`packages/ui/src/components/StaticSchema.tsx`) only ever renders it
  read-only (`mode: 'viewer'`, `selectable: false`) on every page. There is no
  editor for it anywhere in pdfme or its playground — it must be built from
  scratch for this app.
- `getInputFromTemplate(template)` (`packages/common/src/helper.ts`) returns
  one sample-input record per template, using each field's `content` default.
  Combined with `generate()` from `@pdfme/generator` (already a client
  dependency), this is sufficient to produce a filled preview PDF entirely
  client-side, with no server round trip.

These controls only make sense for blank (`BlankPdf`) base PDFs — a custom
uploaded PDF's page size is fixed by the file itself. All three features guard
on `isBlankPdf(basePdf)` where relevant.

## Feature 1: Page size & orientation

**UI**: A new "Page" group in the Row 2 toolbar (before or after "Base PDF"),
containing:
- A page-size `<select>`: A4 / Letter / Legal.
- Two toggle buttons: Portrait / Landscape.

**Sizes** (portrait baseline, mm), hardcoded since no presets exist in the
codebase:

| Size   | Width | Height |
|--------|-------|--------|
| A4     | 210   | 297    |
| Letter | 215.9 | 279.4  |
| Legal  | 215.9 | 355.6  |

**Behavior**:
- Both controls read current state by inspecting
  `designerRef.current.getTemplate().basePdf` on each render/open — the
  select's value is derived from matching current `{width, height}` (or their
  swap) against the table above; orientation is derived from `width <= height`
  (portrait) vs `width > height` (landscape).
- If `basePdf` is not a `BlankPdf` (custom uploaded PDF), both controls are
  disabled (grayed out, non-interactive) since page dimensions come from the
  uploaded file.
- Changing page size: look up the new `{width, height}` for the selected size
  in the current orientation, then apply (see confirm step below).
- Toggling orientation: swap `width` and `height` of the current `basePdf`,
  applied to whichever size is currently active.
- Applying a change: if `template.schemas[0].length > 0` (fields exist on the
  page), show `confirm('Changing the page size may move fields outside the
  page. Continue?')` before applying. If confirmed (or no fields exist), call
  `designerRef.current.updateTemplate({ ...template, basePdf: { ...basePdf,
  width, height } })`. Field positions are left untouched — pdfme does not
  reflow them, and the user can adjust visually afterward.

## Feature 2: Header & Footer editing

**UI**: A new "Edit Header/Footer" button (Edit group). Clicking it opens a
modal (visually consistent with the existing JSON editor modal: white card,
rounded corners, backdrop blur) containing two stacked mini `Designer`
canvases, labeled "Header" and "Footer", each with its own `Save`-relevant
state, plus a single Save/Cancel footer for the whole modal.

**Band height**: fixed at 30mm each, not user-adjustable in this iteration.

**Opening the editor**:
1. Read the current template's `basePdf` (must be `BlankPdf`; if not, disable
   the button entirely, same guard as Feature 1).
2. Split existing `basePdf.staticSchema` (if any) into two arrays by each
   entry's `position.y`:
   - Header entries: `position.y < 30`.
   - Footer entries: `position.y >= basePdf.height - 30` (with `position.y`
     re-based to `position.y - (basePdf.height - 30)` for the footer canvas's
     local coordinate space, so `y=0` is the top of the footer band).
3. Construct two synthetic `BlankPdf` templates, each `{ width: basePdf.width,
   height: 30, padding: basePdf.padding, schemas: [[...splitEntries]] }`, and
   mount two `Designer` instances into two separate DOM containers inside the
   modal, same `font`/`plugins` options as the main designer.

**Editing**: Standard pdfme Designer drag/drop/add-field interaction within
each 30mm-tall mini-canvas — no new interaction code needed, this is just
another `Designer` instance.

**Saving**:
1. Read `.getTemplate().schemas[0]` from both mini-designers.
2. Re-base footer field `position.y` back to main-page coordinates:
   `position.y + (basePdf.height - 30)`. Header fields need no re-basing.
3. Concatenate header + footer arrays into one list, assign as
   `basePdf.staticSchema` on the main template:
   `designerRef.current.updateTemplate({ ...template, basePdf: { ...basePdf,
   staticSchema: merged } })`.
4. Destroy both mini-Designer instances and close the modal.

**Cancel**: Destroy both mini-Designer instances and close the modal without
touching the main template.

## Feature 3: Generate PDF (preview)

**UI**: A new "Generate PDF" button in the Output group (next to "Template
JSON").

**Behavior**:
1. On click, set a local `generating` boolean to show a spinner on the button
   (mirrors the existing `saving` pattern for the Save button).
2. Read `const template = designerRef.current.getTemplate()`.
3. Compute sample inputs: `const inputs = getInputFromTemplate(template)`
   (from `@pdfme/common`).
4. Call `await generate({ template, inputs, options: { font: getFonts() },
   plugins: getPlugins() })` (from `@pdfme/generator`).
5. Convert the returned buffer to a Blob (`application/pdf`), create an object
   URL, and `window.open(url, '_blank')`.
6. On error, surface the message via the existing `error` state banner (same
   pattern as `handleSave`).
7. Always clear `generating` in a `finally` block.

No server round trip, no save required — this previews the in-memory,
possibly-unsaved template state.

## Out of scope

- Resizable/user-configurable header/footer band height (fixed 30mm for now).
- Reflowing or auto-adjusting field positions when page size changes.
- Page-size presets beyond A4/Letter/Legal.
- Persisting header/footer edits to the server independently of the normal
  Save/Save As flow — `staticSchema` is just part of `basePdf` and saves via
  the existing `handleSave`/`handleSaveAs` handlers with no changes needed
  there.

# Designer Toolbar Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three toolbar features to the Designer page: page size/orientation controls, a header & footer visual editor, and a client-side "Generate PDF" preview button.

**Architecture:** All work happens in `client/src/pages/TemplateDesigner.tsx` (a single-file custom toolbar around pdfme's `Designer` component) plus one new modal component file for the header/footer editor, which itself hosts two extra `Designer` instances. No server or `packages/*` changes are needed — all three features use existing public APIs (`@pdfme/common`, `@pdfme/generator`, `@pdfme/ui`).

**Tech Stack:** React 18 + TypeScript, `@pdfme/ui` (`Designer` class), `@pdfme/common` (`isBlankPdf`, `getInputFromTemplate`), `@pdfme/generator` (`generate`), lucide-react icons. No test runner exists in `client/` — verification is manual, via `cd client && npm run dev` and exercising the feature in a browser, per this repo's established practice for frontend work.

## Global Constraints

- Page sizes (portrait mm): A4 210×297, Letter 215.9×279.4, Legal 215.9×355.6.
- Header/footer band height is fixed at 30mm, not user-adjustable in this iteration.
- Page size/orientation and header/footer controls only apply to `BlankPdf` base PDFs (`isBlankPdf(basePdf)` true) — both must be disabled when the base PDF is a custom uploaded file.
- Resizing the page when `template.schemas[0].length > 0` (fields exist) must show a `confirm()` prompt before applying.
- `Designer.updateTemplate(template)` replaces the whole template — always spread the existing template/basePdf and only change the intended fields.
- No new dependencies — `@pdfme/generator`, `@pdfme/common`, `@pdfme/ui`, `lucide-react` are already in `client/package.json`.
- Follow the existing visual style in `TemplateDesigner.tsx`: pill-shaped buttons/inputs (`borderRadius: 50`), `#e6e6e6` borders, `Group`/`ToolbarBtn`/`Sep` helper components, black-on-white accent buttons.

---

## File Structure

- **Modify:** `client/src/pages/TemplateDesigner.tsx` — add Page group (size + orientation), Generate PDF button, Edit Header/Footer button, and state/handlers for all three.
- **Create:** `client/src/components/HeaderFooterEditor.tsx` — modal component encapsulating the two mini-`Designer` instances and their save/cancel logic. Kept separate because it owns its own `Designer` lifecycle (mount/destroy), mirroring how `AskAiPanel.tsx` is already split out as its own component.

---

### Task 1: Page size & orientation controls

**Files:**
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- Consumes: `designerRef.current` (`Designer | null`), `isBlankPdf` from `@pdfme/common`.
- Produces: no new exports — purely internal handlers/state within `TemplateDesigner`.

- [ ] **Step 1: Add page size constants and helpers above the component**

Add after the `BLANK_TEMPLATE` constant (client/src/pages/TemplateDesigner.tsx:14-17):

```tsx
type PageSizeName = 'A4' | 'Letter' | 'Legal';

const PAGE_SIZES_PORTRAIT_MM: Record<PageSizeName, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

function matchPageSizeName(width: number, height: number): PageSizeName | null {
  const w = Math.min(width, height);
  const h = Math.max(width, height);
  for (const name of Object.keys(PAGE_SIZES_PORTRAIT_MM) as PageSizeName[]) {
    const size = PAGE_SIZES_PORTRAIT_MM[name];
    if (Math.abs(size.width - w) < 0.1 && Math.abs(size.height - h) < 0.1) {
      return name;
    }
  }
  return null;
}
```

- [ ] **Step 2: Import `isBlankPdf` and orientation icons**

Modify the import block at client/src/pages/TemplateDesigner.tsx:1-12:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Designer } from '@pdfme/ui';
import { isBlankPdf, type Template } from '@pdfme/common';
import {
  AlertCircle, ArrowLeft, Save, Loader2,
  FileJson, FileDown, RotateCcw, Copy, FileUp, Layout, Sparkles,
  RectangleVertical, RectangleHorizontal, Printer, PanelTop,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { getFonts, getPlugins } from '../lib/pdfme.js';
import { Input } from '../components/ui/input.js';
import AskAiPanel from '../components/AskAiPanel.js';
```

(`PanelTop` and `Printer` are used by Tasks 2 and 3 respectively — importing them now avoids a second edit to this block.)

- [ ] **Step 3: Add page-size/orientation state and a template-version counter**

The toolbar needs to re-render when the template's `basePdf` changes so the select/toggle reflect current state. Add a `templateVersion` counter state, bumped whenever the template is mutated, and read `basePdf` fresh each render via a helper. Add inside the component, after the existing `useState` declarations (client/src/pages/TemplateDesigner.tsx:91-96):

```tsx
  const [aiOpen, setAiOpen] = useState(false);
  const [templateVersion, setTemplateVersion] = useState(0);

  const currentBasePdf = designerRef.current?.getTemplate().basePdf;
  const isBlank = currentBasePdf ? isBlankPdf(currentBasePdf) : false;
  const currentSizeName = isBlank && currentBasePdf && 'width' in currentBasePdf
    ? matchPageSizeName(currentBasePdf.width, currentBasePdf.height)
    : null;
  const currentOrientation = isBlank && currentBasePdf && 'width' in currentBasePdf
    ? (currentBasePdf.width <= currentBasePdf.height ? 'portrait' : 'landscape')
    : 'portrait';
```

Note: `templateVersion` is read nowhere directly in this snippet but is set by the handlers below to force a re-render after `updateTemplate` calls that pdfme's own `Designer` doesn't otherwise notify React about.

- [ ] **Step 4: Add the resize handler with the fields-exist confirm guard**

Add after `handleStaticSchema` (client/src/pages/TemplateDesigner.tsx:167-176):

```tsx
  const applyBasePdfPatch = (patch: { width: number; height: number }) => {
    if (!designerRef.current) return;
    const t = designerRef.current.getTemplate();
    if (!isBlankPdf(t.basePdf)) return;
    const hasFields = t.schemas[0]?.length > 0;
    if (hasFields && !confirm('Changing the page size may move fields outside the page. Continue?')) {
      return;
    }
    designerRef.current.updateTemplate({
      ...t,
      basePdf: { ...t.basePdf, ...patch },
    });
    setTemplateVersion(v => v + 1);
  };

  const handlePageSizeChange = (sizeName: PageSizeName) => {
    if (!designerRef.current) return;
    const t = designerRef.current.getTemplate();
    if (!isBlankPdf(t.basePdf)) return;
    const base = PAGE_SIZES_PORTRAIT_MM[sizeName];
    const landscape = t.basePdf.width > t.basePdf.height;
    applyBasePdfPatch(landscape
      ? { width: base.height, height: base.width }
      : { width: base.width, height: base.height });
  };

  const handleOrientationChange = (orientation: 'portrait' | 'landscape') => {
    if (!designerRef.current) return;
    const t = designerRef.current.getTemplate();
    if (!isBlankPdf(t.basePdf)) return;
    const { width, height } = t.basePdf;
    const isLandscape = width > height;
    if ((orientation === 'landscape') === isLandscape) return;
    applyBasePdfPatch({ width: height, height: width });
  };
```

- [ ] **Step 5: Add the Page group to the Row 2 toolbar**

Insert as the first group in Row 2, before the existing "Base PDF" group (client/src/pages/TemplateDesigner.tsx:292):

```tsx
        <Group label="Page">
          <select
            value={currentSizeName ?? ''}
            disabled={!isBlank}
            onChange={e => handlePageSizeChange(e.target.value as PageSizeName)}
            className="h-[26px] px-2 text-xs font-semibold disabled:opacity-40"
            style={{
              background: 'transparent',
              color: 'rgba(0,0,0,0.55)',
              borderRadius: 50,
              border: '1px solid #e6e6e6',
            }}
          >
            <option value="" disabled>Size</option>
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
            <option value="Legal">Legal</option>
          </select>
          <ToolbarBtn
            icon={<RectangleVertical size={13} />}
            label="Portrait"
            onClick={() => handleOrientationChange('portrait')}
            accent={isBlank && currentOrientation === 'portrait'}
          />
          <ToolbarBtn
            icon={<RectangleHorizontal size={13} />}
            label="Landscape"
            onClick={() => handleOrientationChange('landscape')}
            accent={isBlank && currentOrientation === 'landscape'}
          />
        </Group>

        <Sep />

```

- [ ] **Step 6: Manual verification**

Run the dev server and exercise the feature:

```bash
cd client && npm run dev
```

In the browser: open a blank template in the Designer.
1. Confirm the Page group shows "Size" dropdown defaulted to A4 (matches `BLANK_TEMPLATE`'s 210×297) and the Portrait button is highlighted (accent style).
2. Switch to Letter — canvas should resize to 215.9×279.4mm portrait.
3. Click Landscape — canvas should rotate to 279.4×215.9mm, Landscape button now highlighted.
4. Drag a Text field onto the canvas, then change page size again — confirm dialog should appear; cancelling it must leave the page unchanged; confirming must resize it.
5. Upload a custom base PDF (via "Change PDF") — confirm both the size dropdown and orientation buttons become disabled.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/TemplateDesigner.tsx
git commit -m "feat(designer): add page size and orientation controls"
```

---

### Task 2: Header & Footer editor component

**Files:**
- Create: `client/src/components/HeaderFooterEditor.tsx`

**Interfaces:**
- Consumes: `Template`, `BlankPdf`, `Schema` types from `@pdfme/common`; `Designer` from `@pdfme/ui`; `getFonts`, `getPlugins` from `../lib/pdfme.js`.
- Produces:
  ```tsx
  export default function HeaderFooterEditor(props: {
    basePdf: BlankPdf;
    onSave: (staticSchema: Schema[]) => void;
    onClose: () => void;
  }): JSX.Element
  ```
  Task 3 (TemplateDesigner integration) renders this component and consumes `onSave`/`onClose`.

- [ ] **Step 1: Create the component file with band-splitting helpers and mount/unmount logic**

```tsx
import { useEffect, useRef } from 'react';
import { Designer } from '@pdfme/ui';
import type { BlankPdf, Schema } from '@pdfme/common';
import { getFonts, getPlugins } from '../lib/pdfme.js';

const BAND_HEIGHT_MM = 30;

function splitStaticSchema(staticSchema: Schema[] | undefined, pageHeight: number) {
  const header: Schema[] = [];
  const footer: Schema[] = [];
  (staticSchema ?? []).forEach(schema => {
    if (schema.position.y < BAND_HEIGHT_MM) {
      header.push(schema);
    } else if (schema.position.y >= pageHeight - BAND_HEIGHT_MM) {
      footer.push({
        ...schema,
        position: { ...schema.position, y: schema.position.y - (pageHeight - BAND_HEIGHT_MM) },
      });
    }
  });
  return { header, footer };
}

export default function HeaderFooterEditor(props: {
  basePdf: BlankPdf;
  onSave: (staticSchema: Schema[]) => void;
  onClose: () => void;
}) {
  const { basePdf, onSave, onClose } = props;
  const headerContainerRef = useRef<HTMLDivElement | null>(null);
  const footerContainerRef = useRef<HTMLDivElement | null>(null);
  const headerDesignerRef = useRef<Designer | null>(null);
  const footerDesignerRef = useRef<Designer | null>(null);

  useEffect(() => {
    const { header, footer } = splitStaticSchema(basePdf.staticSchema, basePdf.height);

    if (headerContainerRef.current) {
      headerDesignerRef.current = new Designer({
        domContainer: headerContainerRef.current,
        template: {
          basePdf: { width: basePdf.width, height: BAND_HEIGHT_MM, padding: basePdf.padding },
          schemas: [header],
        },
        options: { font: getFonts(), lang: 'en' },
        plugins: getPlugins(),
      });
    }
    if (footerContainerRef.current) {
      footerDesignerRef.current = new Designer({
        domContainer: footerContainerRef.current,
        template: {
          basePdf: { width: basePdf.width, height: BAND_HEIGHT_MM, padding: basePdf.padding },
          schemas: [footer],
        },
        options: { font: getFonts(), lang: 'en' },
        plugins: getPlugins(),
      });
    }

    return () => {
      const h = headerDesignerRef.current;
      const f = footerDesignerRef.current;
      headerDesignerRef.current = null;
      footerDesignerRef.current = null;
      setTimeout(() => { h?.destroy(); f?.destroy(); }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = () => {
    const headerSchema = headerDesignerRef.current?.getTemplate().schemas[0] ?? [];
    const footerSchema = footerDesignerRef.current?.getTemplate().schemas[0] ?? [];
    const rebasedFooter = footerSchema.map(schema => ({
      ...schema,
      position: { ...schema.position, y: schema.position.y + (basePdf.height - BAND_HEIGHT_MM) },
    }));
    onSave([...headerSchema, ...rebasedFooter]);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.40)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        width: '70vw', maxWidth: 900,
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 16,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>Header &amp; Footer</span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.55)', marginBottom: 6 }}>HEADER</div>
            <div ref={headerContainerRef} style={{ height: 160, border: '1px solid #e6e6e6', borderRadius: 8, overflow: 'hidden' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.55)', marginBottom: 6 }}>FOOTER</div>
            <div ref={footerContainerRef} style={{ height: 160, border: '1px solid #e6e6e6', borderRadius: 8, overflow: 'hidden' }} />
          </div>
        </div>
        <div style={{ padding: '10px 16px', borderTop: '1px solid #e6e6e6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: '6px 16px', borderRadius: 50, border: '1px solid #e6e6e6', background: 'transparent', color: 'rgba(0,0,0,0.55)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{ padding: '6px 16px', borderRadius: 50, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification (standalone typecheck)**

```bash
cd client && npx tsc --noEmit
```

Expected: no new type errors from `HeaderFooterEditor.tsx` (Task 3 wires it up so it won't be reachable from the UI yet, but it must compile standalone).

- [ ] **Step 3: Commit**

```bash
git add client/src/components/HeaderFooterEditor.tsx
git commit -m "feat(designer): add HeaderFooterEditor component"
```

---

### Task 3: Wire Header/Footer editor into the toolbar

**Files:**
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- Consumes: `HeaderFooterEditor` from `../components/HeaderFooterEditor.js` (Task 2's `{ basePdf, onSave, onClose }` props).

- [ ] **Step 1: Import the component and add open/close state**

Add import near the other component imports (client/src/pages/TemplateDesigner.tsx, after `AskAiPanel` import):

```tsx
import HeaderFooterEditor from '../components/HeaderFooterEditor.js';
```

Add state next to `aiOpen` (client/src/pages/TemplateDesigner.tsx:96):

```tsx
  const [headerFooterOpen, setHeaderFooterOpen] = useState(false);
```

- [ ] **Step 2: Add the save handler**

Add after `handleAiTemplateReady` (client/src/pages/TemplateDesigner.tsx:195-199):

```tsx
  const handleHeaderFooterSave = (staticSchema: import('@pdfme/common').Schema[]) => {
    if (!designerRef.current) return;
    const t = designerRef.current.getTemplate();
    if (!isBlankPdf(t.basePdf)) return;
    designerRef.current.updateTemplate({
      ...t,
      basePdf: { ...t.basePdf, staticSchema },
    });
    setTemplateVersion(v => v + 1);
    setHeaderFooterOpen(false);
  };
```

- [ ] **Step 3: Add the "Edit Header/Footer" button to the Edit group**

Modify the Edit group (client/src/pages/TemplateDesigner.tsx:299-303):

```tsx
        <Group label="Edit">
          <ToolbarBtn icon={<Layout size={13} />} label="Static schema" onClick={handleStaticSchema} />
          <ToolbarBtn
            icon={<PanelTop size={13} />}
            label="Header/Footer"
            onClick={() => setHeaderFooterOpen(true)}
          />
          <ToolbarBtn icon={<FileJson size={13} />} label="JSON" onClick={handleOpenJson} />
          <ToolbarBtn icon={<Sparkles size={13} />} label="Ask AI" onClick={() => setAiOpen(true)} />
        </Group>
```

Note: the button should be disabled when `!isBlank` — update `ToolbarBtn` usage to pass through a `disabled` prop. Since `ToolbarBtn` (client/src/pages/TemplateDesigner.tsx:19-59) doesn't currently support `disabled`, extend it:

```tsx
function ToolbarBtn({
  icon, label, onClick, accent, disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      style={accent ? {
        background: '#000',
        color: '#fff',
        borderRadius: 50,
        border: 'none',
      } : {
        background: 'transparent',
        color: 'rgba(0,0,0,0.55)',
        borderRadius: 50,
        border: '1px solid #e6e6e6',
      }}
      onMouseEnter={e => {
        if (!accent) {
          (e.currentTarget as HTMLButtonElement).style.background = '#f7f7f5';
          (e.currentTarget as HTMLButtonElement).style.color = '#000';
        }
      }}
      onMouseLeave={e => {
        if (!accent) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(0,0,0,0.55)';
        }
      }}
    >
      {icon}
      {label}
    </button>
  );
}
```

Then pass `disabled={!isBlank}` to the Header/Footer button:

```tsx
          <ToolbarBtn
            icon={<PanelTop size={13} />}
            label="Header/Footer"
            onClick={() => setHeaderFooterOpen(true)}
            disabled={!isBlank}
          />
```

- [ ] **Step 4: Render the modal conditionally**

Add near the other modals (after the JSON editor modal block, client/src/pages/TemplateDesigner.tsx:375):

```tsx
      {/* Header & Footer editor */}
      {headerFooterOpen && currentBasePdf && isBlankPdf(currentBasePdf) && (
        <HeaderFooterEditor
          basePdf={currentBasePdf}
          onSave={handleHeaderFooterSave}
          onClose={() => setHeaderFooterOpen(false)}
        />
      )}
```

- [ ] **Step 5: Manual verification**

```bash
cd client && npm run dev
```

In the browser:
1. Open a blank template, click "Header/Footer" — modal opens showing two empty 30mm-tall mini-canvases labeled HEADER and FOOTER.
2. Drag a Text field into the header canvas, type some text; drag a Text field into the footer canvas.
3. Click Save — modal closes, no visible change on the main canvas (staticSchema renders read-only, may not be visibly obvious depending on zoom — this is expected per the spec's "Out of scope" note that no new rendering polish is required beyond what pdfme already does).
4. Reopen "Header/Footer" — confirm the previously-added header and footer fields reappear in their respective bands (proves the split/rebase math round-trips correctly).
5. Click "JSON" toolbar button — confirm `basePdf.staticSchema` in the JSON contains both fields with plausible `position.y` values (header entry `y < 30`, footer entry `y >= pageHeight - 30`).
6. Upload a custom PDF — confirm the Header/Footer button becomes disabled.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/TemplateDesigner.tsx
git commit -m "feat(designer): wire header/footer editor into toolbar"
```

---

### Task 4: Generate PDF preview button

**Files:**
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- Consumes: `generate` from `@pdfme/generator`, `getInputFromTemplate` from `@pdfme/common`, `getFonts`/`getPlugins` from `../lib/pdfme.js`.

- [ ] **Step 1: Import `generate` and `getInputFromTemplate`**

Modify the imports (client/src/pages/TemplateDesigner.tsx:1-13, building on Task 1's edit):

```tsx
import { generate } from '@pdfme/generator';
import { getInputFromTemplate, isBlankPdf, type Template } from '@pdfme/common';
```

(Combine with the existing `@pdfme/common` import line rather than duplicating it.)

- [ ] **Step 2: Add `generating` state**

Add next to `saving` (client/src/pages/TemplateDesigner.tsx:92):

```tsx
  const [generating, setGenerating] = useState(false);
```

- [ ] **Step 3: Add the handler**

Add after `handleDownloadTemplateJson` (client/src/pages/TemplateDesigner.tsx:201-210):

```tsx
  const handleGeneratePdf = async () => {
    if (!designerRef.current) return;
    setGenerating(true);
    setError(null);
    try {
      const template = designerRef.current.getTemplate();
      const inputs = getInputFromTemplate(template);
      const pdfBytes = await generate({
        template,
        inputs,
        options: { font: getFonts() },
        plugins: getPlugins(),
      });
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };
```

- [ ] **Step 4: Add the button to the Output group**

Modify (client/src/pages/TemplateDesigner.tsx:315-317):

```tsx
        <Group label="Output">
          <ToolbarBtn icon={<FileDown size={13} />} label="Template JSON" onClick={handleDownloadTemplateJson} />
          <ToolbarBtn
            icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
            label={generating ? 'Generating…' : 'Generate PDF'}
            onClick={handleGeneratePdf}
            disabled={generating}
          />
        </Group>
```

- [ ] **Step 5: Manual verification**

```bash
cd client && npm run dev
```

In the browser:
1. Open a template with at least one Text field with some default content set.
2. Click "Generate PDF" — button shows "Generating…" spinner briefly, then a new browser tab opens showing a rendered PDF with the field's default content filled in.
3. Add a field with no default content, click Generate PDF again — confirm it still succeeds (empty string input is valid).
4. Temporarily break generation (e.g. by opening browser devtools and throwing from `generate` — or skip this step if not easily reproducible) to confirm the `error` banner path is reachable; otherwise reason through the try/catch by code review.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/TemplateDesigner.tsx
git commit -m "feat(designer): add client-side Generate PDF preview button"
```

---

## Self-Review Notes

- **Spec coverage:** Feature 1 (page size/orientation) → Task 1. Feature 2 (header/footer editor) → Tasks 2–3. Feature 3 (generate preview) → Task 4. All three spec sections have corresponding tasks.
- **Placeholder scan:** No TBD/TODO; all steps contain complete code.
- **Type consistency:** `HeaderFooterEditor` props (`basePdf: BlankPdf`, `onSave: (staticSchema: Schema[]) => void`, `onClose: () => void`) defined in Task 2 match the usage in Task 3 Step 4 exactly. `ToolbarBtn`'s new `disabled` prop (added in Task 3 Step 3) is reused as-is in Task 4 Step 4. `PAGE_SIZES_PORTRAIT_MM`/`matchPageSizeName`/`applyBasePdfPatch` names are consistent within Task 1. `templateVersion` setter is introduced in Task 1 and reused in Task 3's `handleHeaderFooterSave` — consistent naming (`setTemplateVersion`).

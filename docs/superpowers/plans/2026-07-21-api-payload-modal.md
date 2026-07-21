# API Payload Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "API payload" modal to the Designer toolbar that documents the real `POST /generate-pdf` request shape, with a Full-template/By-ID input-example toggle and Copy body / Copy as curl actions.

**Architecture:** One new self-contained modal component (`client/src/components/ApiPayloadModal.tsx`) plus toolbar wiring in `client/src/pages/TemplateDesigner.tsx`, following the exact pattern already established by `HeaderFooterEditor.tsx` and the existing JSON editor modal (own open/close state, conditional render, no new dependencies).

**Tech Stack:** React 18 + TypeScript, `@pdfme/common` (`getInputFromTemplate`), `lucide-react` icons, browser `navigator.clipboard` API. No test runner exists in `client/` — verification is manual: typecheck plus a dev-server browser check (or by-inspection reasoning where a browser isn't available, matching this project's established practice).

## Global Constraints

- The modal documents the real, existing endpoint only — `POST /generate-pdf` accepting `{ template_id: string, inputs: Record<string, string>[] }`. No new server endpoint.
- "Full template" mode: `inputs` = `getInputFromTemplate(template)` (from `@pdfme/common`) — every field, real name + sample/default content.
- "By ID" mode: `inputs` = at most the first 2 key/value pairs of `getInputFromTemplate(template)[0]`, or `[{}]` if the template has no fields.
- Absolute URL shown/copied: `window.location.origin + API_BASE + '/generate-pdf'`, where `API_BASE` is computed the same way as `client/src/lib/api.ts:18` (`import.meta.env.VITE_API_BASE_URL ?? "/api"`, trailing slash stripped).
- If `templateId` is `null` (template never saved), the displayed `template_id` is the literal string `"<save the template first>"` and a warning line appears above the body preview.
- "Copy body" copies pretty-printed JSON (`JSON.stringify(body, null, 2)`) only. "Copy as curl" copies a full `curl -X POST <url> -H 'Content-Type: application/json' -d '<body>'` command, via `navigator.clipboard.writeText`.
- No "Send" / live-request button — copy-paste only.
- No persistence of the toggle selection across modal opens — always defaults to "Full template".
- Visual style matches existing modals in this file: white card, `border-radius: 16`, `#e6e6e6` borders, backdrop blur (`rgba(0,0,0,0.40)` + `blur(8px)`), `boxShadow: '0 24px 64px rgba(0,0,0,0.15)'`, pill buttons (`borderRadius: 50`).
- No new dependencies.

---

## File Structure

- **Create:** `client/src/components/ApiPayloadModal.tsx` — the modal itself: toggle, URL/body display, copy actions. Self-contained, no designer/canvas logic (unlike `HeaderFooterEditor.tsx`, this component has no pdfme `Designer` instances to manage).
- **Modify:** `client/src/pages/TemplateDesigner.tsx` — add `apiPayloadOpen` state, an "API" toolbar button in the Output group, and the conditional modal render.

---

### Task 1: ApiPayloadModal component

**Files:**
- Create: `client/src/components/ApiPayloadModal.tsx`

**Interfaces:**
- Consumes: `Template` type from `@pdfme/common`; `getInputFromTemplate` from `@pdfme/common`.
- Produces:
  ```tsx
  export default function ApiPayloadModal(props: {
    templateId: string | null;
    template: Template;
    onClose: () => void;
  }): JSX.Element
  ```
  Task 2 (TemplateDesigner integration) renders this component and consumes these exact props.

- [ ] **Step 1: Create the component file**

```tsx
import { useState } from 'react';
import { getInputFromTemplate, type Template } from '@pdfme/common';

type Mode = 'full' | 'byId';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

function buildInputs(template: Template, mode: Mode): Record<string, string>[] {
  const fullInputs = getInputFromTemplate(template);
  if (mode === 'full') return fullInputs;
  const first = fullInputs[0] ?? {};
  const trimmed = Object.fromEntries(Object.entries(first).slice(0, 2));
  return [trimmed];
}

export default function ApiPayloadModal(props: {
  templateId: string | null;
  template: Template;
  onClose: () => void;
}) {
  const { templateId, template, onClose } = props;
  const [mode, setMode] = useState<Mode>('full');

  const url = `${window.location.origin}${API_BASE}/generate-pdf`;
  const displayedTemplateId = templateId ?? '<save the template first>';
  const body = {
    template_id: displayedTemplateId,
    inputs: buildInputs(template, mode),
  };
  const bodyText = JSON.stringify(body, null, 2);
  const curlText = `curl -X POST ${url} \\\n  -H 'Content-Type: application/json' \\\n  -d '${bodyText}'`;

  const copyBody = () => { void navigator.clipboard.writeText(bodyText); };
  const copyCurl = () => { void navigator.clipboard.writeText(curlText); };

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
        width: '60vw', maxWidth: 800,
        background: '#fff',
        border: '1px solid #e6e6e6',
        borderRadius: 16,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.15)',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6e6e6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#000', fontWeight: 700, fontSize: 14 }}>API payload</span>
          <button onClick={onClose} style={{ color: 'rgba(0,0,0,0.40)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setMode('full')}
              style={{
                padding: '6px 14px', borderRadius: 50, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: mode === 'full' ? 'none' : '1px solid #e6e6e6',
                background: mode === 'full' ? '#000' : 'transparent',
                color: mode === 'full' ? '#fff' : 'rgba(0,0,0,0.55)',
              }}
            >
              Full template
            </button>
            <button
              onClick={() => setMode('byId')}
              style={{
                padding: '6px 14px', borderRadius: 50, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: mode === 'byId' ? 'none' : '1px solid #e6e6e6',
                background: mode === 'byId' ? '#000' : 'transparent',
                color: mode === 'byId' ? '#fff' : 'rgba(0,0,0,0.55)',
              }}
            >
              By ID
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 50, background: '#000', color: '#fff', fontWeight: 700, fontSize: 11,
            }}>
              POST
            </span>
            <span style={{ color: 'rgba(0,0,0,0.70)', wordBreak: 'break-all' }}>{url}</span>
          </div>

          {templateId === null && (
            <div style={{ color: '#dc2626', fontSize: 12 }}>
              Save this template to get a real template_id.
            </div>
          )}

          <pre style={{
            margin: 0,
            width: '100%', maxHeight: '40vh', overflow: 'auto',
            background: '#f7f7f5',
            color: '#000',
            fontFamily: "'Geist Mono', monospace",
            fontSize: 12,
            padding: 16,
            borderRadius: 8,
            boxSizing: 'border-box',
          }}>
            {bodyText}
          </pre>
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid #e6e6e6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={copyBody}
            style={{ padding: '6px 16px', borderRadius: 50, border: '1px solid #e6e6e6', background: 'transparent', color: 'rgba(0,0,0,0.55)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Copy body
          </button>
          <button
            onClick={copyCurl}
            style={{ padding: '6px 16px', borderRadius: 50, border: 'none', background: '#000', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Copy as curl
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. This project's tsconfig has `noUnusedLocals`/`noUnusedParameters: true` — double check no unused imports/vars.

- [ ] **Step 3: Manual verification (by-inspection, component not yet reachable from any page)**

Since this component isn't wired into `TemplateDesigner.tsx` until Task 2, reason through these scenarios and note the reasoning in your report:
1. A template with three text fields (`invoice_number` with `content: "INV-001"`, `client_name` with `content: ""`, `due_date` with `content: "30/06/2026"`) and `templateId: "abc-123"`: confirm "Full template" mode's `bodyText` contains all three fields with their content (empty string is valid JSON, not omitted). Confirm "By ID" mode's `bodyText` contains only the first two fields in insertion order (`invoice_number`, `client_name`), since `Object.entries(...).slice(0, 2)` on a 3-entry object keeps the first 2 and drops `due_date`.
2. A template with zero non-readOnly fields: confirm `getInputFromTemplate` returns `[{}]`, so `buildInputs` for `'byId'` gives `[{}]` (empty object, `Object.entries({}).slice(0,2)` is `[]`, `Object.fromEntries([])` is `{}`).
3. `templateId: null`: confirm `displayedTemplateId` is the literal string `<save the template first>` and the warning line renders.
4. Confirm `copyBody`/`copyCurl` call `navigator.clipboard.writeText` with the expected strings (bodyText vs curlText) — no need to actually run in a browser, just confirm by reading the code that the right string goes to the right button.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ApiPayloadModal.tsx
git commit -m "feat(designer): add ApiPayloadModal component"
```

---

### Task 2: Wire API payload modal into the toolbar

**Files:**
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- Consumes: `ApiPayloadModal` from `../components/ApiPayloadModal.js` (Task 1's `{ templateId, template, onClose }` props).

- [ ] **Step 1: Import the component and add open state**

Add import after the existing `HeaderFooterEditor` import (`client/src/pages/TemplateDesigner.tsx:15`):

```tsx
import ApiPayloadModal from '../components/ApiPayloadModal.js';
```

Add state next to `headerFooterOpen` (`client/src/pages/TemplateDesigner.tsx:123`):

```tsx
  const [apiPayloadOpen, setApiPayloadOpen] = useState(false);
```

- [ ] **Step 2: Import the `Code` icon**

Modify the lucide-react import (`client/src/pages/TemplateDesigner.tsx:6-10`):

```tsx
import {
  AlertCircle, ArrowLeft, Save, Loader2,
  FileJson, FileDown, RotateCcw, Copy, FileUp, Layout, Sparkles, Printer,
  RectangleVertical, RectangleHorizontal, PanelTop, Code,
} from 'lucide-react';
```

- [ ] **Step 3: Add the "API" button to the Output group**

Modify the Output group (`client/src/pages/TemplateDesigner.tsx:472-480`):

```tsx
        <Group label="Output">
          <ToolbarBtn icon={<FileDown size={13} />} label="Template JSON" onClick={handleDownloadTemplateJson} />
          <ToolbarBtn
            icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
            label={generating ? 'Generating…' : 'Generate PDF'}
            onClick={handleGeneratePdf}
            disabled={generating}
          />
          <ToolbarBtn icon={<Code size={13} />} label="API" onClick={() => setApiPayloadOpen(true)} />
        </Group>
```

- [ ] **Step 4: Render the modal conditionally**

Add after the Header & Footer editor block (`client/src/pages/TemplateDesigner.tsx:545-552`), before the "Designer canvas" comment:

```tsx
      {/* API payload modal */}
      {apiPayloadOpen && (
        <ApiPayloadModal
          templateId={id ?? null}
          template={designerRef.current?.getTemplate() ?? BLANK_TEMPLATE}
          onClose={() => setApiPayloadOpen(false)}
        />
      )}
```

- [ ] **Step 5: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Manual verification**

```bash
cd client && npm run dev
```

(Start in background: `nohup npm run dev > /tmp/task2-dev.log 2>&1 & disown`, `sleep 5 && cat /tmp/task2-dev.log` to confirm the port, then curl-check `/` and `/templates/new` for 200. Stop by PID via `lsof -ti:<port> | xargs -r kill` when done — never a blanket `pkill -f vite`.)

If a real browser is available, additionally:
1. Open a new (unsaved) template, add a text field, click "API" — modal opens, shows the warning about saving first, `template_id` shows the placeholder string, `inputs` in "Full template" mode shows the field.
2. Toggle to "By ID" — `inputs` shortens to at most 2 keys.
3. Click "Copy body" — clipboard contains valid JSON matching what's displayed.
4. Click "Copy as curl" — clipboard contains a `curl -X POST ...` command containing the same URL and body.
5. Save the template, reopen "API" — `template_id` now shows the real saved id, warning is gone.

If no browser is available in this environment, reason through each of these 5 steps by inspecting the code changes and describe the walkthrough in the report, consistent with how prior tasks in this project were verified.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/TemplateDesigner.tsx
git commit -m "feat(designer): wire API payload modal into toolbar"
```

---

## Self-Review Notes

- **Spec coverage:** The spec's single feature (API payload modal: trigger, toggle, URL, body, warning, copy actions) is fully covered — Task 1 builds the component per every spec requirement (Full/By-ID modes, absolute URL construction, unsaved-template placeholder + warning, Copy body/Copy as curl), Task 2 wires it into the toolbar exactly as the spec's "Integration" section describes.
- **Placeholder scan:** No TBD/TODO; all steps contain complete code.
- **Type consistency:** `ApiPayloadModal`'s props (`templateId: string | null`, `template: Template`, `onClose: () => void`) defined in Task 1 match Task 2 Step 4's usage exactly. `API_BASE` computation in the new component mirrors `client/src/lib/api.ts:18` exactly (spec requirement). `BLANK_TEMPLATE` fallback in Task 2 Step 4 reuses the existing constant already defined at the top of `TemplateDesigner.tsx:17-20` — no new constant introduced.

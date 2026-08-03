# Designer Toolbar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Template Designer's 14-button action toolbar from a single dense row of five same-styled groups into two rows (primary actions on top, content/setup tools below), with each group rendered as a bordered "segmented cluster" of borderless buttons — no behavior change to any of the 14 actions.

**Architecture:** Pure presentation change confined to `client/src/pages/TemplateDesigner.tsx`. Two existing local helper components (`ToolbarBtn`, `Group`) get restyled; the `Sep` divider component is deleted (no longer needed once groups have their own visible borders); the toolbar JSX is split from one `<div>` row into two, with groups reordered into the approved layout. All `onClick`/`disabled`/label logic, all button icons, and every other part of the page are untouched.

**Tech Stack:** React 18 + TypeScript, inline `style` objects (matching this file's existing convention — no CSS modules or Tailwind config changes needed), `lucide-react` icons (already imported, no new icons).

## Global Constraints

- No new toolbar actions, no removed actions, no renamed labels — this is a visual regrouping of the existing 14 buttons, not a feature change.
- No change to which modal/panel/handler any button opens (`handleSave`, `handleSaveAs`, `handleReset`, `handleOpenPublish`, `handleDownloadTemplateJson`, `handleGeneratePdf`, `setApiPayloadOpen`, `handlePageSizeChange`, `handleOrientationChange`, `handleChangePdf`, `handleStaticSchema`, `setHeaderFooterOpen`, `handleOpenJson`, `setAiOpen`, `setAssetPickerOpen`, `setLetterheadPickerOpen` all keep their exact current wiring).
- No change to any `disabled` condition (`!isBlank` for Header/Footer, `!id` for Publish, `isDetectingAi` for Change PDF, `generating` for Generate PDF).
- No change to Row 1 (back button, name input, Cancel/Save Draft top bar), modal contents, native browser dialogs, or color tokens elsewhere on the page — out of scope per the spec.
- Keep the existing `lucide-react` icons for every button (`Save`, `Copy`, `RotateCcw`, `UploadCloud`, `FileDown`, `Printer`, `Loader2`, `Code`, `RectangleVertical`, `RectangleHorizontal`, `FileUp`, `Layout`, `PanelTop`, `FileJson`, `Sparkles`, `Image as ImageIcon`, `BookOpen`) — no new icons, no icon-only buttons, every button keeps icon + text label.
- No test runner exists in `client/` (project-wide constraint) — verification is `npx tsc --noEmit -p tsconfig.json` plus a manual visual check in the browser if available, otherwise a careful describe-what-you'd-see walkthrough.

---

## File Structure

- **Modify only:** `client/src/pages/TemplateDesigner.tsx`
  - `ToolbarBtn` (lines 49-91): restyle to segmented-cluster child button (no own border, hover/active fill, primary variant stays solid dark fill).
  - `Sep` (lines 93-95): **delete** — no longer used once each group has its own bordered cluster container.
  - `Group` (lines 97-115): restyle to render its `children` inside a bordered cluster container instead of a bare flex row.
  - Toolbar JSX (lines 709-799, "Row 2 — action toolbar"): replace the single row with two rows in the approved order — Row A: Project (left) + Output (right, pushed right via a spacer); Row B: Page, Base PDF, Edit (left-aligned, in that order).

No other files are touched by this plan.

---

### Task 1: Restyle `ToolbarBtn` and `Group`, delete `Sep`, rebuild the two-row toolbar layout

**Files:**
- Modify: `client/src/pages/TemplateDesigner.tsx`

**Interfaces:**
- `ToolbarBtn`'s prop signature is unchanged: `{ icon: React.ReactNode; label: string; onClick: () => void; accent?: boolean; disabled?: boolean }`. Only its internal styling changes — no caller in this file needs to change how it invokes `ToolbarBtn`.
- `Group`'s prop signature is unchanged: `{ label: string; children: React.ReactNode }`. Only its internal styling changes.
- No new components, types, or exports are introduced. This task is entirely internal to `TemplateDesigner.tsx`.

- [ ] **Step 1: Read the current file in full**

Read `client/src/pages/TemplateDesigner.tsx` in full (it's ~930 lines) before editing, to confirm line numbers below still match and to see the full context around the toolbar (state declarations like `isBlank`, `currentSizeName`, `currentOrientation`, `isDetectingAi`, `generating`, `id` used inside the toolbar JSX — these are already defined earlier in the component and must keep being referenced exactly as today).

- [ ] **Step 2: Replace `ToolbarBtn` with the segmented-cluster child button style**

Replace the current `ToolbarBtn` function (lines 49-91) with:

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
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[7px] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      style={accent ? {
        background: '#111',
        color: '#fff',
        border: 'none',
      } : {
        background: 'transparent',
        color: '#555',
        border: 'none',
      }}
      onMouseEnter={e => {
        if (!accent) {
          (e.currentTarget as HTMLButtonElement).style.background = '#fff';
          (e.currentTarget as HTMLButtonElement).style.color = '#111';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';
        } else {
          (e.currentTarget as HTMLButtonElement).style.background = '#000';
        }
      }}
      onMouseLeave={e => {
        if (!accent) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = '#555';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
        } else {
          (e.currentTarget as HTMLButtonElement).style.background = '#111';
        }
      }}
    >
      {icon}
      {label}
    </button>
  );
}
```

This keeps the exact same prop signature and call sites. Visual changes: no individual border/pill radius (the parent `Group` cluster now provides the border), 7px corner radius instead of a full pill, hover now shows a white background + dark text + subtle shadow (previously light-gray background), primary (`accent`) stays a solid dark fill and darkens slightly on hover instead of using an unstyled default hover.

- [ ] **Step 3: Delete the `Sep` component**

Delete the `Sep` function entirely (current lines 93-95):

```tsx
function Sep() {
  return <div style={{ width: 1, height: 20, background: '#e6e6e6', flexShrink: 0 }} />;
}
```

It will have zero remaining call sites after Step 5 removes its four usages from the toolbar JSX — confirm this with a repo-wide search before deleting (`grep -rn "<Sep" client/src/`) in case another file somehow imports it (it doesn't today — `Sep` is a local, non-exported function only used within this file — but confirm rather than assume).

- [ ] **Step 4: Replace `Group` with the segmented-cluster container style**

Replace the current `Group` function (lines 97-115) with:

```tsx
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.07em',
        color: '#a3a3a0',
        textTransform: 'uppercase',
        paddingLeft: 2,
      }}>
        {label}
      </span>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        background: '#f7f7f5',
        border: '1px solid #ececea',
        borderRadius: 10,
        padding: 3,
      }}>
        {children}
      </div>
    </div>
  );
}
```

This wraps `children` (the `ToolbarBtn`s and, for the Page group, the `<select>`) in the bordered cluster container. The group label styling is tightened (10px, bold, tighter letter-spacing, softer gray) per the spec but keeps the same "label above buttons" structure. The `'Geist Mono'` font-family reference is intentionally dropped here — the spec scopes typography-token changes out, but a monospace label over a now visually-heavier cluster reads inconsistently; using the surrounding system font (already the default via this file's `className`-based Tailwind usage) is the minimal-diff way to keep this looking correct without touching font tokens elsewhere. If review disagrees, this is a one-line revert (`fontFamily: "'Geist Mono', monospace"` back onto the `span` style).

- [ ] **Step 5: Rebuild the toolbar as two rows in the approved order**

Replace the entire "Row 2 — action toolbar" block (current lines 709-799, from `{/* Row 2 — action toolbar */}` through the closing `</div>` right before `{/* JSON editor modal */}`) with:

```tsx
      {/* Row 2 — primary actions */}
      <div
        className="flex items-end gap-4 px-4 py-2.5"
        style={{ ...barStyle }}
      >
        <Group label="Project">
          <ToolbarBtn icon={<Save size={13} />} label="Save Draft" onClick={handleSave} accent />
          <ToolbarBtn icon={<Copy size={13} />} label="Save As" onClick={handleSaveAs} />
          <ToolbarBtn icon={<RotateCcw size={13} />} label="Reset" onClick={handleReset} />
          <ToolbarBtn icon={<UploadCloud size={13} />} label="Publish" onClick={() => void handleOpenPublish()} disabled={!id} />
        </Group>

        <div className="flex-1" />

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
      </div>

      {/* Row 3 — content / setup tools */}
      <div
        className="flex items-end gap-4 px-4 py-2.5"
        style={{ ...barStyle }}
      >
        <Group label="Page">
          <select
            value={currentSizeName ?? ''}
            disabled={!isBlank}
            onChange={e => handlePageSizeChange(e.target.value as PageSizeName)}
            className="h-[26px] px-2 text-xs font-semibold rounded-[7px] disabled:opacity-40"
            style={{
              background: 'transparent',
              color: '#555',
              border: 'none',
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

        <Group label="Base PDF">
          <ToolbarBtn
            icon={<FileUp size={13} />}
            label={isDetectingAi ? 'Detecting…' : 'Change PDF'}
            onClick={handleChangePdf}
            disabled={isDetectingAi}
          />
          <input ref={basePdfInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleBasePdfFile} />
        </Group>

        <Group label="Edit">
          <ToolbarBtn icon={<Layout size={13} />} label="Static schema" onClick={handleStaticSchema} />
          <ToolbarBtn
            icon={<PanelTop size={13} />}
            label="Header/Footer"
            onClick={() => setHeaderFooterOpen(true)}
            disabled={!isBlank}
          />
          <ToolbarBtn icon={<FileJson size={13} />} label="JSON" onClick={handleOpenJson} />
          <ToolbarBtn icon={<Sparkles size={13} />} label="Ask AI" onClick={() => setAiOpen(true)} />
          <ToolbarBtn icon={<ImageIcon size={13} />} label="Pick from Assets" onClick={() => setAssetPickerOpen(true)} />
          <ToolbarBtn
            icon={<BookOpen size={13} />}
            label="Apply Letterhead"
            onClick={() => setLetterheadPickerOpen(true)}
          />
        </Group>
      </div>
```

Notes on this replacement:
- Every `ToolbarBtn`/`<select>`/hidden file `<input>` element, its icon, label, `onClick`, and `disabled` value is copied verbatim from the original — only the grouping/row placement and the four `<Sep />` calls change (the `<Sep />` calls are removed entirely; clusters now provide their own visual separation via each `Group`'s border).
- The `<select>`'s inline `style` drops its own `border`/`borderRadius: 50` (matching the same "cluster provides the border" change applied to `ToolbarBtn`) and gains `rounded-[7px]` via `className` to match sibling buttons' corner radius.
- The comment `{/* Row 2 — action toolbar */}` is replaced by two comments, `{/* Row 2 — primary actions */}` and `{/* Row 3 — content / setup tools */}`, so the existing "Row 1" (name/save bar) numbering stays consistent with what's now a 3-row header area.
- Row A (Project + Output) uses `className="flex items-end gap-4 px-4 py-2.5"` (padding bumped from `py-2` to `py-2.5` to match the slightly taller cluster containers) — same as Row B, so both rows have consistent height/padding.

- [ ] **Step 6: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. If TypeScript flags `Sep` as declared-but-unused before you complete Step 3's deletion, that confirms Step 3 needs to run — the step order above (restyle `ToolbarBtn` → delete `Sep` → restyle `Group` → rebuild JSX) means `Sep` has no call sites by the time the JSX replacement in Step 5 lands, so no unused-symbol error should remain after all steps are applied.

- [ ] **Step 7: Manual visual verification**

If a browser is available: start the client dev server (`cd client && npm run dev`, alternate port if 5173 is in use — verify you're not killing someone else's process first) and the server dev process (`cd server && npm run dev`, alternate port if needed). Navigate to `/templates/new` (or open any existing template's `/templates/:id/edit`). Confirm:
1. The toolbar now renders as two visually distinct rows below the name/save bar.
2. Row 1 (primary actions): "Project" cluster (Save Draft, Save As, Reset, Publish) on the left, "Output" cluster (Template JSON, Generate PDF, API) pushed to the right.
3. Row 2 (setup tools): "Page" cluster (size dropdown, Portrait, Landscape), then "Base PDF" cluster (Change PDF), then "Edit" cluster (Static schema, Header/Footer, JSON, Ask AI, Pick from Assets, Apply Letterhead) — left to right, no `Sep` dividers visible, each group visually bounded by its own light-gray bordered container.
4. Each cluster's buttons show a white-background hover state; Save Draft (primary) is a solid dark pill that darkens slightly on hover.
5. Click through at least 3 buttons (e.g. Portrait/Landscape toggle, Change PDF file picker opens, Ask AI panel opens) to confirm no `onClick` wiring broke.
6. Confirm existing `disabled` states still work: Publish is disabled with no `id` (i.e., on `/templates/new` before first save), Header/Footer is disabled if the current base PDF isn't blank (test on a template with an uploaded PDF, if one exists).

If no browser is available, perform a careful code-path walkthrough instead: re-read the final JSX and confirm every one of the 14 original `onClick`/`disabled` bindings appears exactly once, unchanged, across the two new rows, and describe this trace in your report, being explicit that this was a walkthrough and not live browser testing.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/TemplateDesigner.tsx
git commit -m "feat(designer): redesign toolbar into two rows with segmented button clusters"
```

---

## Self-Review Notes

- **Spec coverage:** Both spec requirements are covered by this single task — the two-row layout (Row A: Project left / Output right; Row B: Page, Base PDF, Edit) and the segmented-cluster button style (bordered chip container per group, borderless hover-filled buttons inside, primary solid-fill exception for Save Draft) are both implemented in Step 5's JSX and Steps 2/4's component restyles respectively. The spec's explicit out-of-scope list (Row 1, modal contents, native dialogs, color tokens/dark mode, pre-canvas flow) is respected — no other part of the file is touched.
- **Placeholder scan:** No TBD/TODO; the task contains complete, verbatim code for every changed function and the full replacement JSX block.
- **Type consistency:** `ToolbarBtn` and `Group` prop signatures are unchanged from the current file, so every existing call site (all 14 `ToolbarBtn` invocations, all 5 `Group` invocations) continues to type-check without modification — verified by cross-referencing the original file's exact JSX (read in full during plan authoring) against the replacement block in Step 5, confirming every prop value (icon, label, onClick, disabled, accent) was carried over unchanged.
- **`Sep` removal verified safe:** grepped the file for all `<Sep` usages (4 total, all inside the toolbar block being replaced) and confirmed `Sep` is a local, non-exported function with no other consumers in the codebase before scheduling its deletion in Step 3.
- **Single-task plan justified:** this is one cohesive, single-file visual change (three local component/JSX edits that only make sense applied together — restyling `ToolbarBtn` alone without restyling `Group` and rebuilding the row JSX would leave the page in a broken intermediate visual state) with one clear testable deliverable (the toolbar renders and behaves correctly), so it is not split into multiple tasks per the "fold setup into the task whose deliverable needs it, split only where a reviewer could meaningfully approve one part while rejecting another" guidance — a reviewer either approves this toolbar redesign as a whole or requests changes to it as a whole.

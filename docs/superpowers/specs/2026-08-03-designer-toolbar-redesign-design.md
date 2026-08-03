# Designer Toolbar Redesign

## Problem

`TemplateDesigner.tsx` (the page rendered at both `/templates/new` and
`/templates/:id/edit`) has a 14-button action toolbar (`Group`/`ToolbarBtn`
components, `TemplateDesigner.tsx:49-115`) packed into a single dense row,
split into five groups: Page, Base PDF, Edit, Project, Output. Every button
uses the same tiny style — 9px uppercase group labels, 13px icons, thin
gray-border pills — with no visual hierarchy between a rarely-used action
(e.g. "Static schema") and a primary one (e.g. "Save Draft"). The row feels
cramped and undifferentiated.

## Scope

This pass covers only the action toolbar (the `Group`/`ToolbarBtn` row
currently at `TemplateDesigner.tsx:709-799`, "Row 2" in the current layout).
It does not touch:
- Row 1 (back button, name input, Cancel/Save Draft — the top bar)
- Modal contents (PublishModal, JSON editor modal, ChangePdfChoiceModal, etc.)
- Native browser `confirm()`/`prompt()` dialogs
- Color tokens / dark-mode theming elsewhere on the page
- Any pre-canvas "how do you want to start" flow — clicking "New Template"
  continues to drop straight into the blank canvas as it does today

These are known related rough edges (see prior codebase exploration) but are
explicitly out of scope for this design.

## Design

### Layout: two rows, grouped by purpose

Replace the single 5-group row with two rows:

**Row A — primary actions**, split left/right:
- Left-aligned: **Project** group — Save Draft (primary/accent), Save As,
  Reset, Publish
- Right-aligned: **Output** group — Template JSON, Generate PDF, API

**Row B — content/setup tools**, left-aligned, in this order:
- **Page** group — page size `<select>`, Portrait, Landscape
- **Base PDF** group — Change PDF
- **Edit** group — Static schema, Header/Footer, JSON, Ask AI, Pick from
  Assets, Apply Letterhead

Group membership and every button's existing `onClick`/`disabled`/label
logic are unchanged — this is a visual and structural regrouping of the
same 14 actions, not a behavior change. (Group order and the row split were
chosen and approved via mockup: primary/output actions get top-row
prominence since they're the ones a user reaches for most; page/content
setup tools — used once per template, early in the workflow — sit below.)

### Button style: segmented clusters

Each group renders as one bordered "chip" container (a `cluster`) with
borderless buttons inside it, replacing today's per-button border pill:

- Cluster: light gray background (`#f7f7f5`-equivalent token), 1px border,
  ~10px border radius, ~3px inner padding, small gap between buttons
- Button (default): no border, transparent background, muted text color;
  on hover, white/lighter background + darker text + subtle shadow (same
  treatment as `active` state, so hover previews the "selected" look)
- Button (primary — Save Draft only): solid dark fill, white text/icon, no
  hover-color flip (stays dark, background darkens slightly on hover)
- Button (active/toggled — e.g. current Portrait/Landscape selection):
  same visual treatment as hover (white background + shadow), persists
  without hovering
- Button (disabled): unchanged existing pattern — reduced opacity,
  pointer-events none
- The page-size `<select>` sits inside the Page cluster alongside the
  Portrait/Landscape buttons, styled to match (transparent background,
  no visible border of its own — the cluster provides the border)

Group labels (small uppercase text like "Page", "Project") sit directly
above each cluster, same as today, just with tightened typography (no
change to the `'Geist Mono'` font reference — out of scope per above).

Icons: keep the existing `lucide-react` icons already imported and used by
each button today (`Save`, `Copy`, `RotateCcw`, `UploadCloud`, `FileDown`,
`Printer`, `Code`, `RectangleVertical`, `RectangleHorizontal`, `FileUp`,
`Layout`, `PanelTop`, `FileJson`, `Sparkles`, `Image`, `BookOpen`) — no new
icons, no icon-only mode. Every button keeps its existing icon + text label.

### Component changes

- `ToolbarBtn` (`TemplateDesigner.tsx:49-91`): restyle to the new
  cluster-child button look (remove individual border/pill radius, add
  hover/active fill treatment). Props (`icon`, `label`, `onClick`, `accent`,
  `disabled`) stay the same — `accent` continues to mean "primary/dark
  fill," now scoped visually to render correctly inside a cluster.
- `Group` (`TemplateDesigner.tsx:97-115`): wrap `children` in a new cluster
  container div (background/border/radius/padding) instead of the current
  bare flex row.
- New: a `Row` (or similar) wrapper for Row A / Row B, replacing the single
  `<div className="flex items-end gap-4 ...">` at `TemplateDesigner.tsx:710-712`
  with two such rows. Row A needs a spacer between the Project cluster
  (left) and Output cluster (right).
- `Sep` (`TemplateDesigner.tsx:93-95`, the vertical divider) is no longer
  needed between clusters within a row, since each cluster now has its own
  visible border — remove its usages between groups. (Still evaluate at
  implementation time whether any row needs a divider at all; likely not.)

## Out of scope / explicitly not changing

- No new toolbar actions, no removed actions, no renamed labels
- No change to which modal/panel each button opens
- No change to `disabled` conditions (e.g. Header/Footer still disabled
  when `!isBlank`, Publish still disabled when `!id`)
- No dark-mode/theming work — colors stay close to current (light,
  hardcoded-ish) values; token-izing them into `nx-*` variables is a
  separate future pass per user's explicit scoping decision

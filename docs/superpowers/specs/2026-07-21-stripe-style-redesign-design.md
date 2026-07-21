# Stripe-style redesign: Dashboard + TemplateList

Date: 2026-07-21
Status: Approved for planning

## Context

The user asked for a full UI/UX redo, saying the current aesthetic is "wrong
for this product" — the app currently mixes three unfinished design
attempts:

1. `DESIGN.md`'s editorial system (black/white core + oversized pastel
   color blocks, pill-shaped everything, `Geist Mono` uppercase labels),
   applied via inline styles directly in `Dashboard.tsx` and
   `TemplateList.tsx` (commit `df3a74a9`).
2. A leftover neon blue-gradient "glow" theme still defined in
   `client/src/components/ui/button.tsx` and `badge.tsx`, but not actually
   used by any page — the pages hand-roll inline-styled buttons instead of
   consuming these components.
3. Design tokens in `client/src/index.css` matching system (1), the
   editorial pastel-block system.

Through the brainstorming session (using the visual companion), the user
picked a **Stripe-style direction**: clean white surfaces, soft blue-gray
tints, a single confident indigo accent color, standard `6-8px` border
radius (not pills, not editorial rounding), and regular-weight sans-serif
type throughout (retiring the mono-uppercase-eyebrow pattern). A full
Dashboard mockup in this style (sidebar + top bar + stat cards + table) was
approved as-is.

## Scope

**In scope for this pass:**
- Design tokens (`client/src/index.css`)
- Shared UI components: `client/src/components/ui/button.tsx`,
  `client/src/components/ui/badge.tsx`, and a card primitive if the
  existing `card.tsx` isn't already suitable for the new style
- Layout shell: `client/src/components/layout/Sidebar.tsx`,
  `client/src/components/layout/TopBar.tsx`
- `client/src/pages/Dashboard.tsx`
- `client/src/pages/TemplateList.tsx`

**Out of scope for this pass** (left in current style, revisited later):
- `client/src/pages/TemplateDesigner.tsx`'s custom toolbar
- `client/src/pages/FormFill.tsx`
- `client/src/pages/NotFound.tsx`
- The embedded pdfme `Designer` canvas itself (third-party component, not
  restyled — its own internal UI is out of reach for meaningful
  customization and wasn't part of what the user asked to change)

No functional/data changes — this is a pure visual restyle. Existing
props, API calls, routing, and role-based visibility logic
(`useRole()`/`canEdit`/`canDelete`/`canFill`) are preserved exactly;
only the rendered markup/styling changes.

## Design tokens

Replace the `:root` block in `client/src/index.css` (currently the
editorial system's tokens) with:

```css
:root {
  /* Surfaces */
  --nx-canvas:        #ffffff;
  --nx-surface:       #f7fafc;
  --nx-surface-tint:  #f5f3ff;  /* active/selected nav background */
  --nx-hairline:      #e3e8ef;

  /* Ink */
  --nx-ink:            #0a2540;  /* headings, primary text */
  --nx-ink-secondary:  #425466;  /* body text */
  --nx-ink-muted:      #8792a2;  /* labels, captions, placeholders */

  /* Accent */
  --nx-accent:         #635bff;  /* primary actions, active states */
  --nx-accent-tint:    #f5f3ff;  /* light accent background (badges, active nav) */

  /* Semantic */
  --nx-success:        #0e6245;
  --nx-success-tint:   #e3f9e5;
  --nx-destructive:    #dc2626;
  --nx-destructive-tint: #fef2f2;

  /* Shape */
  --nx-radius-sm: 6px;
  --nx-radius-md: 8px;

  /* Tailwind semantic tokens (kept in sync with the above) */
  --background:        0 0% 100%;
  --foreground:        210 55% 10%;   /* ~#0a2540 */
  --card:              0 0% 100%;
  --card-foreground:   210 55% 10%;
  --popover:           0 0% 100%;
  --popover-foreground:210 55% 10%;
  --primary:           245 100% 68%;  /* ~#635bff */
  --primary-foreground:0 0% 100%;
  --secondary:         220 20% 97%;   /* ~#f7fafc */
  --secondary-foreground:210 25% 32%; /* ~#425466 */
  --muted:             220 20% 97%;
  --muted-foreground:  216 12% 55%;   /* ~#8792a2 */
  --accent:            256 100% 97%;  /* ~#f5f3ff */
  --accent-foreground: 245 100% 68%;
  --destructive:       0 72% 51%;
  --destructive-foreground:0 0% 100%;
  --border:            216 20% 91%;   /* ~#e3e8ef */
  --input:             0 0% 100%;
  --ring:              245 100% 68%;
  --radius:            0.5rem;        /* 8px */
}
```

Remove the `.nx-block-*` pastel helpers and the `.nx-mono` eyebrow helper
class entirely — no page in scope uses them after this pass (they remain
defined nowhere else once Dashboard/TemplateList are rewritten). Keep the
`body` font-family (`'Geist', system-ui, ...`) — Stripe-style still uses a
clean system sans-serif, just without the mono-uppercase treatment for
labels. Keep the scrollbar, loading-animation, and route-transition CSS
blocks unchanged — they're style-agnostic and not part of this visual
direction change.

## Component changes

**`button.tsx`**: Replace the neon-gradient `buttonVariants` with:
- `default`: `bg-[var(--nx-accent)] text-white hover:brightness-110`, `rounded-[var(--nx-radius-sm)]`
- `secondary`: white background, `1px solid var(--nx-hairline)` border, `text-[var(--nx-ink)]`, subtle hover background
- `outline`: transparent background, `1px solid var(--nx-hairline)` border, `text-[var(--nx-ink-secondary)]`
- `ghost`: transparent, `text-[var(--nx-ink-secondary)]`, subtle hover background
- `destructive`: `bg-[var(--nx-destructive)] text-white`
- `link`: `text-[var(--nx-accent)] underline-offset-4 hover:underline`

Sizes unchanged in shape (`sm`/`default`/`lg`/`icon` height scale), only
the border-radius token changes from whatever it currently resolves to, to
`--nx-radius-sm` (6px).

**`badge.tsx`**: Replace pill/pastel variants with tinted-background badges
matching the mockup's status pill (`background: var(--nx-success-tint);
color: var(--nx-success)` for the "Active" example) — `border-radius:
var(--nx-radius-sm)` (not full pill), `default`/`secondary`/`destructive`/
`outline`/`success` variants following the same tint pattern.

**Card primitive**: `client/src/components/ui/card.tsx` exists but hardcodes
the old style (`rounded-2xl border-[#e6e6e6]`). Update `Card`'s base classes
to: white background, `1px solid var(--nx-hairline)` border,
`border-radius: var(--nx-radius-md)`, no shadow by default, and drop the
`hover:border-black/20` hover treatment (not part of the Stripe direction —
cards are static containers, not interactive elements, in the approved
mockup). This becomes the base for stat cards and table containers on both
pages.

## Layout shell changes

**`Sidebar.tsx`**: White background (already is), hairline border unchanged
in concept but recolored to `--nx-hairline`. Logo mark: small indigo
square/rounded-square badge (matching the mockup's "N" mark) replacing the
current black rounded-square. Nav items: active state becomes
`background: var(--nx-accent-tint); color: var(--nx-accent)` (replacing the
current solid-black pill); inactive state becomes
`color: var(--nx-ink-secondary)` with a subtle hover background — no more
`rounded-[50px]` pill shape, use `--nx-radius-sm`. Role-switcher buttons and
user footer follow the same recoloring (accent instead of black for the
active/selected state).

**`TopBar.tsx`**: White background, hairline border bottom (recolored).
Title text: `--nx-ink`. Search input: light `--nx-surface` background,
hairline border, standard radius (not pill). CTA button: uses the new
`Button` `default` variant (indigo fill) instead of hand-rolled black pill
styling.

## Page changes

**`Dashboard.tsx`**: Rebuild the `StatCard` component to the new card
style (white, hairline border, `--nx-radius-md`, no more solid pastel
`BLOCK_COLORS` background — value/label typography follows the ink token
scale). Any other Dashboard sections (recent templates, activity, etc. —
whatever currently exists beyond stat cards) get the same card/table
treatment as the approved mockup. Data fetching and shape are unchanged.

**`TemplateList.tsx`**: 
- Filter bar: template count label uses `--nx-ink-muted` (regular
  sans-serif, not mono-uppercase); grid/list view toggle uses accent
  active state instead of solid black.
- Error banner: `--nx-destructive-tint` background instead of the pastel
  pink block.
- Empty state: card-style container using the new tokens, CTA button uses
  the new `Button` component.
- Grid view: cards drop the `BLOCK_COLORS` pastel header entirely —
  replaced with a plain white card header area (icon in a neutral/tinted
  circle, no per-card random color). Action buttons (`Fill`, `Edit`,
  `Delete`) use the new `Button` variants instead of hand-rolled
  black-pill/outline styles.
- List view: table adopts the mockup's table style (light-gray header row,
  hairline row dividers, standard radius on the container, not
  `rounded-2xl`).

Skeleton loading state: recolor to use `--nx-surface`/`--nx-hairline`
instead of black-opacity overlays; keep the same shimmer/pulse animation
mechanism.

## Out of scope (explicitly)

- `TemplateDesigner.tsx` toolbar and the pdfme `Designer` canvas.
- `FormFill.tsx`.
- `NotFound.tsx`.
- Any new pages, features, or functional/data changes.
- Removing the now-fully-unused editorial tokens' *concept* isn't
  required elsewhere in the codebase beyond `index.css` and the two
  in-scope pages/shared components — a later pass will finish the
  remaining 3 pages using the same tokens/components this pass establishes.

# Industry Template Gallery

## Problem

Today, creating a template always starts from a blank canvas (`BLANK_TEMPLATE` in [TemplateDesigner.tsx](client/src/pages/TemplateDesigner.tsx)) or from the "Ask AI" chat, which requires the user to describe what they want from scratch. New users — especially ones evaluating the product for a specific industry — have no quick way to see "this tool can build a lease agreement / patient intake form / offer letter for me" and get started.

## Goal

Add a Template Gallery: a page organized by industry, where each industry shows a handful of premade template cards (name + one-line description). Clicking a card lands the user in the normal template designer with the existing "Ask AI" panel already open and seeded with an industry-specific prompt, so the AI builds a starting template for them immediately — reusing the app's existing AI-chat template-building flow rather than introducing a new one.

## Global Constraints

- **No backend or database changes.** The gallery's content (industries + templates + seed prompts) is a static TypeScript file on the client. No new tables, no new API routes, no new persisted state.
- **No change to existing "New Template" entry points.** Every current "+ New Template" button/link (Dashboard, Templates page, Sidebar) keeps navigating straight to a blank `/templates/new` exactly as it does today. The gallery is purely additive — a new nav item and page.
- **No change to `pdf_templates` / `template_versions` on selection.** Picking a gallery template does not create a DB row. It behaves exactly like today's "Ask AI" flow on a blank template: nothing is saved until the user explicitly saves/publishes from the designer, same as `TemplateDesigner.tsx`'s existing `id`-less flow.
- **The AI chat's existing behavior is not changed for manual users.** Someone who opens "Ask AI" directly (not via the gallery) sees the exact same empty chat they see today. The only new behavior is an *optional* auto-sent first message when the designer is entered via the gallery.
- **Exactly one auto-send, only on the gallery path.** The seed prompt is sent once, automatically, only when `TemplateDesigner` is mounted fresh (`id` is `undefined`, i.e. `/templates/new`) with a seed prompt present. Navigating to `/templates/new` normally (no gallery selection) behaves identically to today.

## Design

### Content (`client/src/lib/templateGallery.ts`)

A static registry, no runtime dependencies:

```ts
export interface GalleryTemplate {
  id: string;          // slug, e.g. 'hr-offer-letter'
  name: string;         // "Offer Letter"
  description: string;  // one-line card subtitle
  seedPrompt: string;   // first message auto-sent to the AI chat
}

export interface GalleryIndustry {
  id: string;    // 'hr'
  name: string;  // "HR & Onboarding"
  icon: LucideIcon;
  templates: GalleryTemplate[]; // exactly 5 per industry at launch
}

export const TEMPLATE_GALLERY: GalleryIndustry[];
```

Six industries at launch, five templates each (30 total):

- **HR & Onboarding** — Offer Letter, Employee Onboarding Checklist, Leave Request Form, Timesheet, Exit/Offboarding Form
- **Construction & Facilities** — Site Visitor Log, Safety Inspection Checklist, Equipment Checkout Form, Work Order, Incident Report
- **Real Estate** — Lease Agreement, Property Inspection Checklist, Tenant Application, Move-In/Move-Out Checklist, Maintenance Request
- **Retail & Hospitality** — Purchase Order, Delivery Note, Customer Registration Form, Incident Report, Guest Feedback Form
- **Healthcare** — Patient Intake Form, Consent to Treatment, Appointment Record, Discharge Summary, Visitor Log
- **Education** — Student Enrollment Form, Parental Consent Form, Field Trip Permission Slip, Incident Report, Attendance Record

Each `seedPrompt` is a concrete, field-specific instruction (not just the template name) so the AI chat has enough to act on in one turn where possible — e.g. Offer Letter's prompt names candidate name, job title, start date, salary, manager name, and signature lines for both parties. Exact wording for all 30 is written directly into the registry file during implementation, not decided further here — it's content, not a design decision, and is trivial to revise post-launch since it's static data.

### New page (`client/src/pages/TemplateGallery.tsx`)

- `AppLayout` + `TopBar title="Template Gallery"`, matching every other page's shell (`Dashboard.tsx`, `TemplateList.tsx` are the reference).
- Industry pills/tabs across the top (one row, horizontally scrollable on narrow viewports), defaulting to the first industry selected. Selecting a pill swaps the grid below — avoids a single 30-card wall.
- Below the pills: a `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (or similar, matched to `TemplateList.tsx`'s existing grid breakpoints for consistency) of `Card`s for the selected industry's 5 templates. Each card: an icon tile (rounded-full, accent-tint — matching the visual language already established across Dashboard/Templates/Assets/Letterheads/Submissions in this session's redesign pass), the template name, its description, and a "Use this template" button.
- A "Start from scratch" link/button near the top of the page (not per-card) that navigates to plain `/templates/new` — the existing blank-canvas flow, untouched.
- Clicking "Use this template" on a card calls `navigate('/templates/new', { state: { seedPrompt: template.seedPrompt } })`.
- Loading/empty states are not applicable — this is static data, always present.

### Nav entry (`client/src/components/layout/Sidebar.tsx`)

- New `NavItem to="/templates/gallery" icon={<LayoutGrid className="h-4 w-4" />} label="Template Gallery"`, placed directly after the existing "New Template" item (line 90), under the same `(role === 'Admin' || role === 'Designer')` guard as "New Template", "Assets", and "Letterheads" — matches who's allowed to create templates today.

### Route (`client/src/App.tsx`)

- New lazy route: `<Route path="/templates/gallery" element={<RoleGuard allowed={['Admin', 'Designer']}><TemplateGallery /></RoleGuard>} />`, placed near the other `/templates/*` routes. Same `RoleGuard` pattern already used for `/templates/new` and `/templates/:id/edit`.

### Wiring into the designer (`client/src/pages/TemplateDesigner.tsx`)

- Add `const location = useLocation();` and read `const seedPrompt = (location.state as { seedPrompt?: string } | null)?.seedPrompt;` at the top of the component.
- In the existing mount `useEffect` (the one that currently does `if (id) { ... } else { template = BLANK_TEMPLATE }`, around line 296-304): when `!id && seedPrompt`, additionally call `setAiOpen(true)` after the designer is initialized, so the panel opens automatically for a fresh, gallery-seeded template. When `id` is present (editing an existing template) or there's no `seedPrompt`, behavior is unchanged.
- Pass `initialPrompt={seedPrompt}` to the existing `<AskAiPanel>` render (line 913-917). `seedPrompt` is only ever read once at mount for this purpose — no need to clear router state afterward since `AskAiPanel` itself guards against re-sending (see below), and closing/reopening the panel manually later must not re-trigger the auto-send.

### `AskAiPanel` change (`client/src/components/AskAiPanel.tsx`)

- New optional prop: `initialPrompt?: string`.
- New `useEffect` that runs once on mount: if `initialPrompt` is set, populate the first user message and call the existing `send()` logic automatically — reusing the exact same code path a manually-typed message takes (so a seeded template gets identical treatment, including the `res.done`/follow-up-question handling that already exists).
- Guard with a `useRef(false)` "already sent" flag so React 18 Strict Mode's double-invoke in development doesn't send the prompt twice.
- No other change to `AskAiPanel`'s behavior — a panel opened without `initialPrompt` (i.e. every existing call site) behaves exactly as it does today.

## What doesn't change

- `pdf_templates` / `template_versions` schema and all server routes — untouched.
- Every existing "+ New Template" button (`Dashboard.tsx`, `TemplateList.tsx`, `Sidebar.tsx`'s "New Template" item) — untouched, still blank-canvas.
- `AskAiPanel`'s behavior for manually-opened chats — untouched.
- The AI chat endpoint (`aiFormChat`) itself and its conversational/multi-turn behavior — untouched; the gallery only supplies the first message.

## Self-Review Notes

- Placeholder scan: none — all 6 industries and their 5 template names are enumerated; exact seed-prompt wording is explicitly called out as content to write during implementation (trivial, static-data, no design ambiguity), not a deferred design decision.
- Internal consistency: confirmed against actual code — `AskAiPanel`'s `send()` mechanics (`res.done`/`res.template`/error handling), `TemplateDesigner`'s `aiOpen` state and mount `useEffect`, and `Sidebar.tsx`'s role-gating pattern were all read directly from source before writing this spec, not assumed.
- Scope check: single cohesive feature, no hidden second subsystem — confirmed appropriately sized for one implementation plan.
- Ambiguity check: "premade templates" resolved explicitly to mean AI-seeded (per user's choice), not hand-authored static schemas — called out up front so it isn't re-litigated during implementation.

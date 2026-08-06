# Framer Marketing Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Framer marketing landing page for NexGen PDF Manager, reusing the copy/branding from the existing in-app `/welcome` page but with stronger visual execution, real product screenshots, and an added FAQ section.

**Architecture:** A single-page Framer site (Nav → Hero → How it works → Features → FAQ → CTA → Footer) built via the Framer skill/MCP tools, styled to match the app's existing `--nx-*` design tokens. Real screenshots are captured from the running client app first, then used as image assets inside Framer. The site is built in draft — not published — for review.

**Tech Stack:** Framer (via the `framer` skill and its MCP tools), the project's existing Vite client dev server (for screenshot capture), Claude Browser preview tools.

## Global Constraints

- Branding/copy is reused from `client/src/pages/Landing.tsx` as the base — no invented product claims, testimonials, customer logos, or stats (per spec Non-goals).
- Colors: canvas `#fff`, ink `#0a2540`, ink-secondary `#425466`, ink-muted `#8792a2`, accent `#059669`, accent-tint `#ecfdf5`, hairline `#e3e8ef`.
- Font: Figtree.
- Do not publish the Framer site live — build and leave in draft (per spec Review & publishing).
- Do not modify the in-app `/welcome` route or any app/backend code (per spec Non-goals).
- FAQ content must only describe real product behavior (self-attested e-signature + audit trail, Admin/Designer roles, no-code template building, submissions tracking) — no legal-certification claims.

---

### Task 1: Capture real app screenshots

**Files:**
- Create (ephemeral, not committed): screenshots in `/private/tmp/claude-501/-Users-achintha-Desktop-Nexgen-PDF-generator-/04cb7922-92a7-4a89-b372-c278040228e7/scratchpad/landing-assets/`
  - `dashboard.png`
  - `designer-canvas.png`
  - `signed-form.png`

**Interfaces:**
- Produces: three PNG file paths, used as image assets by Task 4 (Hero) and Task 5 (How it works).

- [ ] **Step 1: Start the client dev server preview**

Use `preview_start` with `{"name": "client"}`. This starts `npm --prefix client run dev` on port 5173 and opens a browser tab.

- [ ] **Step 2: Screenshot the Dashboard**

Navigate to the app root (Dashboard view). Wait for content to render (no loading spinners). Take a screenshot via `computer {action: "screenshot"}` and save it to `landing-assets/dashboard.png`. If the Dashboard requires login and no test session exists, use whatever demo/seed data the app already loads by default — do not create new accounts or enter credentials (per safety rules, account creation requires user confirmation).

- [ ] **Step 3: Screenshot the Designer canvas**

Navigate to the Templates/Designer view, open an existing template (or the default empty canvas if none exist). Take a screenshot and save it to `landing-assets/designer-canvas.png`.

- [ ] **Step 4: Screenshot a filled/signed form**

Navigate to a filled-in or signed submission view if one exists in the seed data. Take a screenshot and save it to `landing-assets/signed-form.png`. If no signed submission exists in the current data, screenshot the form-fill view mid-fill instead, and note in your task report which variant was captured.

- [ ] **Step 5: Verify the screenshots**

Open each of the three PNGs with the Read tool and confirm each shows real, readable app UI (not a blank page, error boundary, or loading state). Re-capture any that fail this check.

No commit — these are ephemeral working assets, not repository content.

---

### Task 2: Create the Framer project and set brand foundations

**Files:** None in this repo — this task creates a new project inside Framer via the `framer` skill.

**Interfaces:**
- Consumes: nothing.
- Produces: a Framer project (name it "NexGen PDF Manager — Landing") with a "Home" page, and a color/text style set matching the Global Constraints palette and Figtree font. Later tasks build sections onto this "Home" page. Record the project's preview URL — every later task's verification step re-opens this URL.

- [ ] **Step 1: Load the framer skill**

Invoke `Skill` with `framer` to get the current, authoritative instructions for creating a project and using its design tools (the exact MCP tool names/signatures live there, not in this plan).

- [ ] **Step 2: Create a new Framer project with a "Home" page**

Name the project "NexGen PDF Manager — Landing".

- [ ] **Step 3: Define color styles**

Create named color styles: `canvas` (#fff), `ink` (#0a2540), `ink-secondary` (#425466), `ink-muted` (#8792a2), `accent` (#059669), `accent-tint` (#ecfdf5), `hairline` (#e3e8ef).

- [ ] **Step 4: Define the text style / font**

Set the project's base font to Figtree (or the closest available match in Framer's font picker if Figtree isn't directly available — note which was used).

- [ ] **Step 5: Verify**

Read the project back (via the framer skill's design-reading tool) and confirm the color styles and font are present and named as above.

---

### Task 3: Build the Nav

**Files:** Framer "Home" page, "Nav" section (created in this task).

**Interfaces:**
- Consumes: Framer project from Task 2 (color styles, font).
- Produces: a sticky nav component other sections don't depend on, but establishes the page's top-of-stack element for the scroll-blur behavior described in the spec.

- [ ] **Step 1: Build the nav layout**

Left: small logo mark (rounded square, `accent-tint` background, a document/file glyph in `accent`) + "NexGen PDF Manager" wordmark in `ink`. Center/right: anchor links "How it works", "Features", "FAQ" in `ink-secondary`. Far right: a button "Go to Dashboard" styled with `ink` background, white text, rounded corners matching the app's button radius.

- [ ] **Step 2: Set sticky + scroll behavior**

Pin the nav to the top of the viewport. Add a scroll-triggered style change: background goes from transparent/`canvas` to a blurred `canvas` with a `hairline` bottom border once the page scrolls past ~20px, mirroring `client/src/pages/Landing.tsx:64-66`.

- [ ] **Step 3: Verify**

Preview the page, scroll down, and confirm the nav visually changes (blur/border appears) and stays pinned to the top.

---

### Task 4: Build the Hero section

**Files:** Framer "Home" page, "Hero" section (created in this task). Uses `landing-assets/dashboard.png` from Task 1.

**Interfaces:**
- Consumes: color/text styles from Task 2, `dashboard.png` from Task 1.
- Produces: the Hero section, placed directly below Nav.

- [ ] **Step 1: Build the copy column**

Eyebrow badge: pill shape, `accent-tint` background, `accent` text, checkmark icon, text "Design, fill, sign, and track — all in one place" (verbatim from `client/src/pages/Landing.tsx:98`).

Headline (H1): "PDF documents, from template to signature" (verbatim from line 101), `ink` color, large bold weight, tight line height.

Subhead: "NexGen PDF Manager gives your team a single workflow for building document templates, collecting filled-in forms and signatures, and tracking every submission to completion." (verbatim from lines 104-106), `ink-secondary`.

Two buttons: "Go to Dashboard" (filled, `ink` background) and "Browse templates" (outline style), matching lines 109-115.

- [ ] **Step 2: Build the visual column**

Upload `landing-assets/dashboard.png` (from Task 1) as an image asset. Place it inside a browser-chrome frame (rounded rectangle, thin `hairline` border, subtle drop shadow, a small strip at the top with three dots to suggest a browser window) — replacing the fake mock document card from lines 120-163.

- [ ] **Step 3: Add the floating "Submitted" badge**

Small white rounded card overlapping the bottom-left corner of the screenshot frame: green checkmark icon in an `accent-tint` circle, text "Submitted" (bold, `ink`) and "Order Stream · 2 min ago" (small, `ink-muted`) — same content as lines 158-160.

- [ ] **Step 4: Add entrance motion**

Fade + slide-up animation on the Hero content as the page loads (not scroll-triggered, since it's above the fold).

- [ ] **Step 5: Verify**

Preview the page. Confirm the headline/subhead/CTA copy matches verbatim, the screenshot renders inside the browser-chrome frame, and the "Submitted" badge overlaps it correctly on both desktop and mobile breakpoints (resize the preview to check).

---

### Task 5: Build the How It Works section

**Files:** Framer "Home" page, "How It Works" section. Uses `landing-assets/designer-canvas.png` and `landing-assets/signed-form.png` from Task 1.

**Interfaces:**
- Consumes: color/text styles from Task 2, screenshots from Task 1.
- Produces: the "How It Works" section, anchor target for the Nav's "How it works" link (Task 3).

- [ ] **Step 1: Build the 3-step layout**

Three columns, each with a numbered circle (1/2/3, `ink` background, white text), a title, and a description — verbatim from `client/src/pages/Landing.tsx:14-29`:
1. "Design" — "Build a template with the drag-and-drop editor — text, tables, letterheads, dividers."
2. "Fill & sign" — "Share it as a live form. Fill it in, then click to place a signature before sending."
3. "Track" — "Every submission lands in one place — draft, submitted, or completed."

- [ ] **Step 2: Add screenshot crops per step**

Below step 1's text, place a cropped/scaled version of `designer-canvas.png`. Below step 2's text, place a cropped/scaled version of `signed-form.png`. Step 3 ("Track") can reuse a cropped view of `dashboard.png` (submissions list area) since no separate tracking-view screenshot was captured in Task 1.

- [ ] **Step 3: Set the anchor ID**

Set this section's anchor/ID so the Nav's "How it works" link (Task 3) scrolls to it.

- [ ] **Step 4: Add scroll-in motion**

Fade + slide-up animation triggered when the section enters the viewport.

- [ ] **Step 5: Verify**

Preview the page, click the Nav's "How it works" link, and confirm it scrolls to this section. Confirm all three step descriptions match the source copy verbatim and each screenshot crop is legible (not stretched/blurry).

---

### Task 6: Build the Features section

**Files:** Framer "Home" page, "Features" section.

**Interfaces:**
- Consumes: color/text styles from Task 2.
- Produces: the "Features" section, anchor target for the Nav's "Features" link (Task 3).

- [ ] **Step 1: Build the section header**

H2: "Everything the workflow needs" (verbatim from `client/src/pages/Landing.tsx:196`). Subhead: "One tool for the whole document lifecycle, scoped to the right role." (verbatim from line 198), `ink-secondary`.

- [ ] **Step 2: Build the 4 feature cards**

Grid of 4 cards (2x2 on tablet, 4x1 on desktop, 1x4 on mobile), each with a circular icon badge (`accent-tint` background, `accent` icon), a title, and a description — verbatim from `client/src/pages/Landing.tsx:32-53`:
1. "Template designer" — "Dynamic PDF templates with tables, letterheads, and reusable fields — no code required."
2. "Form fill + e-signature" — "Fill a shared form and click to place a signature directly on the document."
3. "Submissions tracking" — "See every document in one place, so nothing gets lost between teams."
4. "Roles & permissions" — "Admins and Designers manage templates; everyone else fills and signs."

- [ ] **Step 3: Add hover elevation**

On hover, each card should lift slightly with an increased shadow (matches `client/src/pages/Landing.tsx:205`).

- [ ] **Step 4: Set the anchor ID**

Set this section's anchor/ID so the Nav's "Features" link (Task 3) scrolls to it.

- [ ] **Step 5: Verify**

Preview the page, click the Nav's "Features" link, confirm it scrolls here, confirm all 4 titles/descriptions match verbatim, and confirm the grid reflows correctly across desktop/tablet/mobile breakpoints.

---

### Task 7: Build the FAQ section

**Files:** Framer "Home" page, "FAQ" section (new — no equivalent in the current in-app page).

**Interfaces:**
- Consumes: color/text styles from Task 2.
- Produces: the "FAQ" section, anchor target for the Nav's "FAQ" link (Task 3).

- [ ] **Step 1: Build the section header**

H2: "Frequently asked questions", `ink`.

- [ ] **Step 2: Build the Q&A list**

An accordion or simple stacked list with these four Q&As (grounded only in real product behavior per the Global Constraints — do not add claims beyond these):

1. **Q: What does "self-attested" e-signature mean?**
   A: When someone signs a document in NexGen PDF Manager, their signature and the surrounding action are recorded in an audit trail tied to that submission. It's a self-attested signature, not a third-party-certified digital signature — useful for internal workflows and approvals rather than contexts that require certified digital signing.

2. **Q: What's the difference between Admin, Designer, and other roles?**
   A: Admins and Designers can create and manage document templates. Everyone else can fill out forms and add their signature, and see the status of documents they're involved in.

3. **Q: Do I need to write code to build a template?**
   A: No. Templates are built with a drag-and-drop editor — you add text, tables, letterheads, and dividers visually.

4. **Q: Where do submissions go after they're signed?**
   A: Every submission lands in one place, showing its status as draft, submitted, or completed, so nothing gets lost between teams.

- [ ] **Step 3: Set the anchor ID**

Set this section's anchor/ID so the Nav's "FAQ" link (Task 3) scrolls to it.

- [ ] **Step 4: Verify**

Preview the page, click the Nav's "FAQ" link, confirm it scrolls here, and re-read each answer against Global Constraints to confirm no claim goes beyond what's stated above (no legal-certification language, no invented stats).

---

### Task 8: Build the CTA banner and Footer

**Files:** Framer "Home" page, "CTA" and "Footer" sections.

**Interfaces:**
- Consumes: color/text styles from Task 2.
- Produces: the final two sections of the page.

- [ ] **Step 1: Build the CTA banner**

Dark (`ink` background) rounded panel, centered content: H2 "Ready to get started?" (white text, verbatim from `client/src/pages/Landing.tsx:236`), paragraph "Jump into your dashboard to create a template, fill a form, or check on submissions." (white/70%-opacity text, verbatim from line 239), and a "Go to Dashboard" button — matching lines 225-245.

- [ ] **Step 2: Build the Footer**

Logo mark + "NexGen PDF Manager" wordmark, plus two links: "Dashboard" and "Templates" (matching the destinations used by the Hero's CTAs). Top `hairline` border, `ink-muted` text color for secondary elements.

- [ ] **Step 3: Verify**

Preview the page, confirm the CTA banner copy matches verbatim, and confirm the footer links are present and styled consistently with the rest of the page.

---

### Task 9: Full-page review pass

**Files:** None — verification only.

**Interfaces:**
- Consumes: the complete Framer "Home" page from Tasks 2-8.
- Produces: a reviewed, draft-only Framer site ready to share with the user.

- [ ] **Step 1: Responsive check**

Using the framer skill's preview, check the full page at desktop, tablet, and mobile breakpoints. Confirm no overlapping elements, no horizontal scroll, and that all sections/images reflow sensibly.

- [ ] **Step 2: Content parity check**

Re-read `client/src/pages/Landing.tsx` side-by-side with the built Framer page. Confirm every piece of copy called out as "verbatim" in Tasks 3-8 matches exactly (headline, subhead, step descriptions, feature descriptions, CTA copy).

- [ ] **Step 3: Nav link check**

Click each of the three Nav anchor links ("How it works", "Features", "FAQ") and confirm each scrolls to the correct section.

- [ ] **Step 4: Confirm draft-only state**

Confirm via the framer skill that the project has NOT been published live (per Global Constraints) — it should only exist as an editable draft/preview.

- [ ] **Step 5: Report back**

Summarize what was built, share the Framer preview URL, and note anything that deviated from this plan (e.g., a substituted screenshot from Task 1 Step 4, or a substituted font from Task 2 Step 4).

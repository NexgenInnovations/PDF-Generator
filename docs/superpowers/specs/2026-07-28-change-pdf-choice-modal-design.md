# Explicit choice on "Change PDF" upload: write on PDF vs recreate with AI

Date: 2026-07-28
Status: Approved for planning

## Context

Two features already exist for detecting fields from an uploaded PDF, both
wired into `client/src/pages/TemplateDesigner.tsx`'s `handleBasePdfFile`:

1. **AcroForm detection** (`client/src/lib/pdfFieldDetection.ts`'s
   `detectFields`) — reads real, structural AcroForm fields from the PDF
   and overlays them on the PDF kept as the template's background.
2. **AI vision detection** (`client/src/lib/aiPdfVisionDetection.ts`'s
   `detectFieldsWithAiVision`) — rasterizes the PDF's pages, sends them to
   `gpt-4o` vision, and generates a fresh blank-page template with
   AI-inferred fields (discarding the uploaded PDF as background).

Today's logic picks between them automatically: AcroForm detection runs
first, and AI vision only runs as a fallback when AcroForm detection finds
**zero** fields.

This breaks down for PDFs that are a hybrid: real AcroForm fields for some
inputs (e.g. checkboxes) but plain, non-interactive page content for
others (e.g. table cells/lines with typed-in text, common in some
government/legal forms exported from tools that only wire up certain
widgets). A real example: Australian Department of Home Affairs Form 956
has real AcroForm checkbox fields, but its name/address/ID-number entry
areas are just static table cells with no field behind them — so today's
logic finds the checkboxes, treats that as "AcroForm detection succeeded,"
and never gives AI vision a chance to find the missing text areas.

An earlier design direction explored merging AcroForm and AI vision
results together (running both, asking AI vision to estimate positions
for only the gaps). That approach was discarded during brainstorming in
favor of a simpler alternative: stop trying to have the app guess the
right strategy, and let the user choose explicitly every time.

## Feature behavior

**Trigger**: every time a PDF is selected via "Change PDF" (both on
`/templates/new` and when editing an existing template) — no automatic
detection-strategy guessing.

**Flow**:
1. User selects a file via the existing hidden `<input type="file">`
   (`basePdfInputRef`, unchanged).
2. Instead of immediately running any detection, a new modal appears:
   **`ChangePdfChoiceModal`**, styled consistently with the existing
   `client/src/components/ApiPayloadModal.tsx` (full-screen translucent
   backdrop with blur, centered white card, rounded corners, matching
   border/shadow conventions).
3. The modal presents exactly two choices, as buttons:
   - **"Write on the PDF"** — runs today's existing AcroForm-only path
     unchanged: `detectFields` runs, the PDF is kept as the template's
     background, and any real AcroForm fields found are overlaid at their
     exact positions. If zero AcroForm fields are found, the result is
     background-only (today's existing behavior for that case, unchanged
     — no AI, no error, no popup).
   - **"Recreate with AI"** — runs `detectFieldsWithAiVision`
     unconditionally, regardless of whether the PDF has any AcroForm
     fields. Produces a fresh, blank-page, AI-generated template
     (discarding the uploaded PDF as background), exactly as this
     function already behaves today when used as a fallback. The
     existing `isDetectingAi` loading state (Change PDF button becomes
     disabled and shows "Detecting…") is reused for this choice's
     in-flight period.
   - A short one-line description may appear under each button
     clarifying the tradeoff (e.g. "Keeps the real PDF and only fills in
     fields it already has" / "Generates a new form inspired by this
     document's content").
4. If the user dismisses the modal (clicking outside, an explicit close
   button, or Escape) without picking either option: the upload is
   aborted entirely. No template change occurs, the file input's value is
   reset, and the user can click "Change PDF" again to retry from
   scratch.
5. Whichever path is chosen, all existing internal behavior of that path
   (validation via `checkTemplate`, fallback-to-background-only on
   validation failure, error banner via the existing `error` state) is
   reused unchanged — this feature only changes WHEN each path runs, not
   HOW either path behaves internally.

## Edge case: "Write on the PDF" chosen for a fully flat PDF

If the user picks "Write on the PDF" for a PDF with zero AcroForm fields
(e.g. a scanned document with no interactive fields at all), the result is
just the PDF set as background with an empty schema — no fields, no
error, no automatic fallback to AI. This is an intentional consequence of
making the choice explicit and user-driven: the user picked that specific
path, so the app honors it rather than silently switching strategies
underneath them. If they wanted AI-generated fields, they can click
"Change PDF" again and choose "Recreate with AI" instead.

## What's explicitly NOT changing

- No changes to `client/src/lib/pdfFieldDetection.ts` (`detectFields`) —
  used exactly as today, just invoked conditionally on user choice
  instead of unconditionally-first.
- No changes to `client/src/lib/aiPdfVisionDetection.ts`
  (`detectFieldsWithAiVision`) or any server-side AI vision code
  (`server/src/services/aiPdfVisionService.ts`,
  `server/src/routes/aiPdfVision.ts`) — used exactly as today, just
  invoked unconditionally on user choice instead of only as a
  zero-fields fallback.
- No new server routes, no new AI prompts, no position-merging logic, no
  overlap detection between AcroForm and AI-found fields — the earlier
  "merge both results" design direction is fully superseded by this
  simpler either/or choice.
- No change to the existing AI chat feature (`AskAiPanel`,
  `server/src/services/aiFormService.ts`) — unrelated code path.

## Out of scope

- Remembering the user's last choice as a default for next time (always
  ask, every upload, per the approved flow).
- Any visual preview of what each choice would produce before committing
  to it (e.g. no side-by-side comparison) — the user picks blind, based
  on the two short descriptions, consistent with how "Change PDF"
  already silently replaces content today without a preview step.
- Any change to what happens when the PDF is used for the very first
  upload on a brand-new template (`/templates/new`) versus replacing an
  existing template's PDF (`/templates/:id/edit`) — both cases go through
  the same modal, same two choices, same underlying behavior.

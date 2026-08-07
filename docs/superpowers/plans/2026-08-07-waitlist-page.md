# Waitlist Page + Signup Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Waitlist" page to the existing Framer marketing site, backed by a new `/waitlist` endpoint on the existing Express/MSSQL server, so name+email signups are captured in the app's own database.

**Architecture:** A new Express route + DB table on the server (`server/src/routes/waitlist.ts`, `server/src/db.ts`), following this codebase's existing route/db patterns exactly (see `server/src/routes/letterheads.ts` for the shape to match). A new Framer page (`/waitlist`) in the existing Framer project, with a custom React code component handling the form's fetch call to that endpoint. No deployment, no email sending — both explicitly out of scope per the spec.

**Tech Stack:** Express, MSSQL (`mssql` npm package, no migration tool — schema lives in `ensureTables()`), `express-rate-limit` (new dependency), Framer (via the `framer` skill and `framer-code-components` skill).

## Global Constraints

- Deploying the server publicly is out of scope. All verification happens against the server running locally (`npm --prefix server run dev`, port 3004 by default).
- No confirmation email — success is shown on-page only.
- The existing landing page (`/` in the Framer project) is not modified.
- No auth on the new endpoint — matches every other route in this backend today.
- Duplicate email → `200` with `alreadyOnList: true`, not an error.
- This backend package has no automated test framework (confirmed: no `*.test.ts` files anywhere under `server/src`, and the root `vitest.config.ts` only covers `packages/*` workspaces). Verification for the backend task uses direct `curl` calls against the locally running server, matching how the rest of this package is validated today — do not introduce a new test framework as a side effect of this feature.
- Rate limit: 5 requests per IP per 15 minutes on `POST /waitlist`, returning `429` when exceeded.
- Framer project ID: `9EWDQbiBnMiY9W2bJHWJ` ("NexGen PDF Manager — Landing", shows as "Considerate Tone" in the Framer dashboard — see prior plan's known limitation). Reconnect with `npx @framer/agent@latest session new "9EWDQbiBnMiY9W2bJHWJ"`.
- Color styles already defined on this Framer project (use by name, don't redefine): `canvas` (#fff), `ink` (#0a2540), `ink-secondary` (#425466), `ink-muted` (#8792a2), `accent` (#059669), `accent-tint` (#ecfdf5), `hairline` (#e3e8ef). Text style: "Paragraph" preset, font Figtree.
- Do not publish the Framer project live.

---

### Task 1: Waitlist backend endpoint

**Files:**
- Modify: `server/src/db.ts:213-216` (insert new table into `ensureTables()`, right before the `console.log('Tables ready')` line), and append a new exported function at the end of the file (after line 866).
- Create: `server/src/routes/waitlist.ts`
- Modify: `server/src/index.ts:8` (import) and `server/src/index.ts:39` (mount, alongside the other `app.use(...)` route registrations)
- Modify: `server/package.json` (add `express-rate-limit` dependency)

**Interfaces:**
- Consumes: `getPool()` from `server/src/db.ts` (already defined, same pattern every other DB function in that file uses).
- Produces: `createWaitlistSignup(name: string, email: string): Promise<{ alreadyOnList: boolean }>`, exported from `server/src/db.ts`. `waitlistRouter` (Express `Router`), exported from `server/src/routes/waitlist.ts`, mounted at `/waitlist`. Task 2 and Task 3 depend on `POST /waitlist` existing and behaving exactly as specified below — they don't touch these files.

- [ ] **Step 1: Add the `express-rate-limit` dependency**

```bash
npm --prefix server install express-rate-limit
```

- [ ] **Step 2: Add the `waitlist_signups` table to `ensureTables()`**

In `server/src/db.ts`, insert this block right before the `console.log('Tables ready');` line (currently line 215):

```ts
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'waitlist_signups')
    CREATE TABLE waitlist_signups (
      id              INT IDENTITY(1,1) PRIMARY KEY,
      name            NVARCHAR(200)    NOT NULL,
      email           NVARCHAR(320)    NOT NULL UNIQUE,
      created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
    )
  `);
```

- [ ] **Step 3: Add `createWaitlistSignup` to `server/src/db.ts`**

Append at the end of the file:

```ts
export async function createWaitlistSignup(
  name: string,
  email: string
): Promise<{ alreadyOnList: boolean }> {
  try {
    await getPool()
      .request()
      .input('name', sql.NVarChar(200), name)
      .input('email', sql.NVarChar(320), email)
      .query(`
        INSERT INTO waitlist_signups (name, email)
        VALUES (@name, @email)
      `);
    return { alreadyOnList: false };
  } catch (error) {
    const err = error as { number?: number };
    // MSSQL error 2627 (PK/UNIQUE constraint) or 2601 (unique index) — the
    // email already exists. Treat as a friendly duplicate, not a failure.
    if (err.number === 2627 || err.number === 2601) {
      return { alreadyOnList: true };
    }
    throw error;
  }
}
```

- [ ] **Step 4: Create `server/src/routes/waitlist.ts`**

```ts
// server/src/routes/waitlist.ts
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createWaitlistSignup } from '../db.js';

export const waitlistRouter = Router();

const waitlistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @openapi
 * /waitlist:
 *   post:
 *     summary: Join the NexGen PDF Manager waitlist
 *     tags: [Waitlist]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Signup accepted (new or already on the list)
 *       400:
 *         description: Missing or invalid fields
 *       429:
 *         description: Too many requests
 */
waitlistRouter.post('/', waitlistLimiter, async (req: Request, res: Response) => {
  const { name, email } = req.body as { name?: string; email?: string };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    res.status(400).json({ error: 'a valid email is required' });
    return;
  }

  try {
    const result = await createWaitlistSignup(name.trim(), email.trim().toLowerCase());
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});
```

- [ ] **Step 5: Wire the route into `server/src/index.ts`**

Add the import alongside the other route imports (after the `submissionsRouter` import on line 8):

```ts
import { waitlistRouter } from './routes/waitlist.js';
```

Add the mount alongside the other `app.use(...)` calls (after `app.use(submissionsRouter);` on line 39):

```ts
app.use('/waitlist', waitlistRouter);
```

- [ ] **Step 6: Start the server locally**

```bash
npm --prefix server run dev
```

Expected: log output includes `Connected to MSSQL`, `Tables ready`, and `Server running on port 3004` (or whatever `PORT` resolves to in `server/.env`) with no errors.

- [ ] **Step 7: Verify a new signup succeeds**

```bash
curl -s -X POST http://localhost:3004/waitlist \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada Lovelace","email":"ada@example.com"}'
```

Expected: HTTP 200, body `{"alreadyOnList":false}`.

- [ ] **Step 8: Verify a duplicate email is handled gracefully**

Run the exact same `curl` command from Step 7 again.

Expected: HTTP 200, body `{"alreadyOnList":true}` — not an error.

- [ ] **Step 9: Verify invalid input is rejected**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3004/waitlist \
  -H 'Content-Type: application/json' \
  -d '{"name":"","email":"ada@example.com"}'

curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3004/waitlist \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada Lovelace","email":"not-an-email"}'
```

Expected: both print `400`.

- [ ] **Step 10: Verify rate limiting**

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3004/waitlist \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Rate Test $i\",\"email\":\"rate-test-$i@example.com\"}"
done
```

Expected: the first 5 requests print `200`, the 6th prints `429`.

- [ ] **Step 11: Commit**

```bash
git add server/src/db.ts server/src/routes/waitlist.ts server/src/index.ts server/package.json server/package-lock.json
git commit -m "feat(server): add waitlist signup endpoint"
```

---

### Task 2: Framer waitlist form (Code Component)

**Files:** None in this repo — this task creates a new Code Component inside the Framer project `9EWDQbiBnMiY9W2bJHWJ`. Reconnect per Global Constraints.

**Interfaces:**
- Consumes: `POST http://localhost:3004/waitlist` from Task 1, with request body `{ name: string, email: string }` and response body `{ alreadyOnList: boolean }` (200), `{ error: string }` (400/429/500).
- Produces: a reusable Framer Code Component (name it "WaitlistForm") with a property control `apiBaseUrl` (string, default `"http://localhost:3004"`). Task 3 consumes this component by dropping it onto the new Waitlist page.

- [ ] **Step 1: Load the `framer` and `framer-code-components` skills**

Invoke `Skill` with `framer` first, then `framer-code-components`, to get the current, authoritative instructions and constraints for building a code component in this Framer project.

- [ ] **Step 2: Build the "WaitlistForm" code component**

A React component with:
- Two inputs: "Name" (text) and "Email" (email), styled with the project's `ink`, `ink-secondary`, and `hairline` color styles and Figtree font — visually consistent with the rest of the site (border, padding, rounded corners matching the site's existing form-adjacent elements, e.g. the buttons already built in the landing page).
- A submit button, label "Join the waitlist", styled like the landing page's primary button (`ink` background, white text).
- A property control `apiBaseUrl: string`, default value `"http://localhost:3004"`.

- [ ] **Step 3: Implement the four states**

- **Idle**: both inputs + button, enabled.
- **Submitting**: on submit, client-side validate both fields are non-empty and the email matches a basic `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` pattern before making any network call — if invalid, show an inline validation message and do not call `fetch`. If valid, disable inputs/button and show a loading label on the button (e.g. "Joining…").
- **Success**: `fetch(`${apiBaseUrl}/waitlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email }) })`. On a 200 response, parse the JSON body:
  - `alreadyOnList === false` → replace the form with: "You're on the list — we'll be in touch." (`ink`, semibold)
  - `alreadyOnList === true` → replace the form with: "You're already on the list!" (`ink`, semibold)
- **Error**: on a non-200 response, or a network/fetch failure, show an inline error message below the form (`ink-secondary` or a distinct error tone if the project has one — otherwise reuse `ink-secondary`), re-enable the inputs/button so the user can retry. Use the response's `error` field as the message when present, otherwise a generic "Something went wrong — please try again."

- [ ] **Step 4: Verify all four states live**

With the server from Task 1 running locally (`npm --prefix server run dev`), render the component live in Framer's editor canvas (per the framer-code-components skill's guidance for live-testing a component — this executes real React and real `fetch` calls without publishing):
1. Fill in a new name/email, submit → confirm the "You're on the list" success state renders.
2. Submit the exact same email again → confirm the "You're already on the list!" state renders.
3. Enter an invalid email (e.g. `not-an-email`), submit → confirm the inline validation message renders and no network request was made (check via the framer skill's network/console inspection if available, or the absence of a new row for that non-email string).
4. Stop the local server, submit a valid new email → confirm the error state renders (network failure), then restart the server.

Take a screenshot of each of the four states for the report.

- [ ] **Step 5: Verify no other content was touched**

Confirm this task did not modify the existing landing page (`/`), Nav, Hero, How It Works, Features, FAQ, CTA, or Footer sections, or the project's color/text styles.

---

### Task 3: Framer waitlist page

**Files:** A new page in the Framer project `9EWDQbiBnMiY9W2bJHWJ` — no repo files. Reconnect per Global Constraints.

**Interfaces:**
- Consumes: the "WaitlistForm" code component from Task 2.
- Produces: a published-in-draft page at path `/waitlist` on the Framer project. Nothing later depends on this task.

- [ ] **Step 1: Load the `framer` skill**

Invoke `Skill` with `framer` to reconnect to the project and get current instructions for adding a page.

- [ ] **Step 2: Create the "Waitlist" page at path `/waitlist`**

Add a new page to the project (separate from "Home").

- [ ] **Step 3: Build the header**

Reuse the same logo mark + "NexGen PDF Manager" wordmark styling used in the landing page's Nav (rounded square, `accent-tint` background, document icon in `accent`, plus semibold `ink` wordmark text) — but as a simple non-sticky header with no anchor links, just linking the whole header (or the wordmark) back to `/`.

- [ ] **Step 4: Build the copy**

Centered content column, max-width ~600px:
- Eyebrow badge (same pill style as the landing page's Hero eyebrow: `accent-tint` background, `accent` text): "Coming soon"
- Headline (H1), `ink`, bold: "Get early access to what's next"
- Subhead, `ink-secondary`: "We're building new plans and features for NexGen PDF Manager — join the waitlist to be the first to know, and get early access when they launch."

- [ ] **Step 5: Place the WaitlistForm component**

Add an instance of the "WaitlistForm" code component from Task 2 below the copy, centered, with its `apiBaseUrl` property left at the default `"http://localhost:3004"`.

- [ ] **Step 6: Verify the assembled page**

Read the page back and confirm the header, eyebrow, headline, and subhead text match verbatim (character-for-character against Step 4's text). Take a full-page screenshot.

With the Task 1 server running locally, exercise the live form on this assembled page (not just the isolated component from Task 2) end-to-end: submit a new name/email, confirm the success state renders on the actual page layout (not overlapping or clipped by surrounding content).

- [ ] **Step 7: Confirm draft-only state**

Confirm via the framer skill that no publish/`confirm_publish` call was made — the project remains an editable draft only.

- [ ] **Step 8: Report back**

Summarize what was built, note the Framer project ID and how to open it, and flag that this feature is verified against `http://localhost:3004` only — switching the WaitlistForm's `apiBaseUrl` property to a real deployed URL is a separate follow-up once the server is deployed (out of scope per the spec's Non-goals).

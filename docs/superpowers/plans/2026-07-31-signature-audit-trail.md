# Self-Attested Signature Audit Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture self-attested identity (name, email), timestamp, IP address, and a tamper-evidence hash for every signature field a signer fills in, and make that evidence visible via a new read-only Submissions view — without changing how the drawn signature image itself is stored or rendered.

**Architecture:** Server: a new `signature_events` table linked to the existing `filled_submissions` table, populated inside `POST /generate-pdf`'s existing best-effort submission-recording path, using a SHA-256 hash of the server's own generated PDF bytes (never trusting a client-supplied hash). Client: `FormFill.tsx` scans the loaded template's schema for `type: 'signature'` fields and renders one "Your Details" panel per field (a new component, `SignerDetailsPanel`) above the pdfme `Form`, gating Submit until every signature pad and its corresponding panel are filled; a new `Submissions.tsx` page (routed, nav-linked from `TemplateList.tsx`) lists past submissions and their signature events read-only.

**Tech Stack:** Node.js + Express + TypeScript + MSSQL (`mssql` package, `crypto` built-in for SHA-256) on the server; React 18 + TypeScript on the client. No new npm dependencies. No test runner exists in either `client/` or `server/` — verification is manual: typecheck plus live server/browser testing.

## Global Constraints

- The drawn signature image itself (`content` field of `type: 'signature'` schema fields) is completely unchanged — still a base64 PNG rendered by pdfme's stock, unmodified `signature` plugin. This plan never touches `packages/schemas/src/graphics/signature.ts`.
- One `signature_events` row per signature field per submission — a template with N signature fields produces N rows for a single submission, each potentially with a different name/email.
- `document_hash` is always computed server-side, from the exact PDF bytes the server generates in that same request — never accepted from the client.
- `signer_name`/`signer_email` per signature field ARE accepted from the client (there's nothing else that could supply them — this is self-attested by design) but are validated as non-empty strings before being trusted into the DB.
- Recording `signature_events` happens inside the SAME best-effort, non-blocking try/catch that already wraps `createFilledSubmission`/`createGeneratedPdf` in `POST /generate-pdf` — a failure to record signature evidence must never prevent the signer from receiving their generated PDF.
- The fill-flow UI change is purely additive: if a template has zero signature fields, `FormFill.tsx` behaves identically to today (no panels, no new validation, no behavior change at all).
- The "Your Details" panel layout is always shown when there is ≥1 signature field, regardless of count — no special-cased "skip the panel for exactly one field" behavior.
- The new Submissions view is read-only in this pass — no export, no download, no editing of audit data.
- `packages/schemas/src/graphics/signature.ts` and pdfme's `Form`/`Designer` components are not modified anywhere in this plan.

---

## File Structure

- **Modify:** `server/src/db.ts` — add `signature_events` table to `ensureTables()`, add `SignatureEventRow` type and CRUD functions (`createSignatureEvent`, `listSubmissionsForTemplate`, `listSignatureEventsForSubmission`).
- **Modify:** `server/src/routes/filledPdfs.ts` — accept `signatureEvents` in the request body, compute the SHA-256 hash, insert one row per event inside the existing best-effort try/catch.
- **Create:** `server/src/routes/submissions.ts` — new route: `GET /templates/:id/submissions` (list submissions + their signature events for a template).
- **Modify:** `server/src/index.ts` — mount the new `submissionsRouter`.
- **Modify:** `client/src/types.ts` — add `SubmissionSummary`/`SignatureEventRecord` types.
- **Modify:** `client/src/lib/api.ts` — extend `createFilledPdf` to accept/send `signatureEvents`; add `api.listSubmissions`.
- **Create:** `client/src/components/SignerDetailsPanel.tsx` — the "Your Details" panel component.
- **Modify:** `client/src/pages/FormFill.tsx` — scan for signature fields, render panels, validate, send `signatureEvents` on submit.
- **Create:** `client/src/pages/Submissions.tsx` — the new read-only audit-trail view.
- **Modify:** `client/src/App.tsx` — add the `/templates/:id/submissions` route (role-gated).
- **Modify:** `client/src/pages/TemplateList.tsx` — add a "Submissions" link per template row.

---

### Task 1: Server — `signature_events` table, CRUD, and `POST /generate-pdf` extension

**Files:**
- Modify: `server/src/db.ts`
- Modify: `server/src/routes/filledPdfs.ts`

**Interfaces:**
- Produces (for Task 4's `submissions.ts` route to also consume):
  ```ts
  export interface SignatureEventRow {
    id: string;
    submission_id: string;
    field_name: string;
    signer_name: string;
    signer_email: string;
    signed_at: string;
    ip_address: string | null;
    document_hash: string;
  }
  export async function createSignatureEvent(input: {
    submissionId: string;
    fieldName: string;
    signerName: string;
    signerEmail: string;
    ipAddress: string | null;
    documentHash: string;
  }): Promise<SignatureEventRow>
  export async function listSignatureEventsForSubmission(submissionId: string): Promise<SignatureEventRow[]>
  ```
  `signed_at` is `DATETIME2 NOT NULL DEFAULT GETUTCDATE()` — set by the database at insert time, not passed in by the caller (this guarantees the timestamp reflects when the record was actually written, consistent with how every other `_at` column in this schema already works, e.g. `submitted_at`/`generated_at`).

- [ ] **Step 1: Add the `signature_events` table to `ensureTables()`**

Read the current `server/src/db.ts` in full first to find the exact current end of `ensureTables()` (after the `letterheads` migration block, before `console.log('Tables ready');`). Insert a new table-creation block:

```ts
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'signature_events')
    CREATE TABLE signature_events (
      id              UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
      submission_id   UNIQUEIDENTIFIER NOT NULL REFERENCES filled_submissions(id) ON DELETE CASCADE,
      field_name      NVARCHAR(255)    NOT NULL,
      signer_name     NVARCHAR(255)    NOT NULL,
      signer_email    NVARCHAR(320)    NOT NULL,
      signed_at       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      ip_address      NVARCHAR(45)     NULL,
      document_hash   NVARCHAR(64)     NOT NULL
    )
  `);
```

`NVARCHAR(320)` for `signer_email` matches the RFC 5321 maximum email length. `NVARCHAR(45)` for `ip_address` accommodates the longest possible IPv6 textual representation. `NVARCHAR(64)` for `document_hash` is the exact length of a SHA-256 hex digest (32 bytes → 64 hex characters) — not `NVARCHAR(MAX)`, since this is a fixed-length value and a bounded column is both more correct and slightly cheaper. `ON DELETE CASCADE` matches this schema's existing convention for child rows tied to a parent that can be deleted (e.g. `filled_submissions` itself cascades from `pdf_templates`).

- [ ] **Step 2: Add the `SignatureEventRow` type**

Find the `// ─── Types ───` section (where `FilledSubmissionRow`, `GeneratedPdfRow` are defined) and add, after `GeneratedPdfRow`:

```ts
export interface SignatureEventRow {
  id: string;
  submission_id: string;
  field_name: string;
  signer_name: string;
  signer_email: string;
  signed_at: string;
  ip_address: string | null;
  document_hash: string;
}
```

- [ ] **Step 3: Add the CRUD functions**

At the end of the file (after the `letterheads` section), add a new section:

```ts
// ─── signature_events ───────────────────────────────────────────────────────

export async function createSignatureEvent(input: {
  submissionId: string;
  fieldName: string;
  signerName: string;
  signerEmail: string;
  ipAddress: string | null;
  documentHash: string;
}): Promise<SignatureEventRow> {
  const result = await getPool()
    .request()
    .input('submission_id', sql.UniqueIdentifier, input.submissionId)
    .input('field_name', sql.NVarChar(255), input.fieldName)
    .input('signer_name', sql.NVarChar(255), input.signerName)
    .input('signer_email', sql.NVarChar(320), input.signerEmail)
    .input('ip_address', sql.NVarChar(45), input.ipAddress)
    .input('document_hash', sql.NVarChar(64), input.documentHash)
    .query(`
      INSERT INTO signature_events (submission_id, field_name, signer_name, signer_email, ip_address, document_hash)
      OUTPUT INSERTED.id, INSERTED.submission_id, INSERTED.field_name, INSERTED.signer_name,
             INSERTED.signer_email, INSERTED.signed_at, INSERTED.ip_address, INSERTED.document_hash
      VALUES (@submission_id, @field_name, @signer_name, @signer_email, @ip_address, @document_hash)
    `);
  return result.recordset[0];
}

export async function listSignatureEventsForSubmission(submissionId: string): Promise<SignatureEventRow[]> {
  const result = await getPool()
    .request()
    .input('submission_id', sql.UniqueIdentifier, submissionId)
    .query(`
      SELECT id, submission_id, field_name, signer_name, signer_email, signed_at, ip_address, document_hash
      FROM signature_events
      WHERE submission_id = @submission_id
      ORDER BY signed_at ASC
    `);
  return result.recordset;
}
```

- [ ] **Step 4: Extend `POST /generate-pdf` to accept and record `signatureEvents`**

Read the current `server/src/routes/filledPdfs.ts` in full. Add the `crypto` import at the top:

```ts
import { createHash } from 'crypto';
```

Replace the request body destructuring and validation near the top of the route handler:

```ts
generatePdfRouter.post('/', async (req: Request, res: Response) => {
  const { template_id, inputs, version, tag, signatureEvents } = req.body as {
    template_id?: string;
    inputs?: Record<string, string>[];
    version?: number;
    tag?: string;
    signatureEvents?: { fieldName?: string; signerName?: string; signerEmail?: string }[];
  };

  if (!template_id || !Array.isArray(inputs) || inputs.length === 0) {
    res.status(400).json({ error: 'template_id and a non-empty inputs array are required' });
    return;
  }

  const validatedSignatureEvents: { fieldName: string; signerName: string; signerEmail: string }[] = [];
  if (signatureEvents !== undefined) {
    if (!Array.isArray(signatureEvents)) {
      res.status(400).json({ error: 'signatureEvents must be an array' });
      return;
    }
    for (const event of signatureEvents) {
      if (
        !event ||
        typeof event.fieldName !== 'string' || event.fieldName.trim().length === 0 ||
        typeof event.signerName !== 'string' || event.signerName.trim().length === 0 ||
        typeof event.signerEmail !== 'string' || event.signerEmail.trim().length === 0
      ) {
        res.status(400).json({ error: 'Each signatureEvents entry requires fieldName, signerName, and signerEmail' });
        return;
      }
      validatedSignatureEvents.push({
        fieldName: event.fieldName.trim(),
        signerName: event.signerName.trim(),
        signerEmail: event.signerEmail.trim(),
      });
    }
  }
```

Replace the existing best-effort submission-recording block (the inner `try { const submission = ...; await createGeneratedPdf(...); } catch (dbErr) { console.error(...); }`) to also record signature events, using the hash of the `pdf` bytes already generated earlier in this same handler:

```ts
    try {
      const submission = await createFilledSubmission(
        template_id,
        resolvedVersion.version,
        inputs
      );
      await createGeneratedPdf({
        submissionId: submission.id,
        templateId: template_id,
        templateVersion: resolvedVersion.version,
        inputsSnapshot: inputs,
        schemaSnapshot: resolvedVersion.schema,
        filePath: 'generated-in-memory',
        fileSizeBytes: pdf.length,
      });

      if (validatedSignatureEvents.length > 0) {
        const documentHash = createHash('sha256').update(pdf).digest('hex');
        const ipAddress = req.ip ?? null;
        for (const event of validatedSignatureEvents) {
          await createSignatureEvent({
            submissionId: submission.id,
            fieldName: event.fieldName,
            signerName: event.signerName,
            signerEmail: event.signerEmail,
            ipAddress,
            documentHash,
          });
        }
      }
    } catch (dbErr) {
      console.error('Failed to record submission/generated_pdf/signature_events:', dbErr);
    }
```

Update the import line at the top of the file to include `createSignatureEvent`:
```ts
import { getTemplate, getPublishedVersion, getLatestPublishedVersion, createFilledSubmission, createGeneratedPdf, createSignatureEvent } from '../db.js';
```

Note: `pdf` (the generated PDF `Buffer`/`Uint8Array`) is already computed earlier in this same handler via `const pdf = await generatePdf(resolvedVersion.schema as Template, inputs);` (unchanged) — the hash is computed from that exact same value, satisfying the constraint that the hash reflects the actual bytes the server generated and is about to send back to the client, not a separate or re-derived copy.

- [ ] **Step 5: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Start the server (`cd server && npm run dev`, on an alternate port if 3004 is in use by another process — verify ownership via `ps -p <pid> -o command` first). Confirm the log shows `Connected to MSSQL` / `Tables ready` with no thrown error, confirming the new `CREATE TABLE signature_events` statement is valid MSSQL syntax and executed successfully.

You'll need a real template ID with a published version to test `POST /generate-pdf` end-to-end — use `curl http://localhost:<port>/templates` to find an existing published template, or skip straight to a synthetic check: run

```bash
curl -s -X POST http://localhost:<port>/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"template_id":"<a real template id>","inputs":[{}],"signatureEvents":[{"fieldName":"sig1","signerName":"Test Signer","signerEmail":"test@example.com"}]}' \
  -o /tmp/test-generated.pdf -w "\nHTTP %{http_code}\n"
```

Expected: `200`, and `/tmp/test-generated.pdf` is a valid PDF. Then, if you have DB query access, confirm a new `signature_events` row exists for the resulting submission with the correct `field_name`/`signer_name`/`signer_email`, a non-null `document_hash` that is exactly 64 hex characters, and a `signed_at` close to the current time. If you don't have direct DB access, this will be independently verifiable once Task 4's `GET /templates/:id/submissions` route exists — note in your report that full end-to-end confirmation of the DB row's contents may need to wait for that route, and describe what you WERE able to confirm (the 200 response, the valid PDF, any server-side console output).

Also confirm the request works correctly with `signatureEvents` OMITTED entirely (existing callers, e.g. anything calling this route before Task 3's client changes ship, must be unaffected):

```bash
curl -s -X POST http://localhost:<port>/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"template_id":"<a real template id>","inputs":[{}]}' \
  -o /tmp/test-generated-2.pdf -w "\nHTTP %{http_code}\n"
```

Expected: `200`, identical behavior to before this task (no `signature_events` row inserted, since the array was empty/absent).

Kill the server process you started (verify PID ownership first).

- [ ] **Step 7: Commit**

```bash
git add server/src/db.ts server/src/routes/filledPdfs.ts
git commit -m "feat(server): capture signature audit trail on PDF generation"
```

---

### Task 2: Server — Submissions listing route

**Files:**
- Create: `server/src/routes/submissions.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `listSignatureEventsForSubmission`, `SignatureEventRow` from `../db.js` (Task 1). Needs a new `listSubmissionsForTemplate` function — add it to `server/src/db.ts` in this task (it did not exist before this plan; Task 1 did not add it since it's specific to the read-side Submissions feature, not the write-side signature-capture feature).
- Produces: mounted router `submissionsRouter`, exposing:
  - `GET /templates/:id/submissions` — returns `200` with an array of `{ id, template_id, template_version, submitted_at, signatureEvents: SignatureEventRow[] }`, most recent first. Returns `404` if the template itself doesn't exist.

- [ ] **Step 1: Add `listSubmissionsForTemplate` to `server/src/db.ts`**

Read the current `FilledSubmissionRow` type and the `filled_submissions` section of `server/src/db.ts` (search for `createFilledSubmission`) to place this new function correctly nearby. Add:

```ts
export async function listSubmissionsForTemplate(templateId: string): Promise<FilledSubmissionRow[]> {
  const result = await getPool()
    .request()
    .input('tid', sql.UniqueIdentifier, templateId)
    .query(`
      SELECT id, template_id, template_version, [inputs], submitted_at
      FROM filled_submissions
      WHERE template_id = @tid
      ORDER BY submitted_at DESC
    `);
  return result.recordset.map(row => ({
    ...row,
    inputs: JSON.parse(row.inputs as string),
  }));
}
```

(`JSON.parse` on `inputs` matches how every other JSON-blob column in this file is already deserialized on read, e.g. `parseVersionRow`, `parseLetterheadRow`.)

- [ ] **Step 2: Create the route**

```ts
// server/src/routes/submissions.ts
import { Router, Request, Response } from 'express';
import { getTemplate, listSubmissionsForTemplate, listSignatureEventsForSubmission } from '../db.js';

export const submissionsRouter = Router();

/**
 * @openapi
 * /templates/{id}/submissions:
 *   get:
 *     summary: List filled submissions for a template, including their signature audit events
 *     tags: [Submissions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Submissions for this template, most recent first
 *       404:
 *         description: Template not found
 */
submissionsRouter.get('/templates/:id/submissions', async (req: Request, res: Response) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const submissions = await listSubmissionsForTemplate(req.params.id);
    const withEvents = await Promise.all(
      submissions.map(async submission => ({
        id: submission.id,
        template_id: submission.template_id,
        template_version: submission.template_version,
        submitted_at: submission.submitted_at,
        signatureEvents: await listSignatureEventsForSubmission(submission.id),
      }))
    );

    res.json(withEvents);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});
```

Note: this route is mounted at the router's own top-level path (`/templates/:id/submissions`, registered directly on this router rather than nested under an existing `/templates` mount point), so `submissionsRouter` is mounted at the app root (`app.use(submissionsRouter)` in Task 2 Step 3, not `app.use('/templates', submissionsRouter)`) to avoid double-prefixing — this keeps it independent of `templatesRouter`'s own internal route definitions, which this task does not need to touch.

The `Promise.all` fan-out (one `listSignatureEventsForSubmission` call per submission) is acceptable here since a single template's submission history is not expected to be large enough for this to matter; no pagination is implemented in this pass (matches the spec's explicit scope — a simple read-only list).

- [ ] **Step 3: Mount the route in `server/src/index.ts`**

Read the current `server/src/index.ts` in full first (do not disturb the existing `/ai-form/detect-from-pdf` body-limit ordering). Add the import:
```ts
import { submissionsRouter } from './routes/submissions.js';
```
and mount it at the app root (since the route itself already declares the full `/templates/:id/submissions` path):
```ts
app.use(submissionsRouter);
```
Place this mount alongside the other simple JSON routers (e.g. after `app.use('/letterheads', letterheadsRouter);`).

- [ ] **Step 4: Typecheck**

Run: `cd server && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Start the server (alternate port if needed, confirm process ownership). Using the template ID and submission created in Task 1's verification (if that server run is still available, otherwise create a fresh one the same way):

```bash
curl -s http://localhost:<port>/templates/<template id>/submissions -w "\nHTTP %{http_code}\n"
```

Expected: `200` with a JSON array; if you completed Task 1's `signatureEvents`-included test, the first (most recent) submission's `signatureEvents` array should contain exactly one entry with `field_name: "sig1"`, `signer_name: "Test Signer"`, `signer_email: "test@example.com"`, a 64-character `document_hash`, and a `signed_at` timestamp — this is the point where Task 1's DB-row claim becomes independently verifiable via HTTP rather than requiring direct DB access.

```bash
curl -s http://localhost:<port>/templates/00000000-0000-0000-0000-000000000000/submissions -w "\nHTTP %{http_code}\n"
```

Expected: `404` (nonexistent template).

Kill the server process (verify PID ownership first).

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts server/src/routes/submissions.ts server/src/index.ts
git commit -m "feat(server): add submissions listing route with signature events"
```

---

### Task 3: Client — API, types, and `SignerDetailsPanel` component

**Files:**
- Modify: `client/src/types.ts`
- Modify: `client/src/lib/api.ts`
- Create: `client/src/components/SignerDetailsPanel.tsx`

**Interfaces:**
- Consumes: Task 1's extended `POST /generate-pdf`, Task 2's `GET /templates/:id/submissions`.
- Produces:
  ```ts
  // client/src/types.ts
  export interface SignatureEventRecord {
    id: string;
    submission_id: string;
    field_name: string;
    signer_name: string;
    signer_email: string;
    signed_at: string;
    ip_address: string | null;
    document_hash: string;
  }
  export interface SubmissionRecord {
    id: string;
    template_id: string;
    template_version: number;
    submitted_at: string;
    signatureEvents: SignatureEventRecord[];
  }
  // client/src/lib/api.ts
  createFilledPdf(template_id, inputs, versionRef?, signatureEvents?: { fieldName: string; signerName: string; signerEmail: string }[]): Promise<void>
  listSubmissions(templateId: string): Promise<SubmissionRecord[]>
  ```
  `SignerDetailsPanel`'s own props:
  ```tsx
  export default function SignerDetailsPanel(props: {
    fieldLabel: string;
    name: string;
    email: string;
    onNameChange: (value: string) => void;
    onEmailChange: (value: string) => void;
  }): JSX.Element
  ```
  A fully controlled component (no internal state) — `FormFill.tsx` (Task 4... wait, Task 4 in THIS plan's numbering is the client Submissions page; the panel is wired into `FormFill.tsx` in a later step of this same Task 3, not a separate task) owns the actual name/email values in its own state, one pair per signature field.

- [ ] **Step 1: Add the types**

In `client/src/types.ts`, add:

```ts
export interface SignatureEventRecord {
  id: string;
  submission_id: string;
  field_name: string;
  signer_name: string;
  signer_email: string;
  signed_at: string;
  ip_address: string | null;
  document_hash: string;
}

export interface SubmissionRecord {
  id: string;
  template_id: string;
  template_version: number;
  submitted_at: string;
  signatureEvents: SignatureEventRecord[];
}
```

- [ ] **Step 2: Extend `api.ts`**

Read the current `client/src/lib/api.ts` in full. Add `SubmissionRecord` to the existing type-only import line. Replace the existing `createFilledPdf` method:

```ts
  createFilledPdf: async (
    template_id: string,
    inputs: Record<string, string>[],
    versionRef?: PublishedVersionRef,
    signatureEvents?: { fieldName: string; signerName: string; signerEmail: string }[]
  ) => {
    const res = await fetch(API_BASE + "/generate-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id,
        inputs,
        ...(versionRef && "version" in versionRef ? { version: versionRef.version } : {}),
        ...(versionRef && "tag" in versionRef ? { tag: versionRef.tag } : {}),
        ...(signatureEvents && signatureEvents.length > 0 ? { signatureEvents } : {}),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${text}`);
    }
  },
```

Add a new method after the existing letterhead methods:

```ts
  listSubmissions: (templateId: string) => request<SubmissionRecord[]>(`/templates/${templateId}/submissions`),
```

`signatureEvents` is only included in the request body when non-empty (matching Task 1's server-side handling of it as fully optional) — a template with no signature fields sends exactly the same request shape as before this plan, unchanged.

- [ ] **Step 3: Create `SignerDetailsPanel.tsx`**

```tsx
// client/src/components/SignerDetailsPanel.tsx
export default function SignerDetailsPanel(props: {
  fieldLabel: string;
  name: string;
  email: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
}) {
  const { fieldLabel, name, email, onNameChange, onEmailChange } = props;

  return (
    <div
      style={{
        border: '1px solid #e6e6e6',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        background: '#fff',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#000', marginBottom: 10 }}>
        Details for: {fieldLabel}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.55)', marginBottom: 4 }}>
            Full name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Jane Doe"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e6e6e6', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(0,0,0,0.55)', marginBottom: 4 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="jane@example.com"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e6e6e6', fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
      </div>
    </div>
  );
}
```

Fully controlled, no internal state — the parent (`FormFill.tsx`, this task's Step 4) owns one `{name, email}` pair per signature field and passes them down.

- [ ] **Step 4: Wire signature-field scanning and panels into `FormFill.tsx`**

Read the current `client/src/pages/FormFill.tsx` in full (178 lines). Add the import:
```tsx
import SignerDetailsPanel from '../components/SignerDetailsPanel.js';
```

Add a helper to extract signature fields from the loaded template, placed near the top of the file (module scope, not inside the component). Verified against the actual `Schema` zod type (`packages/common/src/schema.ts:124-140`): `type` is a plain `z.string()` (not a literal union) and `name` is always present unconditionally, so no type-predicate narrowing is needed — a plain filter is both correct and simpler:

```tsx
function getSignatureFields(template: Template): { name: string }[] {
  return template.schemas
    .flat()
    .filter(schema => schema.type === 'signature')
    .map(schema => ({ name: schema.name }));
}
```

Add new state inside the `FormFill` component, alongside the existing `templateRecord`/`pageState`/etc. state:

```tsx
const [signerDetails, setSignerDetails] = useState<Record<string, { name: string; email: string }>>({});
```

Add a `useEffect` that (re)initializes `signerDetails` whenever `templateRecord` changes, so each signature field starts with an empty `{name: '', email: ''}` pair:

```tsx
useEffect(() => {
  if (!templateRecord) return;
  const fields = getSignatureFields(templateRecord.schema);
  setSignerDetails(prev => {
    const next: Record<string, { name: string; email: string }> = {};
    for (const f of fields) {
      next[f.name] = prev[f.name] ?? { name: '', email: '' };
    }
    return next;
  });
}, [templateRecord]);
```

Add a derived boolean for whether all signer details are filled in, computed inline in the render (not memoized — this file has no existing `useMemo` usage, matching its current style):

```tsx
const signatureFields = templateRecord ? getSignatureFields(templateRecord.schema) : [];
const allSignerDetailsFilled = signatureFields.every(
  f => signerDetails[f.name]?.name.trim() && signerDetails[f.name]?.email.trim()
);
```

Update `handleSubmit` to also gather and send `signatureEvents`, and to be blocked if `allSignerDetailsFilled` is false (in addition to any existing guard). Read the CURRENT `handleSubmit` in full first, then modify it: after `const inputs = (uiRef.current as Form).getInputs();`, add:

```tsx
      if (!allSignerDetailsFilled) {
        setError('Please fill in the signer details for every signature field before submitting.');
        setSubmitting(false);
        return;
      }

      const signatureEvents = signatureFields.map(f => ({
        fieldName: f.name,
        signerName: signerDetails[f.name].name.trim(),
        signerEmail: signerDetails[f.name].email.trim(),
      }));
```

and pass `signatureEvents` as the new fourth argument where `api.createFilledPdf` is called:
```tsx
      await api.createFilledPdf(id, inputs, versionRef, signatureEvents);
```

Update the JSX to render one `SignerDetailsPanel` per signature field, above the `<div ref={containerRef} .../>` that hosts the embedded pdfme `Form`, only during `pageState === 'filling'`:

```tsx
      {pageState === 'filling' && signatureFields.length > 0 && (
        <div style={{ padding: '12px 16px', background: '#f7f7f5', borderBottom: '1px solid #e6e6e6' }}>
          {signatureFields.map(f => (
            <SignerDetailsPanel
              key={f.name}
              fieldLabel={f.name}
              name={signerDetails[f.name]?.name ?? ''}
              email={signerDetails[f.name]?.email ?? ''}
              onNameChange={value => setSignerDetails(prev => ({ ...prev, [f.name]: { ...prev[f.name], name: value } }))}
              onEmailChange={value => setSignerDetails(prev => ({ ...prev, [f.name]: { ...prev[f.name], email: value } }))}
            />
          ))}
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-hidden" />
```

Also update the existing "Generate PDF" submit button's `disabled` prop (currently `disabled={submitting}`) to additionally require `allSignerDetailsFilled`:
```tsx
disabled={submitting || !allSignerDetailsFilled}
```

- [ ] **Step 5: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Start both server and client dev servers (alternate ports if needed, confirm process ownership). If a browser is available:
1. Publish (or use an existing published) template that has at least one signature field. Open its fill link (`/templates/:id/fill`).
2. Confirm a "Details for: <field name>" panel appears above the form, with empty Full name / Email inputs.
3. Confirm "Generate PDF" is disabled until BOTH the signature pad is drawn on AND the name/email panel is filled in.
4. Fill in name, email, draw a signature, fill any other required fields, click "Generate PDF". Confirm it succeeds (produces the preview/download as before).
5. Open a DIFFERENT template with NO signature fields. Confirm the fill page looks and behaves exactly as it did before this plan — no panel, no extra validation, `disabled={submitting}` behaving as it always did.

If no browser is available, perform a careful code-path walkthrough (signature-field scanning, panel rendering per field, the `allSignerDetailsFilled` gate, the `signatureEvents` payload construction) and describe it in detail in your report, being explicit about which method you used.

- [ ] **Step 7: Commit**

```bash
git add client/src/types.ts client/src/lib/api.ts client/src/components/SignerDetailsPanel.tsx client/src/pages/FormFill.tsx
git commit -m "feat(form-fill): capture signer name/email for each signature field"
```

---

### Task 4: Client — Submissions view, routing, and navigation

**Files:**
- Create: `client/src/pages/Submissions.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/TemplateList.tsx`

**Interfaces:**
- Consumes: `api.listSubmissions` from `../lib/api.js` (Task 3).

- [ ] **Step 1: Create the Submissions page**

```tsx
// client/src/pages/Submissions.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import type { SubmissionRecord } from '../types.js';
import { AppLayout } from '../components/layout/AppLayout.js';
import { TopBar } from '../components/layout/TopBar.js';
import { Card } from '../components/ui/card.js';

export default function Submissions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.listSubmissions(id)
      .then(setSubmissions)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <AppLayout>
      <TopBar title="Submissions" />
      <div className="p-6 space-y-4">
        <button
          onClick={() => navigate('/templates')}
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: 'rgba(0,0,0,0.55)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Templates
        </button>

        {error && (
          <div className="flex items-center gap-2 rounded-[var(--nx-radius-sm)] p-3 text-sm" style={{ background: 'var(--nx-destructive-tint)', color: 'var(--nx-destructive)' }}>
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>Loading…</p>
        ) : submissions.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--nx-ink-muted)' }}>No submissions yet.</p>
        ) : (
          <div className="space-y-3">
            {submissions.map(s => (
              <Card key={s.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: 'var(--nx-ink)' }}>
                    Version {s.template_version}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--nx-ink-muted)' }}>
                    {new Date(s.submitted_at).toLocaleString()}
                  </span>
                </div>
                {s.signatureEvents.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--nx-ink-muted)' }}>No signature fields on this submission.</p>
                ) : (
                  <div className="space-y-2">
                    {s.signatureEvents.map(evt => (
                      <div
                        key={evt.id}
                        className="text-xs"
                        style={{ padding: '8px 10px', background: 'var(--nx-surface)', borderRadius: 8 }}
                      >
                        <div style={{ fontWeight: 600, color: 'var(--nx-ink)' }}>{evt.field_name}</div>
                        <div style={{ color: 'var(--nx-ink-secondary)' }}>
                          {evt.signer_name} &lt;{evt.signer_email}&gt;
                        </div>
                        <div style={{ color: 'var(--nx-ink-muted)', fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>
                          Signed {new Date(evt.signed_at).toLocaleString()}
                          {evt.ip_address ? ` from ${evt.ip_address}` : ''}
                        </div>
                        <div style={{ color: 'var(--nx-ink-muted)', fontFamily: "'Geist Mono', monospace", fontSize: 10, wordBreak: 'break-all' }}>
                          SHA-256: {evt.document_hash}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
```

Before finalizing, read `client/src/components/layout/TopBar.tsx` and `client/src/components/ui/card.tsx` to confirm their prop signatures match this usage (`<TopBar title="..." />`, `<Card className="...">`) — these were already verified against real source in an earlier plan this session (the company assets library plan) and found to match this exact usage pattern; re-confirm they haven't changed since, but no change is expected.

- [ ] **Step 2: Add the route**

In `client/src/App.tsx`, add the lazy import:
```tsx
const Submissions = lazy(() => import('./pages/Submissions.js'));
```
and a new route, following the same `RoleGuard` pattern as `/assets`/`/letterheads`:
```tsx
<Route
  path="/templates/:id/submissions"
  element={
    <RoleGuard allowed={['Admin', 'Designer']}>
      <Submissions />
    </RoleGuard>
  }
/>
```

- [ ] **Step 3: Add a "Submissions" link to each template row**

Read the current `client/src/pages/TemplateList.tsx` in full to find the exact current row-action area (near the existing `<Link to={`/templates/${t.id}/fill`}>`/`<Link to={`/templates/${t.id}/edit`}>` links — there appear to be two such areas in the current file, a compact list view and a grid/card view; add the new link in both, matching each area's existing styling convention exactly). Add, alongside the existing Edit link:

```tsx
<Link to={`/templates/${t.id}/submissions`}>
  {/* match the exact button/icon styling of the neighboring Edit link in this same view */}
</Link>
```

Pick an appropriate `lucide-react` icon (e.g. `ClipboardList` or `FileCheck` — check this file's current icon import line first and pick one not already imported, or reuse one if an appropriate icon is already imported for a similar purpose) with a label like "Submissions".

- [ ] **Step 4: Typecheck**

Run: `cd client && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Start both server and client dev servers (alternate ports if needed). If a browser is available:
1. Navigate to `/templates`. Confirm each template row now has a "Submissions" link/button alongside Edit/Fill.
2. Click it for a template that has at least one submission with signature events (from Task 3's verification). Confirm the Submissions page loads, shows the submission with its version/timestamp, and shows the signature event(s) with name, email, signed-at, IP (if captured), and the full SHA-256 hash.
3. Navigate to a template with zero submissions. Confirm "No submissions yet." renders cleanly, no error.
4. Confirm a nonexistent template ID in the URL produces a clean error (via the `error` state banner), not a crash.

If no browser is available, perform a careful code-path walkthrough and describe it in detail in your report.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Submissions.tsx client/src/App.tsx client/src/pages/TemplateList.tsx
git commit -m "feat(submissions): add read-only signature audit trail view"
```

---

## Self-Review Notes

- **Spec coverage:** Every behavior in `docs/superpowers/specs/2026-07-31-self-attested-signature-audit-trail-design.md` is covered — the `signature_events` table with all five evidentiary fields (name, email, timestamp, IP, hash) per signature field per submission (Task 1), server-side-only hash computation from the actual generated PDF bytes (Task 1 Step 4, explicitly never trusting a client-supplied hash), the "Your Details" panel shown for every signature-field count including exactly one (Task 3 Step 4, no special-casing), Submit blocked until all signatures + details are filled (Task 3's `allSignerDetailsFilled` gate), the best-effort/non-blocking recording path preserved (Task 1 Step 4 keeps the same try/catch), zero-signature-field templates behaving identically to before this plan (Task 3 Step 4's `signatureFields.length > 0` guard on rendering, and Task 1's `validatedSignatureEvents.length > 0` guard on inserting), and the new read-only Submissions view (Task 4).
- **Placeholder scan:** No TBD/TODO; all four tasks contain complete code.
- **Type consistency:** Server `SignatureEventRow` (Task 1) → client `SignatureEventRecord` (Task 3) match field-for-field. `listSubmissionsForTemplate`'s return type (`FilledSubmissionRow[]`, Task 2) is transformed into the route's `{...submission, signatureEvents}` response shape (Task 2 Step 2), which matches client `SubmissionRecord` (Task 3) exactly. `api.createFilledPdf`'s new fourth parameter shape (Task 3 Step 2) matches exactly what `FormFill.tsx`'s `handleSubmit` constructs (Task 3 Step 4) and what the server's `POST /generate-pdf` validates (Task 1 Step 4: `fieldName`/`signerName`/`signerEmail`, all required non-empty strings).
- **Task ordering:** Task 1 → Task 2 (needs Task 1's `signature_events` table/types to exist, though Task 2 also adds its own new `listSubmissionsForTemplate` function to `db.ts` independently) → Task 3 (needs Task 1's extended `POST /generate-pdf` and Task 2's `GET /templates/:id/submissions` route) → Task 4 (needs Task 3's `api.listSubmissions`). Strictly sequential.
- **Constraint verified during planning, not assumed:** confirmed `node:crypto`'s `createHash`/`randomUUID` pattern is already in live use elsewhere in this codebase (`server/src/routes/assets.ts`'s `randomUUID()` import) — Task 1's `createHash('sha256')` usage follows an already-established, working dependency, not a new one.
- **Deliberate scope boundary respected throughout:** no task in this plan touches `packages/schemas/src/graphics/signature.ts` or any pdfme `Form`/`Designer` internals — every new UI element (`SignerDetailsPanel`, the Submissions page) is a plain, independent React component composed alongside pdfme's existing components, never inside or forking them, matching the spec's explicit rejection of the plugin-modification approach during brainstorming.

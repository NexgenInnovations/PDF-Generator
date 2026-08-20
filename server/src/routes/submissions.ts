// server/src/routes/submissions.ts
import { Router, Response } from 'express';
import {
  getTemplate,
  listSubmissionsForTemplate,
  listSignatureEventsForSubmission,
  listSubmissionFoldersForOrg,
  getGeneratedPdfBySubmissionId,
  getGeneratedPdf,
} from '../db.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

export const submissionsRouter = Router();

const FILLED_PDFS_BUCKET = 'filled-pdfs';

/**
 * @openapi
 * /submissions:
 *   get:
 *     summary: List one "folder" per published template in the caller's organization, with its submission count
 *     tags: [Submissions]
 *     responses:
 *       200:
 *         description: Folders, alphabetical by template name
 */
submissionsRouter.get('/submissions', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
  try {
    const folders = await listSubmissionFoldersForOrg(req.auth!.orgId!);
    res.json(folders);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /generated-pdfs/{id}/file:
 *   get:
 *     summary: Download the stored PDF for a submission
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
 *         description: The raw PDF bytes
 *       404:
 *         description: Not found, or nothing was stored for this submission
 */
submissionsRouter.get('/generated-pdfs/:id/file', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
  try {
    const record = await getGeneratedPdf(req.params.id, req.auth!.orgId!);
    if (!record) {
      res.status(404).json({ error: 'Submission not found' });
      return;
    }
    // Older rows (pre-dating storage) and rows whose upload failed at
    // generation time don't have a real object in the bucket — a 404 here,
    // not a 500, since nothing was ever stored for them.
    const { data, error: downloadError } = await supabaseAdmin.storage.from(FILLED_PDFS_BUCKET).download(record.file_path);
    if (downloadError || !data) {
      res.status(404).json({ error: 'No stored PDF for this submission' });
      return;
    }
    const bytes = Buffer.from(await data.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="submission-${record.id}.pdf"`);
    res.send(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

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
submissionsRouter.get('/templates/:id/submissions', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
  try {
    const template = await getTemplate(req.params.id, req.auth!.orgId!);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const submissions = await listSubmissionsForTemplate(req.params.id);
    const withEvents = await Promise.all(
      submissions.map(async submission => {
        const generatedPdf = await getGeneratedPdfBySubmissionId(submission.id);
        return {
          id: submission.id,
          template_id: submission.template_id,
          template_version: submission.template_version,
          submitter_name: submission.submitter_name,
          submitter_email: submission.submitter_email,
          submitted_at: submission.submitted_at,
          signatureEvents: await listSignatureEventsForSubmission(submission.id),
          generatedPdfId: generatedPdf?.id ?? null,
          fileSizeBytes: generatedPdf?.file_size_bytes ?? null,
        };
      })
    );

    res.json(withEvents);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

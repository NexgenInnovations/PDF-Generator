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

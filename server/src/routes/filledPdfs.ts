import { Router, Request, Response } from 'express';
import { generatePdf } from '../services/pdfService.js';
import { getTemplate, getLatestTemplateVersion } from '../db.js';
import type { Template } from '@pdfme/common';

export const generatePdfRouter = Router();

/**
 * @openapi
 * /api/generate-pdf:
 *   post:
 *     summary: Generate a PDF from a template and return it as a binary file
 *     tags: [PDF Generation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [template_id, inputs]
 *             properties:
 *               template_id:
 *                 type: string
 *                 format: uuid
 *                 example: "527f8122-2009-4e84-b56b-dad77675da08"
 *               inputs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   additionalProperties:
 *                     type: string
 *                 example: [{"field1": "NEXGEN", "field2": "123"}]
 *     responses:
 *       200:
 *         description: PDF file binary
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Template not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
generatePdfRouter.post('/', async (req: Request, res: Response) => {
  const { template_id, inputs } = req.body as {
    template_id?: string;
    inputs?: Record<string, string>[];
  };

  if (!template_id || !inputs) {
    res.status(400).json({ error: 'template_id and inputs are required' });
    return;
  }

  try {
    const record = await getTemplate(template_id);
    if (!record) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const latestVersion = await getLatestTemplateVersion(template_id);
    if (!latestVersion) {
      res.status(404).json({ error: 'No template version found' });
      return;
    }

    const pdf = await generatePdf(latestVersion.schema as Template, inputs);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="generated.pdf"');
    res.setHeader('Content-Length', pdf.length);
    res.status(200).send(pdf);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

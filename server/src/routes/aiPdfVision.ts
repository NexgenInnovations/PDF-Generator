import { Router, Request, Response } from 'express';
import { runAiPdfVisionDetection } from '../services/aiPdfVisionService.js';

export const aiPdfVisionRouter = Router();

/**
 * @openapi
 * /ai-form/detect-from-pdf:
 *   post:
 *     summary: Detect form fields from page images of a flat PDF using AI vision, and generate a pdfme template
 *     tags: [AI Form Builder]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [images]
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   description: A data URL (data:image/jpeg;base64,...) for one page, in page order
 *     responses:
 *       200:
 *         description: The generated template
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 template:
 *                   type: object
 *       400:
 *         description: Missing or invalid images array
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: AI detection failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiPdfVisionRouter.post('/detect-from-pdf', async (req: Request, res: Response) => {
  const { images } = req.body as { images?: string[] };

  if (!Array.isArray(images) || images.length === 0 || !images.every(i => typeof i === 'string')) {
    res.status(400).json({ error: 'images is required and must be a non-empty array of strings' });
    return;
  }

  try {
    const result = await runAiPdfVisionDetection(images);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

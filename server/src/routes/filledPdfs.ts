import { Router, Request, Response } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateAndSavePdf } from '../services/pdfService.js';
import type { Template } from '@pdfme/common';
import { createFilledPdf, getFilledPdf, getTemplate, listFilledPdfs } from '../storage.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUTS_DIR = join(__dirname, '..', '..', 'outputs');

export const filledPdfsRouter = Router();

const handleError = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  console.error(error);
  res.status(500).json({ error: message });
};

/**
 * @openapi
 * /filled-pdfs:
 *   get:
 *     summary: List all filled PDF records
 *     tags: [Filled PDFs]
 *     responses:
 *       200:
 *         description: Array of filled PDF records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FilledPdfRecord'
 */
filledPdfsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(await listFilledPdfs());
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /filled-pdfs/{id}:
 *   get:
 *     summary: Get a filled PDF record by ID
 *     tags: [Filled PDFs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Filled PDF record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FilledPdfRecord'
 *       404:
 *         description: Record not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
filledPdfsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const record = await getFilledPdf(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Filled PDF not found' });
      return;
    }
    res.json(record);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /filled-pdfs/{id}/download:
 *   get:
 *     summary: Download the generated PDF file
 *     tags: [Filled PDFs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: PDF file stream
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Record or file not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
filledPdfsRouter.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const record = await getFilledPdf(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Filled PDF not found' });
      return;
    }

    const filePath = join(OUTPUTS_DIR, record.file_path.replace(/^outputs\//, ''));

    try {
      await stat(filePath);
    } catch {
      res.status(404).json({ error: 'PDF file not found on disk' });
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${record.id}.pdf"`);
    createReadStream(filePath).pipe(res);
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /filled-pdfs:
 *   post:
 *     summary: Generate a PDF from a template and save it
 *     tags: [Filled PDFs]
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
 *               inputs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   additionalProperties:
 *                     type: string
 *     responses:
 *       201:
 *         description: Created filled PDF record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FilledPdfRecord'
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
filledPdfsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { template_id, inputs } = req.body as {
      template_id: string;
      inputs: Record<string, string>[];
    };

    if (!template_id || !inputs) {
      res.status(400).json({ error: 'template_id and inputs are required' });
      return;
    }

    const templateRecord = await getTemplate(template_id);
    if (!templateRecord) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const template = templateRecord.schema as Template;
    const filePath = await generateAndSavePdf(template, inputs);

    res.status(201).json(await createFilledPdf(template_id, inputs, filePath));
  } catch (error) {
    handleError(res, error);
  }
});

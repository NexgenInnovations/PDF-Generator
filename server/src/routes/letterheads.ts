// server/src/routes/letterheads.ts
import { Router, Request, Response } from 'express';
import { listLetterheads, getLetterhead, createLetterhead, updateLetterhead, deleteLetterhead } from '../db.js';

export const letterheadsRouter = Router();

/**
 * @openapi
 * /letterheads:
 *   post:
 *     summary: Create a new letterhead
 *     tags: [Letterheads]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, staticSchema, pageWidth, pageHeight]
 *             properties:
 *               name:
 *                 type: string
 *               staticSchema:
 *                 type: array
 *               pageWidth:
 *                 type: number
 *               pageHeight:
 *                 type: number
 *     responses:
 *       201:
 *         description: The created letterhead
 *       400:
 *         description: Missing or invalid fields
 */
letterheadsRouter.post('/', async (req: Request, res: Response) => {
  const { name, type, staticSchema, pageWidth, pageHeight, basePdf } = req.body as {
    name?: string;
    type?: 'fields' | 'pdf';
    staticSchema?: unknown;
    pageWidth?: number;
    pageHeight?: number;
    basePdf?: string;
  };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const resolvedType: 'fields' | 'pdf' = type === 'pdf' ? 'pdf' : 'fields';

  if (resolvedType === 'fields') {
    if (!Array.isArray(staticSchema)) {
      res.status(400).json({ error: 'staticSchema is required and must be an array' });
      return;
    }
    if (typeof pageWidth !== 'number' || typeof pageHeight !== 'number') {
      res.status(400).json({ error: 'pageWidth and pageHeight are required numbers' });
      return;
    }
  } else {
    if (!basePdf || typeof basePdf !== 'string') {
      res.status(400).json({ error: 'basePdf is required and must be a string' });
      return;
    }
  }

  try {
    const letterhead = await createLetterhead({
      name: name.trim(),
      type: resolvedType,
      staticSchema: resolvedType === 'fields' ? staticSchema : undefined,
      pageWidth: resolvedType === 'fields' ? pageWidth : undefined,
      pageHeight: resolvedType === 'fields' ? pageHeight : undefined,
      basePdf: resolvedType === 'pdf' ? basePdf : undefined,
    });
    res.status(201).json(letterhead);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /letterheads:
 *   get:
 *     summary: List all letterheads (metadata only)
 *     tags: [Letterheads]
 *     responses:
 *       200:
 *         description: All letterheads
 */
letterheadsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const letterheads = await listLetterheads();
    res.json(letterheads);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /letterheads/{id}:
 *   get:
 *     summary: Get a single letterhead, including its full static schema
 *     tags: [Letterheads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The letterhead
 *       404:
 *         description: Letterhead not found
 */
letterheadsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const letterhead = await getLetterhead(req.params.id);
    if (!letterhead) {
      res.status(404).json({ error: 'Letterhead not found' });
      return;
    }
    res.json(letterhead);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /letterheads/{id}:
 *   put:
 *     summary: Update a letterhead (partial update — omit fields to leave them unchanged)
 *     tags: [Letterheads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               staticSchema:
 *                 type: array
 *               pageWidth:
 *                 type: number
 *               pageHeight:
 *                 type: number
 *     responses:
 *       200:
 *         description: The updated letterhead
 *       404:
 *         description: Letterhead not found
 */
letterheadsRouter.put('/:id', async (req: Request, res: Response) => {
  const { name, staticSchema, pageWidth, pageHeight, basePdf } = req.body as {
    name?: string;
    staticSchema?: unknown;
    pageWidth?: number;
    pageHeight?: number;
    basePdf?: string;
  };

  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  if (staticSchema !== undefined && !Array.isArray(staticSchema)) {
    res.status(400).json({ error: 'staticSchema must be an array' });
    return;
  }
  if (basePdf !== undefined && typeof basePdf !== 'string') {
    res.status(400).json({ error: 'basePdf must be a string' });
    return;
  }

  try {
    const updated = await updateLetterhead(req.params.id, {
      name: name?.trim(),
      staticSchema,
      pageWidth,
      pageHeight,
      basePdf,
    });
    if (!updated) {
      res.status(404).json({ error: 'Letterhead not found' });
      return;
    }
    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /letterheads/{id}:
 *   delete:
 *     summary: Delete a letterhead
 *     tags: [Letterheads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted
 */
letterheadsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteLetterhead(req.params.id);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

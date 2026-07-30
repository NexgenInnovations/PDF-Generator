import { Router, Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listAssets, getAsset, createAsset, deleteAsset } from '../db.js';

export const assetsRouter = Router();

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/svg+xml': '.svg',
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/**
 * @openapi
 * /assets:
 *   post:
 *     summary: Upload a company asset (logo/image)
 *     tags: [Company Assets]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, name]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: The created asset
 *       400:
 *         description: Missing file, missing name, or unsupported file type
 */
assetsRouter.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const file = req.file;
  const name = (req.body as { name?: string }).name;

  if (!file) {
    res.status(400).json({ error: 'file is required' });
    return;
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const ext = ALLOWED_MIME_TYPES[file.mimetype];
  if (!ext) {
    res.status(400).json({ error: `Unsupported file type: ${file.mimetype}. Allowed: PNG, JPEG, SVG.` });
    return;
  }

  const filename = `${randomUUID()}${ext}`;
  const filePath = path.join(ASSETS_DIR, filename);

  try {
    await fs.mkdir(ASSETS_DIR, { recursive: true });
    await fs.writeFile(filePath, file.buffer);

    const asset = await createAsset({
      name: name.trim(),
      filePath,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
    });
    res.status(201).json(asset);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /assets:
 *   get:
 *     summary: List all company assets
 *     tags: [Company Assets]
 *     responses:
 *       200:
 *         description: All assets (metadata only)
 */
assetsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const assets = await listAssets();
    res.json(assets);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /assets/{id}/file:
 *   get:
 *     summary: Download the raw file for an asset
 *     tags: [Company Assets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The raw file bytes
 *       404:
 *         description: Asset not found
 */
assetsRouter.get('/:id/file', async (req: Request, res: Response) => {
  try {
    const asset = await getAsset(req.params.id);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    const bytes = await fs.readFile(asset.file_path);
    res.setHeader('Content-Type', asset.mime_type);
    res.send(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

/**
 * @openapi
 * /assets/{id}:
 *   delete:
 *     summary: Delete a company asset
 *     tags: [Company Assets]
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
 *       404:
 *         description: Asset not found
 */
assetsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await deleteAsset(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    try {
      await fs.unlink(deleted.file_path);
    } catch (fileErr) {
      console.warn(`Could not delete asset file at ${deleted.file_path}:`, fileErr);
    }
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

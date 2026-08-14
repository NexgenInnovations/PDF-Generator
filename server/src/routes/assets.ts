import { Router, Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { randomUUID } from 'crypto';
import { listAssets, getAsset, createAsset, deleteAsset } from '../db.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

export const assetsRouter = Router();

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/svg+xml': '.svg',
};

const BUCKET = 'company-assets';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File is too large. Maximum size is 10MB.' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Upload failed';
    res.status(400).json({ error: message });
  });
}

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
assetsRouter.post('/', requireAuth, requireRole(['Admin', 'Designer']), handleUpload, async (req: AuthedRequest, res: Response) => {
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

  try {
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(filename, file.buffer, { contentType: file.mimetype });
    if (uploadError) throw uploadError;

    const asset = await createAsset({
      name: name.trim(),
      filePath: filename,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      orgId: req.auth!.orgId!,
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
assetsRouter.get('/', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
  try {
    const assets = await listAssets(req.auth!.orgId!);
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
assetsRouter.get('/:id/file', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
  try {
    const asset = await getAsset(req.params.id, req.auth!.orgId!);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    const { data, error: downloadError } = await supabaseAdmin.storage.from(BUCKET).download(asset.file_path);
    if (downloadError || !data) throw downloadError ?? new Error('File not found in storage');
    const bytes = Buffer.from(await data.arrayBuffer());
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
assetsRouter.delete('/:id', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
  try {
    const deleted = await deleteAsset(req.params.id, req.auth!.orgId!);
    if (!deleted) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    const { error: removeError } = await supabaseAdmin.storage.from(BUCKET).remove([deleted.file_path]);
    if (removeError) {
      console.warn(`Could not delete asset file "${deleted.file_path}" from storage:`, removeError);
    }
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

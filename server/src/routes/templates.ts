import { Router, Request, Response } from 'express';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import {
  createTemplate,
  deleteTemplate,
  getDraft,
  getLatestPublishedVersion,
  getPublishedVersion,
  getTemplate,
  listPublishedVersions,
  listTemplates,
  publishVersion,
  saveDraft,
  updateTemplate,
} from '../db.js';

export const templatesRouter = Router();

const handleError = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  console.error(error);
  res.status(500).json({ error: message });
};

/**
 * @openapi
 * /templates:
 *   get:
 *     summary: List all templates
 *     tags: [Templates]
 *     responses:
 *       200:
 *         description: Array of template summaries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TemplateSummary'
 */
templatesRouter.get('/', requireAuth, async (_req: AuthedRequest, res: Response) => {
  try {
    res.json(await listTemplates());
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /templates/{id}:
 *   get:
 *     summary: Get a template by ID
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Full template record including schema
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TemplateRecord'
 *       404:
 *         description: Template not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
templatesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const { version, tag } = req.query as { version?: string; tag?: string };
    if (version !== undefined || tag !== undefined) {
      const ref = version !== undefined ? { version: Number(version) } : { tag: tag as string };
      const published = await getPublishedVersion(req.params.id, ref);
      if (!published) {
        res.status(404).json({ error: 'Requested version not found' });
        return;
      }
      res.json({
        ...template,
        latestPublished: { schema: published.schema, version: published.version, tag: published.tag },
        draft: null,
      });
      return;
    }

    const [draft, latestPublished] = await Promise.all([
      getDraft(req.params.id),
      getLatestPublishedVersion(req.params.id),
    ]);
    res.json({
      ...template,
      draft: draft ? { schema: draft.schema, version: draft.version } : null,
      latestPublished: latestPublished
        ? { schema: latestPublished.schema, version: latestPublished.version, tag: latestPublished.tag }
        : null,
    });
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /templates:
 *   post:
 *     summary: Create a new template
 *     tags: [Templates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, schema]
 *             properties:
 *               name:
 *                 type: string
 *               schema:
 *                 type: object
 *                 description: pdfme Template object
 *     responses:
 *       201:
 *         description: Created template record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TemplateRecord'
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
templatesRouter.post('/', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
  try {
    const { name, schema } = req.body as { name: string; schema: unknown };
    if (!name || !schema) {
      res.status(400).json({ error: 'name and schema are required' });
      return;
    }
    const template = await createTemplate(name);
    const draft = await saveDraft(template.id, schema);
    res.status(201).json({ ...template, schema, draft: { schema: draft.schema, version: draft.version } });
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /templates/{id}:
 *   put:
 *     summary: Update a template
 *     tags: [Templates]
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
 *             required: [name, schema]
 *             properties:
 *               name:
 *                 type: string
 *               schema:
 *                 type: object
 *     responses:
 *       200:
 *         description: Updated template record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TemplateRecord'
 *       404:
 *         description: Template not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
templatesRouter.put('/:id', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
  try {
    const { name, schema } = req.body as { name?: string; schema?: unknown };
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const template = await updateTemplate(req.params.id, name);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    let draft = null;
    if (schema !== undefined) {
      const draftRow = await saveDraft(template.id, schema);
      draft = { schema: draftRow.schema, version: draftRow.version };
    }
    res.json({ ...template, draft });
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /templates/{id}/publish:
 *   post:
 *     summary: Publish a template's draft as a new or replacement published version
 *     tags: [Templates]
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
 *             required: [schema, tag, mode]
 *             properties:
 *               schema:
 *                 type: object
 *               tag:
 *                 type: string
 *               mode:
 *                 type: string
 *                 enum: [new, replace]
 *               version:
 *                 type: integer
 *                 description: Required when mode is "replace"
 *     responses:
 *       200:
 *         description: The created or updated published version
 *       400:
 *         description: Missing required fields
 *       409:
 *         description: Duplicate tag for this template
 */
templatesRouter.post('/:id/publish', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
  try {
    const { schema, tag, mode, version } = req.body as {
      schema?: unknown;
      tag?: string;
      mode?: 'new' | 'replace';
      version?: number;
    };
    if (!schema || !tag || !mode) {
      res.status(400).json({ error: 'schema, tag, and mode are required' });
      return;
    }
    if (mode === 'replace' && typeof version !== 'number') {
      res.status(400).json({ error: 'version is required when mode is "replace"' });
      return;
    }

    const target = mode === 'new' ? { mode: 'new' as const } : { mode: 'replace' as const, version: version! };
    const published = await publishVersion(req.params.id, schema, tag, target);

    // Re-sync the draft to mirror what was just published. Best-effort: the
    // publish itself already committed, so a failure here must not be
    // reported as a publish failure — it would falsely tell the client the
    // publish didn't happen when it did, and could lead to a confusing
    // duplicate-tag 409 on a retry.
    try {
      await saveDraft(req.params.id, schema);
    } catch (syncError) {
      console.error('Failed to re-sync draft after publish:', syncError);
    }

    res.json({ schema: published.schema, version: published.version, tag: published.tag });
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === '23505') {
      res.status(409).json({ error: `Tag "${(req.body as { tag?: string }).tag}" is already used for this template` });
      return;
    }
    handleError(res, error);
  }
});

/**
 * @openapi
 * /templates/{id}/versions:
 *   get:
 *     summary: List a template's published versions
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Array of published versions, newest first
 */
templatesRouter.get('/:id/versions', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const versions = await listPublishedVersions(req.params.id);
    res.json(versions.map(v => ({ version: v.version, tag: v.tag, created_at: v.created_at })));
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * @openapi
 * /templates/{id}:
 *   delete:
 *     summary: Delete a template
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Template deleted
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
templatesRouter.delete('/:id', requireAuth, requireRole(['Admin']), async (req: AuthedRequest, res: Response) => {
  try {
    await deleteTemplate(req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
});

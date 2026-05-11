import { Router, Request, Response } from 'express';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from '../storage.js';

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
templatesRouter.get('/', async (_req: Request, res: Response) => {
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
    res.json(template);
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
templatesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, schema } = req.body as { name: string; schema: unknown };
    if (!name || !schema) {
      res.status(400).json({ error: 'name and schema are required' });
      return;
    }
    res.status(201).json(await createTemplate(name, schema));
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
templatesRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, schema } = req.body as { name: string; schema: unknown };
    const template = await updateTemplate(req.params.id, name, schema);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
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
templatesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await deleteTemplate(req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
});

import { Router, Request, Response } from 'express';
import { pool } from '../db.js';

export const templatesRouter = Router();

templatesRouter.get('/', async (_req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT id, name, created_at, updated_at FROM templates ORDER BY created_at DESC'
  );
  res.json(result.rows);
});

templatesRouter.get('/:id', async (req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM templates WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(result.rows[0]);
});

templatesRouter.post('/', async (req: Request, res: Response) => {
  const { name, schema } = req.body as { name: string; schema: unknown };
  if (!name || !schema) {
    res.status(400).json({ error: 'name and schema are required' });
    return;
  }
  const result = await pool.query(
    'INSERT INTO templates (name, schema) VALUES ($1, $2) RETURNING *',
    [name, JSON.stringify(schema)]
  );
  res.status(201).json(result.rows[0]);
});

templatesRouter.put('/:id', async (req: Request, res: Response) => {
  const { name, schema } = req.body as { name: string; schema: unknown };
  const result = await pool.query(
    'UPDATE templates SET name = $1, schema = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
    [name, JSON.stringify(schema), req.params.id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(result.rows[0]);
});

templatesRouter.delete('/:id', async (req: Request, res: Response) => {
  await pool.query('DELETE FROM templates WHERE id = $1', [req.params.id]);
  res.status(204).send();
});

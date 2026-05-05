import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import { generateAndSavePdf } from '../services/pdfService.js';
import type { Template } from '@pdfme/common';

export const filledPdfsRouter = Router();

filledPdfsRouter.post('/', async (req: Request, res: Response) => {
  const { template_id, inputs } = req.body as {
    template_id: string;
    inputs: Record<string, string>[];
  };

  if (!template_id || !inputs) {
    res.status(400).json({ error: 'template_id and inputs are required' });
    return;
  }

  const templateResult = await pool.query('SELECT * FROM templates WHERE id = $1', [template_id]);
  if (templateResult.rows.length === 0) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }

  const template = templateResult.rows[0].schema as Template;
  const filePath = await generateAndSavePdf(template, inputs);

  const result = await pool.query(
    'INSERT INTO filled_pdfs (template_id, inputs, file_path) VALUES ($1, $2, $3) RETURNING *',
    [template_id, JSON.stringify(inputs), filePath]
  );

  res.status(201).json(result.rows[0]);
});

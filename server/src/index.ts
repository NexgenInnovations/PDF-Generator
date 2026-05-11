import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { templatesRouter } from './routes/templates.js';
import { filledPdfsRouter } from './routes/filledPdfs.js';
import { swaggerSpec, swaggerUi } from './swagger.js';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await mkdir(join(__dirname, '..', 'outputs'), { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
app.use('/templates', templatesRouter);
app.use('/filled-pdfs', filledPdfsRouter);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/docs/swagger.json', (_req, res) => res.json(swaggerSpec));

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/docs`);
});

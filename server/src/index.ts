import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { templatesRouter } from './routes/templates.js';
import { generatePdfRouter } from './routes/filledPdfs.js';
import { aiFormRouter } from './routes/aiForm.js';
import { swaggerSpec, swaggerUi } from './swagger.js';
import { initDb } from './db.js';

await initDb();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
app.use('/templates', templatesRouter);
app.use('/api/generate-pdf', generatePdfRouter);
app.use('/api/ai-form', aiFormRouter);

app.get('/docs/swagger.json', (_req, res) => res.json(swaggerSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const PORT = process.env.PORT ?? 3004;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/docs`);
});

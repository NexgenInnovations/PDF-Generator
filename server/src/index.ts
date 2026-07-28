import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { templatesRouter } from './routes/templates.js';
import { generatePdfRouter } from './routes/filledPdfs.js';
import { aiFormRouter } from './routes/aiForm.js';
import { aiPdfVisionRouter } from './routes/aiPdfVision.js';
import { swaggerSpec, swaggerUi } from './swagger.js';
import { initDb } from './db.js';

await initDb();

const app = express();
app.use(cors());

// This route needs a larger body limit (base64 page images) than the rest
// of the app. It must be registered, with its own express.json(), BEFORE
// the app-wide express.json() below — Express does not allow a later,
// larger-limit body parser to override an earlier, stricter one on the
// same request, since the earlier one already consumes (or rejects) the
// request stream. Keep this route registered above the global parser.
app.use('/ai-form', express.json({ limit: '25mb' }), aiPdfVisionRouter);

app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
app.use('/templates', templatesRouter);
app.use('/generate-pdf', generatePdfRouter);
app.use('/ai-form', aiFormRouter);

app.get('/docs/swagger.json', (_req, res) => res.json(swaggerSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const PORT = process.env.PORT ?? 3004;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/docs`);
});

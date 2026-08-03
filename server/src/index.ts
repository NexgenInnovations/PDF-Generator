import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';
import { templatesRouter } from './routes/templates.js';
import { generatePdfRouter } from './routes/filledPdfs.js';
import { aiFormRouter } from './routes/aiForm.js';
import { aiPdfVisionRouter } from './routes/aiPdfVision.js';
import { assetsRouter } from './routes/assets.js';
import { letterheadsRouter } from './routes/letterheads.js';
import { submissionsRouter } from './routes/submissions.js';
import { swaggerSpec, swaggerUi } from './swagger.js';
import { initDb } from './db.js';

await initDb();

const app = express();
// Trust the reverse proxy so req.ip reflects the signer's actual IP address
// (used for evidentiary purposes in signature_events.ip_address) rather than
// the proxy's own address. No proxy-specific topology (hop count, trusted
// subnet) is configured anywhere else in this codebase, so `true` is the
// simplest correct default for this app's likely single-reverse-proxy setup.
app.set('trust proxy', true);
app.use(cors());

// This route needs a larger body limit (base64 page images) than the rest
// of the app. Its parser is scoped to this exact path (not the shared
// '/ai-form' prefix, which would also widen the sibling /ai-form/chat
// route's limit) and registered BEFORE the app-wide express.json() below —
// Express does not allow a later, larger-limit body parser to override an
// earlier, stricter one on the same request, since the earlier one already
// consumes (or rejects) the request stream. Keep this above the global parser.
app.use('/ai-form/detect-from-pdf', express.json({ limit: '25mb' }));
app.use('/ai-form', aiPdfVisionRouter);

app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
app.use('/templates', templatesRouter);
app.use('/generate-pdf', generatePdfRouter);
app.use('/ai-form', aiFormRouter);
app.use('/assets', assetsRouter);
app.use('/letterheads', letterheadsRouter);
app.use(submissionsRouter);

app.get('/docs/swagger.json', (_req, res) => res.json(swaggerSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const PORT = process.env.PORT ?? 3004;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/docs`);
});

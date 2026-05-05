import express from 'express';
import cors from 'cors';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await mkdir(join(__dirname, '..', 'outputs'), { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes will be mounted here in later tasks
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

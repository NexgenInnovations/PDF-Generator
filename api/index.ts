import type { IncomingMessage, ServerResponse } from 'node:http';
import { app } from '../server/src/app.js';
import { initDb } from '../server/src/db.js';

// Runs once per cold start; subsequent invocations on the same warm
// instance reuse the already-resolved promise instead of re-connecting.
let dbReady: Promise<void> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!dbReady) {
    dbReady = initDb();
  }
  await dbReady;

  // Vercel routes /api/* here with the full path (including the /api
  // prefix) still on req.url. The Express app's routes are mounted at
  // the bare paths (/templates, /assets, ...), matching what the local
  // Vite dev proxy already does (client/vite.config.ts strips /api the
  // same way before forwarding to this same Express app locally).
  if (req.url) {
    req.url = req.url.replace(/^\/api/, '') || '/';
  }

  app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}

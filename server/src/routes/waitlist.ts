// server/src/routes/waitlist.ts
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createWaitlistSignup } from '../db.js';

export const waitlistRouter = Router();

const waitlistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @openapi
 * /waitlist:
 *   post:
 *     summary: Join the NexGen PDF Manager waitlist
 *     tags: [Waitlist]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Signup accepted (new or already on the list)
 *       400:
 *         description: Missing or invalid fields
 *       429:
 *         description: Too many requests
 */
waitlistRouter.post('/', waitlistLimiter, async (req: Request, res: Response) => {
  const { name, email } = req.body as { name?: string; email?: string };

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    res.status(400).json({ error: 'a valid email is required' });
    return;
  }

  try {
    const result = await createWaitlistSignup(name.trim(), email.trim().toLowerCase());
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

import { Router, Request, Response } from 'express';
import { runAiFormChat, type ChatMessage } from '../services/aiFormService.js';

export const aiFormRouter = Router();

/**
 * @openapi
 * /ai-form/chat:
 *   post:
 *     summary: Chat with an AI agent that designs a pdfme form template
 *     tags: [AI Form Builder]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messages]
 *             properties:
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [role, content]
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: Either a clarifying question or the finished template
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 done:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 template:
 *                   type: object
 *       400:
 *         description: Missing or invalid messages array
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
aiFormRouter.post('/chat', async (req: Request, res: Response) => {
  const { messages } = req.body as { messages?: ChatMessage[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages is required and must be a non-empty array' });
    return;
  }

  try {
    const result = await runAiFormChat(messages);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

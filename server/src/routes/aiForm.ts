import { Router, Response } from 'express';
import { runAiFormChat, type ChatMessage, type OccupiedRegion } from '../services/aiFormService.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';

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
 *               occupiedRegions:
 *                 type: array
 *                 description: Regions on page 1 (mm) the AI should avoid overlapping, e.g. a letterhead's existing fields.
 *                 items:
 *                   type: object
 *                   required: [x, y, width, height]
 *                   properties:
 *                     x:
 *                       type: number
 *                     y:
 *                       type: number
 *                     width:
 *                       type: number
 *                     height:
 *                       type: number
 *               currentFields:
 *                 type: array
 *                 description: The field list already on the form (as previously returned in `fields`), so the AI can treat this message as a modification instead of starting over.
 *                 items:
 *                   type: object
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
 *                 fields:
 *                   type: array
 *                   description: The field list used to build `template` — pass this back as `currentFields` on the next message to let the AI keep tweaking it.
 *                   items:
 *                     type: object
 *       400:
 *         description: Missing or invalid messages array
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
function isValidOccupiedRegion(r: unknown): r is OccupiedRegion {
  return (
    !!r &&
    typeof r === 'object' &&
    typeof (r as OccupiedRegion).x === 'number' &&
    typeof (r as OccupiedRegion).y === 'number' &&
    typeof (r as OccupiedRegion).width === 'number' &&
    typeof (r as OccupiedRegion).height === 'number'
  );
}

aiFormRouter.post('/chat', requireAuth, requireRole(['Admin', 'Designer']), async (req: AuthedRequest, res: Response) => {
  const { messages, occupiedRegions, currentFields } = req.body as {
    messages?: ChatMessage[];
    occupiedRegions?: unknown;
    currentFields?: unknown;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages is required and must be a non-empty array' });
    return;
  }

  let validatedRegions: OccupiedRegion[] | undefined;
  if (occupiedRegions !== undefined) {
    if (!Array.isArray(occupiedRegions) || !occupiedRegions.every(isValidOccupiedRegion)) {
      res.status(400).json({ error: 'occupiedRegions must be an array of { x, y, width, height } numbers' });
      return;
    }
    validatedRegions = occupiedRegions;
  }

  try {
    const result = await runAiFormChat(messages, validatedRegions, currentFields);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

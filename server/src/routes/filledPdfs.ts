import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { generatePdf } from '../services/pdfService.js';
import { getTemplate, getPublishedVersion, getLatestPublishedVersion, createFilledSubmission, createGeneratedPdf, createSignatureEvent } from '../db.js';
import type { Template } from '@pdfme/common';

export const generatePdfRouter = Router();

/**
 * @openapi
 * /generate-pdf:
 *   post:
 *     summary: Generate a PDF from a template and return it as a downloadable file
 *     tags: [PDF Generation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [template_id, inputs]
 *             properties:
 *               template_id:
 *                 type: string
 *                 format: uuid
 *                 example: "F60E93AD-3726-4B83-AEA4-06948CAD870B"
 *               inputs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   additionalProperties:
 *                     type: string
 *                 example:
 *                   - company_name: "Nexgen Solutions"
 *                     company_address: "123 Tech Street, Sydney NSW 2000"
 *                     company_email: "billing@nexgen.com.au"
 *                     client_name: "Acme Corporation"
 *                     client_address: "456 Client Avenue, Melbourne VIC 3000"
 *                     invoice_number: "INV-2026-001"
 *                     invoice_date: "16/06/2026"
 *                     due_date: "30/06/2026"
 *                     item1_desc: "Web Development Services"
 *                     item1_qty: "10 hrs"
 *                     item1_price: "$1,500.00"
 *                     item2_desc: "UI/UX Design"
 *                     item2_qty: "5 hrs"
 *                     item2_price: "$750.00"
 *                     subtotal: "$2,250.00"
 *                     tax: "$225.00"
 *                     total: "$2,475.00"
 *                     notes: "Payment due within 14 days. Thank you for your business!"
 *     responses:
 *       200:
 *         description: Generated PDF file — downloads automatically
 *         headers:
 *           Content-Disposition:
 *             schema:
 *               type: string
 *               example: attachment; filename="generated.pdf"
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Template not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
generatePdfRouter.post('/', async (req: Request, res: Response) => {
  const { template_id, inputs, version, tag, signatureEvents, signAnywhere } = req.body as {
    template_id?: string;
    inputs?: Record<string, string>[];
    version?: number;
    tag?: string;
    signatureEvents?: { fieldName?: string; signerName?: string; signerEmail?: string }[];
    signAnywhere?: { page?: number; x?: number; y?: number; content?: string; signerName?: string; signerEmail?: string };
  };

  if (!template_id || !Array.isArray(inputs) || inputs.length === 0) {
    res.status(400).json({ error: 'template_id and a non-empty inputs array are required' });
    return;
  }

  const validatedSignatureEvents: { fieldName: string; signerName: string; signerEmail: string }[] = [];
  if (signatureEvents !== undefined) {
    if (!Array.isArray(signatureEvents)) {
      res.status(400).json({ error: 'signatureEvents must be an array' });
      return;
    }
    for (const event of signatureEvents) {
      if (
        !event ||
        typeof event.fieldName !== 'string' || event.fieldName.trim().length === 0 ||
        typeof event.signerName !== 'string' || event.signerName.trim().length === 0 ||
        typeof event.signerEmail !== 'string' || event.signerEmail.trim().length === 0
      ) {
        res.status(400).json({ error: 'Each signatureEvents entry requires fieldName, signerName, and signerEmail' });
        return;
      }
      validatedSignatureEvents.push({
        fieldName: event.fieldName.trim(),
        signerName: event.signerName.trim(),
        signerEmail: event.signerEmail.trim(),
      });
    }
  }

  let validatedSignAnywhere: { page: number; x: number; y: number; content: string; signerName: string; signerEmail: string } | undefined;
  if (signAnywhere !== undefined) {
    if (
      typeof signAnywhere.page !== 'number' || !Number.isInteger(signAnywhere.page) || signAnywhere.page < 0 ||
      typeof signAnywhere.x !== 'number' || !Number.isFinite(signAnywhere.x) ||
      typeof signAnywhere.y !== 'number' || !Number.isFinite(signAnywhere.y) ||
      typeof signAnywhere.content !== 'string' || signAnywhere.content.trim().length === 0 ||
      typeof signAnywhere.signerName !== 'string' || signAnywhere.signerName.trim().length === 0 ||
      typeof signAnywhere.signerEmail !== 'string' || signAnywhere.signerEmail.trim().length === 0
    ) {
      res.status(400).json({ error: 'signAnywhere requires a non-negative integer page, finite x/y, and non-empty content, signerName, signerEmail' });
      return;
    }
    validatedSignAnywhere = {
      page: signAnywhere.page,
      x: signAnywhere.x,
      y: signAnywhere.y,
      content: signAnywhere.content,
      signerName: signAnywhere.signerName.trim(),
      signerEmail: signAnywhere.signerEmail.trim(),
    };
  }

  try {
    const record = await getTemplate(template_id);
    if (!record) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const resolvedVersion = version !== undefined
      ? await getPublishedVersion(template_id, { version })
      : tag !== undefined
        ? await getPublishedVersion(template_id, { tag })
        : await getLatestPublishedVersion(template_id);

    if (!resolvedVersion) {
      res.status(404).json({ error: 'No published version found' });
      return;
    }

    let templateForGeneration = resolvedVersion.schema as Template;
    let signAnywhereFieldName: string | undefined;

    if (validatedSignAnywhere) {
      if (validatedSignAnywhere.page >= templateForGeneration.schemas.length) {
        res.status(400).json({ error: `signAnywhere.page ${validatedSignAnywhere.page} is out of range for this template's ${templateForGeneration.schemas.length} page(s)` });
        return;
      }

      const basePdf = templateForGeneration.basePdf;
      const pageWidthMm = typeof basePdf === 'object' && 'width' in basePdf ? basePdf.width : 210;
      const pageHeightMm = typeof basePdf === 'object' && 'height' in basePdf ? basePdf.height : 297;
      const SIGN_ANYWHERE_WIDTH_MM = 62.5;
      const SIGN_ANYWHERE_HEIGHT_MM = 37.5;
      const clampedX = Math.min(Math.max(validatedSignAnywhere.x, 0), Math.max(0, pageWidthMm - SIGN_ANYWHERE_WIDTH_MM));
      const clampedY = Math.min(Math.max(validatedSignAnywhere.y, 0), Math.max(0, pageHeightMm - SIGN_ANYWHERE_HEIGHT_MM));

      signAnywhereFieldName = `sign_anywhere_${randomUUID()}`;
      const clonedTemplate: Template = JSON.parse(JSON.stringify(templateForGeneration));
      clonedTemplate.schemas[validatedSignAnywhere.page].push({
        name: signAnywhereFieldName,
        type: 'signature',
        content: validatedSignAnywhere.content,
        position: { x: clampedX, y: clampedY },
        width: SIGN_ANYWHERE_WIDTH_MM,
        height: SIGN_ANYWHERE_HEIGHT_MM,
      });
      templateForGeneration = clonedTemplate;
    }

    const pdf = await generatePdf(templateForGeneration, inputs);

    try {
      const submission = await createFilledSubmission(
        template_id,
        resolvedVersion.version,
        inputs
      );
      await createGeneratedPdf({
        submissionId: submission.id,
        templateId: template_id,
        templateVersion: resolvedVersion.version,
        inputsSnapshot: inputs,
        schemaSnapshot: resolvedVersion.schema,
        filePath: 'generated-in-memory',
        fileSizeBytes: pdf.length,
      });

      const allSignatureEvents = [
        ...validatedSignatureEvents,
        ...(validatedSignAnywhere && signAnywhereFieldName
          ? [{ fieldName: signAnywhereFieldName, signerName: validatedSignAnywhere.signerName, signerEmail: validatedSignAnywhere.signerEmail }]
          : []),
      ];

      if (allSignatureEvents.length > 0) {
        const documentHash = createHash('sha256').update(pdf).digest('hex');
        const ipAddress = req.ip ?? null;
        for (const event of allSignatureEvents) {
          await createSignatureEvent({
            submissionId: submission.id,
            fieldName: event.fieldName,
            signerName: event.signerName,
            signerEmail: event.signerEmail,
            ipAddress,
            documentHash,
          });
        }
      }
    } catch (dbErr) {
      console.error('Failed to record submission/generated_pdf/signature_events:', dbErr);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="generated.pdf"');
    res.setHeader('Content-Length', pdf.length);
    res.status(200).send(pdf);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    console.error(error);
    res.status(500).json({ error: message });
  }
});

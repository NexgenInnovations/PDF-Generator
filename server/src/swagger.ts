import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PDF Template Manager API',
      version: '1.0.0',
      description: 'REST API for managing PDF templates and generated filled PDFs',
    },
    servers: [{ url: 'http://localhost:3001', description: 'Local dev server' }],
    components: {
      schemas: {
        TemplateSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        TemplateRecord: {
          allOf: [
            { $ref: '#/components/schemas/TemplateSummary' },
            {
              type: 'object',
              properties: {
                schema: { type: 'object', description: 'Full pdfme Template object' },
              },
            },
          ],
        },
        FilledPdfRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            template_id: { type: 'string', format: 'uuid' },
            inputs: {
              type: 'array',
              items: { type: 'object', additionalProperties: { type: 'string' } },
            },
            file_path: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
export { swaggerUi };

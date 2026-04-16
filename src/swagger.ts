// ===========================================================
// SWAGGER BASE CONFIG
// ===========================================================
// Only holds the OpenAPI base definition and reusable schemas.
// Route-level documentation lives as @swagger JSDoc comments
// in src/routes/index.ts, co-located with the route definitions.
// swagger-jsdoc scans that file and merges everything together.
// ===========================================================

import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'NFC Card API',
      version: '1.0.0',
      description: 'Digital NFC Business Card System REST API',
    },
    servers: [{ url: 'http://localhost:5000' }],
    components: {
      // -- JWT Bearer auth applied to all protected routes --
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste your JWT token from /api/auth/login',
        },
      },
      schemas: {
        RegisterBody: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string', example: 'John Doe' },
            email: { type: 'string', example: 'john@example.com' },
            password: { type: 'string', example: 'password123' },
            cardId: { type: 'string', example: 'CARD_AB3K2L', description: 'Optional: activate a card at registration' },
          },
        },
        LoginBody: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            // Match the seeded admin credentials so the docs are usable out of the box in development.
            email: { type: 'string', example: 'admin@nfccard.com' },
            password: { type: 'string', example: 'admin123!' },
          },
        },
        UpdateProfileBody: {
          type: 'object',
          properties: {
            fullName: { type: 'string', example: 'John Doe' },
            jobTitle: { type: 'string', example: 'Software Engineer' },
            company: { type: 'string', example: 'Acme Corp' },
            phone: { type: 'string', example: '+1234567890' },
            email: { type: 'string', example: 'john@example.com' },
            website: { type: 'string', example: 'https://johndoe.com' },
            bio: { type: 'string', example: 'Building cool things.' },
            imageUrl: { type: 'string', example: 'https://cdn.example.com/photo.jpg' },
            whatsapp: { type: 'string', example: '1234567890' },
            links: {
              type: 'array',
              items: {
                type: 'object',
                required: ['type', 'label', 'url'],
                properties: {
                  type: { type: 'string', example: 'instagram' },
                  label: { type: 'string', example: 'Follow me' },
                  url: { type: 'string', example: 'https://instagram.com/johndoe' },
                  order: { type: 'integer', example: 0 },
                },
              },
            },
          },
        },
        CreateCardBody: {
          type: 'object',
          properties: {
            count: { type: 'integer', example: 5, description: 'Number of cards to generate (max 100)' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Error message' },
          },
        },
      },
    },
  },
  // -- Scan routes file for @swagger JSDoc comments --
  apis: [path.join(__dirname, './routes/index.ts')],
};

export const swaggerSpec = swaggerJsdoc(options);

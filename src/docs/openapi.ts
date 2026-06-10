import { config } from '@config/index';

/**
 * Curated OpenAPI 3.0 spec — covers the headline endpoints. The full surface is
 * larger than this; this spec is meant for vendor onboarding + sanity browsing,
 * not as an exhaustive contract.
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'SmartDine API',
    version: '1.0.0',
    description:
      'Single-restaurant management platform. Powers QR ordering, KDS, billing, inventory, customers, promotions, notifications, and reports.',
    contact: { name: 'Fixl Solutions', email: 'engineering@fixlsolutions.com' },
  },
  servers: [{ url: config.urls.publicBase + config.apiPrefix, description: 'API base' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      guestToken: { type: 'apiKey', in: 'header', name: 'X-Guest-Token' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object' },
            },
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              user: { type: 'object' },
              mfaRequired: { type: 'boolean' },
            },
          },
        },
      },
      OrderItem: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
          comboId: { type: 'string' },
          variantId: { type: 'string' },
          qty: { type: 'integer', minimum: 1 },
          notes: { type: 'string' },
          modifiers: {
            type: 'array',
            items: {
              type: 'object',
              properties: { groupId: { type: 'string' }, modifierId: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  paths: {
    '/auth/staff/login': {
      post: {
        tags: ['Auth'],
        summary: 'Staff email + password login',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: {
            description: 'OK',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } },
          },
          401: {
            description: 'Invalid credentials',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current staff user',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/auth/guest/otp/request': {
      post: {
        tags: ['Auth'],
        summary: 'Request a guest OTP (window flow)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phone'],
                properties: { phone: { type: 'string', example: '+919812345678' } },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/auth/guest/otp/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify a guest OTP → returns guest token',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/menu/public': {
      get: {
        tags: ['Menu (public)'],
        summary: 'Guest-facing menu (no auth)',
        parameters: [
          { name: 'lang', in: 'query', schema: { type: 'string' } },
          { name: 'channel', in: 'query', schema: { type: 'string', enum: ['dine_in', 'window'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/guest/orders/dine-in': {
      post: {
        tags: ['Orders (guest)'],
        summary: 'Place a dine-in order using a table QR slug (anonymous)',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/guest/orders/window': {
      post: {
        tags: ['Orders (guest)'],
        summary: 'Place a window/takeaway order (requires guest token)',
        security: [{ guestToken: [] }],
        responses: { 201: { description: 'Created' } },
      },
    },
    '/guest/orders/{id}': {
      get: {
        tags: ['Orders (guest)'],
        summary: 'Guest checks order status',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/orders': {
      get: {
        tags: ['Orders (staff)'],
        summary: 'List orders',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Orders (staff)'],
        summary: 'Place an assisted order (waiter)',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' } },
      },
    },
    '/orders/{id}/accept': {
      patch: {
        tags: ['Orders (staff)'],
        summary: 'Manager / kitchen accepts an order',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/kds/queue': {
      get: {
        tags: ['KDS'],
        summary: 'Active items for one station',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'station', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/kds/orders/{orderId}/items/{itemId}/status': {
      patch: {
        tags: ['KDS'],
        summary: 'Transition a kitchen item state',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'orderId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/billing/orders/{id}/bill': {
      post: {
        tags: ['Billing'],
        summary: 'Generate / refresh the invoice for an order (with optional discount/coupon/loyalty)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Created' } },
      },
    },
    '/payments/invoices/{invoiceId}': {
      post: {
        tags: ['Payments'],
        summary: 'Record a payment against an invoice',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'invoiceId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Created' } },
      },
    },
    '/payments/upi/qr': {
      post: {
        tags: ['Payments'],
        summary: 'Issue a dynamic Razorpay UPI QR for an invoice',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Created' } },
      },
    },
    '/payments/webhook/razorpay': {
      post: {
        tags: ['Payments'],
        summary: 'Razorpay webhook (signature-verified)',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/reports/kpi-dashboard': {
      get: {
        tags: ['Reports'],
        summary: 'Top-7 KPIs for the home screen',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/reports/sales': {
      get: {
        tags: ['Reports'],
        summary: 'Sales report (day/week/month, by channel)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'groupBy', in: 'query', schema: { type: 'string', enum: ['day', 'week', 'month'] } },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/reports/{type}/export': {
      get: {
        tags: ['Reports'],
        summary: 'Export a report as CSV / XLSX / PDF',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'type', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['csv', 'xlsx', 'pdf'] } },
        ],
        responses: { 200: { description: 'Binary download' } },
      },
    },
    '/r/{slug}': {
      get: {
        tags: ['QR'],
        summary: 'Public QR redirect (302 to guest app; logs scan)',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 302: { description: 'Redirect' } },
      },
    },
  },
};

/* OpenAPI 3.0 description of the Sales & Insights Service, served by Swagger UI at /api-docs. */

const rangeParams = [
  { name: 'from', in: 'query', schema: { type: 'string' }, description: 'YYYY-MM-DD or ISO date-time (UTC). Default: 29 days before `to`.' },
  { name: 'to', in: 'query', schema: { type: 'string' }, description: 'YYYY-MM-DD (inclusive, whole day) or ISO date-time. Default: now.' },
];
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];
const num = (name: string, description: string, extra: Record<string, unknown> = {}) => ({
  name,
  in: 'query',
  description,
  schema: { type: 'number', ...extra },
});

const json = (schema: unknown, example?: unknown) => ({ content: { 'application/json': { schema, example } } });
const ok = (description: string, schema: unknown = { type: 'object' }, example?: unknown) => ({
  description,
  ...json(schema, example),
});
const err = (description: string) => ({ description, ...json({ $ref: '#/components/schemas/Error' }) });

const analyticsGet = (summary: string, description: string, parameters: unknown[], example?: unknown) => ({
  get: {
    tags: ['Analytics'],
    summary,
    description,
    parameters,
    responses: {
      '200': ok('Result wrapped in `data`', { type: 'object', properties: { data: { type: 'object' } } }, example),
      '400': err('Invalid query parameter'),
      '503': err('CATALOG_UNAVAILABLE (only for endpoints that need live stock data)'),
    },
  },
});

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ThreadIQ Sales & Insights Service',
    version: '1.0.0',
    description:
      'Records sales (deducting stock through the Catalog Service over HTTP) and computes analytics. Definitions: grossSales = sum of line totals; discounts = order-level discounts; revenue = grossSales - discounts. Trend scores and restock suggestions are transparent rule-based estimates, not machine learning.',
  },
  servers: [{ url: 'http://localhost:3002' }],
  tags: [{ name: 'Sales' }, { name: 'Analytics' }, { name: 'System' }],
  paths: {
    '/health': { get: { tags: ['System'], summary: 'Liveness/readiness check', responses: { '200': { description: 'Healthy' }, '503': { description: 'Database unavailable' } } } },
    '/api/v1/sales': {
      get: {
        tags: ['Sales'],
        summary: 'List sales (newest first)',
        parameters: [...pageParams, ...rangeParams, { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Match on sale number' }],
        responses: { '200': ok('Page of sales', { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Sale' } }, meta: { type: 'object' } } }), '400': err('Invalid query') },
      },
      post: {
        tags: ['Sales'],
        summary: 'Record a sale',
        description:
          'Validates lines against the catalog, computes prices and totals on the server (client prices/totals are ignored), deducts stock via the Catalog Service, then stores the sale. Requires an idempotency key (`Idempotency-Key` header or `idempotencyKey` field): replaying the same key returns the original sale with 200 and `Idempotent-Replay: true` and never deducts stock twice. If saving fails after the deduction, the stock is restored (compensation).',
        parameters: [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string', minLength: 8, maxLength: 100 }, description: 'Alternative to the body field' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateSale' },
              example: {
                idempotencyKey: '0b5c3c1e-6f8f-4a74-a1d0-5ac3e9a1e001',
                items: [{ productId: '665f1c2e8f1b2a0012345678', variantId: '665f1c2e8f1b2a0012345679', quantity: 2 }],
                discount: 100,
              },
            },
          },
        },
        responses: {
          '201': ok('Sale created', { type: 'object', properties: { data: { $ref: '#/components/schemas/Sale' } } }),
          '200': ok('Idempotent replay of an existing sale'),
          '400': err('VALIDATION_ERROR or INVALID_DISCOUNT'),
          '404': err('PRODUCT_NOT_FOUND or VARIANT_NOT_FOUND'),
          '409': err('INSUFFICIENT_STOCK or PRODUCT_ARCHIVED'),
          '500': err('SALE_PERSISTENCE_FAILED (stock restored)'),
          '503': err('CATALOG_UNAVAILABLE - nothing was recorded'),
        },
      },
    },
    '/api/v1/sales/{id}': {
      get: {
        tags: ['Sales'],
        summary: 'Get a sale',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } }],
        responses: { '200': ok('Sale', { type: 'object', properties: { data: { $ref: '#/components/schemas/Sale' } } }), '400': err('Malformed id'), '404': err('Not found') },
      },
    },
    '/api/v1/analytics/overview': analyticsGet(
      'Revenue KPIs for a period plus current inventory KPIs',
      'Returns revenue, grossSales, discounts, salesCount, unitsSold, averageOrderValue and (when the Catalog Service is reachable) inventory totals.',
      rangeParams,
    ),
    '/api/v1/analytics/revenue-trend': analyticsGet('Zero-filled revenue per day or ISO week (Monday start)', 'Weeks are Monday-based (UTC).', [
      ...rangeParams,
      { name: 'interval', in: 'query', schema: { type: 'string', enum: ['day', 'week'], default: 'day' } },
    ]),
    '/api/v1/analytics/category-performance': analyticsGet('Revenue and units by category, merged with current stock by category', 'Category revenue is net of discounts (discount spread proportionally over lines).', rangeParams),
    '/api/v1/analytics/top-products': analyticsGet('Best-selling products in a period', '', [
      ...rangeParams,
      { name: 'limit', in: 'query', schema: { type: 'integer', default: 5, maximum: 50 } },
      { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['units', 'revenue'], default: 'units' } },
    ]),
    '/api/v1/analytics/slow-moving': analyticsGet(
      'Active products with stock that are not selling',
      'Statuses: no_sales_history (never sold), no_recent_sales (sold before, none in the look-back period), low_velocity (<= maxUnitsPerDay). Out-of-stock and too-new products are counted in `summary` but never listed as slow-moving.',
      [
        num('days', 'Look-back period in days (default 30)', { minimum: 7, maximum: 365 }),
        num('limit', 'Max rows', { default: 50 }),
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['no_sales_history', 'no_recent_sales', 'low_velocity'] } },
      ],
    ),
    '/api/v1/analytics/trend-scores': analyticsGet(
      'Explainable 0-100 trend score per active product',
      'score = 0.60*velocity + 0.25*growth + 0.15*urgency. Windows: recent = last N days, previous = the N days before (default N = 14). Rule-based heuristic, not machine learning.',
      [num('windowDays', 'Window length N (default 14)', { minimum: 3, maximum: 60 }), num('limit', 'Max rows', { default: 50 }), { name: 'category', in: 'query', schema: { type: 'string' } }],
    ),
    '/api/v1/analytics/restock-recommendations': analyticsGet(
      'Variants to reorder, with an explainable suggested quantity (estimate)',
      'avgDaily = units sold in window / windowDays; flagged when stock <= reorder threshold or cover < threshold days; target = ceil(avgDaily * targetDays) + reorder threshold.',
      [
        num('windowDays', 'Sales window (default 30)', { minimum: 7, maximum: 180 }),
        num('coverDays', 'Flag when stock cover is below this many days (default 14)'),
        num('targetDays', 'Target cover in days (default 30)'),
        { name: 'priority', in: 'query', schema: { type: 'string', enum: ['critical', 'high', 'medium'] } },
        num('limit', 'Max rows', { default: 100 }),
      ],
    ),
  },
  components: {
    schemas: {
      CreateSale: {
        type: 'object',
        required: ['idempotencyKey', 'items'],
        properties: {
          idempotencyKey: { type: 'string', minLength: 8, maxLength: 100 },
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['productId', 'variantId', 'quantity'],
              properties: { productId: { type: 'string' }, variantId: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } },
            },
          },
          discount: { type: 'number', minimum: 0, default: 0, description: 'Absolute amount; cannot exceed the subtotal' },
        },
      },
      Sale: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          saleNumber: { type: 'string', example: 'TIQ-20260115-A1B2C3' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productId: { type: 'string' }, variantId: { type: 'string' }, sku: { type: 'string' }, productName: { type: 'string' },
                category: { type: 'string' }, size: { type: 'string' }, color: { type: 'string' },
                quantity: { type: 'integer' }, unitPrice: { type: 'number' }, lineTotal: { type: 'number' },
              },
            },
          },
          unitsSold: { type: 'integer' },
          subtotal: { type: 'number' },
          discount: { type: 'number' },
          total: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } },
      },
    },
  },
};

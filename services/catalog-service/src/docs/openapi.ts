/* OpenAPI 3.0 description of the Catalog Service, served by Swagger UI at /api-docs. */

const idParam = (name = 'id') => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
  description: 'MongoDB ObjectId (24 hex characters)',
});

const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];

const jsonBody = (ref: string, example?: unknown) => ({
  required: true,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` }, example } },
});

const ok = (description: string, schema: unknown) => ({
  description,
  content: { 'application/json': { schema } },
});

const dataOf = (ref: string) => ({ type: 'object', properties: { data: { $ref: `#/components/schemas/${ref}` } } });
const listOf = (ref: string) => ({
  type: 'object',
  properties: {
    data: { type: 'array', items: { $ref: `#/components/schemas/${ref}` } },
    meta: { $ref: '#/components/schemas/PageMeta' },
  },
});

const errors = {
  '400': { $ref: '#/components/responses/ValidationError' },
  '404': { $ref: '#/components/responses/NotFound' },
  '409': { $ref: '#/components/responses/Conflict' },
};

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ThreadIQ Catalog Service',
    version: '1.0.0',
    description:
      'Products, clothing variants, stock levels and inventory movements. Stock can only change through the inventory endpoints; every change is validated (never negative) and recorded as a StockMovement.',
  },
  servers: [{ url: 'http://localhost:3001' }],
  tags: [{ name: 'Products' }, { name: 'Inventory' }, { name: 'System' }],
  paths: {
    '/health': {
      get: { tags: ['System'], summary: 'Liveness/readiness check', responses: { '200': { description: 'Healthy' }, '503': { description: 'Database unavailable' } } },
    },
    '/api/v1/products': {
      get: {
        tags: ['Products'],
        summary: 'List products (search, filter, sort, paginate)',
        parameters: [
          ...pageParams,
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search name, SKU, brand or variant SKU' },
          { name: 'category', in: 'query', schema: { $ref: '#/components/schemas/Category' } },
          { name: 'size', in: 'query', schema: { $ref: '#/components/schemas/Size' } },
          { name: 'color', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'archived', 'all'], default: 'active' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['name', 'createdAt', 'updatedAt', 'sellingPrice'], default: 'createdAt' } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
        ],
        responses: { '200': ok('Page of products', listOf('Product')), '400': errors['400'] },
      },
      post: {
        tags: ['Products'],
        summary: 'Create a product with variants (initial stock is recorded as receipt movements)',
        requestBody: jsonBody('CreateProduct', {
          name: 'Linen Camp Shirt',
          sku: 'SHT-LINEN-01',
          brand: 'Loom & Lane',
          category: 'Shirts',
          description: 'Relaxed linen shirt',
          sellingPrice: 1999,
          costPrice: 800,
          variants: [{ sku: 'SHT-LINEN-01-M-SAGE', size: 'M', color: 'Sage', stock: 20, reorderThreshold: 5 }],
        }),
        responses: { '201': ok('Created', dataOf('Product')), '400': errors['400'], '409': errors['409'] },
      },
    },
    '/api/v1/products/{id}': {
      parameters: [idParam()],
      get: { tags: ['Products'], summary: 'Get product details', responses: { '200': ok('Product', dataOf('Product')), '400': errors['400'], '404': errors['404'] } },
      patch: {
        tags: ['Products'],
        summary: 'Update product metadata (not stock)',
        requestBody: jsonBody('UpdateProduct', { sellingPrice: 2199 }),
        responses: { '200': ok('Updated', dataOf('Product')), '400': errors['400'], '404': errors['404'] },
      },
      delete: {
        tags: ['Products'],
        summary: 'Archive a product (soft delete; history is preserved). Restore with PATCH {status:"active"}',
        responses: { '200': ok('Archived product', dataOf('Product')), '404': errors['404'] },
      },
    },
    '/api/v1/products/{id}/variants': {
      parameters: [idParam()],
      post: {
        tags: ['Products'],
        summary: 'Add a variant to a product',
        requestBody: jsonBody('VariantInput'),
        responses: { '201': ok('Updated product', dataOf('Product')), '400': errors['400'], '404': errors['404'], '409': errors['409'] },
      },
    },
    '/api/v1/products/{id}/variants/{variantId}': {
      parameters: [idParam(), idParam('variantId')],
      patch: {
        tags: ['Products'],
        summary: 'Set a variant reorder threshold',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { reorderThreshold: { type: 'integer', minimum: 0 } }, required: ['reorderThreshold'] } } } },
        responses: { '200': ok('Updated product', dataOf('Product')), '400': errors['400'], '404': errors['404'] },
      },
    },
    '/api/v1/inventory/low-stock': {
      get: {
        tags: ['Inventory'],
        summary: 'Variants at or below their reorder threshold (low) or at zero (out)',
        parameters: [
          ...pageParams,
          { name: 'level', in: 'query', schema: { type: 'string', enum: ['all', 'low', 'out'], default: 'all' } },
        ],
        responses: { '200': ok('Page of low-stock variants', listOf('LowStockRow')) },
      },
    },
    '/api/v1/inventory/movements': {
      get: {
        tags: ['Inventory'],
        summary: 'Stock movement history',
        parameters: [
          ...pageParams,
          { name: 'productId', in: 'query', schema: { type: 'string' } },
          { name: 'variantId', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['receipt', 'adjustment', 'sale', 'return'] } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { '200': ok('Page of movements', listOf('StockMovement')) },
      },
    },
    '/api/v1/inventory/summary': {
      get: { tags: ['Inventory'], summary: 'Active products, units, valuation at cost and per-category stock', responses: { '200': { description: 'Inventory summary' } } },
    },
    '/api/v1/inventory/snapshot': {
      get: {
        tags: ['Inventory'],
        summary: 'Flat per-variant stock snapshot (used by the Insights Service)',
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'all'], default: 'active' } }],
        responses: { '200': { description: 'Array of variant rows' } },
      },
    },
    '/api/v1/inventory/receipts': {
      post: {
        tags: ['Inventory'],
        summary: 'Receive new stock',
        requestBody: jsonBody('Receipt', { productId: '665f1c2e8f1b2a0012345678', variantId: '665f1c2e8f1b2a0012345679', quantity: 25, reason: 'Supplier delivery #4411' }),
        responses: { '201': ok('Movement', dataOf('StockMovement')), '400': errors['400'], '404': errors['404'] },
      },
    },
    '/api/v1/inventory/adjustments': {
      post: {
        tags: ['Inventory'],
        summary: 'Adjust stock by a signed quantity with a reason (never below zero)',
        requestBody: jsonBody('Adjustment', { productId: '665f1c2e8f1b2a0012345678', variantId: '665f1c2e8f1b2a0012345679', quantityChange: -2, reason: 'Damaged items' }),
        responses: { '201': ok('Movement', dataOf('StockMovement')), '400': errors['400'], '404': errors['404'], '409': errors['409'] },
      },
    },
    '/api/v1/inventory/sale-deductions': {
      post: {
        tags: ['Inventory'],
        summary: 'Deduct stock for a sale (internal; idempotent per reference)',
        description: 'All-or-nothing across lines: if one line fails, lines applied by the same call are rolled back. Replaying a reference never deducts twice.',
        requestBody: jsonBody('SaleDeduction'),
        responses: { '200': { description: 'Deducted' }, '404': errors['404'], '409': errors['409'] },
      },
    },
    '/api/v1/inventory/sale-restorations': {
      post: {
        tags: ['Inventory'],
        summary: 'Compensate a sale deduction by returning its stock (internal; idempotent)',
        requestBody: jsonBody('SaleRestoration'),
        responses: { '200': { description: 'Restored line count' } },
      },
    },
  },
  components: {
    schemas: {
      Category: { type: 'string', enum: ['T-Shirts', 'Shirts', 'Dresses', 'Jeans', 'Trousers', 'Ethnic Wear', 'Jackets', 'Tops'] },
      Size: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
      PageMeta: {
        type: 'object',
        properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } },
      },
      VariantInput: {
        type: 'object',
        required: ['sku', 'size', 'color'],
        properties: {
          sku: { type: 'string' },
          size: { $ref: '#/components/schemas/Size' },
          color: { type: 'string' },
          stock: { type: 'integer', minimum: 0, default: 0 },
          reorderThreshold: { type: 'integer', minimum: 0, default: 5 },
        },
      },
      Variant: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          sku: { type: 'string' },
          size: { $ref: '#/components/schemas/Size' },
          color: { type: 'string' },
          stock: { type: 'integer' },
          reorderThreshold: { type: 'integer' },
          stockLevel: { type: 'string', enum: ['in_stock', 'low', 'out'] },
        },
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          sku: { type: 'string' },
          brand: { type: 'string' },
          category: { $ref: '#/components/schemas/Category' },
          description: { type: 'string' },
          sellingPrice: { type: 'number' },
          costPrice: { type: 'number' },
          status: { type: 'string', enum: ['active', 'archived'] },
          variants: { type: 'array', items: { $ref: '#/components/schemas/Variant' } },
          totalStock: { type: 'integer' },
          lowStockVariants: { type: 'integer' },
          outOfStockVariants: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateProduct: {
        type: 'object',
        required: ['name', 'sku', 'brand', 'category', 'sellingPrice', 'costPrice', 'variants'],
        properties: {
          name: { type: 'string' },
          sku: { type: 'string' },
          brand: { type: 'string' },
          category: { $ref: '#/components/schemas/Category' },
          description: { type: 'string' },
          sellingPrice: { type: 'number', minimum: 0 },
          costPrice: { type: 'number', minimum: 0 },
          variants: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/VariantInput' } },
        },
      },
      UpdateProduct: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          brand: { type: 'string' },
          category: { $ref: '#/components/schemas/Category' },
          description: { type: 'string' },
          sellingPrice: { type: 'number', minimum: 0 },
          costPrice: { type: 'number', minimum: 0 },
          status: { type: 'string', enum: ['active', 'archived'] },
        },
      },
      StockMovement: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          productId: { type: 'string' },
          productName: { type: 'string' },
          variantId: { type: 'string' },
          variantSku: { type: 'string' },
          type: { type: 'string', enum: ['receipt', 'adjustment', 'sale', 'return'] },
          quantityChange: { type: 'integer', description: 'Signed' },
          balanceAfter: { type: 'integer' },
          reason: { type: 'string' },
          reference: { type: 'string', nullable: true },
          reversed: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      LowStockRow: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          productName: { type: 'string' },
          variantId: { type: 'string' },
          variantSku: { type: 'string' },
          size: { type: 'string' },
          color: { type: 'string' },
          stock: { type: 'integer' },
          reorderThreshold: { type: 'integer' },
          level: { type: 'string', enum: ['low', 'out'] },
        },
      },
      Receipt: {
        type: 'object',
        required: ['productId', 'variantId', 'quantity'],
        properties: { productId: { type: 'string' }, variantId: { type: 'string' }, quantity: { type: 'integer', minimum: 1 }, reason: { type: 'string' } },
      },
      Adjustment: {
        type: 'object',
        required: ['productId', 'variantId', 'quantityChange', 'reason'],
        properties: { productId: { type: 'string' }, variantId: { type: 'string' }, quantityChange: { type: 'integer' }, reason: { type: 'string' } },
      },
      SaleDeduction: {
        type: 'object',
        required: ['reference', 'items'],
        properties: {
          reference: { type: 'string', minLength: 8 },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { productId: { type: 'string' }, variantId: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } },
            },
          },
        },
      },
      SaleRestoration: {
        type: 'object',
        required: ['reference'],
        properties: { reference: { type: 'string' }, reason: { type: 'string' } },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} },
          },
        },
      },
    },
    responses: {
      ValidationError: { description: 'Validation failed (VALIDATION_ERROR)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'Resource not found (NOT_FOUND)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Conflict: { description: 'DUPLICATE_KEY, INSUFFICIENT_STOCK, DUPLICATE_VARIANT or PRODUCT_ARCHIVED', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  },
};

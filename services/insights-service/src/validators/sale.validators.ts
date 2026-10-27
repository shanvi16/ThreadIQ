import { z } from 'zod';
import { dateRangeShape } from '../utils/dates';
import { objectId, paginationQuery, round2 } from '../utils/http';

/**
 * Only identifiers and quantities are accepted from the client. Any prices or totals sent are
 * stripped (zod object default) and recomputed from the Catalog Service on the backend.
 */
export const createSaleBody = z.object({
  idempotencyKey: z
    .string({ required_error: 'An Idempotency-Key header (or idempotencyKey field) is required' })
    .trim()
    .min(8, 'Idempotency key must be at least 8 characters')
    .max(100),
  items: z
    .array(
      z.object({
        productId: objectId,
        variantId: objectId,
        quantity: z
          .number({ invalid_type_error: 'Quantity must be a number', required_error: 'Quantity is required' })
          .int('Quantity must be a whole number')
          .min(1, 'Quantity must be at least 1')
          .max(10_000, 'Quantity is too large'),
      }),
    )
    .min(1, 'A sale needs at least one line item')
    .max(50, 'A sale may contain at most 50 lines'),
  discount: z
    .number({ invalid_type_error: 'Discount must be a number' })
    .finite()
    .min(0, 'Discount cannot be negative')
    .max(10_000_000)
    .default(0)
    .transform(round2),
});
export type CreateSaleInput = z.infer<typeof createSaleBody>;

export const listSalesQuery = z.object({
  ...paginationQuery,
  ...dateRangeShape,
  q: z.string().trim().max(60).optional(),
});

export const idParams = z.object({ id: objectId });

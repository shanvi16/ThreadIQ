import { z } from 'zod';
import { MAX_QUANTITY, MOVEMENT_TYPES } from '../config/constants';
import { objectId, paginationQuery } from '../utils/http';
import { positiveQuantity } from './product.validators';

const reason = (min = 1) => z.string().trim().min(min, 'A reason is required').max(300);
const reference = z.string().trim().min(8, 'Reference must be at least 8 characters').max(120);

export const receiptBody = z
  .object({
    productId: objectId,
    variantId: objectId,
    quantity: positiveQuantity('Quantity'),
    reason: reason().default('Stock received'),
  })
  .strict();

export const adjustmentBody = z
  .object({
    productId: objectId,
    variantId: objectId,
    quantityChange: z
      .number({ invalid_type_error: 'Quantity change must be a number', required_error: 'Quantity change is required' })
      .int('Quantity change must be a whole number')
      .min(-MAX_QUANTITY)
      .max(MAX_QUANTITY)
      .refine((n) => n !== 0, 'Quantity change cannot be zero'),
    reason: reason(),
  })
  .strict();

export const saleDeductionBody = z
  .object({
    reference,
    items: z
      .array(
        z
          .object({ productId: objectId, variantId: objectId, quantity: positiveQuantity('Quantity') })
          .strict(),
      )
      .min(1, 'At least one item is required')
      .max(50),
  })
  .strict();

export const saleRestorationBody = z
  .object({ reference, reason: reason().default('Sale could not be completed') })
  .strict();

const dateParam = z.coerce.date();

export const listMovementsQuery = z.object({
  ...paginationQuery,
  productId: objectId.optional(),
  variantId: objectId.optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: dateParam.optional(),
  to: dateParam.optional(),
});

export const lowStockQuery = z.object({
  ...paginationQuery,
  limit: z.coerce.number().int().min(1).max(200).default(50),
  level: z.enum(['all', 'low', 'out']).default('all'),
});

export const snapshotQuery = z.object({
  status: z.enum(['active', 'all']).default('active'),
});

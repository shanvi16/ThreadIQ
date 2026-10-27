import { z } from 'zod';
import { CATEGORIES, DEFAULT_REORDER_THRESHOLD, MAX_QUANTITY, PRODUCT_STATUSES, SIZES } from '../config/constants';
import { objectId, paginationQuery, round2 } from '../utils/http';

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export const skuSchema = z
  .string()
  .trim()
  .min(2, 'SKU must be at least 2 characters')
  .max(40, 'SKU must be at most 40 characters')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'SKU may only contain letters, digits, ".", "_" and "-"')
  .transform((s) => s.toUpperCase());

const money = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number`, required_error: `${label} is required` })
    .finite()
    .min(0, `${label} cannot be negative`)
    .max(10_000_000, `${label} is too large`)
    .transform(round2);

export const quantity = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number`, required_error: `${label} is required` })
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(MAX_QUANTITY, `${label} is too large`);

export const positiveQuantity = (label: string) => quantity(label).min(1, `${label} must be at least 1`);

const category = z.enum(CATEGORIES, { errorMap: () => ({ message: `Category must be one of: ${CATEGORIES.join(', ')}` }) });
const size = z.enum(SIZES, { errorMap: () => ({ message: `Size must be one of: ${SIZES.join(', ')}` }) });
const color = z.string().trim().min(1, 'Color is required').max(30).transform(titleCase);

export const variantInput = z
  .object({
    sku: skuSchema,
    size,
    color,
    stock: quantity('Stock').default(0),
    reorderThreshold: quantity('Reorder threshold').default(DEFAULT_REORDER_THRESHOLD),
  })
  .strict();
export type VariantInput = z.infer<typeof variantInput>;

/** Rejects duplicate variant SKUs and duplicate size+color combinations. */
export function findVariantConflict(variants: Pick<VariantInput, 'sku' | 'size' | 'color'>[]): string | null {
  const skus = new Set<string>();
  const combos = new Set<string>();
  for (const v of variants) {
    if (skus.has(v.sku)) return `Duplicate variant SKU "${v.sku}"`;
    skus.add(v.sku);
    const combo = `${v.size}|${v.color.toLowerCase()}`;
    if (combos.has(combo)) return `Duplicate variant combination ${v.size} / ${v.color}`;
    combos.add(combo);
  }
  return null;
}

const productFields = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  brand: z.string().trim().min(1, 'Brand is required').max(80),
  category,
  description: z.string().trim().max(2000).default(''),
  sellingPrice: money('Selling price'),
  costPrice: money('Cost price'),
};

export const createProductBody = z
  .object({
    ...productFields,
    sku: skuSchema,
    variants: z.array(variantInput).min(1, 'At least one variant is required').max(60),
  })
  .strict()
  .superRefine((val, ctx) => {
    const conflict = findVariantConflict(val.variants);
    if (conflict) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variants'], message: conflict });
  });

export const updateProductBody = z
  .object({
    name: productFields.name,
    brand: productFields.brand,
    category: productFields.category,
    description: z.string().trim().max(2000),
    sellingPrice: productFields.sellingPrice,
    costPrice: productFields.costPrice,
    status: z.enum(PRODUCT_STATUSES),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

export const idParams = z.object({ id: objectId });
export const variantParams = z.object({ id: objectId, variantId: objectId });

export const updateVariantBody = z
  .object({ reorderThreshold: quantity('Reorder threshold') })
  .strict();

export const listProductsQuery = z.object({
  ...paginationQuery,
  q: z.string().trim().max(100).optional(),
  category: category.optional(),
  size: size.optional(),
  color: z.string().trim().min(1).max(30).transform(titleCase).optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'sellingPrice']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type ListProductsQuery = z.infer<typeof listProductsQuery>;

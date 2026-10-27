import { z } from 'zod';
import { CATEGORIES, SIZES } from '../../types/api';

const whole = (label: string) =>
  z.number({ invalid_type_error: `${label}: enter a number` }).int(`${label}: whole numbers only`).min(0, `${label} cannot be negative`).max(1_000_000, `${label} is too large`);

const price = (label: string) =>
  z.number({ invalid_type_error: `${label}: enter a number` }).min(0, `${label} cannot be negative`).max(10_000_000, `${label} is too large`);

export const skuField = z
  .string()
  .trim()
  .min(2, 'SKU must be at least 2 characters')
  .max(40, 'SKU must be at most 40 characters')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Use letters, digits, ".", "_" or "-"');

export const variantSchema = z.object({
  sku: skuField,
  size: z.enum(SIZES, { errorMap: () => ({ message: 'Choose a size' }) }),
  color: z.string().trim().min(1, 'Colour is required').max(30, 'At most 30 characters'),
  stock: whole('Stock'),
  reorderThreshold: whole('Reorder level'),
});
export type VariantValues = z.infer<typeof variantSchema>;

const productBase = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120, 'At most 120 characters'),
  brand: z.string().trim().min(1, 'Brand is required').max(80, 'At most 80 characters'),
  category: z.enum(CATEGORIES, { errorMap: () => ({ message: 'Choose a category' }) }),
  description: z.string().trim().max(2000, 'At most 2000 characters'),
  sellingPrice: price('Selling price'),
  costPrice: price('Cost price'),
});

/** Detects duplicate variant SKUs and duplicate size + colour combinations. */
export function variantConflicts(variants: { sku: string; size: string; color: string }[]): Map<number, string> {
  const problems = new Map<number, string>();
  const skus = new Map<string, number>();
  const combos = new Map<string, number>();
  variants.forEach((v, i) => {
    const sku = v.sku.trim().toUpperCase();
    const combo = `${v.size}|${v.color.trim().toLowerCase()}`;
    if (sku && skus.has(sku)) problems.set(i, `Duplicate variant SKU "${sku}"`);
    if (v.color.trim() && combos.has(combo)) problems.set(i, `Duplicate combination ${v.size} / ${v.color.trim()}`);
    if (sku) skus.set(sku, i);
    if (v.color.trim()) combos.set(combo, i);
  });
  return problems;
}

export const createProductSchema = productBase
  .extend({
    sku: skuField,
    variants: z.array(variantSchema).min(1, 'Add at least one variant'),
  })
  .superRefine((val, ctx) => {
    for (const [index, message] of variantConflicts(val.variants)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variants', index, 'sku'], message });
    }
  });
export type CreateProductValues = z.infer<typeof createProductSchema>;

export const editProductSchema = productBase;
export type EditProductValues = z.infer<typeof editProductSchema>;

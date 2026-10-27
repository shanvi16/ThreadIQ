import type { FilterQuery, SortOrder } from 'mongoose';
import { logger } from '../config/logger';
import type { ProductAttrs } from '../models/product.model';
import { movementRepository } from '../repositories/movement.repository';
import { productRepository } from '../repositories/product.repository';
import { conflict, notFound } from '../utils/errors';
import { buildMeta, escapeRegex } from '../utils/http';
import {
  findVariantConflict,
  type ListProductsQuery,
  type VariantInput,
} from '../validators/product.validators';
import { toProductDto } from './mappers';

type CreateInput = Pick<ProductAttrs, 'name' | 'brand' | 'category' | 'description' | 'sellingPrice' | 'costPrice'> & {
  sku: string;
  variants: VariantInput[];
};

async function recordInitialStock(product: NonNullable<Awaited<ReturnType<typeof productRepository.findById>>>, skus?: string[]) {
  const variants = product.variants.filter((v) => v.stock > 0 && (!skus || skus.includes(v.sku)));
  if (variants.length === 0) return;
  await movementRepository.insertMany(
    variants.map((v) => ({
      productId: product._id as never,
      productName: product.name,
      productSku: product.sku,
      variantId: v._id,
      variantSku: v.sku,
      size: v.size,
      color: v.color,
      type: 'receipt' as const,
      quantityChange: v.stock,
      balanceAfter: v.stock,
      reason: 'Initial stock',
    })),
  );
}

export const productService = {
  async create(input: CreateInput) {
    const created = await productRepository.create(input as Partial<ProductAttrs>);
    const product = await productRepository.findById(String(created._id));
    try {
      await recordInitialStock(product!);
    } catch (err) {
      logger.error({ err }, 'Initial stock movements failed; removing product');
      await productRepository.deleteById(String(created._id));
      throw err;
    }
    return toProductDto(product!);
  },

  async getById(id: string) {
    const product = await productRepository.findById(id);
    if (!product) throw notFound('Product');
    return toProductDto(product);
  },

  async list(query: ListProductsQuery) {
    const filter: FilterQuery<ProductAttrs> = {};
    if (query.status !== 'all') filter.status = query.status;
    if (query.category) filter.category = query.category;
    if (query.size && query.color) filter.variants = { $elemMatch: { size: query.size, color: query.color } };
    else if (query.size) filter['variants.size'] = query.size;
    else if (query.color) filter['variants.color'] = query.color;
    if (query.q) {
      const rx = new RegExp(escapeRegex(query.q), 'i');
      filter.$or = [{ name: rx }, { sku: rx }, { brand: rx }, { 'variants.sku': rx }];
    }
    const sort: Record<string, SortOrder> = { [query.sortBy]: query.order === 'asc' ? 1 : -1, _id: 1 };

    const { items, total } = await productRepository.list(filter, sort, query.page, query.limit);
    return { data: items.map(toProductDto), meta: buildMeta(query.page, query.limit, total) };
  },

  /** Metadata only. Stock can only change through the inventory endpoints. */
  async update(id: string, patch: Partial<Omit<ProductAttrs, 'variants'>>) {
    const product = await productRepository.update(id, patch);
    if (!product) throw notFound('Product');
    return toProductDto(product);
  },

  /** DELETE is a soft delete: the product is archived so historical sales and movements stay meaningful. */
  async archive(id: string) {
    return this.update(id, { status: 'archived' });
  },

  async addVariant(id: string, variant: VariantInput) {
    const product = await productRepository.findById(id);
    if (!product) throw notFound('Product');
    const problem = findVariantConflict([...product.variants, variant]);
    if (problem) throw conflict('DUPLICATE_VARIANT', problem);

    const updated = await productRepository.addVariant(id, variant);
    if (!updated) throw notFound('Product');
    await recordInitialStock(updated, [variant.sku]);
    return toProductDto(updated);
  },

  async setReorderThreshold(id: string, variantId: string, reorderThreshold: number) {
    const updated = await productRepository.setReorderThreshold(id, variantId, reorderThreshold);
    if (!updated) throw notFound('Product variant');
    return toProductDto(updated);
  },
};

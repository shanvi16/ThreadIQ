import { randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import type { CatalogClient, CatalogProduct } from '../clients/catalog.client';
import { logger } from '../config/logger';
import type { SaleAttrs, SaleItem } from '../models/sale.model';
import { saleRepository } from '../repositories/sale.repository';
import { AppError, notFound } from '../utils/errors';
import { buildMeta, escapeRegex, round2 } from '../utils/http';
import { isoDay, parseDateBound } from '../utils/dates';
import type { CreateSaleInput } from '../validators/sale.validators';

type SaleDoc = SaleAttrs & { _id: unknown };

export const toSaleDto = (s: SaleDoc) => ({
  id: String(s._id),
  saleNumber: s.saleNumber,
  items: s.items.map((i) => ({
    productId: String(i.productId),
    variantId: String(i.variantId),
    sku: i.sku,
    productSku: i.productSku,
    productName: i.productName,
    category: i.category,
    size: i.size,
    color: i.color,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    lineTotal: i.lineTotal,
  })),
  unitsSold: s.items.reduce((sum, i) => sum + i.quantity, 0),
  subtotal: s.subtotal,
  discount: s.discount,
  total: s.total,
  createdAt: s.createdAt,
});

const isDuplicateKey = (err: unknown): err is { code: number; keyValue?: Record<string, unknown> } =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

const generateSaleNumber = (now: Date) =>
  `TIQ-${isoDay(now).replaceAll('-', '')}-${randomBytes(3).toString('hex').toUpperCase()}`;

/** Merges repeated lines for the same variant so stock is checked and deducted once per variant. */
function mergeLines(items: CreateSaleInput['items']) {
  const merged = new Map<string, { productId: string; variantId: string; quantity: number }>();
  for (const item of items) {
    const key = `${item.productId}:${item.variantId}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += item.quantity;
    else merged.set(key, { ...item });
  }
  return [...merged.values()];
}

export interface SaleServiceDeps {
  catalog: CatalogClient;
  now?: () => Date;
}

export function createSaleService({ catalog, now = () => new Date() }: SaleServiceDeps) {
  /** Step 1-3: validate every line against the Catalog Service and snapshot names/prices. */
  async function buildLines(lines: ReturnType<typeof mergeLines>): Promise<SaleItem[]> {
    const products = new Map<string, CatalogProduct>();
    for (const productId of new Set(lines.map((l) => l.productId))) {
      const product = await catalog.getProduct(productId);
      if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product ${productId} does not exist`, { productId });
      products.set(productId, product);
    }

    return lines.map((line) => {
      const product = products.get(line.productId)!;
      const variant = product.variants.find((v) => v.id === line.variantId);
      if (!variant) {
        throw new AppError(404, 'VARIANT_NOT_FOUND', `Variant ${line.variantId} does not exist on "${product.name}"`, line);
      }
      if (product.status !== 'active') {
        throw new AppError(409, 'PRODUCT_ARCHIVED', `"${product.name}" is archived and cannot be sold`, { productId: product.id });
      }
      if (variant.stock < line.quantity) {
        throw new AppError(
          409,
          'INSUFFICIENT_STOCK',
          `Insufficient stock for ${product.name} (${variant.sku}): ${variant.stock} available, ${line.quantity} requested`,
          { productId: product.id, variantId: variant.id, sku: variant.sku, available: variant.stock, requested: line.quantity },
        );
      }
      const unitPrice = round2(product.sellingPrice);
      return {
        productId: product.id as unknown as Types.ObjectId,
        variantId: variant.id as unknown as Types.ObjectId,
        sku: variant.sku,
        productSku: product.sku,
        productName: product.name,
        category: product.category,
        size: variant.size,
        color: variant.color,
        quantity: line.quantity,
        unitPrice,
        lineTotal: round2(unitPrice * line.quantity),
      };
    });
  }

  async function persist(base: Omit<SaleAttrs, 'saleNumber' | 'createdAt'>) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await saleRepository.create({ ...base, saleNumber: generateSaleNumber(now()) });
      } catch (err) {
        const retryable = isDuplicateKey(err) && err.keyValue && 'saleNumber' in err.keyValue && attempt < 3;
        if (!retryable) throw err;
      }
    }
  }

  return {
    /**
     * Records a sale. Workflow (see docs/architecture.md):
     *  1. replay check by idempotency key  2. validate lines + prices against the catalog
     *  3. compute totals on the backend    4. deduct stock via Catalog Service (atomic per variant)
     *  5. persist the sale                 6. if persisting fails, compensate by restoring the stock
     */
    async create(input: CreateSaleInput): Promise<{ sale: ReturnType<typeof toSaleDto>; replayed: boolean }> {
      const existing = await saleRepository.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return { sale: toSaleDto(existing as SaleDoc), replayed: true };

      const lines = mergeLines(input.items);
      const items = await buildLines(lines);

      const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
      if (input.discount > subtotal) {
        throw new AppError(400, 'INVALID_DISCOUNT', `Discount (${input.discount}) cannot exceed the subtotal (${subtotal})`, {
          discount: input.discount,
          subtotal,
        });
      }
      const total = round2(subtotal - input.discount);

      // The idempotency key doubles as the stock reference, so a retry never deducts twice.
      await catalog.deductStock(
        input.idempotencyKey,
        lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
      );

      try {
        const sale = await persist({ idempotencyKey: input.idempotencyKey, items, subtotal, discount: input.discount, total });
        return { sale: toSaleDto(sale as SaleDoc), replayed: false };
      } catch (err) {
        if (isDuplicateKey(err) && err.keyValue && 'idempotencyKey' in err.keyValue) {
          // A concurrent request with the same key saved the sale first; its stock deduction is the one that counts.
          const winner = await saleRepository.findByIdempotencyKey(input.idempotencyKey);
          if (winner) return { sale: toSaleDto(winner as SaleDoc), replayed: true };
        }
        logger.error({ err, idempotencyKey: input.idempotencyKey }, 'Sale persistence failed after stock deduction; compensating');
        let compensated = true;
        await catalog
          .restoreStock(input.idempotencyKey, 'Sale could not be saved')
          .catch((restoreErr) => {
            compensated = false;
            logger.error(
              { err: restoreErr, idempotencyKey: input.idempotencyKey },
              'COMPENSATION FAILED: stock needs reconciliation. Retrying the same request is safe (idempotent).',
            );
          });
        throw new AppError(
          500,
          'SALE_PERSISTENCE_FAILED',
          compensated
            ? 'The sale could not be saved. Inventory was restored; please try again.'
            : 'The sale could not be saved and inventory restoration is pending. Retrying the same request is safe.',
          { compensated },
        );
      }
    },

    async getById(id: string) {
      const sale = await saleRepository.findById(id);
      if (!sale) throw notFound('Sale');
      return toSaleDto(sale as SaleDoc);
    },

    async list(query: { page: number; limit: number; from?: string; to?: string; q?: string }) {
      const filter: Record<string, unknown> = {};
      if (query.from || query.to) {
        const from = query.from ? parseDateBound(query.from, false) : new Date(0);
        const to = query.to ? parseDateBound(query.to, true) : new Date(8.64e15);
        if (from > to) throw new AppError(400, 'VALIDATION_ERROR', '"from" must not be after "to"');
        filter.createdAt = { $gte: from, $lte: to };
      }
      if (query.q) filter.saleNumber = new RegExp(escapeRegex(query.q), 'i');
      const { items, total } = await saleRepository.list(filter, query.page, query.limit);
      return { data: (items as SaleDoc[]).map(toSaleDto), meta: buildMeta(query.page, query.limit, total) };
    },
  };
}

export type SaleService = ReturnType<typeof createSaleService>;

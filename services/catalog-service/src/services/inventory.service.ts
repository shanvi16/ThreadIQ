import type { FilterQuery } from 'mongoose';
import type { MovementType } from '../config/constants';
import { logger } from '../config/logger';
import type { StockMovementAttrs } from '../models/stock-movement.model';
import { movementRepository } from '../repositories/movement.repository';
import { productRepository } from '../repositories/product.repository';
import { AppError, conflict, notFound } from '../utils/errors';
import { buildMeta } from '../utils/http';
import { toMovementDto } from './mappers';

interface StockChange {
  productId: string;
  variantId: string;
  /** Signed quantity change. */
  delta: number;
  type: MovementType;
  reason: string;
  reference?: string;
}

type MovementDoc = StockMovementAttrs & { _id: unknown };

interface AppliedChange {
  movement: MovementDoc;
  alreadyApplied: boolean;
}

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

async function explainFailedChange(c: StockChange): Promise<AppError> {
  const product = await productRepository.findById(c.productId);
  if (!product) return notFound('Product');
  const variant = product.variants.find((v) => String(v._id) === c.variantId);
  if (!variant) return notFound('Variant');
  if (c.type === 'sale' && product.status !== 'active') {
    return conflict('PRODUCT_ARCHIVED', `Product "${product.name}" is archived and cannot be sold`);
  }
  return conflict(
    'INSUFFICIENT_STOCK',
    `Insufficient stock for ${product.name} (${variant.sku}): ${variant.stock} available, ${-c.delta} requested`,
    {
      productId: c.productId,
      variantId: c.variantId,
      sku: variant.sku,
      available: variant.stock,
      requested: -c.delta,
    },
  );
}

/**
 * Applies one signed stock change atomically and records the matching movement.
 * Order: conditional stock update first (guarantees non-negative stock), then the movement.
 * If the movement cannot be stored the stock change is compensated.
 */
async function applyChange(c: StockChange): Promise<AppliedChange> {
  const updated = await productRepository.changeStock(c.productId, c.variantId, c.delta, {
    requireActive: c.type === 'sale',
  });
  if (!updated) throw await explainFailedChange(c);

  const variant = updated.variants.find((v) => String(v._id) === c.variantId)!;
  try {
    const movement = await movementRepository.create({
      productId: updated._id as never,
      productName: updated.name,
      productSku: updated.sku,
      variantId: variant._id,
      variantSku: variant.sku,
      size: variant.size,
      color: variant.color,
      type: c.type,
      quantityChange: c.delta,
      balanceAfter: variant.stock,
      reason: c.reason,
      reference: c.reference,
    });
    return { movement: movement.toObject() as MovementDoc, alreadyApplied: false };
  } catch (err) {
    // Undo the stock change so stock and movement history never diverge.
    await productRepository.changeStock(c.productId, c.variantId, -c.delta).catch((undoErr) =>
      logger.error({ err: undoErr, change: c }, 'Failed to undo stock change after movement error'),
    );
    if (isDuplicateKey(err) && c.reference) {
      // A concurrent request with the same sale reference won the race: treat as already applied.
      const existing = await movementRepository.findActiveSale(c.reference, c.variantId);
      if (existing) return { movement: existing as MovementDoc, alreadyApplied: true };
    }
    throw err;
  }
}

async function reverseSaleMovement(movement: MovementDoc, reason: string): Promise<boolean> {
  const claimed = await movementRepository.claimReversal(movement._id);
  if (!claimed) return false; // already reversed by someone else
  try {
    await applyChange({
      productId: String(movement.productId),
      variantId: String(movement.variantId),
      delta: -movement.quantityChange,
      type: 'return',
      reason,
      reference: movement.reference,
    });
    return true;
  } catch (err) {
    await movementRepository.releaseReversal(movement._id);
    throw err;
  }
}

export interface ChangeInput {
  productId: string;
  variantId: string;
  reason: string;
}

export const inventoryService = {
  async receive(input: ChangeInput & { quantity: number }) {
    const { movement } = await applyChange({
      productId: input.productId,
      variantId: input.variantId,
      delta: input.quantity,
      type: 'receipt',
      reason: input.reason,
    });
    return toMovementDto(movement);
  },

  async adjust(input: ChangeInput & { quantityChange: number }) {
    const { movement } = await applyChange({
      productId: input.productId,
      variantId: input.variantId,
      delta: input.quantityChange,
      type: 'adjustment',
      reason: input.reason,
    });
    return toMovementDto(movement);
  },

  /**
   * Deducts stock for a sale. Idempotent per (reference, variant): replaying the same reference
   * never deducts twice. If any line fails, lines applied by this call are rolled back.
   */
  async deductForSale(reference: string, items: { productId: string; variantId: string; quantity: number }[]) {
    const lines = new Map<string, { productId: string; variantId: string; quantity: number }>();
    for (const item of items) {
      const key = `${item.productId}:${item.variantId}`;
      const line = lines.get(key);
      if (line) line.quantity += item.quantity;
      else lines.set(key, { ...item });
    }

    const applied: AppliedChange[] = [];
    const results: {
      productId: string;
      variantId: string;
      quantity: number;
      balanceAfter: number;
      alreadyApplied: boolean;
    }[] = [];

    try {
      for (const line of lines.values()) {
        const existing = await movementRepository.findActiveSale(reference, line.variantId);
        const outcome: AppliedChange = existing
          ? { movement: existing as MovementDoc, alreadyApplied: true }
          : await applyChange({
              productId: line.productId,
              variantId: line.variantId,
              delta: -line.quantity,
              type: 'sale',
              reason: `Sale ${reference}`,
              reference,
            });
        applied.push(outcome);
        results.push({
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          balanceAfter: outcome.movement.balanceAfter,
          alreadyApplied: outcome.alreadyApplied,
        });
      }
    } catch (err) {
      for (const a of applied.filter((x) => !x.alreadyApplied)) {
        await reverseSaleMovement(a.movement, 'Rolled back: sale deduction failed').catch((rollbackErr) =>
          logger.error({ err: rollbackErr, reference }, 'Rollback of partial sale deduction failed'),
        );
      }
      throw err;
    }
    return { reference, items: results };
  },

  /** Compensation: returns the stock of every active sale deduction for a reference. Idempotent. */
  async restoreForSale(reference: string, reason: string) {
    const movements = (await movementRepository.findActiveSalesByReference(reference)) as MovementDoc[];
    let restored = 0;
    for (const m of movements) {
      if (await reverseSaleMovement(m, reason)) restored += 1;
    }
    return { reference, restoredLines: restored };
  },

  async listMovements(query: {
    page: number;
    limit: number;
    productId?: string;
    variantId?: string;
    type?: MovementType;
    from?: Date;
    to?: Date;
  }) {
    const filter: FilterQuery<StockMovementAttrs> = {};
    if (query.productId) filter.productId = query.productId;
    if (query.variantId) filter.variantId = query.variantId;
    if (query.type) filter.type = query.type;
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    const { items, total } = await movementRepository.list(filter, query.page, query.limit);
    return { data: (items as MovementDoc[]).map(toMovementDto), meta: buildMeta(query.page, query.limit, total) };
  },

  async lowStock(query: { page: number; limit: number; level: 'all' | 'low' | 'out' }) {
    const { items, total } = await productRepository.lowStock(query.level, query.page, query.limit);
    const data = items.map((row: Record<string, unknown> & { stock: number }) => ({
      ...row,
      productId: String(row.productId),
      variantId: String(row.variantId),
      level: row.stock === 0 ? 'out' : 'low',
    }));
    return { data, meta: buildMeta(query.page, query.limit, total) };
  },

  async snapshot(status: 'active' | 'all') {
    const rows = await productRepository.snapshot(status);
    return rows.map((r: Record<string, unknown>) => ({
      ...r,
      productId: String(r.productId),
      variantId: String(r.variantId),
    }));
  },

  async summary() {
    const [byCategory, activeProducts] = await Promise.all([
      productRepository.stockByCategory(),
      productRepository.countActive(),
    ]);
    const categories = byCategory.map((c) => ({
      category: c._id as string,
      units: c.units as number,
      valueAtCost: Math.round(c.valueAtCost * 100) / 100,
      variants: c.variants as number,
      lowStockVariants: c.lowStockVariants as number,
      outOfStockVariants: c.outOfStockVariants as number,
    }));
    const sum = (key: 'units' | 'valueAtCost' | 'lowStockVariants' | 'outOfStockVariants') =>
      categories.reduce((acc, c) => acc + c[key], 0);
    return {
      activeProducts,
      totalUnits: sum('units'),
      inventoryValueAtCost: Math.round(sum('valueAtCost') * 100) / 100,
      lowStockVariants: sum('lowStockVariants'),
      outOfStockVariants: sum('outOfStockVariants'),
      byCategory: categories,
    };
  },
};

import type { FilterQuery } from 'mongoose';
import { StockMovementModel, type StockMovementAttrs } from '../models/stock-movement.model';

export const movementRepository = {
  create: (data: Partial<StockMovementAttrs>) => StockMovementModel.create(data),

  insertMany: (docs: Partial<StockMovementAttrs>[]) => StockMovementModel.insertMany(docs),

  findActiveSale: (reference: string, variantId: string) =>
    StockMovementModel.findOne({ reference, variantId, type: 'sale', reversed: false }).lean(),

  findActiveSalesByReference: (reference: string) =>
    StockMovementModel.find({ reference, type: 'sale', reversed: false }).lean(),

  /** Atomically flags a movement as reversed. Returns null if it was already reversed. */
  claimReversal: (id: unknown) =>
    StockMovementModel.findOneAndUpdate({ _id: id, reversed: false }, { $set: { reversed: true } }).lean(),

  releaseReversal: (id: unknown) => StockMovementModel.updateOne({ _id: id }, { $set: { reversed: false } }),

  async list(filter: FilterQuery<StockMovementAttrs>, page: number, limit: number) {
    const [items, total] = await Promise.all([
      StockMovementModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StockMovementModel.countDocuments(filter),
    ]);
    return { items, total };
  },

  deleteByProduct: (productId: string) => StockMovementModel.deleteMany({ productId }),
};

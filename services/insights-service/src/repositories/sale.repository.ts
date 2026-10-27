import type { FilterQuery } from 'mongoose';
import { SaleModel, type SaleAttrs } from '../models/sale.model';

export const saleRepository = {
  create: async (data: Omit<SaleAttrs, 'createdAt'> & { createdAt?: Date }) => (await SaleModel.create(data)).toObject(),

  findById: (id: string) => SaleModel.findById(id).lean(),

  findByIdempotencyKey: (key: string) => SaleModel.findOne({ idempotencyKey: key }).lean(),

  async list(filter: FilterQuery<SaleAttrs>, page: number, limit: number) {
    const [items, total] = await Promise.all([
      SaleModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SaleModel.countDocuments(filter),
    ]);
    return { items, total };
  },
};

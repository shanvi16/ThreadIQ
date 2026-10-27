import type { FilterQuery, SortOrder } from 'mongoose';
import { ProductModel, type ProductAttrs } from '../models/product.model';

export const productRepository = {
  create: (data: Partial<ProductAttrs>) => ProductModel.create(data),

  findById: (id: string) => ProductModel.findById(id).lean(),

  async list(filter: FilterQuery<ProductAttrs>, sort: Record<string, SortOrder>, page: number, limit: number) {
    const [items, total] = await Promise.all([
      ProductModel.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ProductModel.countDocuments(filter),
    ]);
    return { items, total };
  },

  update: (id: string, patch: Partial<ProductAttrs>) =>
    ProductModel.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean(),

  deleteById: (id: string) => ProductModel.deleteOne({ _id: id }),

  /**
   * Atomic conditional stock update on a single variant.
   * The `$elemMatch` + `$gte` condition and the `$inc` happen in one document operation, so concurrent
   * deductions can never push stock below zero. Returns null when the condition did not match.
   */
  changeStock(
    productId: string,
    variantId: string,
    delta: number,
    opts: { requireActive?: boolean } = {},
  ) {
    const minStock = delta < 0 ? -delta : 0;
    const filter: FilterQuery<ProductAttrs> = {
      _id: productId,
      variants: { $elemMatch: { _id: variantId, stock: { $gte: minStock } } },
    };
    if (opts.requireActive) filter.status = 'active';
    return ProductModel.findOneAndUpdate(filter, { $inc: { 'variants.$.stock': delta } }, { new: true }).lean();
  },

  addVariant: (id: string, variant: Record<string, unknown>) =>
    ProductModel.findByIdAndUpdate(id, { $push: { variants: variant } }, { new: true, runValidators: true }).lean(),

  setReorderThreshold: (id: string, variantId: string, reorderThreshold: number) =>
    ProductModel.findOneAndUpdate(
      { _id: id, 'variants._id': variantId },
      { $set: { 'variants.$.reorderThreshold': reorderThreshold } },
      { new: true },
    ).lean(),

  /** Flat list of variants joined with product data, optionally limited to low/out-of-stock rows. */
  async lowStock(level: 'all' | 'low' | 'out', page: number, limit: number) {
    const stockMatch =
      level === 'out'
        ? { 'variants.stock': 0 }
        : level === 'low'
          ? { $expr: { $and: [{ $gt: ['$variants.stock', 0] }, { $lte: ['$variants.stock', '$variants.reorderThreshold'] }] } }
          : { $expr: { $lte: ['$variants.stock', '$variants.reorderThreshold'] } };

    const [result] = await ProductModel.aggregate([
      { $match: { status: 'active' } },
      { $unwind: '$variants' },
      { $match: stockMatch },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          productName: '$name',
          productSku: '$sku',
          category: 1,
          variantId: '$variants._id',
          variantSku: '$variants.sku',
          size: '$variants.size',
          color: '$variants.color',
          stock: '$variants.stock',
          reorderThreshold: '$variants.reorderThreshold',
        },
      },
      { $sort: { stock: 1, productName: 1, variantSku: 1 } },
      {
        $facet: {
          items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: 'n' }],
        },
      },
    ]);
    return { items: result?.items ?? [], total: result?.total?.[0]?.n ?? 0 };
  },

  /** One row per variant (flat) used by the Insights Service for analytics. */
  snapshot: (status: 'active' | 'all') =>
    ProductModel.aggregate([
      ...(status === 'active' ? [{ $match: { status: 'active' } }] : []),
      { $unwind: '$variants' },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          productName: '$name',
          productSku: '$sku',
          category: 1,
          status: 1,
          sellingPrice: 1,
          costPrice: 1,
          productCreatedAt: '$createdAt',
          variantId: '$variants._id',
          variantSku: '$variants.sku',
          size: '$variants.size',
          color: '$variants.color',
          stock: '$variants.stock',
          reorderThreshold: '$variants.reorderThreshold',
        },
      },
      { $sort: { productName: 1, variantSku: 1 } },
    ]),

  /** Inventory KPIs for active products, grouped by category. */
  async stockByCategory() {
    return ProductModel.aggregate([
      { $match: { status: 'active' } },
      { $unwind: '$variants' },
      {
        $group: {
          _id: '$category',
          units: { $sum: '$variants.stock' },
          valueAtCost: { $sum: { $multiply: ['$variants.stock', '$costPrice'] } },
          variants: { $sum: 1 },
          lowStockVariants: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$variants.stock', 0] }, { $lte: ['$variants.stock', '$variants.reorderThreshold'] }] },
                1,
                0,
              ],
            },
          },
          outOfStockVariants: { $sum: { $cond: [{ $eq: ['$variants.stock', 0] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  },

  countActive: () => ProductModel.countDocuments({ status: 'active' }),
};

import { Types } from 'mongoose';
import { SaleModel } from '../models/sale.model';
import type { DateRange } from '../utils/dates';

const inRange = ({ from, to }: DateRange) => ({ createdAt: { $gte: from, $lte: to } });

/**
 * Net revenue of a line = line total scaled by (order total / order subtotal), so the order-level
 * discount is spread proportionally across lines and category/product revenue adds up to the order totals.
 */
const netLineRevenue = {
  $multiply: ['$items.lineTotal', { $cond: [{ $gt: ['$subtotal', 0] }, { $divide: ['$total', '$subtotal'] }, 1] }],
};

export interface Totals {
  revenue: number;
  grossSales: number;
  discounts: number;
  salesCount: number;
  unitsSold: number;
}

export interface WindowSpec {
  name: string;
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
}

export const analyticsRepository = {
  async totals(range: DateRange): Promise<Totals> {
    const [row] = await SaleModel.aggregate([
      { $match: inRange(range) },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$total' },
          grossSales: { $sum: '$subtotal' },
          discounts: { $sum: '$discount' },
          salesCount: { $sum: 1 },
          unitsSold: { $sum: { $sum: '$items.quantity' } },
        },
      },
    ]);
    return row ?? { revenue: 0, grossSales: 0, discounts: 0, salesCount: 0, unitsSold: 0 };
  },

  dailyRevenue(range: DateRange): Promise<{ _id: string; revenue: number; orders: number; units: number }[]> {
    return SaleModel.aggregate([
      { $match: inRange(range) },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
          units: { $sum: { $sum: '$items.quantity' } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  },

  byCategory(range: DateRange): Promise<{ _id: string; revenue: number; units: number }[]> {
    return SaleModel.aggregate([
      { $match: inRange(range) },
      { $unwind: '$items' },
      { $group: { _id: '$items.category', revenue: { $sum: netLineRevenue }, units: { $sum: '$items.quantity' } } },
      { $sort: { revenue: -1 } },
    ]);
  },

  byProduct(range: DateRange, sortBy: 'units' | 'revenue', limit: number) {
    return SaleModel.aggregate([
      { $match: inRange(range) },
      { $sort: { createdAt: -1 } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.productName' },
          productSku: { $first: '$items.productSku' },
          category: { $first: '$items.category' },
          units: { $sum: '$items.quantity' },
          revenue: { $sum: netLineRevenue },
        },
      },
      { $sort: { [sortBy]: -1, productName: 1 } },
      { $limit: limit },
    ]) as Promise<
      { _id: Types.ObjectId; productName: string; productSku: string; category: string; units: number; revenue: number }[]
    >;
  },

  /** Per-product unit counts: all time, last sale, and one column per requested window. */
  async productStats(windows: WindowSpec[]): Promise<Map<string, Record<string, number> & { lastSoldAt: Date | null; total: number }>> {
    const windowSums = Object.fromEntries(
      windows.map((w) => [
        w.name,
        {
          $sum: {
            $cond: [{ $and: [{ $gte: ['$createdAt', w.from] }, { $lt: ['$createdAt', w.to] }] }, '$items.quantity', 0],
          },
        },
      ]),
    );
    const rows = await SaleModel.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          total: { $sum: '$items.quantity' },
          lastSoldAt: { $max: '$createdAt' },
          ...windowSums,
        },
      },
    ]);
    return new Map(rows.map((r) => [String(r._id), r]));
  },

  /** Units sold per variant in [from, to). */
  async variantUnits(from: Date, to: Date): Promise<Map<string, number>> {
    const rows = await SaleModel.aggregate([
      { $match: { createdAt: { $gte: from, $lt: to } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.variantId', units: { $sum: '$items.quantity' } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), r.units as number]));
  },
};

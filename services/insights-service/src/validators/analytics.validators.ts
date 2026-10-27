import { z } from 'zod';
import { dateRangeShape } from '../utils/dates';

const optionalNumber = (min: number, max: number, integer = false) => {
  const base = z.coerce.number().min(min).max(max);
  return (integer ? base.int() : base).optional();
};

export const rangeQuery = z.object({ ...dateRangeShape });

export const revenueTrendQuery = z.object({
  ...dateRangeShape,
  interval: z.enum(['day', 'week']).default('day'),
});

export const topProductsQuery = z.object({
  ...dateRangeShape,
  limit: z.coerce.number().int().min(1).max(50).default(5),
  sortBy: z.enum(['units', 'revenue']).default('units'),
});

export const slowMovingQuery = z.object({
  days: optionalNumber(7, 365, true),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(['no_sales_history', 'no_recent_sales', 'low_velocity']).optional(),
});

export const trendScoresQuery = z.object({
  windowDays: optionalNumber(3, 60, true),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  category: z.string().trim().max(40).optional(),
});

export const restockQuery = z.object({
  windowDays: optionalNumber(7, 180, true),
  coverDays: optionalNumber(1, 180),
  targetDays: optionalNumber(1, 365),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  priority: z.enum(['critical', 'high', 'medium']).optional(),
});

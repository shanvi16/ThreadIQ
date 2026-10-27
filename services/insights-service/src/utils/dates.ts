import { z } from 'zod';
import { AppError } from './errors';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 731;
const DAY_MS = 86_400_000;

/** Accepts YYYY-MM-DD or a full ISO date-time. */
export const dateInput = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(new Date(s).getTime()), 'Must be a valid date (YYYY-MM-DD or ISO 8601)');

export const dateRangeShape = {
  from: dateInput.optional(),
  to: dateInput.optional(),
};

/** Parses YYYY-MM-DD (start or end of that UTC day) or a full ISO date-time. */
export const parseDateBound = (s: string, endOfDay: boolean): Date =>
  new Date(DATE_ONLY.test(s) ? `${s}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : s);

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Resolves optional from/to query values into a concrete UTC range.
 * A date-only `to` is inclusive of the whole day. Defaults to the last `defaultDays` days.
 */
export function resolveRange(q: { from?: string; to?: string }, now: Date, defaultDays = 30): DateRange {
  const to = q.to ? parseDateBound(q.to, true) : now;
  const from = q.from ? parseDateBound(q.from, false) : new Date(startOfUtcDay(to).getTime() - (defaultDays - 1) * DAY_MS);

  if (from.getTime() > to.getTime()) throw new AppError(400, 'VALIDATION_ERROR', '"from" must not be after "to"');
  if ((to.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS) {
    throw new AppError(400, 'VALIDATION_ERROR', `Date range may not exceed ${MAX_RANGE_DAYS} days`);
  }
  return { from, to };
}

export const startOfUtcDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Monday-based week start (UTC). */
export function startOfUtcWeek(d: Date): Date {
  const day = startOfUtcDay(d);
  const offset = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - offset * DAY_MS);
}

export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

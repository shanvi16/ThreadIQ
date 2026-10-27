/**
 * Pure analytics rules (no I/O). Every formula here is documented in docs/architecture.md.
 * These are transparent rule-based heuristics, NOT machine learning or statistical forecasts.
 */
import type { AnalyticsConfig } from '../config/analytics';

export const clamp = (n: number, min = 0, max = 100): number => Math.min(max, Math.max(min, n));
export const round1 = (n: number): number => Math.round(n * 10) / 10;
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const MS_PER_DAY = 86_400_000;
export const daysBetween = (from: Date, to: Date): number => Math.max(0, (to.getTime() - from.getTime()) / MS_PER_DAY);

/* ------------------------------------------------------------------ trend score */

export type TrendDataStatus = 'ok' | 'insufficient_history' | 'no_sales';
export type TrendLabel = 'hot' | 'rising' | 'steady' | 'cooling' | 'inactive';

export interface TrendInput {
  recentUnits: number;
  previousUnits: number;
  /** Units currently in stock across all variants. */
  totalStock: number;
  productAgeDays: number;
}

export interface TrendResult {
  score: number;
  label: TrendLabel;
  dataStatus: TrendDataStatus;
  components: { velocity: number; growth: number; urgency: number };
  weighted: { velocity: number; growth: number; urgency: number };
  recentUnits: number;
  previousUnits: number;
  unitsPerDay: number;
  /** Percentage change vs previous window; null when the previous window had no sales. */
  growthPercent: number | null;
  stockCoverDays: number | null;
  explanation: string;
}

/**
 * score = 0.60*velocity + 0.25*growth + 0.15*urgency   (each component is 0..100, result clamped to 0..100)
 *  velocity = clamp(unitsPerDay / baselineUnitsPerDay * 100)
 *  growth   = clamp(50 + 50 * (recent - previous) / previous)   when previous > 0
 *           = 100 ("new demand")  when previous = 0 and recent > 0
 *           = 0                   when both windows are empty
 *  urgency  = clamp(100 * (1 - stockCoverDays / targetCoverDays)), 0 when there is no demand
 */
export function computeTrendScore(input: TrendInput, cfg: AnalyticsConfig['trend']): TrendResult {
  const { recentUnits, previousUnits, totalStock, productAgeDays } = input;
  const unitsPerDay = recentUnits / cfg.windowDays;

  const velocity = clamp((unitsPerDay / cfg.baselineUnitsPerDay) * 100);

  let growth: number;
  let growthPercent: number | null = null;
  if (previousUnits > 0) {
    const change = (recentUnits - previousUnits) / previousUnits;
    growthPercent = round1(change * 100);
    growth = clamp(50 + 50 * change);
  } else {
    growth = recentUnits > 0 ? 100 : 0;
  }

  const stockCoverDays = unitsPerDay > 0 ? totalStock / unitsPerDay : null;
  const urgency = stockCoverDays === null ? 0 : clamp(100 * (1 - stockCoverDays / cfg.targetCoverDays));

  const { weights } = cfg;
  const weighted = {
    velocity: round1(weights.velocity * velocity),
    growth: round1(weights.growth * growth),
    urgency: round1(weights.urgency * urgency),
  };
  const score = round1(clamp(weights.velocity * velocity + weights.growth * growth + weights.urgency * urgency));

  const dataStatus: TrendDataStatus =
    recentUnits + previousUnits === 0 ? 'no_sales' : productAgeDays < cfg.windowDays * 2 ? 'insufficient_history' : 'ok';
  const label: TrendLabel =
    dataStatus === 'no_sales' ? 'inactive' : score >= 70 ? 'hot' : score >= 50 ? 'rising' : score >= 25 ? 'steady' : 'cooling';

  const growthText =
    previousUnits > 0
      ? `${growthPercent! >= 0 ? '+' : ''}${growthPercent}% vs the previous ${cfg.windowDays} days`
      : recentUnits > 0
        ? 'new demand (no sales in the previous window)'
        : 'no sales in either window';
  const coverText = stockCoverDays === null ? 'no recent demand, so no stock urgency' : `${round1(stockCoverDays)} days of stock cover`;
  const caveat =
    dataStatus === 'insufficient_history'
      ? ' Limited history: the product is newer than two windows, so treat this as a rough heuristic.'
      : '';
  const explanation = `${recentUnits} units in the last ${cfg.windowDays} days (${round1(unitsPerDay)}/day); ${growthText}; ${coverText}.${caveat}`;

  return {
    score,
    label,
    dataStatus,
    components: { velocity: round1(velocity), growth: round1(growth), urgency: round1(urgency) },
    weighted,
    recentUnits,
    previousUnits,
    unitsPerDay: round2(unitsPerDay),
    growthPercent,
    stockCoverDays: stockCoverDays === null ? null : round1(stockCoverDays),
    explanation,
  };
}

/* ------------------------------------------------------------------ slow-moving */

export type SlowMovingStatus =
  | 'out_of_stock'
  | 'too_new'
  | 'no_sales_history'
  | 'no_recent_sales'
  | 'low_velocity'
  | 'ok';

export interface SlowMovingInput {
  totalStock: number;
  unitsInPeriod: number;
  unitsAllTime: number;
  productAgeDays: number;
}

/**
 * Order of rules matters:
 *  1. no stock                         -> out_of_stock (not "slow", simply unavailable)
 *  2. younger than the look-back period -> too_new (not enough history to judge)
 *  3. never sold                       -> no_sales_history
 *  4. sold before, none in the period  -> no_recent_sales
 *  5. units/day <= threshold           -> low_velocity
 */
export function classifySlowMoving(input: SlowMovingInput, cfg: AnalyticsConfig['slowMoving']): SlowMovingStatus {
  if (input.totalStock <= 0) return 'out_of_stock';
  if (input.productAgeDays < cfg.lookbackDays) return 'too_new';
  if (input.unitsAllTime === 0) return 'no_sales_history';
  if (input.unitsInPeriod === 0) return 'no_recent_sales';
  if (input.unitsInPeriod / cfg.lookbackDays <= cfg.maxUnitsPerDay) return 'low_velocity';
  return 'ok';
}

/* ------------------------------------------------------------------ restock */

export type RestockPriority = 'critical' | 'high' | 'medium';
export type RestockDataStatus = 'ok' | 'limited_history' | 'no_recent_sales';
export type RestockReason = 'out_of_stock' | 'below_reorder_level' | 'low_cover';

export interface RestockInput {
  stock: number;
  reorderThreshold: number;
  unitsInWindow: number;
  variantAgeDays: number;
}

export interface RestockResult {
  avgDailyUnits: number;
  coverDays: number | null;
  reasons: RestockReason[];
  priority: RestockPriority;
  dataStatus: RestockDataStatus;
  targetStock: number;
  suggestedQuantity: number;
  explanation: string;
}

/**
 * avgDaily  = unitsInWindow / windowDays
 * coverDays = stock / avgDaily            (null when avgDaily = 0: no division by zero)
 * flagged when stock <= reorderThreshold OR coverDays < coverThresholdDays
 * target    = ceil(avgDaily * targetCoverDays) + reorderThreshold   (safety stock)
 *             or 2 * reorderThreshold when there were no recent sales (labelled heuristic)
 * suggested = max(0, target - stock)
 */
export function computeRestock(input: RestockInput, cfg: AnalyticsConfig['restock']): RestockResult | null {
  const { stock, reorderThreshold, unitsInWindow, variantAgeDays } = input;
  const avgDaily = unitsInWindow / cfg.windowDays;
  const coverDays = avgDaily > 0 ? stock / avgDaily : null;

  const reasons: RestockReason[] = [];
  if (stock === 0) reasons.push('out_of_stock');
  if (stock <= reorderThreshold && stock > 0) reasons.push('below_reorder_level');
  if (coverDays !== null && coverDays < cfg.coverThresholdDays && stock > 0) reasons.push('low_cover');

  if (reasons.length === 0) return null;

  const dataStatus: RestockDataStatus =
    unitsInWindow === 0 ? 'no_recent_sales' : variantAgeDays < cfg.windowDays ? 'limited_history' : 'ok';

  const demandForTarget = Math.ceil((unitsInWindow * cfg.targetCoverDays) / cfg.windowDays);
  const targetStock = avgDaily > 0 ? demandForTarget + reorderThreshold : reorderThreshold * 2;
  const suggestedQuantity = Math.max(0, targetStock - stock);
  if (suggestedQuantity === 0) return null;

  const priority: RestockPriority = stock === 0 ? 'critical' : coverDays !== null && coverDays < 7 ? 'high' : 'medium';

  const basis =
    avgDaily > 0
      ? `Selling ~${round2(avgDaily)} units/day over the last ${cfg.windowDays} days; target = ${cfg.targetCoverDays} days of demand + reorder level (${reorderThreshold}) = ${targetStock}.`
      : `No sales in the last ${cfg.windowDays} days; heuristic target = 2 x reorder level = ${targetStock}.`;
  const explanation = `${basis} Stock ${stock} -> order ${suggestedQuantity} (estimate).`;

  return {
    avgDailyUnits: round2(avgDaily),
    coverDays: coverDays === null ? null : round1(coverDays),
    reasons,
    priority,
    dataStatus,
    targetStock,
    suggestedQuantity,
    explanation,
  };
}

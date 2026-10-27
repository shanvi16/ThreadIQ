import { describe, expect, it } from 'vitest';
import { classifySlowMoving, clamp, computeRestock, computeTrendScore } from '../src/analytics/calculations';
import { defaultAnalyticsConfig } from '../src/config/analytics';

const trendCfg = { windowDays: 14, baselineUnitsPerDay: 2, targetCoverDays: 30, weights: { velocity: 0.6, growth: 0.25, urgency: 0.15 } };
const slowCfg = { lookbackDays: 30, maxUnitsPerDay: 0.1 };
const restockCfg = { windowDays: 30, coverThresholdDays: 14, targetCoverDays: 30 };

describe('clamp', () => {
  it('limits values to 0..100', () => {
    expect(clamp(-5)).toBe(0);
    expect(clamp(250)).toBe(100);
    expect(clamp(42)).toBe(42);
  });
});

describe('computeTrendScore', () => {
  it('uses the documented weights 60/25/15', () => {
    expect(defaultAnalyticsConfig.trend.weights).toEqual({ velocity: 0.6, growth: 0.25, urgency: 0.15 });
  });

  it('handles a product with no sales in either window (zero history, zero denominators)', () => {
    const r = computeTrendScore({ recentUnits: 0, previousUnits: 0, totalStock: 20, productAgeDays: 90 }, trendCfg);
    expect(r.score).toBe(0);
    expect(r.dataStatus).toBe('no_sales');
    expect(r.label).toBe('inactive');
    expect(r.growthPercent).toBeNull();
    expect(r.stockCoverDays).toBeNull();
    expect(r.components).toEqual({ velocity: 0, growth: 0, urgency: 0 });
    expect(Number.isFinite(r.score)).toBe(true);
  });

  it('treats sales after an empty previous window as new demand (growth = 100) without dividing by zero', () => {
    const r = computeTrendScore({ recentUnits: 7, previousUnits: 0, totalStock: 100, productAgeDays: 90 }, trendCfg);
    expect(r.components.growth).toBe(100);
    expect(r.growthPercent).toBeNull();
    expect(r.explanation).toContain('new demand');
  });

  it('computes a known example exactly', () => {
    // 14 units / 14 days = 1/day -> velocity 50; +100% growth -> 100; stock 10 -> cover 10d -> urgency 66.7
    const r = computeTrendScore({ recentUnits: 14, previousUnits: 7, totalStock: 10, productAgeDays: 90 }, trendCfg);
    expect(r.components).toEqual({ velocity: 50, growth: 100, urgency: 66.7 });
    expect(r.score).toBe(65); // 0.6*50 + 0.25*100 + 0.15*66.67 = 65.0
    expect(r.growthPercent).toBe(100);
    expect(r.stockCoverDays).toBe(10);
    expect(r.label).toBe('rising');
  });

  it('clamps the score and components to the 0..100 range', () => {
    const hot = computeTrendScore({ recentUnits: 1000, previousUnits: 1, totalStock: 0, productAgeDays: 90 }, trendCfg);
    expect(hot.score).toBe(100);
    expect(hot.components.velocity).toBe(100);
    const crashed = computeTrendScore({ recentUnits: 0, previousUnits: 100, totalStock: 500, productAgeDays: 90 }, trendCfg);
    expect(crashed.components.growth).toBe(0);
    expect(crashed.score).toBeGreaterThanOrEqual(0);
    expect(crashed.score).toBeLessThanOrEqual(100);
  });

  it('flags young products as insufficient history', () => {
    const r = computeTrendScore({ recentUnits: 5, previousUnits: 0, totalStock: 10, productAgeDays: 10 }, trendCfg);
    expect(r.dataStatus).toBe('insufficient_history');
    expect(r.explanation).toContain('Limited history');
  });
});

describe('classifySlowMoving', () => {
  const base = { totalStock: 10, unitsInPeriod: 0, unitsAllTime: 0, productAgeDays: 90 };
  it('distinguishes the documented cases', () => {
    expect(classifySlowMoving({ ...base, totalStock: 0 }, slowCfg)).toBe('out_of_stock');
    expect(classifySlowMoving({ ...base, productAgeDays: 5 }, slowCfg)).toBe('too_new');
    expect(classifySlowMoving(base, slowCfg)).toBe('no_sales_history');
    expect(classifySlowMoving({ ...base, unitsAllTime: 8 }, slowCfg)).toBe('no_recent_sales');
    expect(classifySlowMoving({ ...base, unitsAllTime: 8, unitsInPeriod: 3 }, slowCfg)).toBe('low_velocity'); // 0.1/day
    expect(classifySlowMoving({ ...base, unitsAllTime: 8, unitsInPeriod: 4 }, slowCfg)).toBe('ok');
  });
  it('never labels a brand-new product with no sales as slow-moving', () => {
    expect(classifySlowMoving({ ...base, productAgeDays: 2 }, slowCfg)).toBe('too_new');
  });
});

describe('computeRestock', () => {
  it('suggests a quantity from target stock minus current stock', () => {
    // 30 units in 30 days = 1/day, stock 4, threshold 5 -> target 30 + 5 = 35 -> order 31
    const r = computeRestock({ stock: 4, reorderThreshold: 5, unitsInWindow: 30, variantAgeDays: 90 }, restockCfg)!;
    expect(r.avgDailyUnits).toBe(1);
    expect(r.coverDays).toBe(4);
    expect(r.reasons).toEqual(['below_reorder_level', 'low_cover']);
    expect(r.targetStock).toBe(35);
    expect(r.suggestedQuantity).toBe(31);
    expect(r.priority).toBe('high');
    expect(r.dataStatus).toBe('ok');
  });

  it('flags low cover even when above the reorder level', () => {
    const r = computeRestock({ stock: 12, reorderThreshold: 5, unitsInWindow: 30, variantAgeDays: 90 }, restockCfg)!;
    expect(r.reasons).toEqual(['low_cover']);
    expect(r.priority).toBe('medium');
  });

  it('avoids division by zero when there are no recent sales', () => {
    const r = computeRestock({ stock: 0, reorderThreshold: 5, unitsInWindow: 0, variantAgeDays: 90 }, restockCfg)!;
    expect(r.coverDays).toBeNull();
    expect(r.avgDailyUnits).toBe(0);
    expect(r.priority).toBe('critical');
    expect(r.dataStatus).toBe('no_recent_sales');
    expect(r.targetStock).toBe(10);
    expect(r.suggestedQuantity).toBe(10);
  });

  it('returns null for healthy variants and for no-demand variants above the reorder level', () => {
    expect(computeRestock({ stock: 100, reorderThreshold: 5, unitsInWindow: 10, variantAgeDays: 90 }, restockCfg)).toBeNull();
    expect(computeRestock({ stock: 50, reorderThreshold: 5, unitsInWindow: 0, variantAgeDays: 90 }, restockCfg)).toBeNull();
  });

  it('marks young variants as limited history', () => {
    const r = computeRestock({ stock: 1, reorderThreshold: 5, unitsInWindow: 4, variantAgeDays: 10 }, restockCfg)!;
    expect(r.dataStatus).toBe('limited_history');
  });
});

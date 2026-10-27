import { env } from './env';

/** Tunable analytics rules. Defaults are documented in docs/architecture.md. */
export interface AnalyticsConfig {
  trend: {
    windowDays: number;
    baselineUnitsPerDay: number;
    targetCoverDays: number;
    weights: { velocity: number; growth: number; urgency: number };
  };
  slowMoving: { lookbackDays: number; maxUnitsPerDay: number };
  restock: { windowDays: number; coverThresholdDays: number; targetCoverDays: number };
}

export const defaultAnalyticsConfig: AnalyticsConfig = {
  trend: {
    windowDays: env.TREND_WINDOW_DAYS,
    baselineUnitsPerDay: env.TREND_BASELINE_UNITS_PER_DAY,
    targetCoverDays: env.TREND_TARGET_COVER_DAYS,
    weights: { velocity: 0.6, growth: 0.25, urgency: 0.15 },
  },
  slowMoving: { lookbackDays: env.SLOW_LOOKBACK_DAYS, maxUnitsPerDay: env.SLOW_MAX_UNITS_PER_DAY },
  restock: {
    windowDays: env.RESTOCK_WINDOW_DAYS,
    coverThresholdDays: env.RESTOCK_COVER_THRESHOLD_DAYS,
    targetCoverDays: env.RESTOCK_TARGET_COVER_DAYS,
  },
};

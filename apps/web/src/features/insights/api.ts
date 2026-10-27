import { useQuery } from '@tanstack/react-query';
import { insightsHttp } from '../../lib/http';
import type {
  CategoryPerformance,
  Overview,
  RestockPriority,
  RestockRecommendations,
  RevenueTrend,
  Single,
  SlowMoving,
  SlowStatus,
  TopProducts,
  TrendScores,
} from '../../types/api';

interface Range {
  from: string;
  to: string;
}

const get = async <T,>(path: string, params?: Record<string, string | number | undefined>) => (await insightsHttp.get<Single<T>>(path, params)).data;

export const useOverview = (r: Range) =>
  useQuery({ queryKey: ['analytics', 'overview', r], queryFn: () => get<Overview>('/api/v1/analytics/overview', { ...r }) });

export const useRevenueTrend = (r: Range, interval: 'day' | 'week') =>
  useQuery({ queryKey: ['analytics', 'revenue-trend', r, interval], queryFn: () => get<RevenueTrend>('/api/v1/analytics/revenue-trend', { ...r, interval }) });

export const useCategoryPerformance = (r: Range) =>
  useQuery({ queryKey: ['analytics', 'category-performance', r], queryFn: () => get<CategoryPerformance>('/api/v1/analytics/category-performance', { ...r }) });

export const useTopProducts = (r: Range, sortBy: 'units' | 'revenue', limit = 5) =>
  useQuery({ queryKey: ['analytics', 'top-products', r, sortBy, limit], queryFn: () => get<TopProducts>('/api/v1/analytics/top-products', { ...r, sortBy, limit }) });

export const useSlowMoving = (limit = 50, status?: SlowStatus) =>
  useQuery({ queryKey: ['analytics', 'slow-moving', limit, status], queryFn: () => get<SlowMoving>('/api/v1/analytics/slow-moving', { limit, status }) });

export const useTrendScores = (limit = 50) =>
  useQuery({ queryKey: ['analytics', 'trend-scores', limit], queryFn: () => get<TrendScores>('/api/v1/analytics/trend-scores', { limit }) });

export const useRestock = (limit = 100, priority?: RestockPriority) =>
  useQuery({ queryKey: ['analytics', 'restock', limit, priority], queryFn: () => get<RestockRecommendations>('/api/v1/analytics/restock-recommendations', { limit, priority }) });

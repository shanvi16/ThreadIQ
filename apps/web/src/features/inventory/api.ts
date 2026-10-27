import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogHttp } from '../../lib/http';
import type { LowStockRow, MovementType, Paginated, Single, StockMovement } from '../../types/api';
import { invalidateCatalogData } from '../products/api';

export const useLowStock = (params: { level: 'all' | 'low' | 'out'; page: number; limit: number }) =>
  useQuery({
    queryKey: ['inventory', 'low-stock', params],
    queryFn: () => catalogHttp.get<Paginated<LowStockRow>>('/api/v1/inventory/low-stock', params),
    placeholderData: keepPreviousData,
  });

export const useMovements = (params: { page: number; limit: number; type?: MovementType | ''; productId?: string }) =>
  useQuery({
    queryKey: ['inventory', 'movements', params],
    queryFn: () => catalogHttp.get<Paginated<StockMovement>>('/api/v1/inventory/movements', params),
    placeholderData: keepPreviousData,
  });

export function useReceiveStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { productId: string; variantId: string; quantity: number; reason?: string }) =>
      (await catalogHttp.post<Single<StockMovement>>('/api/v1/inventory/receipts', body)).data,
    onSuccess: () => invalidateCatalogData(qc),
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { productId: string; variantId: string; quantityChange: number; reason: string }) =>
      (await catalogHttp.post<Single<StockMovement>>('/api/v1/inventory/adjustments', body)).data,
    onSuccess: () => invalidateCatalogData(qc),
  });
}

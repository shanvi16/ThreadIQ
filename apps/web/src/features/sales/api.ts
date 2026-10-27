import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { insightsHttp } from '../../lib/http';
import type { CreateSaleRequest, Paginated, Sale, Single } from '../../types/api';
import { invalidateCatalogData } from '../products/api';

export interface SaleFilters {
  page: number;
  limit: number;
  from?: string;
  to?: string;
  q?: string;
}

export const useSales = (filters: SaleFilters) =>
  useQuery({
    queryKey: ['sales', 'list', filters],
    queryFn: () => insightsHttp.get<Paginated<Sale>>('/api/v1/sales', { ...filters }),
    placeholderData: keepPreviousData,
  });

export const useSale = (id: string | undefined) =>
  useQuery({
    queryKey: ['sales', 'detail', id],
    queryFn: async () => (await insightsHttp.get<Single<Sale>>(`/api/v1/sales/${id}`)).data,
    enabled: Boolean(id),
  });

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    // The idempotency key makes a repeated submission of the same form return the original sale.
    mutationFn: async (body: CreateSaleRequest) =>
      insightsHttp.post<Single<Sale> & { meta: { replayed: boolean } }>('/api/v1/sales', body, { 'Idempotency-Key': body.idempotencyKey }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['sales'] }), invalidateCatalogData(qc)]);
    },
  });
}

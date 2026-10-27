import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { catalogHttp } from '../../lib/http';
import type { Category, Paginated, Product, ProductStatus, Single, Size } from '../../types/api';

export interface ProductFilters {
  page: number;
  limit: number;
  q?: string;
  category?: Category | '';
  size?: Size | '';
  color?: string;
  status: ProductStatus | 'all';
  sortBy: 'name' | 'createdAt' | 'updatedAt' | 'sellingPrice';
  order: 'asc' | 'desc';
}

export interface CreateProductBody {
  name: string;
  sku: string;
  brand: string;
  category: Category;
  description: string;
  sellingPrice: number;
  costPrice: number;
  variants: { sku: string; size: Size; color: string; stock: number; reorderThreshold: number }[];
}
export type UpdateProductBody = Partial<Pick<Product, 'name' | 'brand' | 'category' | 'description' | 'sellingPrice' | 'costPrice' | 'status'>>;

/** Anything that changes stock or products must refresh every view derived from them. */
export const invalidateCatalogData = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: ['products'] }),
    qc.invalidateQueries({ queryKey: ['inventory'] }),
    qc.invalidateQueries({ queryKey: ['analytics'] }),
  ]);

export const useProducts = (filters: ProductFilters) =>
  useQuery({
    queryKey: ['products', 'list', filters],
    queryFn: () => catalogHttp.get<Paginated<Product>>('/api/v1/products', { ...filters }),
    placeholderData: keepPreviousData,
  });

export const useProduct = (id: string | undefined) =>
  useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: async () => (await catalogHttp.get<Single<Product>>(`/api/v1/products/${id}`)).data,
    enabled: Boolean(id),
  });

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateProductBody) => (await catalogHttp.post<Single<Product>>('/api/v1/products', body)).data,
    onSuccess: () => invalidateCatalogData(qc),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateProductBody) => (await catalogHttp.patch<Single<Product>>(`/api/v1/products/${id}`, body)).data,
    onSuccess: () => invalidateCatalogData(qc),
  });
}

/** DELETE archives the product (soft delete); restoring is a PATCH back to active. */
export function useSetProductStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProductStatus }) =>
      status === 'archived'
        ? (await catalogHttp.delete<Single<Product>>(`/api/v1/products/${id}`)).data
        : (await catalogHttp.patch<Single<Product>>(`/api/v1/products/${id}`, { status: 'active' })).data,
    onSuccess: () => invalidateCatalogData(qc),
  });
}

export function useAddVariant(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateProductBody['variants'][number]) =>
      (await catalogHttp.post<Single<Product>>(`/api/v1/products/${productId}/variants`, body)).data,
    onSuccess: () => invalidateCatalogData(qc),
  });
}

export function useSetReorderThreshold(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ variantId, reorderThreshold }: { variantId: string; reorderThreshold: number }) =>
      (await catalogHttp.patch<Single<Product>>(`/api/v1/products/${productId}/variants/${variantId}`, { reorderThreshold })).data,
    onSuccess: () => invalidateCatalogData(qc),
  });
}

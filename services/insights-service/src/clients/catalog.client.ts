import { logger } from '../config/logger';
import { AppError } from '../utils/errors';

export interface CatalogVariant {
  id: string;
  sku: string;
  size: string;
  color: string;
  stock: number;
  reorderThreshold: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  sellingPrice: number;
  status: 'active' | 'archived';
  variants: CatalogVariant[];
}

/** One row per variant, as returned by the Catalog Service snapshot endpoint. */
export interface CatalogVariantRow {
  productId: string;
  productName: string;
  productSku: string;
  category: string;
  status: 'active' | 'archived';
  sellingPrice: number;
  costPrice: number;
  productCreatedAt: string;
  variantId: string;
  variantSku: string;
  size: string;
  color: string;
  stock: number;
  reorderThreshold: number;
}

export interface CatalogSummary {
  activeProducts: number;
  totalUnits: number;
  inventoryValueAtCost: number;
  lowStockVariants: number;
  outOfStockVariants: number;
  byCategory: {
    category: string;
    units: number;
    valueAtCost: number;
    variants: number;
    lowStockVariants: number;
    outOfStockVariants: number;
  }[];
}

export interface DeductionLine {
  productId: string;
  variantId: string;
  quantity: number;
}

/** Port used by the services; the real implementation talks HTTP, tests use a stub. */
export interface CatalogClient {
  getProduct(id: string): Promise<CatalogProduct | null>;
  deductStock(reference: string, items: DeductionLine[]): Promise<void>;
  restoreStock(reference: string, reason: string): Promise<void>;
  getSnapshot(): Promise<CatalogVariantRow[]>;
  getSummary(): Promise<CatalogSummary>;
}

const unavailable = (detail: string) =>
  new AppError(503, 'CATALOG_UNAVAILABLE', 'The Catalog Service is currently unavailable. Please try again shortly.', { detail });

export class HttpCatalogClient implements CatalogClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  private async request(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const json = await res.json().catch(() => null);
      if (res.status >= 500) {
        logger.warn({ path, status: res.status }, 'Catalog Service returned a server error');
        throw unavailable(`HTTP ${res.status}`);
      }
      return { status: res.status, json };
    } catch (err) {
      if (err instanceof AppError) throw err;
      const reason = (err as Error).name === 'AbortError' ? `timeout after ${this.timeoutMs}ms` : (err as Error).message;
      logger.warn({ path, reason }, 'Catalog Service request failed');
      throw unavailable(reason);
    } finally {
      clearTimeout(timer);
    }
  }

  private unexpected(path: string, status: number, json: any): AppError {
    return new AppError(502, 'CATALOG_BAD_RESPONSE', `Unexpected response from Catalog Service (${status}) for ${path}`, json?.error);
  }

  /** Returns `json.data` of a 200 response, or throws if the body is not the expected envelope. */
  private dataOf<T>(path: string, status: number, json: any): T {
    if (status !== 200 || json === null || typeof json !== 'object' || !('data' in json)) {
      throw this.unexpected(path, status, json);
    }
    return json.data as T;
  }

  async getProduct(id: string): Promise<CatalogProduct | null> {
    const path = `/api/v1/products/${encodeURIComponent(id)}`;
    const { status, json } = await this.request('GET', path);
    if (status === 404) return null;
    return this.dataOf(path, status, json);
  }

  async deductStock(reference: string, items: DeductionLine[]): Promise<void> {
    const path = '/api/v1/inventory/sale-deductions';
    const { status, json } = await this.request('POST', path, { reference, items });
    if (status === 200) return;
    if (status === 409 || status === 404) {
      throw new AppError(status, json?.error?.code ?? 'STOCK_DEDUCTION_FAILED', json?.error?.message ?? 'Stock deduction failed', json?.error?.details);
    }
    throw this.unexpected(path, status, json);
  }

  async restoreStock(reference: string, reason: string): Promise<void> {
    const path = '/api/v1/inventory/sale-restorations';
    const { status, json } = await this.request('POST', path, { reference, reason });
    if (status !== 200) throw this.unexpected(path, status, json);
  }

  async getSnapshot(): Promise<CatalogVariantRow[]> {
    const path = '/api/v1/inventory/snapshot?status=all';
    const { status, json } = await this.request('GET', path);
    return this.dataOf(path, status, json);
  }

  async getSummary(): Promise<CatalogSummary> {
    const path = '/api/v1/inventory/summary';
    const { status, json } = await this.request('GET', path);
    return this.dataOf(path, status, json);
  }
}

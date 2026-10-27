import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp, type AppDeps } from '../src/app';
import type {
  CatalogClient,
  CatalogProduct,
  CatalogSummary,
  CatalogVariantRow,
  DeductionLine,
} from '../src/clients/catalog.client';
import { defaultAnalyticsConfig } from '../src/config/analytics';
import { SaleModel } from '../src/models/sale.model';
import { AppError } from '../src/utils/errors';

let mongod: MongoMemoryServer | undefined;

export async function startTestDb() {
  const uri = process.env.TEST_MONGO_URI ?? (mongod = await MongoMemoryServer.create()).getUri('threadiq_sales_test');
  await mongoose.connect(uri);
  await SaleModel.init();
}

export async function stopTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongod?.stop();
}

export const clearSales = () => SaleModel.deleteMany({});

export const oid = () => new Types.ObjectId().toHexString();

export interface FakeVariantSpec {
  sku?: string;
  size?: string;
  color?: string;
  stock: number;
  reorderThreshold?: number;
}

export interface FakeProductSpec {
  name: string;
  category?: string;
  sellingPrice?: number;
  costPrice?: number;
  ageDays?: number;
  status?: 'active' | 'archived';
  variants: FakeVariantSpec[];
}

/** In-memory stand-in for the Catalog Service that honours the same stock rules. */
export class FakeCatalog implements CatalogClient {
  products = new Map<string, CatalogProduct & { costPrice: number; createdAt: Date }>();
  down = false;
  deductions = new Map<string, DeductionLine[]>();
  deductCalls = 0;
  restoreCalls: string[] = [];
  failRestore = false;

  constructor(private readonly now: () => Date = () => new Date()) {}

  addProduct(spec: FakeProductSpec) {
    const id = oid();
    const product = {
      id,
      name: spec.name,
      sku: `SKU-${spec.name.replace(/\W+/g, '-').toUpperCase()}`,
      category: spec.category ?? 'Shirts',
      sellingPrice: spec.sellingPrice ?? 1000,
      costPrice: spec.costPrice ?? 400,
      status: spec.status ?? ('active' as const),
      createdAt: new Date(this.now().getTime() - (spec.ageDays ?? 100) * 86_400_000),
      variants: spec.variants.map((v, i) => ({
        id: oid(),
        sku: v.sku ?? `${spec.name.replace(/\W+/g, '-').toUpperCase()}-V${i + 1}`,
        size: v.size ?? 'M',
        color: v.color ?? 'Blue',
        stock: v.stock,
        reorderThreshold: v.reorderThreshold ?? 5,
      })),
    };
    this.products.set(id, product);
    return product;
  }

  stockOf(productId: string, variantId: string) {
    return this.products.get(productId)!.variants.find((v) => v.id === variantId)!.stock;
  }

  private assertUp() {
    if (this.down) throw new AppError(503, 'CATALOG_UNAVAILABLE', 'Catalog down');
  }

  async getProduct(id: string) {
    this.assertUp();
    return this.products.get(id) ?? null;
  }

  async deductStock(reference: string, items: DeductionLine[]) {
    this.assertUp();
    this.deductCalls += 1;
    if (this.deductions.has(reference)) return; // idempotent per reference, like the real service
    for (const item of items) {
      const variant = this.products.get(item.productId)?.variants.find((v) => v.id === item.variantId);
      if (!variant) throw new AppError(404, 'NOT_FOUND', 'Variant not found');
      if (variant.stock < item.quantity) {
        throw new AppError(409, 'INSUFFICIENT_STOCK', `Insufficient stock for ${variant.sku}`, { available: variant.stock });
      }
    }
    for (const item of items) {
      this.products.get(item.productId)!.variants.find((v) => v.id === item.variantId)!.stock -= item.quantity;
    }
    this.deductions.set(reference, items);
  }

  async restoreStock(reference: string) {
    this.assertUp();
    this.restoreCalls.push(reference);
    if (this.failRestore) throw new AppError(503, 'CATALOG_UNAVAILABLE', 'restore failed');
    for (const item of this.deductions.get(reference) ?? []) {
      this.products.get(item.productId)!.variants.find((v) => v.id === item.variantId)!.stock += item.quantity;
    }
    this.deductions.delete(reference);
  }

  async getSnapshot(): Promise<CatalogVariantRow[]> {
    this.assertUp();
    return [...this.products.values()].flatMap((p) =>
      p.variants.map((v) => ({
        productId: p.id,
        productName: p.name,
        productSku: p.sku,
        category: p.category,
        status: p.status,
        sellingPrice: p.sellingPrice,
        costPrice: p.costPrice,
        productCreatedAt: p.createdAt.toISOString(),
        variantId: v.id,
        variantSku: v.sku,
        size: v.size,
        color: v.color,
        stock: v.stock,
        reorderThreshold: v.reorderThreshold,
      })),
    );
  }

  async getSummary(): Promise<CatalogSummary> {
    this.assertUp();
    const rows = (await this.getSnapshot()).filter((r) => r.status === 'active');
    const byCategory = new Map<string, CatalogSummary['byCategory'][number]>();
    for (const r of rows) {
      const c = byCategory.get(r.category) ?? { category: r.category, units: 0, valueAtCost: 0, variants: 0, lowStockVariants: 0, outOfStockVariants: 0 };
      c.units += r.stock;
      c.valueAtCost += r.stock * r.costPrice;
      c.variants += 1;
      if (r.stock === 0) c.outOfStockVariants += 1;
      else if (r.stock <= r.reorderThreshold) c.lowStockVariants += 1;
      byCategory.set(r.category, c);
    }
    const categories = [...byCategory.values()];
    const sum = (k: 'units' | 'valueAtCost' | 'lowStockVariants' | 'outOfStockVariants') => categories.reduce((a, c) => a + c[k], 0);
    return {
      activeProducts: new Set(rows.map((r) => r.productId)).size,
      totalUnits: sum('units'),
      inventoryValueAtCost: sum('valueAtCost'),
      lowStockVariants: sum('lowStockVariants'),
      outOfStockVariants: sum('outOfStockVariants'),
      byCategory: categories,
    };
  }
}

export const apiWith = (deps: AppDeps) => request(createApp({ analyticsConfig: defaultAnalyticsConfig, ...deps }));

let keyCounter = 0;
export const newKey = () => `test-key-${Date.now()}-${(keyCounter += 1)}`;

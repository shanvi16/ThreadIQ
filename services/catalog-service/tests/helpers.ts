import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../src/app';
import { ProductModel } from '../src/models/product.model';
import { StockMovementModel } from '../src/models/stock-movement.model';

let mongod: MongoMemoryServer | undefined;

/** Uses TEST_MONGO_URI when provided, otherwise an in-memory MongoDB. */
export async function startTestDb() {
  const uri = process.env.TEST_MONGO_URI ?? (mongod = await MongoMemoryServer.create()).getUri('threadiq_catalog_test');
  await mongoose.connect(uri);
  await Promise.all([ProductModel.init(), StockMovementModel.init()]);
}

export async function stopTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await mongod?.stop();
}

export async function clearDb() {
  await Promise.all([ProductModel.deleteMany({}), StockMovementModel.deleteMany({})]);
}

export const api = () => request(createApp());

let counter = 0;
export function productPayload(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    name: `Test Shirt ${counter}`,
    sku: `TST-${counter}`,
    brand: 'Loom & Lane',
    category: 'Shirts',
    description: 'A test shirt',
    sellingPrice: 1500,
    costPrice: 600,
    variants: [
      { sku: `TST-${counter}-M-BLUE`, size: 'M', color: 'blue', stock: 10, reorderThreshold: 3 },
      { sku: `TST-${counter}-L-BLUE`, size: 'L', color: 'blue', stock: 4, reorderThreshold: 3 },
    ],
    ...overrides,
  };
}

export async function createProduct(overrides: Record<string, unknown> = {}) {
  const res = await api().post('/api/v1/products').send(productPayload(overrides));
  if (res.status !== 201) throw new Error(`createProduct failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as {
    id: string;
    sku: string;
    variants: { id: string; sku: string; stock: number }[];
  };
}

/**
 * Deterministic demo data for ThreadIQ.
 *
 *   npm run seed
 *
 * RESETS the products/stockmovements collections of the catalog database and the sales collection
 * of the sales database, then re-creates ~20 products, their stock history and ~90 days of sales.
 * Running it twice yields the same data (a seeded PRNG drives everything; dates are relative to
 * today's UTC midnight, or to SEED_REFERENCE_DATE=YYYY-MM-DD when set).
 *
 * The seed writes to MongoDB directly (like a migration tool) and intentionally imports no service code,
 * so the services keep owning their schemas. Stock quantities and stock movements are generated together,
 * so every variant's stock equals the replayed sum of its movements.
 */
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';

const CATALOG_URI = process.env.CATALOG_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/threadiq_catalog';
const SALES_URI = process.env.SALES_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/threadiq_sales';
const HISTORY_DAYS = 90;
const STOCK_START_DAYS = 100;
const DAY_MS = 86_400_000;

/* ----------------------------------------------------------------- helpers */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260101);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const poisson = (lambda: number): number => {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rand();
  } while (p > limit);
  return k - 1;
};
const oid = (key: string) => new mongoose.Types.ObjectId(createHash('sha1').update(key).digest('hex').slice(0, 24));
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');

const reference = (() => {
  const base = process.env.SEED_REFERENCE_DATE ? new Date(`${process.env.SEED_REFERENCE_DATE}T00:00:00Z`) : new Date();
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
})();
const daysAgo = (days: number, hour = 0, minute = 0) => new Date(reference.getTime() - days * DAY_MS + (hour * 60 + minute) * 60_000);

/* ----------------------------------------------------------------- catalog definition */

type StockProfile = 'healthy' | 'tight' | 'critical' | 'overstock' | 'soldout';
interface ProductDef {
  sku: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  cost: number;
  sizes: string[];
  colors: string[];
  /** Expected units/day across all variants: [31+ days ago, 14-30 days ago, last 14 days]. */
  rate: [number, number, number];
  stock: StockProfile;
  ageDays?: number;
  description: string;
}

const LL = 'Loom & Lane';
const SS = 'Saffron Studio';
const products: ProductDef[] = [
  { sku: 'TS-CREW-01', name: 'Everyday Crew Tee', brand: LL, category: 'T-Shirts', price: 799, cost: 280, sizes: ['S', 'M', 'L', 'XL'], colors: ['White', 'Black'], rate: [1.6, 1.8, 2.2], stock: 'tight', description: 'Heavyweight 100% cotton crew-neck tee.' },
  { sku: 'TS-GRAPH-01', name: 'Studio Graphic Tee', brand: LL, category: 'T-Shirts', price: 999, cost: 350, sizes: ['S', 'M', 'L'], colors: ['Sand', 'Sage'], rate: [1.0, 1.2, 2.8], stock: 'critical', description: 'Screen-printed graphic tee, relaxed fit.' },
  { sku: 'TS-BOXY-01', name: 'Boxy Oversized Tee', brand: LL, category: 'T-Shirts', price: 1099, cost: 380, sizes: ['M', 'L', 'XL'], colors: ['Charcoal', 'Ecru'], rate: [0.8, 0.7, 0.6], stock: 'overstock', description: 'Dropped-shoulder oversized tee.' },
  { sku: 'SH-LINEN-01', name: 'Linen Camp Shirt', brand: LL, category: 'Shirts', price: 1899, cost: 700, sizes: ['S', 'M', 'L', 'XL'], colors: ['Sage', 'Sky Blue'], rate: [1.2, 1.3, 1.5], stock: 'healthy', description: 'Breathable linen camp-collar shirt.' },
  { sku: 'SH-OXFD-01', name: 'Oxford Button-Down', brand: LL, category: 'Shirts', price: 2299, cost: 850, sizes: ['M', 'L', 'XL'], colors: ['White', 'Blue Stripe'], rate: [0.9, 0.8, 0.4], stock: 'overstock', description: 'Classic oxford weave button-down.' },
  { sku: 'SH-FLAN-01', name: 'Brushed Flannel Shirt', brand: LL, category: 'Shirts', price: 2099, cost: 780, sizes: ['M', 'L', 'XL'], colors: ['Rust Check', 'Forest Check'], rate: [0.5, 0, 0], stock: 'overstock', description: 'Soft brushed flannel, winter weight.' },
  { sku: 'DR-WRAP-01', name: 'Floral Wrap Dress', brand: LL, category: 'Dresses', price: 2999, cost: 1100, sizes: ['XS', 'S', 'M', 'L'], colors: ['Marigold', 'Navy'], rate: [1.4, 1.6, 2.0], stock: 'healthy', description: 'Viscose wrap dress with floral print.' },
  { sku: 'DR-SLIP-01', name: 'Satin Slip Dress', brand: LL, category: 'Dresses', price: 3499, cost: 1300, sizes: ['XS', 'S', 'M'], colors: ['Champagne', 'Emerald'], rate: [0.5, 0.9, 1.7], stock: 'tight', description: 'Bias-cut satin midi slip dress.' },
  { sku: 'DR-MAXI-01', name: 'Tiered Maxi Dress', brand: LL, category: 'Dresses', price: 3799, cost: 1400, sizes: ['S', 'M', 'L'], colors: ['Terracotta', 'Ivory'], rate: [0.5, 0.12, 0.06], stock: 'overstock', description: 'Cotton voile tiered maxi dress.' },
  { sku: 'JN-SLIM-01', name: 'Slim Tapered Jeans', brand: LL, category: 'Jeans', price: 2799, cost: 1000, sizes: ['S', 'M', 'L', 'XL'], colors: ['Indigo', 'Washed Black'], rate: [1.3, 1.4, 1.4], stock: 'healthy', description: 'Stretch denim, slim through the thigh.' },
  { sku: 'JN-WIDE-01', name: 'Wide-Leg Denim', brand: LL, category: 'Jeans', price: 3099, cost: 1150, sizes: ['S', 'M', 'L'], colors: ['Light Wash', 'Indigo'], rate: [0.6, 1.0, 1.6], stock: 'tight', description: 'High-rise wide-leg rigid denim.' },
  { sku: 'TR-CHNO-01', name: 'Stretch Chino Trousers', brand: LL, category: 'Trousers', price: 2499, cost: 900, sizes: ['M', 'L', 'XL'], colors: ['Khaki', 'Olive'], rate: [0.8, 0.9, 0.9], stock: 'healthy', description: 'Everyday stretch-cotton chinos.' },
  { sku: 'TR-PLET-01', name: 'Pleated Wool Trousers', brand: LL, category: 'Trousers', price: 3299, cost: 1300, sizes: ['M', 'L'], colors: ['Charcoal', 'Camel'], rate: [0, 0, 0], stock: 'overstock', description: 'Tailored pleated trousers in a wool blend.' },
  { sku: 'EW-KURT-01', name: 'Block Print Cotton Kurta', brand: SS, category: 'Ethnic Wear', price: 1799, cost: 650, sizes: ['S', 'M', 'L', 'XL'], colors: ['Indigo Print', 'Madder Red'], rate: [1.1, 1.2, 1.1], stock: 'healthy', description: 'Hand block-printed cotton kurta.' },
  { sku: 'EW-ANAR-01', name: 'Anarkali Festive Set', brand: SS, category: 'Ethnic Wear', price: 4499, cost: 1800, sizes: ['S', 'M', 'L'], colors: ['Mulberry', 'Teal'], rate: [0.4, 0.6, 1.4], stock: 'critical', description: 'Three-piece anarkali set with dupatta.' },
  { sku: 'JK-DNM-01', name: 'Washed Denim Jacket', brand: LL, category: 'Jackets', price: 3599, cost: 1400, sizes: ['M', 'L', 'XL'], colors: ['Mid Wash', 'Black'], rate: [0.6, 0.7, 0.8], stock: 'healthy', description: 'Classic trucker jacket in washed denim.' },
  { sku: 'JK-BMBR-01', name: 'Quilted Bomber Jacket', brand: LL, category: 'Jackets', price: 4299, cost: 1700, sizes: ['S', 'M', 'L'], colors: ['Olive', 'Black'], rate: [0.2, 0.5, 1.0], stock: 'soldout', description: 'Lightweight quilted bomber with ribbed trims.' },
  { sku: 'TP-RIB-01', name: 'Ribbed Knit Top', brand: LL, category: 'Tops', price: 899, cost: 300, sizes: ['XS', 'S', 'M', 'L'], colors: ['Black', 'Cream'], rate: [1.5, 1.7, 1.9], stock: 'healthy', description: 'Stretch rib-knit fitted top.' },
  { sku: 'TP-PEPL-01', name: 'Peplum Blouse', brand: LL, category: 'Tops', price: 1299, cost: 450, sizes: ['S', 'M', 'L'], colors: ['Blush', 'Cobalt'], rate: [0.7, 0.5, 0.4], stock: 'healthy', description: 'Crepe peplum blouse with a concealed zip.' },
  { sku: 'TP-CRCH-01', name: 'Crochet Halter Top', brand: LL, category: 'Tops', price: 1199, cost: 420, sizes: ['S', 'M', 'L'], colors: ['Ecru', 'Lilac'], rate: [0, 0, 0], stock: 'healthy', ageDays: 5, description: 'New arrival: hand-crochet halter top.' },
];

const SIZE_WEIGHT: Record<string, number> = { XS: 0.5, S: 1, M: 1.6, L: 1.3, XL: 0.7, XXL: 0.4 };
const REORDER_THRESHOLD = 6;

interface VariantDef {
  _id: mongoose.Types.ObjectId;
  sku: string;
  size: string;
  color: string;
  weight: number;
  finalStock: number;
  adjustment: number;
}
interface BuiltProduct {
  def: ProductDef;
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  variants: VariantDef[];
}

function finalStockFor(profile: StockProfile, index: number): number {
  switch (profile) {
    case 'healthy':
      return 18 + ((index * 7) % 20);
    case 'tight':
      return [REORDER_THRESHOLD - 2, REORDER_THRESHOLD + 3, 0, REORDER_THRESHOLD, 9, 14][index % 6];
    case 'critical':
      return [0, 2, REORDER_THRESHOLD - 1, 1, 0, 3][index % 6];
    case 'overstock':
      return 55 + index * 9;
    case 'soldout':
      return 0;
  }
}

const built: BuiltProduct[] = products.map((def, pi) => {
  const variants: VariantDef[] = [];
  for (const color of def.colors) {
    for (const size of def.sizes) {
      const i = variants.length;
      variants.push({
        _id: oid(`variant:${def.sku}:${size}:${color}`),
        sku: `${def.sku}-${size}-${color.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}`,
        size,
        color,
        weight: SIZE_WEIGHT[size] ?? 1,
        finalStock: finalStockFor(def.stock, i),
        adjustment: (pi + i) % 9 === 0 && def.rate[0] > 0 ? 1 : 0,
      });
    }
  }
  return { def, _id: oid(`product:${def.sku}`), createdAt: daysAgo(def.ageDays ?? STOCK_START_DAYS, 9), variants };
});

/* ----------------------------------------------------------------- sales generation */

interface Unit {
  product: BuiltProduct;
  variant: VariantDef;
  at: Date;
}

const rateFor = (def: ProductDef, daysBack: number) => (daysBack >= 31 ? def.rate[0] : daysBack >= 14 ? def.rate[1] : def.rate[2]);
const weekdayFactor = (d: Date) => ([0, 6].includes(d.getUTCDay()) ? 1.5 : d.getUTCDay() === 5 ? 1.2 : 1);

const salesDocs: Record<string, unknown>[] = [];
const soldByVariant = new Map<string, number>();
const saleMovements: { variant: VariantDef; product: BuiltProduct; quantity: number; at: Date; saleNumber: string; key: string }[] = [];
let saleSeq = 0;

for (let back = HISTORY_DAYS - 1; back >= 0; back -= 1) {
  const day = daysBack(back);
  const units: Unit[] = [];
  for (const product of built) {
    if (product.createdAt > day) continue;
    const n = poisson(rateFor(product.def, back) * weekdayFactor(day));
    for (let k = 0; k < n; k += 1) {
      const total = product.variants.reduce((s, v) => s + v.weight, 0);
      let r = rand() * total;
      const variant = product.variants.find((v) => (r -= v.weight) < 0) ?? product.variants[0];
      units.push({ product, variant, at: new Date(day.getTime() + (10 * 60 + Math.floor(rand() * 600)) * 60_000) });
    }
  }
  // Shuffle then chunk into orders of 1-3 lines.
  for (let i = units.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [units[i], units[j]] = [units[j], units[i]];
  }
  while (units.length > 0) {
    const size = Math.min(units.length, 1 + Math.floor(rand() * 3));
    const chunk = units.splice(0, size);
    const lines = new Map<string, { unit: Unit; quantity: number }>();
    for (const u of chunk) {
      const key = String(u.variant._id);
      const line = lines.get(key);
      if (line) line.quantity += 1;
      else lines.set(key, { unit: u, quantity: 1 });
    }
    saleSeq += 1;
    const at = chunk.map((u) => u.at).sort((a, b) => a.getTime() - b.getTime())[0];
    const saleNumber = `TIQ-${ymd(at)}-${saleSeq.toString(16).padStart(6, '0').toUpperCase()}`;
    const idempotencyKey = `seed-sale-${saleSeq.toString().padStart(6, '0')}`;
    const items = [...lines.values()].map(({ unit, quantity }) => ({
      productId: unit.product._id,
      variantId: unit.variant._id,
      sku: unit.variant.sku,
      productSku: unit.product.def.sku,
      productName: unit.product.def.name,
      category: unit.product.def.category,
      size: unit.variant.size,
      color: unit.variant.color,
      quantity,
      unitPrice: unit.product.def.price,
      lineTotal: round2(unit.product.def.price * quantity),
    }));
    const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
    const discount = rand() < 0.2 ? Math.round(subtotal * pick([0.05, 0.1, 0.15])) : 0;
    salesDocs.push({ saleNumber, idempotencyKey, items, subtotal, discount, total: round2(subtotal - discount), createdAt: at });
    for (const { unit, quantity } of lines.values()) {
      soldByVariant.set(String(unit.variant._id), (soldByVariant.get(String(unit.variant._id)) ?? 0) + quantity);
      saleMovements.push({ variant: unit.variant, product: unit.product, quantity, at, saleNumber, key: idempotencyKey });
    }
  }
}

function daysBack(back: number): Date {
  return daysAgo(back);
}

/* ----------------------------------------------------------------- build catalog + movements */

const productDocs = built.map(({ def, _id, createdAt, variants }) => ({
  _id,
  name: def.name,
  sku: def.sku,
  brand: def.brand,
  category: def.category,
  description: def.description,
  sellingPrice: def.price,
  costPrice: def.cost,
  status: 'active',
  variants: variants.map((v) => ({ _id: v._id, sku: v.sku, size: v.size, color: v.color, stock: v.finalStock, reorderThreshold: REORDER_THRESHOLD })),
  createdAt,
  updatedAt: daysAgo(1, 9),
}));

interface MovementRow {
  product: BuiltProduct;
  variant: VariantDef;
  type: 'receipt' | 'adjustment' | 'sale';
  change: number;
  reason: string;
  reference?: string;
  at: Date;
}
const movementRows: MovementRow[] = [];
for (const product of built) {
  for (const variant of product.variants) {
    const sold = soldByVariant.get(String(variant._id)) ?? 0;
    const initial = variant.finalStock + sold + variant.adjustment;
    if (initial > 0) {
      movementRows.push({ product, variant, type: 'receipt', change: initial, reason: 'Initial stock', at: product.createdAt });
    }
    if (variant.adjustment > 0) {
      movementRows.push({ product, variant, type: 'adjustment', change: -variant.adjustment, reason: 'Damaged item written off', at: daysAgo(45, 11) });
    }
  }
}
for (const m of saleMovements) {
  movementRows.push({ product: m.product, variant: m.variant, type: 'sale', change: -m.quantity, reason: `Sale ${m.saleNumber}`, reference: m.key, at: m.at });
}
movementRows.sort((a, b) => a.at.getTime() - b.at.getTime());

const balances = new Map<string, number>();
const movementDocs = movementRows.map((row) => {
  const key = String(row.variant._id);
  const balance = (balances.get(key) ?? 0) + row.change;
  if (balance < 0) throw new Error(`Seed bug: negative balance for ${row.variant.sku}`);
  balances.set(key, balance);
  return {
    productId: row.product._id,
    productName: row.product.def.name,
    productSku: row.product.def.sku,
    variantId: row.variant._id,
    variantSku: row.variant.sku,
    size: row.variant.size,
    color: row.variant.color,
    type: row.type,
    quantityChange: row.change,
    balanceAfter: balance,
    reason: row.reason,
    ...(row.reference ? { reference: row.reference } : {}),
    reversed: false,
    createdAt: row.at,
  };
});
for (const product of built) {
  for (const v of product.variants) {
    if ((balances.get(String(v._id)) ?? 0) !== v.finalStock) throw new Error(`Seed bug: stock mismatch for ${v.sku}`);
  }
}

/* ----------------------------------------------------------------- write */

async function insertInBatches(coll: mongoose.mongo.Collection, docs: Record<string, unknown>[]) {
  for (let i = 0; i < docs.length; i += 1000) await coll.insertMany(docs.slice(i, i + 1000) as never[]);
}

async function main() {
  const catalog = await mongoose.createConnection(CATALOG_URI, { serverSelectionTimeoutMS: 10_000 }).asPromise();
  const sales = await mongoose.createConnection(SALES_URI, { serverSelectionTimeoutMS: 10_000 }).asPromise();
  try {
    console.log(`Seeding ${catalog.name} and ${sales.name} (reference date ${reference.toISOString().slice(0, 10)})...`);
    await Promise.all([
      catalog.collection('products').deleteMany({}),
      catalog.collection('stockmovements').deleteMany({}),
      sales.collection('sales').deleteMany({}),
    ]);
    await catalog.collection('products').insertMany(productDocs as never[]);
    await insertInBatches(catalog.collection('stockmovements'), movementDocs);
    await insertInBatches(sales.collection('sales'), salesDocs);

    const low = productDocs.flatMap((p) => p.variants).filter((v) => v.stock <= v.reorderThreshold);
    console.log(
      `Done: ${productDocs.length} products, ${productDocs.reduce((s, p) => s + p.variants.length, 0)} variants, ` +
        `${movementDocs.length} stock movements, ${salesDocs.length} sales over ${HISTORY_DAYS} days ` +
        `(${low.filter((v) => v.stock === 0).length} variants out of stock, ${low.filter((v) => v.stock > 0).length} low).`,
    );
  } finally {
    await Promise.all([catalog.close(), sales.close()]);
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

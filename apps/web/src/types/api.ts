/** Types mirroring the REST contract documented in docs/api-reference.md. */

export const CATEGORIES = ['T-Shirts', 'Shirts', 'Dresses', 'Jeans', 'Trousers', 'Ethnic Wear', 'Jackets', 'Tops'] as const;
export type Category = (typeof CATEGORIES)[number];

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
export type Size = (typeof SIZES)[number];

export type StockLevel = 'in_stock' | 'low' | 'out';
export type ProductStatus = 'active' | 'archived';
export type MovementType = 'receipt' | 'adjustment' | 'sale' | 'return';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}
export interface Single<T> {
  data: T;
}

/* ------------------------------ Catalog Service ------------------------------ */

export interface Variant {
  id: string;
  sku: string;
  size: Size;
  color: string;
  stock: number;
  reorderThreshold: number;
  stockLevel: StockLevel;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: Category;
  description: string;
  sellingPrice: number;
  costPrice: number;
  status: ProductStatus;
  variants: Variant[];
  totalStock: number;
  lowStockVariants: number;
  outOfStockVariants: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  variantId: string;
  variantSku: string;
  size: string;
  color: string;
  type: MovementType;
  quantityChange: number;
  balanceAfter: number;
  reason: string;
  reference: string | null;
  reversed: boolean;
  createdAt: string;
}

export interface LowStockRow {
  productId: string;
  productName: string;
  productSku: string;
  category: Category;
  variantId: string;
  variantSku: string;
  size: Size;
  color: string;
  stock: number;
  reorderThreshold: number;
  level: 'low' | 'out';
}

/* ------------------------------ Insights Service ----------------------------- */

export interface SaleItem {
  productId: string;
  variantId: string;
  sku: string;
  productSku: string;
  productName: string;
  category: string;
  size: string;
  color: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  saleNumber: string;
  items: SaleItem[];
  unitsSold: number;
  subtotal: number;
  discount: number;
  total: number;
  createdAt: string;
}

export interface CreateSaleRequest {
  idempotencyKey: string;
  items: { productId: string; variantId: string; quantity: number }[];
  discount: number;
}

export interface InventorySummary {
  activeProducts: number;
  totalUnits: number;
  inventoryValueAtCost: number;
  lowStockVariants: number;
  outOfStockVariants: number;
  byCategory: { category: string; units: number; valueAtCost: number; variants: number; lowStockVariants: number; outOfStockVariants: number }[];
}

export interface Period {
  from: string;
  to: string;
}

export interface Overview {
  period: Period;
  revenue: number;
  grossSales: number;
  discounts: number;
  salesCount: number;
  unitsSold: number;
  averageOrderValue: number;
  inventoryAvailable: boolean;
  inventory: InventorySummary | null;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
  units: number;
}
export interface RevenueTrend {
  period: Period;
  interval: 'day' | 'week';
  points: RevenuePoint[];
}

export interface CategoryPerformanceItem {
  category: string;
  revenue: number;
  unitsSold: number;
  stockUnits: number | null;
  stockValueAtCost: number | null;
}
export interface CategoryPerformance {
  period: Period;
  inventoryAvailable: boolean;
  items: CategoryPerformanceItem[];
}

export interface TopProduct {
  productId: string;
  productName: string;
  productSku: string;
  category: string;
  unitsSold: number;
  revenue: number;
}
export interface TopProducts {
  period: Period;
  sortBy: 'units' | 'revenue';
  items: TopProduct[];
}

export type SlowStatus = 'no_sales_history' | 'no_recent_sales' | 'low_velocity';
export interface SlowMovingItem {
  productId: string;
  productName: string;
  productSku: string;
  category: string;
  status: SlowStatus;
  totalStock: number;
  stockValueAtCost: number;
  unitsInPeriod: number;
  unitsPerDay: number;
  lastSoldAt: string | null;
  daysSinceLastSale: number | null;
  productAgeDays: number;
}
export interface SlowMoving {
  lookbackDays: number;
  maxUnitsPerDay: number;
  summary: { noSalesHistory: number; noRecentSales: number; lowVelocity: number; outOfStock: number; tooNewToJudge: number };
  items: SlowMovingItem[];
}

export type TrendLabel = 'hot' | 'rising' | 'steady' | 'cooling' | 'inactive';
export interface TrendItem {
  productId: string;
  productName: string;
  productSku: string;
  category: string;
  totalStock: number;
  score: number;
  label: TrendLabel;
  dataStatus: 'ok' | 'insufficient_history' | 'no_sales';
  components: { velocity: number; growth: number; urgency: number };
  weighted: { velocity: number; growth: number; urgency: number };
  recentUnits: number;
  previousUnits: number;
  unitsPerDay: number;
  growthPercent: number | null;
  stockCoverDays: number | null;
  explanation: string;
}
export interface TrendScores {
  method: string;
  windowDays: number;
  weights: { velocity: number; growth: number; urgency: number };
  baselineUnitsPerDay: number;
  targetCoverDays: number;
  items: TrendItem[];
}

export type RestockPriority = 'critical' | 'high' | 'medium';
export interface RestockItem {
  productId: string;
  productName: string;
  variantId: string;
  variantSku: string;
  category: string;
  size: string;
  color: string;
  currentStock: number;
  reorderThreshold: number;
  avgDailyUnits: number;
  coverDays: number | null;
  reasons: ('out_of_stock' | 'below_reorder_level' | 'low_cover')[];
  priority: RestockPriority;
  dataStatus: 'ok' | 'limited_history' | 'no_recent_sales';
  targetStock: number;
  suggestedQuantity: number;
  estimatedCostToReorder: number;
  explanation: string;
}
export interface RestockRecommendations {
  note: string;
  windowDays: number;
  coverThresholdDays: number;
  targetCoverDays: number;
  total: number;
  items: RestockItem[];
}

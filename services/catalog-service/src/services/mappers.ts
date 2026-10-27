import type { ProductAttrs, Variant } from '../models/product.model';
import type { StockMovementAttrs } from '../models/stock-movement.model';

type WithId<T> = T & { _id: unknown };

export type StockLevel = 'in_stock' | 'low' | 'out';

export const stockLevel = (stock: number, reorderThreshold: number): StockLevel =>
  stock === 0 ? 'out' : stock <= reorderThreshold ? 'low' : 'in_stock';

export const toVariantDto = (v: Variant) => ({
  id: String(v._id),
  sku: v.sku,
  size: v.size,
  color: v.color,
  stock: v.stock,
  reorderThreshold: v.reorderThreshold,
  stockLevel: stockLevel(v.stock, v.reorderThreshold),
});

export const toProductDto = (p: WithId<ProductAttrs>) => {
  const variants = p.variants.map(toVariantDto);
  return {
    id: String(p._id),
    name: p.name,
    sku: p.sku,
    brand: p.brand,
    category: p.category,
    description: p.description,
    sellingPrice: p.sellingPrice,
    costPrice: p.costPrice,
    status: p.status,
    variants,
    totalStock: variants.reduce((sum, v) => sum + v.stock, 0),
    lowStockVariants: variants.filter((v) => v.stockLevel === 'low').length,
    outOfStockVariants: variants.filter((v) => v.stockLevel === 'out').length,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
};

export const toMovementDto = (m: WithId<StockMovementAttrs>) => ({
  id: String(m._id),
  productId: String(m.productId),
  productName: m.productName,
  productSku: m.productSku,
  variantId: String(m.variantId),
  variantSku: m.variantSku,
  size: m.size,
  color: m.color,
  type: m.type,
  quantityChange: m.quantityChange,
  balanceAfter: m.balanceAfter,
  reason: m.reason,
  reference: m.reference ?? null,
  reversed: m.reversed,
  createdAt: m.createdAt,
});

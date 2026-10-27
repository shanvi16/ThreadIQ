import { Schema, model, Types } from 'mongoose';

export interface SaleItem {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  /** Snapshots: history must survive later renames and repricing. */
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

export interface SaleAttrs {
  saleNumber: string;
  idempotencyKey: string;
  items: SaleItem[];
  /** Sum of line totals (gross sales). */
  subtotal: number;
  discount: number;
  /** subtotal - discount (net revenue). */
  total: number;
  createdAt: Date;
}

const integer = { validator: Number.isInteger, message: '{PATH} must be an integer' };

const saleItemSchema = new Schema<SaleItem>(
  {
    productId: { type: Schema.Types.ObjectId, required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    productSku: { type: String, required: true },
    productName: { type: String, required: true },
    category: { type: String, required: true },
    size: { type: String, required: true },
    color: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, validate: integer },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const saleSchema = new Schema<SaleAttrs>(
  {
    saleNumber: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    items: { type: [saleItemSchema], validate: (v: unknown[]) => v.length > 0 },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

saleSchema.index({ saleNumber: 1 }, { unique: true });
saleSchema.index({ idempotencyKey: 1 }, { unique: true });
saleSchema.index({ createdAt: -1 });
saleSchema.index({ 'items.productId': 1, createdAt: -1 });
saleSchema.index({ 'items.variantId': 1, createdAt: -1 });

export const SaleModel = model<SaleAttrs>('Sale', saleSchema);

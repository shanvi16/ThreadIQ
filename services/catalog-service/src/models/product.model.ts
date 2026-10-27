import { Schema, model, Types } from 'mongoose';
import {
  CATEGORIES,
  DEFAULT_REORDER_THRESHOLD,
  PRODUCT_STATUSES,
  SIZES,
  type Category,
  type ProductStatus,
  type Size,
} from '../config/constants';

export interface Variant {
  _id: Types.ObjectId;
  sku: string;
  size: Size;
  color: string;
  stock: number;
  reorderThreshold: number;
}

export interface ProductAttrs {
  name: string;
  sku: string;
  brand: string;
  category: Category;
  description: string;
  sellingPrice: number;
  costPrice: number;
  status: ProductStatus;
  variants: Variant[];
  createdAt: Date;
  updatedAt: Date;
}

const integer = { validator: Number.isInteger, message: '{PATH} must be an integer' };

const variantSchema = new Schema<Variant>({
  sku: { type: String, required: true, trim: true, uppercase: true },
  size: { type: String, required: true, enum: SIZES },
  color: { type: String, required: true, trim: true },
  stock: { type: Number, required: true, min: 0, default: 0, validate: integer },
  reorderThreshold: {
    type: Number,
    required: true,
    min: 0,
    default: DEFAULT_REORDER_THRESHOLD,
    validate: integer,
  },
});

const productSchema = new Schema<ProductAttrs>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    sku: { type: String, required: true, trim: true, uppercase: true },
    brand: { type: String, required: true, trim: true, maxlength: 80 },
    category: { type: String, required: true, enum: CATEGORIES },
    description: { type: String, default: '', trim: true, maxlength: 2000 },
    sellingPrice: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, required: true, min: 0 },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'active' },
    variants: { type: [variantSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

productSchema.index({ sku: 1 }, { unique: true });
// Variant SKUs are globally unique. The partial filter keeps the index safe for documents with no variants.
productSchema.index(
  { 'variants.sku': 1 },
  { unique: true, partialFilterExpression: { 'variants.sku': { $exists: true } } },
);
productSchema.index({ category: 1, status: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ name: 1 });

export const ProductModel = model<ProductAttrs>('Product', productSchema);

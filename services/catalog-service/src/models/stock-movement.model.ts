import { Schema, model, Types } from 'mongoose';
import { MOVEMENT_TYPES, type MovementType } from '../config/constants';

export interface StockMovementAttrs {
  productId: Types.ObjectId;
  productName: string;
  productSku: string;
  variantId: Types.ObjectId;
  variantSku: string;
  size: string;
  color: string;
  type: MovementType;
  /** Signed: positive adds stock, negative removes it. */
  quantityChange: number;
  balanceAfter: number;
  reason: string;
  /** Optional external reference, e.g. the sale idempotency key. */
  reference?: string;
  /** True once a sale movement has been compensated (stock returned). */
  reversed: boolean;
  createdAt: Date;
}

const stockMovementSchema = new Schema<StockMovementAttrs>(
  {
    productId: { type: Schema.Types.ObjectId, required: true, ref: 'Product' },
    productName: { type: String, required: true },
    productSku: { type: String, required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    variantSku: { type: String, required: true },
    size: { type: String, required: true },
    color: { type: String, required: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    quantityChange: {
      type: Number,
      required: true,
      validate: { validator: (n: number) => Number.isInteger(n) && n !== 0, message: 'must be a non-zero integer' },
    },
    balanceAfter: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    reference: { type: String, trim: true, maxlength: 120 },
    reversed: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

stockMovementSchema.index({ productId: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1 });
stockMovementSchema.index({ reference: 1 });
// A given sale reference may deduct a variant only once (until that deduction is reversed).
stockMovementSchema.index(
  { reference: 1, variantId: 1 },
  { unique: true, partialFilterExpression: { type: 'sale', reversed: false } },
);

export const StockMovementModel = model<StockMovementAttrs>('StockMovement', stockMovementSchema);

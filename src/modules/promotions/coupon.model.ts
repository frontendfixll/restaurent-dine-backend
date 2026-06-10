import { Schema, model, Document, Types } from 'mongoose';
import { DiscountType, DiscountScope, ChannelKey } from './discount.model';

export interface CouponRedemptionEntry {
  customerId?: Types.ObjectId;
  customerPhone?: string;
  orderId: Types.ObjectId;
  amount: number;
  at: Date;
}

export interface CouponDocument extends Document {
  _id: Types.ObjectId;
  code: string;
  description?: string;
  type: DiscountType;
  value: number;
  maxDiscount?: number;
  scope: DiscountScope;
  categoryIds: Types.ObjectId[];
  itemIds: Types.ObjectId[];
  channels: ChannelKey[];
  minBillAmount: number;
  validFrom?: Date;
  validUntil?: Date;
  usageLimit?: number;
  perUserLimit?: number;
  usedCount: number;
  redemptions: CouponRedemptionEntry[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<CouponDocument>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    description: String,
    type: { type: String, enum: ['percent', 'flat'], required: true },
    value: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, min: 0 },
    scope: { type: String, enum: ['bill', 'category', 'item', 'channel'], default: 'bill' },
    categoryIds: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    itemIds: [{ type: Schema.Types.ObjectId, ref: 'Item' }],
    channels: { type: [String], enum: ['dine_in', 'window', 'assisted'], default: [] },
    minBillAmount: { type: Number, default: 0 },
    validFrom: Date,
    validUntil: Date,
    usageLimit: Number,
    perUserLimit: Number,
    usedCount: { type: Number, default: 0 },
    redemptions: {
      type: [
        new Schema<CouponRedemptionEntry>(
          {
            customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
            customerPhone: String,
            orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
            amount: { type: Number, required: true },
            at: { type: Date, default: () => new Date() },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const CouponModel = model<CouponDocument>('Coupon', CouponSchema);

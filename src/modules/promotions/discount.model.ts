import { Schema, model, Document, Types } from 'mongoose';

export type DiscountType = 'percent' | 'flat';
export type DiscountScope = 'bill' | 'category' | 'item' | 'channel';
export type ChannelKey = 'dine_in' | 'window' | 'assisted';

export interface DiscountDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  type: DiscountType;
  value: number;
  maxDiscount?: number;
  scope: DiscountScope;
  categoryIds: Types.ObjectId[];
  itemIds: Types.ObjectId[];
  channels: ChannelKey[];
  minBillAmount: number;
  daysOfWeek: number[];
  startTime?: string;
  endTime?: string;
  validFrom?: Date;
  validUntil?: Date;
  isActive: boolean;
  usageCount: number;
  maxTotalUses?: number;
  createdAt: Date;
  updatedAt: Date;
}

const DiscountSchema = new Schema<DiscountDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: String,
    type: { type: String, enum: ['percent', 'flat'], required: true },
    value: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, min: 0 },
    scope: { type: String, enum: ['bill', 'category', 'item', 'channel'], required: true, index: true },
    categoryIds: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    itemIds: [{ type: Schema.Types.ObjectId, ref: 'Item' }],
    channels: { type: [String], enum: ['dine_in', 'window', 'assisted'], default: [] },
    minBillAmount: { type: Number, default: 0 },
    daysOfWeek: { type: [Number], default: [] },
    startTime: String,
    endTime: String,
    validFrom: Date,
    validUntil: Date,
    isActive: { type: Boolean, default: true, index: true },
    usageCount: { type: Number, default: 0 },
    maxTotalUses: Number,
  },
  { timestamps: true },
);

DiscountSchema.index({ isActive: 1, scope: 1 });

export const DiscountModel = model<DiscountDocument>('Discount', DiscountSchema);

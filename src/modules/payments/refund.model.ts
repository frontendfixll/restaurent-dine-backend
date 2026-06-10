import { Schema, model, Document, Types } from 'mongoose';

export type RefundStatus = 'pending' | 'processed' | 'failed';
export type RefundMethod = 'cash' | 'gateway' | 'wallet' | 'manual';

export interface RefundDocument extends Document {
  _id: Types.ObjectId;
  invoiceId: Types.ObjectId;
  paymentId: Types.ObjectId;
  amount: number;
  reason: string;
  method: RefundMethod;
  status: RefundStatus;
  approvedById?: Types.ObjectId;
  processedAt?: Date;
  gatewayRefundId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RefundSchema = new Schema<RefundDocument>(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true },
    method: { type: String, enum: ['cash', 'gateway', 'wallet', 'manual'], required: true },
    status: {
      type: String,
      enum: ['pending', 'processed', 'failed'],
      default: 'pending',
      index: true,
    },
    approvedById: { type: Schema.Types.ObjectId, ref: 'User' },
    processedAt: Date,
    gatewayRefundId: String,
    notes: String,
  },
  { timestamps: true },
);

export const RefundModel = model<RefundDocument>('Refund', RefundSchema);

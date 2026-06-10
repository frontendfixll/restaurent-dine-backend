import { Schema, model, Document, Types } from 'mongoose';

export type PaymentMode = 'cash' | 'upi' | 'card' | 'wallet' | 'online_prepay';
export type PaymentProvider = 'razorpay' | 'phonepe' | 'stripe';
export type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded' | 'cancelled';

export interface PaymentDocument extends Document {
  _id: Types.ObjectId;
  invoiceId: Types.ObjectId;
  orderId: Types.ObjectId;
  splitId?: Types.ObjectId;

  mode: PaymentMode;
  provider?: PaymentProvider;
  amount: number;
  status: PaymentStatus;

  txnRef?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewayPayload?: Record<string, unknown>;

  cashTendered?: number;
  changeReturned?: number;

  cashierId?: Types.ObjectId;
  cashSessionId?: Types.ObjectId;
  receivedAt?: Date;
  notes?: string;

  refundedAmount: number;

  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<PaymentDocument>(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    splitId: { type: Schema.Types.ObjectId },

    mode: {
      type: String,
      enum: ['cash', 'upi', 'card', 'wallet', 'online_prepay'],
      required: true,
      index: true,
    },
    provider: { type: String, enum: ['razorpay', 'phonepe', 'stripe'] },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'refunded', 'cancelled'],
      default: 'pending',
      index: true,
    },

    txnRef: { type: String, index: true },
    gatewayOrderId: { type: String, index: true },
    gatewayPaymentId: { type: String, index: true },
    gatewayPayload: { type: Schema.Types.Mixed },

    cashTendered: Number,
    changeReturned: Number,

    cashierId: { type: Schema.Types.ObjectId, ref: 'User' },
    cashSessionId: { type: Schema.Types.ObjectId, ref: 'CashSession' },
    receivedAt: Date,
    notes: String,

    refundedAmount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ cashSessionId: 1, status: 1 });

export const PaymentModel = model<PaymentDocument>('Payment', PaymentSchema);

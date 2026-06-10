import { Schema, model, Document, Types } from 'mongoose';

export type CashSessionStatus = 'open' | 'closed';

export interface CashSessionDocument extends Document {
  _id: Types.ObjectId;
  cashierId: Types.ObjectId;
  cashierName?: string;
  openingFloat: number;
  expectedCash: number;
  actualCash?: number;
  variance?: number;
  denominations?: Record<string, number>;
  notes?: string;
  status: CashSessionStatus;
  openedAt: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CashSessionSchema = new Schema<CashSessionDocument>(
  {
    cashierId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cashierName: String,
    openingFloat: { type: Number, required: true, min: 0, default: 0 },
    expectedCash: { type: Number, default: 0 },
    actualCash: Number,
    variance: Number,
    denominations: { type: Schema.Types.Mixed },
    notes: String,
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    openedAt: { type: Date, default: () => new Date() },
    closedAt: Date,
  },
  { timestamps: true },
);

CashSessionSchema.index({ cashierId: 1, status: 1 });

export const CashSessionModel = model<CashSessionDocument>('CashSession', CashSessionSchema);

import { Schema, model, Document, Types } from 'mongoose';

export type LoyaltyHistoryType = 'earned' | 'redeemed' | 'adjusted' | 'expired' | 'welcome';

export interface LoyaltyHistoryEntry {
  _id: Types.ObjectId;
  type: LoyaltyHistoryType;
  points: number;
  balanceAfter: number;
  orderId?: Types.ObjectId;
  reason?: string;
  actorId?: Types.ObjectId;
  at: Date;
}

export interface LoyaltyAccountDocument extends Document {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  points: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  history: LoyaltyHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const HistorySchema = new Schema<LoyaltyHistoryEntry>(
  {
    type: {
      type: String,
      enum: ['earned', 'redeemed', 'adjusted', 'expired', 'welcome'],
      required: true,
    },
    points: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    reason: String,
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const LoyaltyAccountSchema = new Schema<LoyaltyAccountDocument>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true, index: true },
    points: { type: Number, default: 0, min: 0 },
    lifetimeEarned: { type: Number, default: 0 },
    lifetimeRedeemed: { type: Number, default: 0 },
    history: { type: [HistorySchema], default: [] },
  },
  { timestamps: true },
);

export const LoyaltyAccountModel = model<LoyaltyAccountDocument>(
  'LoyaltyAccount',
  LoyaltyAccountSchema,
);

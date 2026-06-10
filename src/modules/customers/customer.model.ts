import { Schema, model, Document, Types } from 'mongoose';

export interface FavoriteItem {
  itemId: Types.ObjectId;
  name: string;
  count: number;
  lastAt: Date;
}

export interface CustomerDocument extends Document {
  _id: Types.ObjectId;
  phone?: string;
  name?: string;
  email?: string;
  tags: string[];
  allergens: string[];
  visitCount: number;
  lifetimeValue: number;
  averageBill: number;
  firstVisitAt?: Date;
  lastVisitAt?: Date;
  favoriteItems: FavoriteItem[];
  notes?: string;
  marketingOptIn: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FavoriteItemSchema = new Schema<FavoriteItem>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    name: { type: String, required: true },
    count: { type: Number, default: 0 },
    lastAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const CustomerSchema = new Schema<CustomerDocument>(
  {
    phone: { type: String, unique: true, sparse: true, index: true },
    name: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, sparse: true, index: true },
    tags: { type: [String], default: [], index: true },
    allergens: { type: [String], default: [] },
    visitCount: { type: Number, default: 0 },
    lifetimeValue: { type: Number, default: 0 },
    averageBill: { type: Number, default: 0 },
    firstVisitAt: Date,
    lastVisitAt: { type: Date, index: true },
    favoriteItems: { type: [FavoriteItemSchema], default: [] },
    notes: String,
    marketingOptIn: { type: Boolean, default: false },
  },
  { timestamps: true },
);

CustomerSchema.index({ lifetimeValue: -1 });
CustomerSchema.index({ visitCount: -1 });

export const CustomerModel = model<CustomerDocument>('Customer', CustomerSchema);

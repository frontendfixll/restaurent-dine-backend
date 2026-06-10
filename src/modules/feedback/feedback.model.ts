import { Schema, model, Document, Types } from 'mongoose';

export const FEEDBACK_TAG_CHIPS = [
  'food',
  'service',
  'speed',
  'cleanliness',
  'ambience',
  'pricing',
  'staff',
  'portion',
  'taste',
] as const;
export type FeedbackTagChip = (typeof FEEDBACK_TAG_CHIPS)[number];

export type FeedbackChannel = 'sms' | 'whatsapp' | 'email';

export interface FeedbackReply {
  text: string;
  sentVia: FeedbackChannel;
  sentAt: Date;
  sentById?: Types.ObjectId;
}

export interface FeedbackDocument extends Document {
  _id: Types.ObjectId;
  orderId: Types.ObjectId;
  orderNumber: string;
  customerId?: Types.ObjectId;
  customerPhone?: string;
  customerName?: string;
  rating: number;
  text?: string;
  tagChips: FeedbackTagChip[];
  sentiment: 'positive' | 'neutral' | 'negative';
  reply?: FeedbackReply;
  acknowledged: boolean;
  channel: 'dine_in' | 'window' | 'assisted';
  createdAt: Date;
  updatedAt: Date;
}

const ReplySchema = new Schema<FeedbackReply>(
  {
    text: { type: String, required: true },
    sentVia: { type: String, enum: ['sms', 'whatsapp', 'email'], required: true },
    sentAt: { type: Date, default: () => new Date() },
    sentById: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

const FeedbackSchema = new Schema<FeedbackDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
    orderNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    customerPhone: { type: String, index: true },
    customerName: String,
    rating: { type: Number, required: true, min: 1, max: 5, index: true },
    text: String,
    tagChips: { type: [String], default: [], enum: FEEDBACK_TAG_CHIPS, index: true },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'], required: true, index: true },
    reply: ReplySchema,
    acknowledged: { type: Boolean, default: false, index: true },
    channel: { type: String, enum: ['dine_in', 'window', 'assisted'], required: true },
  },
  { timestamps: true },
);

FeedbackSchema.index({ rating: 1, createdAt: -1 });
FeedbackSchema.index({ sentiment: 1, acknowledged: 1 });

export const FeedbackModel = model<FeedbackDocument>('Feedback', FeedbackSchema);

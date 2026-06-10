import { Schema, model, Document, Types } from 'mongoose';
import { NotificationChannel } from './events';

export type NotificationStatus = 'queued' | 'sent' | 'failed' | 'skipped' | 'mocked';

export interface NotificationLogDocument extends Document {
  _id: Types.ObjectId;
  eventKey: string;
  channel: NotificationChannel;
  to: string;
  subject?: string;
  body: string;
  status: NotificationStatus;
  providerMessageId?: string;
  errorMessage?: string;
  relatedOrderId?: Types.ObjectId;
  relatedInvoiceId?: Types.ObjectId;
  relatedCustomerId?: Types.ObjectId;
  triggeredById?: Types.ObjectId;
  attempts: number;
  sentAt?: Date;
  createdAt: Date;
}

const NotificationLogSchema = new Schema<NotificationLogDocument>(
  {
    eventKey: { type: String, required: true, index: true },
    channel: { type: String, enum: ['sms', 'whatsapp', 'email', 'push'], required: true, index: true },
    to: { type: String, required: true, index: true },
    subject: String,
    body: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed', 'skipped', 'mocked'],
      required: true,
      index: true,
    },
    providerMessageId: String,
    errorMessage: String,
    relatedOrderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    relatedInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', index: true },
    relatedCustomerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    triggeredById: { type: Schema.Types.ObjectId, ref: 'User' },
    attempts: { type: Number, default: 1 },
    sentAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

NotificationLogSchema.index({ status: 1, createdAt: -1 });
NotificationLogSchema.index({ eventKey: 1, createdAt: -1 });

export const NotificationLogModel = model<NotificationLogDocument>(
  'NotificationLog',
  NotificationLogSchema,
);

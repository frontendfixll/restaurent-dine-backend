import { Schema, model, Document, Types } from 'mongoose';
import { NotificationChannel } from './events';

export interface NotificationTemplateDocument extends Document {
  _id: Types.ObjectId;
  eventKey: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  isActive: boolean;
  notes?: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationTemplateSchema = new Schema<NotificationTemplateDocument>(
  {
    eventKey: { type: String, required: true, index: true },
    channel: { type: String, enum: ['sms', 'whatsapp', 'email', 'push'], required: true },
    subject: { type: String, maxlength: 200 },
    body: { type: String, required: true, maxlength: 4000 },
    isActive: { type: Boolean, default: true, index: true },
    notes: String,
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

NotificationTemplateSchema.index({ eventKey: 1, channel: 1 }, { unique: true });

export const NotificationTemplateModel = model<NotificationTemplateDocument>(
  'NotificationTemplate',
  NotificationTemplateSchema,
);

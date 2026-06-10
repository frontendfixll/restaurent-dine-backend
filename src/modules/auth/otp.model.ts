import { Schema, model, Document, Types } from 'mongoose';

export type OtpPurpose = 'guest_signin' | 'staff_2fa';
export type OtpChannel = 'sms' | 'whatsapp' | 'email';

export interface OtpDocument extends Document {
  _id: Types.ObjectId;
  identifier: string; // phone (E.164) or email
  channel: OtpChannel;
  purpose: OtpPurpose;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const OtpSchema = new Schema<OtpDocument>(
  {
    identifier: { type: String, required: true, index: true },
    channel: { type: String, enum: ['sms', 'whatsapp', 'email'], required: true },
    purpose: { type: String, enum: ['guest_signin', 'staff_2fa'], required: true, index: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
OtpSchema.index({ identifier: 1, purpose: 1, consumedAt: 1 });

export const OtpModel = model<OtpDocument>('Otp', OtpSchema);

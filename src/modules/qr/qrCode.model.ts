import { Schema, model, Document, Types } from 'mongoose';

export type QrType = 'table' | 'window';
export type QrStyle = 'plain' | 'branded' | 'designed';

export interface QrCodeDocument extends Document {
  _id: Types.ObjectId;
  type: QrType;
  slug: string;
  label: string;
  tableId?: Types.ObjectId;
  style: QrStyle;
  imageUrl?: string;
  imagePublicId?: string;
  isActive: boolean;
  analytics: {
    scans: number;
    orders: number;
    revenue: number;
    lastScanAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const QrCodeSchema = new Schema<QrCodeDocument>(
  {
    type: { type: String, enum: ['table', 'window'], required: true, index: true },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    label: { type: String, required: true, trim: true },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table', index: true },
    style: { type: String, enum: ['plain', 'branded', 'designed'], default: 'plain' },
    imageUrl: String,
    imagePublicId: String,
    isActive: { type: Boolean, default: true, index: true },
    analytics: {
      scans: { type: Number, default: 0 },
      orders: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      lastScanAt: Date,
    },
  },
  { timestamps: true },
);

export const QrCodeModel = model<QrCodeDocument>('QrCode', QrCodeSchema);

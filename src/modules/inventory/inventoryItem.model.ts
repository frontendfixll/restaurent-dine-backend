import { Schema, model, Document, Types } from 'mongoose';

export type InventoryUnit = 'kg' | 'g' | 'L' | 'ml' | 'pcs';

export interface InventoryItemDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  sku?: string;
  unit: InventoryUnit;
  currentStock: number;
  lowStockThreshold: number;
  costPerUnit?: number;
  supplierName?: string;
  notes?: string;
  isActive: boolean;
  lastStockInAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryItemSchema = new Schema<InventoryItemDocument>(
  {
    name: { type: String, required: true, trim: true, unique: true, index: true },
    sku: { type: String, trim: true, index: true },
    unit: { type: String, enum: ['kg', 'g', 'L', 'ml', 'pcs'], required: true },
    currentStock: { type: Number, required: true, default: 0 },
    lowStockThreshold: { type: Number, required: true, default: 0 },
    costPerUnit: { type: Number, min: 0 },
    supplierName: String,
    notes: String,
    isActive: { type: Boolean, default: true, index: true },
    lastStockInAt: Date,
  },
  { timestamps: true },
);

export const InventoryItemModel = model<InventoryItemDocument>('InventoryItem', InventoryItemSchema);

import { Schema, model, Document, Types } from 'mongoose';

export type TableStatus = 'vacant' | 'seated' | 'ordered' | 'awaiting_bill' | 'cleaning';

export interface TableDocument extends Document {
  _id: Types.ObjectId;
  number: string;
  zone?: string;
  capacity: number;
  status: TableStatus;
  currentSessionId?: Types.ObjectId;
  mergedWithTableIds: Types.ObjectId[];
  mergedIntoTableId?: Types.ObjectId;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TableSchema = new Schema<TableDocument>(
  {
    number: { type: String, required: true, trim: true, unique: true, index: true },
    zone: { type: String, trim: true, index: true },
    capacity: { type: Number, required: true, min: 1, max: 50, default: 4 },
    status: {
      type: String,
      enum: ['vacant', 'seated', 'ordered', 'awaiting_bill', 'cleaning'],
      default: 'vacant',
      index: true,
    },
    currentSessionId: { type: Schema.Types.ObjectId, ref: 'TableSession' },
    mergedWithTableIds: [{ type: Schema.Types.ObjectId, ref: 'Table' }],
    mergedIntoTableId: { type: Schema.Types.ObjectId, ref: 'Table' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const TableModel = model<TableDocument>('Table', TableSchema);

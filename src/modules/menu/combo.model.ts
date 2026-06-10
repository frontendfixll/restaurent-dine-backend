import { Schema, model, Document, Types } from 'mongoose';
import { AvailabilityWindow } from './item.model';

export interface ComboItem {
  itemId: Types.ObjectId;
  variantId?: Types.ObjectId;
  qty: number;
}

interface ComboTranslation {
  name: string;
  description?: string;
}

export interface ComboDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  imagePublicId?: string;
  price: number;
  items: ComboItem[];
  modifierGroupIds: Types.ObjectId[];
  availabilityWindows: AvailabilityWindow[];
  translations?: Map<string, ComboTranslation>;
  is86: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const ComboItemSchema = new Schema<ComboItem>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    variantId: { type: Schema.Types.ObjectId },
    qty: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false },
);

const AvailabilityWindowSchema = new Schema<AvailabilityWindow>(
  {
    daysOfWeek: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    startTime: { type: String, default: '00:00' },
    endTime: { type: String, default: '23:59' },
  },
  { _id: false },
);

const TranslationSchema = new Schema<ComboTranslation>(
  { name: { type: String, required: true }, description: String },
  { _id: false },
);

const ComboSchema = new Schema<ComboDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, unique: true, index: true },
    description: { type: String, trim: true },
    imageUrl: String,
    imagePublicId: String,
    price: { type: Number, required: true, min: 0 },
    items: { type: [ComboItemSchema], default: [], validate: (v: ComboItem[]) => v.length > 0 },
    modifierGroupIds: [{ type: Schema.Types.ObjectId, ref: 'ModifierGroup' }],
    availabilityWindows: { type: [AvailabilityWindowSchema], default: [] },
    translations: { type: Map, of: TranslationSchema },
    is86: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const ComboModel = model<ComboDocument>('Combo', ComboSchema);

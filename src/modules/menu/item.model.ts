import { Schema, model, Document, Types } from 'mongoose';

export type FoodType = 'veg' | 'non_veg' | 'egg' | 'vegan';

export interface Variant {
  _id: Types.ObjectId;
  name: string;
  priceDelta: number;
  absolutePrice?: number;
  sku?: string;
  is86: boolean;
}

export interface AvailabilityWindow {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}

export interface ItemTranslation {
  name: string;
  description?: string;
}

export interface ItemDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  categoryId: Types.ObjectId;
  basePrice: number;
  prepTimeMinutes: number;
  foodType: FoodType;
  spiceLevel: number;
  calories?: number;
  allergens: string[];
  hsnCode?: string;
  imageUrl?: string;
  imagePublicId?: string;
  variants: Variant[];
  modifierGroupIds: Types.ObjectId[];
  availabilityWindows: AvailabilityWindow[];
  station?: string;
  tags: string[];
  translations?: Map<string, ItemTranslation>;
  is86: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const VariantSchema = new Schema<Variant>(
  {
    name: { type: String, required: true, trim: true },
    priceDelta: { type: Number, default: 0 },
    absolutePrice: { type: Number, min: 0 },
    sku: { type: String, trim: true },
    is86: { type: Boolean, default: false },
  },
  { _id: true },
);

const AvailabilityWindowSchema = new Schema<AvailabilityWindow>(
  {
    daysOfWeek: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    startTime: { type: String, default: '00:00' },
    endTime: { type: String, default: '23:59' },
  },
  { _id: false },
);

const TranslationSchema = new Schema<ItemTranslation>(
  { name: { type: String, required: true }, description: String },
  { _id: false },
);

const ItemSchema = new Schema<ItemDocument>(
  {
    name: { type: String, required: true, trim: true, index: 'text' },
    slug: { type: String, required: true, lowercase: true, unique: true, index: true },
    description: { type: String, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    basePrice: { type: Number, required: true, min: 0 },
    prepTimeMinutes: { type: Number, default: 10, min: 0 },
    foodType: { type: String, enum: ['veg', 'non_veg', 'egg', 'vegan'], required: true, index: true },
    spiceLevel: { type: Number, min: 0, max: 5, default: 0 },
    calories: { type: Number, min: 0 },
    allergens: { type: [String], default: [] },
    hsnCode: { type: String, trim: true },
    imageUrl: String,
    imagePublicId: String,
    variants: { type: [VariantSchema], default: [] },
    modifierGroupIds: [{ type: Schema.Types.ObjectId, ref: 'ModifierGroup' }],
    availabilityWindows: { type: [AvailabilityWindowSchema], default: [] },
    station: { type: String, trim: true, index: true },
    tags: { type: [String], default: [], index: true },
    translations: { type: Map, of: TranslationSchema },
    is86: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

ItemSchema.index({ categoryId: 1, sortOrder: 1, name: 1 });

export const ItemModel = model<ItemDocument>('Item', ItemSchema);

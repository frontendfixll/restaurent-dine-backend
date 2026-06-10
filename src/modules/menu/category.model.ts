import { Schema, model, Document, Types } from 'mongoose';

interface CategoryTranslation {
  name: string;
  description?: string;
}

export interface CategoryDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  iconUrl?: string;
  iconPublicId?: string;
  sortOrder: number;
  isActive: boolean;
  translations?: Map<string, CategoryTranslation>;
  createdAt: Date;
  updatedAt: Date;
}

const TranslationSchema = new Schema<CategoryTranslation>(
  { name: { type: String, required: true }, description: String },
  { _id: false },
);

const CategorySchema = new Schema<CategoryDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, unique: true, index: true },
    description: { type: String, trim: true },
    iconUrl: String,
    iconPublicId: String,
    sortOrder: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
    translations: { type: Map, of: TranslationSchema },
  },
  { timestamps: true },
);

export const CategoryModel = model<CategoryDocument>('Category', CategorySchema);

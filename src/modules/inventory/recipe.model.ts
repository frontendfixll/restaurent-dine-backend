import { Schema, model, Document, Types } from 'mongoose';
import { InventoryUnit } from './inventoryItem.model';

export interface RecipeIngredient {
  inventoryItemId: Types.ObjectId;
  qty: number;
  unit: InventoryUnit;
  optional: boolean;
}

export interface RecipeDocument extends Document {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  variantId?: Types.ObjectId;
  ingredients: RecipeIngredient[];
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const IngredientSchema = new Schema<RecipeIngredient>(
  {
    inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    qty: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: ['kg', 'g', 'L', 'ml', 'pcs'], required: true },
    optional: { type: Boolean, default: false },
  },
  { _id: false },
);

const RecipeSchema = new Schema<RecipeDocument>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
    variantId: { type: Schema.Types.ObjectId },
    ingredients: { type: [IngredientSchema], default: [] },
    notes: String,
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// One recipe per (itemId, variantId) combination. variantId may be null.
RecipeSchema.index({ itemId: 1, variantId: 1 }, { unique: true });

export const RecipeModel = model<RecipeDocument>('Recipe', RecipeSchema);

import { Schema, model, Document, Types } from 'mongoose';

export interface Modifier {
  _id: Types.ObjectId;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  is86: boolean;
}

export interface ModifierGroupDocument extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  modifiers: Modifier[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ModifierSchema = new Schema<Modifier>(
  {
    name: { type: String, required: true, trim: true },
    priceDelta: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    is86: { type: Boolean, default: false },
  },
  { _id: true },
);

const ModifierGroupSchema = new Schema<ModifierGroupDocument>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isRequired: { type: Boolean, default: false },
    minSelections: { type: Number, default: 0, min: 0 },
    maxSelections: { type: Number, default: 1, min: 1 },
    modifiers: { type: [ModifierSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

ModifierGroupSchema.pre('validate', function (next) {
  if (this.minSelections > this.maxSelections) {
    return next(new Error('minSelections cannot exceed maxSelections'));
  }
  next();
});

export const ModifierGroupModel = model<ModifierGroupDocument>('ModifierGroup', ModifierGroupSchema);

import { Schema, model, Document, Types } from 'mongoose';

export interface RoleDocument extends Document {
  _id: Types.ObjectId;
  key: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<RoleDocument>(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    permissions: { type: [String], required: true, default: [] },
    isSystem: { type: Boolean, required: true, default: false, index: true },
  },
  { timestamps: true },
);

export const RoleModel = model<RoleDocument>('Role', RoleSchema);

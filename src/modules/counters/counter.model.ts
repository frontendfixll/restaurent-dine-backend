import { Schema, model, Document } from 'mongoose';

export interface CounterDocument extends Document<string> {
  _id: string;
  seq: number;
}

const CounterSchema = new Schema<CounterDocument>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false, _id: false },
);

export const CounterModel = model<CounterDocument>('Counter', CounterSchema);

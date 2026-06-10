import { CounterModel } from './counter.model';

/**
 * Atomically increment and return the next sequence for a key.
 * Used for daily order numbers, window tokens, invoice numbers, etc.
 */
export async function nextSeq(key: string): Promise<number> {
  const doc = await CounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return doc.seq;
}

export async function peekSeq(key: string): Promise<number> {
  const doc = await CounterModel.findById(key).lean();
  return doc?.seq ?? 0;
}

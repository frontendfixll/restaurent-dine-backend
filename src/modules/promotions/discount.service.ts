import { Types, FilterQuery } from 'mongoose';
import { DiscountModel, DiscountDocument } from './discount.model';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CreateDiscountInput {
  name: string;
  description?: string;
  type: 'percent' | 'flat';
  value: number;
  maxDiscount?: number;
  scope: 'bill' | 'category' | 'item' | 'channel';
  categoryIds?: string[];
  itemIds?: string[];
  channels?: Array<'dine_in' | 'window' | 'assisted'>;
  minBillAmount?: number;
  daysOfWeek?: number[];
  startTime?: string;
  endTime?: string;
  validFrom?: Date;
  validUntil?: Date;
  maxTotalUses?: number;
}

export async function listDiscounts(opts: { isActive?: boolean; scope?: string; page?: number; limit?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const filter: FilterQuery<DiscountDocument> = {};
  if (typeof opts.isActive === 'boolean') filter.isActive = opts.isActive;
  if (opts.scope) filter.scope = opts.scope;
  const [items, total] = await Promise.all([
    DiscountModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    DiscountModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getDiscount(id: string) {
  const d = await DiscountModel.findById(id).lean();
  if (!d) throw AppError.notFound('Discount not found');
  return d;
}

export async function createDiscount(input: CreateDiscountInput, ctx: ActorCtx) {
  if (input.type === 'percent' && input.value > 100) {
    throw AppError.badRequest('Percent discount cannot exceed 100');
  }
  const d = await DiscountModel.create({
    name: input.name,
    description: input.description,
    type: input.type,
    value: input.value,
    maxDiscount: input.maxDiscount,
    scope: input.scope,
    categoryIds: input.categoryIds?.map((id) => new Types.ObjectId(id)) ?? [],
    itemIds: input.itemIds?.map((id) => new Types.ObjectId(id)) ?? [],
    channels: input.channels ?? [],
    minBillAmount: input.minBillAmount ?? 0,
    daysOfWeek: input.daysOfWeek ?? [],
    startTime: input.startTime,
    endTime: input.endTime,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    maxTotalUses: input.maxTotalUses,
  });
  await writeAuditLog({
    ...ctx,
    action: 'discount.create',
    entity: 'Discount',
    entityId: String(d._id),
    after: d.toObject(),
  });
  return d.toObject();
}

export interface UpdateDiscountInput extends Partial<CreateDiscountInput> {
  isActive?: boolean;
}

export async function updateDiscount(id: string, input: UpdateDiscountInput, ctx: ActorCtx) {
  const d = await DiscountModel.findById(id);
  if (!d) throw AppError.notFound('Discount not found');
  const before = d.toObject();
  if (input.name !== undefined) d.name = input.name;
  if (input.description !== undefined) d.description = input.description;
  if (input.type !== undefined) d.type = input.type;
  if (input.value !== undefined) d.value = input.value;
  if (input.maxDiscount !== undefined) d.maxDiscount = input.maxDiscount;
  if (input.scope !== undefined) d.scope = input.scope;
  if (input.categoryIds) d.categoryIds = input.categoryIds.map((id) => new Types.ObjectId(id));
  if (input.itemIds) d.itemIds = input.itemIds.map((id) => new Types.ObjectId(id));
  if (input.channels) d.channels = input.channels;
  if (input.minBillAmount !== undefined) d.minBillAmount = input.minBillAmount;
  if (input.daysOfWeek) d.daysOfWeek = input.daysOfWeek;
  if (input.startTime !== undefined) d.startTime = input.startTime;
  if (input.endTime !== undefined) d.endTime = input.endTime;
  if (input.validFrom !== undefined) d.validFrom = input.validFrom;
  if (input.validUntil !== undefined) d.validUntil = input.validUntil;
  if (input.maxTotalUses !== undefined) d.maxTotalUses = input.maxTotalUses;
  if (typeof input.isActive === 'boolean') d.isActive = input.isActive;
  await d.save();
  await writeAuditLog({
    ...ctx,
    action: 'discount.update',
    entity: 'Discount',
    entityId: String(d._id),
    before,
    after: d.toObject(),
  });
  return d.toObject();
}

export async function deleteDiscount(id: string, ctx: ActorCtx) {
  const d = await DiscountModel.findById(id);
  if (!d) throw AppError.notFound('Discount not found');
  await DiscountModel.deleteOne({ _id: d._id });
  await writeAuditLog({
    ...ctx,
    action: 'discount.delete',
    entity: 'Discount',
    entityId: String(d._id),
    before: d.toObject(),
  });
}

// === Pricing helpers used by the promotions orchestrator ===

export interface DiscountContext {
  subtotal: number; // includes modifiers
  itemsBreakdown: Array<{ itemId?: Types.ObjectId; categoryId?: Types.ObjectId; lineTotal: number }>;
  channel: 'dine_in' | 'window' | 'assisted';
  now?: Date;
}

export interface DiscountResult {
  valid: boolean;
  reason?: string;
  amount: number;
}

function inTimeWindow(d: DiscountDocument, now: Date): boolean {
  if (d.validFrom && now < d.validFrom) return false;
  if (d.validUntil && now > d.validUntil) return false;
  if (d.daysOfWeek.length && !d.daysOfWeek.includes(now.getDay())) return false;
  if (d.startTime && d.endTime) {
    const [sh, sm] = d.startTime.split(':').map(Number);
    const [eh, em] = d.endTime.split(':').map(Number);
    const cur = now.getHours() * 60 + now.getMinutes();
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (start <= end) {
      if (cur < start || cur > end) return false;
    } else {
      if (cur > end && cur < start) return false;
    }
  }
  return true;
}

export function computeDiscountAmount(d: DiscountDocument, ctx: DiscountContext): DiscountResult {
  const now = ctx.now ?? new Date();
  if (!d.isActive) return { valid: false, reason: 'Discount is inactive', amount: 0 };
  if (!inTimeWindow(d, now)) return { valid: false, reason: 'Outside discount time window', amount: 0 };
  if (d.maxTotalUses && d.usageCount >= d.maxTotalUses) {
    return { valid: false, reason: 'Discount usage limit reached', amount: 0 };
  }
  if (ctx.subtotal < d.minBillAmount) {
    return { valid: false, reason: `Min bill ₹${d.minBillAmount} required`, amount: 0 };
  }
  if (d.scope === 'channel' && d.channels.length && !d.channels.includes(ctx.channel)) {
    return { valid: false, reason: 'Discount not applicable to this channel', amount: 0 };
  }

  let eligibleAmount = 0;
  if (d.scope === 'bill' || d.scope === 'channel') {
    eligibleAmount = ctx.subtotal;
  } else if (d.scope === 'category') {
    const cats = new Set(d.categoryIds.map((c) => String(c)));
    eligibleAmount = ctx.itemsBreakdown
      .filter((i) => i.categoryId && cats.has(String(i.categoryId)))
      .reduce((s, i) => s + i.lineTotal, 0);
    if (eligibleAmount <= 0) return { valid: false, reason: 'No items match discount categories', amount: 0 };
  } else if (d.scope === 'item') {
    const items = new Set(d.itemIds.map((i) => String(i)));
    eligibleAmount = ctx.itemsBreakdown
      .filter((i) => i.itemId && items.has(String(i.itemId)))
      .reduce((s, i) => s + i.lineTotal, 0);
    if (eligibleAmount <= 0) return { valid: false, reason: 'No items match discount selection', amount: 0 };
  }

  let amount = d.type === 'flat' ? d.value : (eligibleAmount * d.value) / 100;
  if (d.maxDiscount !== undefined) amount = Math.min(amount, d.maxDiscount);
  amount = Math.min(amount, eligibleAmount);
  return { valid: true, amount: round2(amount) };
}

export async function incrementDiscountUsage(id: Types.ObjectId) {
  await DiscountModel.updateOne({ _id: id }, { $inc: { usageCount: 1 } });
}

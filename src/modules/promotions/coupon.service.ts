import { Types } from 'mongoose';
import { CouponModel, CouponDocument } from './coupon.model';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';
import { DiscountContext, DiscountResult } from './discount.service';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CreateCouponInput {
  code: string;
  description?: string;
  type: 'percent' | 'flat';
  value: number;
  maxDiscount?: number;
  scope?: 'bill' | 'category' | 'item' | 'channel';
  categoryIds?: string[];
  itemIds?: string[];
  channels?: Array<'dine_in' | 'window' | 'assisted'>;
  minBillAmount?: number;
  validFrom?: Date;
  validUntil?: Date;
  usageLimit?: number;
  perUserLimit?: number;
}

export async function listCoupons(opts: { isActive?: boolean; page?: number; limit?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const filter: Record<string, unknown> = {};
  if (typeof opts.isActive === 'boolean') filter.isActive = opts.isActive;
  const [items, total] = await Promise.all([
    CouponModel.find(filter)
      .select('-redemptions')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CouponModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getCoupon(id: string) {
  const c = await CouponModel.findById(id).lean();
  if (!c) throw AppError.notFound('Coupon not found');
  return c;
}

export async function createCoupon(input: CreateCouponInput, ctx: ActorCtx) {
  const code = input.code.toUpperCase().trim();
  const existing = await CouponModel.findOne({ code });
  if (existing) throw AppError.conflict(`Coupon code "${code}" already exists`);
  if (input.type === 'percent' && input.value > 100) {
    throw AppError.badRequest('Percent coupon cannot exceed 100');
  }
  const c = await CouponModel.create({
    code,
    description: input.description,
    type: input.type,
    value: input.value,
    maxDiscount: input.maxDiscount,
    scope: input.scope ?? 'bill',
    categoryIds: input.categoryIds?.map((id) => new Types.ObjectId(id)) ?? [],
    itemIds: input.itemIds?.map((id) => new Types.ObjectId(id)) ?? [],
    channels: input.channels ?? [],
    minBillAmount: input.minBillAmount ?? 0,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    usageLimit: input.usageLimit,
    perUserLimit: input.perUserLimit,
  });
  await writeAuditLog({
    ...ctx,
    action: 'coupon.create',
    entity: 'Coupon',
    entityId: String(c._id),
    after: c.toObject(),
  });
  return c.toObject();
}

export interface UpdateCouponInput extends Partial<CreateCouponInput> {
  isActive?: boolean;
}

export async function updateCoupon(id: string, input: UpdateCouponInput, ctx: ActorCtx) {
  const c = await CouponModel.findById(id);
  if (!c) throw AppError.notFound('Coupon not found');
  const before = c.toObject();
  if (input.code !== undefined) c.code = input.code.toUpperCase().trim();
  if (input.description !== undefined) c.description = input.description;
  if (input.type !== undefined) c.type = input.type;
  if (input.value !== undefined) c.value = input.value;
  if (input.maxDiscount !== undefined) c.maxDiscount = input.maxDiscount;
  if (input.scope !== undefined) c.scope = input.scope;
  if (input.categoryIds) c.categoryIds = input.categoryIds.map((id) => new Types.ObjectId(id));
  if (input.itemIds) c.itemIds = input.itemIds.map((id) => new Types.ObjectId(id));
  if (input.channels) c.channels = input.channels;
  if (input.minBillAmount !== undefined) c.minBillAmount = input.minBillAmount;
  if (input.validFrom !== undefined) c.validFrom = input.validFrom;
  if (input.validUntil !== undefined) c.validUntil = input.validUntil;
  if (input.usageLimit !== undefined) c.usageLimit = input.usageLimit;
  if (input.perUserLimit !== undefined) c.perUserLimit = input.perUserLimit;
  if (typeof input.isActive === 'boolean') c.isActive = input.isActive;
  await c.save();
  await writeAuditLog({
    ...ctx,
    action: 'coupon.update',
    entity: 'Coupon',
    entityId: String(c._id),
    before,
    after: c.toObject(),
  });
  return c.toObject();
}

export async function deleteCoupon(id: string, ctx: ActorCtx) {
  const c = await CouponModel.findById(id);
  if (!c) throw AppError.notFound('Coupon not found');
  await CouponModel.deleteOne({ _id: c._id });
  await writeAuditLog({
    ...ctx,
    action: 'coupon.delete',
    entity: 'Coupon',
    entityId: String(c._id),
    before: c.toObject(),
  });
}

export interface CouponValidateInput {
  code: string;
  customerPhone?: string;
  customerId?: string;
  context: DiscountContext;
}

export async function validateCoupon(input: CouponValidateInput): Promise<DiscountResult & {
  couponId?: string;
  code?: string;
}> {
  const code = input.code.toUpperCase().trim();
  const coupon = await CouponModel.findOne({ code });
  if (!coupon) return { valid: false, reason: 'Invalid coupon code', amount: 0 };
  if (!coupon.isActive) return { valid: false, reason: 'Coupon disabled', amount: 0 };
  const now = input.context.now ?? new Date();
  if (coupon.validFrom && now < coupon.validFrom) return { valid: false, reason: 'Not started yet', amount: 0 };
  if (coupon.validUntil && now > coupon.validUntil) return { valid: false, reason: 'Coupon expired', amount: 0 };
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, reason: 'Coupon fully redeemed', amount: 0 };
  }
  if (input.context.subtotal < coupon.minBillAmount) {
    return { valid: false, reason: `Min bill ₹${coupon.minBillAmount} required`, amount: 0 };
  }
  if (coupon.scope === 'channel' && coupon.channels.length && !coupon.channels.includes(input.context.channel)) {
    return { valid: false, reason: 'Not applicable to this channel', amount: 0 };
  }
  if (coupon.perUserLimit && (input.customerPhone || input.customerId)) {
    const used = coupon.redemptions.filter((r) => {
      if (input.customerId && r.customerId && String(r.customerId) === input.customerId) return true;
      if (input.customerPhone && r.customerPhone === input.customerPhone) return true;
      return false;
    }).length;
    if (used >= coupon.perUserLimit) {
      return { valid: false, reason: 'Per-user limit reached', amount: 0 };
    }
  }

  let eligible = 0;
  if (coupon.scope === 'bill' || coupon.scope === 'channel') {
    eligible = input.context.subtotal;
  } else if (coupon.scope === 'category') {
    const cats = new Set(coupon.categoryIds.map((c) => String(c)));
    eligible = input.context.itemsBreakdown
      .filter((i) => i.categoryId && cats.has(String(i.categoryId)))
      .reduce((s, i) => s + i.lineTotal, 0);
    if (eligible <= 0) return { valid: false, reason: 'No matching categories', amount: 0 };
  } else if (coupon.scope === 'item') {
    const itemIds = new Set(coupon.itemIds.map((i) => String(i)));
    eligible = input.context.itemsBreakdown
      .filter((i) => i.itemId && itemIds.has(String(i.itemId)))
      .reduce((s, i) => s + i.lineTotal, 0);
    if (eligible <= 0) return { valid: false, reason: 'No matching items', amount: 0 };
  }

  let amount = coupon.type === 'flat' ? coupon.value : (eligible * coupon.value) / 100;
  if (coupon.maxDiscount !== undefined) amount = Math.min(amount, coupon.maxDiscount);
  amount = Math.min(amount, eligible);

  return { valid: true, amount: round2(amount), couponId: String(coupon._id), code: coupon.code };
}

export async function recordCouponRedemption(
  couponId: Types.ObjectId | string,
  orderId: Types.ObjectId,
  amount: number,
  customerId?: Types.ObjectId,
  customerPhone?: string,
) {
  await CouponModel.updateOne(
    { _id: couponId },
    {
      $inc: { usedCount: 1 },
      $push: {
        redemptions: {
          customerId,
          customerPhone,
          orderId,
          amount: round2(amount),
          at: new Date(),
        },
      },
    },
  );
}

import { Types } from 'mongoose';
import { OrderDocument } from '@modules/orders/order.model';
import { ItemModel } from '@modules/menu/item.model';
import {
  DiscountModel,
  DiscountDocument,
} from './discount.model';
import {
  computeDiscountAmount,
  incrementDiscountUsage,
  DiscountContext,
} from './discount.service';
import { validateCoupon, recordCouponRedemption } from './coupon.service';
import { previewRedeem, commitRedeem } from './loyalty.service';
import { AppError } from '@utils/AppError';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface PromotionRequest {
  discountId?: string;
  couponCode?: string;
  loyaltyPoints?: number;
}

export interface PromotionApplied {
  discount?: { id: string; name: string; amount: number };
  coupon?: { id: string; code: string; amount: number };
  loyalty?: { pointsRedeemed: number; amount: number };
  totalDiscount: number;
}

export async function buildDiscountContext(order: OrderDocument): Promise<DiscountContext> {
  const active = order.items.filter((i) => i.status !== 'cancelled');
  const itemIds = active.map((i) => i.itemId).filter((id): id is Types.ObjectId => !!id);
  const itemsMeta = itemIds.length
    ? await ItemModel.find({ _id: { $in: itemIds } }).select('_id categoryId').lean()
    : [];
  const catById = new Map(itemsMeta.map((m) => [String(m._id), m.categoryId]));
  const itemsBreakdown = active.map((i) => ({
    itemId: i.itemId,
    categoryId: i.itemId ? catById.get(String(i.itemId)) : undefined,
    lineTotal: i.lineTotal,
  }));
  const subtotal = active.reduce((s, i) => s + i.lineTotal, 0);
  return { subtotal: round2(subtotal), itemsBreakdown, channel: order.channel };
}

/**
 * Apply requested promotions to an order. Returns the aggregate discount value
 * and a breakdown. Throws on validation errors so the caller surfaces them.
 *
 * Important: this only computes amounts. The caller commits side-effects
 * (usage counters, loyalty deduction) via `commitPromotions`.
 */
export async function applyPromotions(
  order: OrderDocument,
  req: PromotionRequest,
): Promise<{ applied: PromotionApplied; loyaltyContext?: { pointsToCommit: number } }> {
  const context = await buildDiscountContext(order);
  const applied: PromotionApplied = { totalDiscount: 0 };
  let runningSubtotal = context.subtotal;

  // 1) Discount
  if (req.discountId) {
    const d = await DiscountModel.findById(req.discountId);
    if (!d) throw AppError.badRequest('Discount not found');
    const result = computeDiscountAmount(d as DiscountDocument, { ...context, subtotal: runningSubtotal });
    if (!result.valid) throw AppError.badRequest(`Discount: ${result.reason}`);
    applied.discount = { id: String(d._id), name: d.name, amount: result.amount };
    runningSubtotal = round2(runningSubtotal - result.amount);
  }

  // 2) Coupon
  if (req.couponCode) {
    const customerPhone = order.guestPhone;
    const customerId = order.customerId ? String(order.customerId) : undefined;
    const result = await validateCoupon({
      code: req.couponCode,
      customerPhone,
      customerId,
      context: { ...context, subtotal: runningSubtotal },
    });
    if (!result.valid) throw AppError.badRequest(`Coupon: ${result.reason}`);
    applied.coupon = { id: result.couponId!, code: result.code!, amount: result.amount };
    runningSubtotal = round2(runningSubtotal - result.amount);
  }

  // 3) Loyalty (need a customer)
  let loyaltyContext: { pointsToCommit: number } | undefined;
  if (req.loyaltyPoints && req.loyaltyPoints > 0) {
    if (!order.customerId) throw AppError.badRequest('Loyalty redemption requires a customer');
    // billGrand BEFORE loyalty is approximated by subtotal+modifiers minus current discounts.
    // Tax-inclusive math complicates this; for v1 we cap at remaining bill before tax.
    const result = await previewRedeem({
      customerId: order.customerId,
      pointsRequested: req.loyaltyPoints,
      billGrand: runningSubtotal,
    });
    if (!result.valid) throw AppError.badRequest(`Loyalty: ${result.reason}`);
    applied.loyalty = { pointsRedeemed: result.pointsRedeemed, amount: result.amount };
    runningSubtotal = round2(runningSubtotal - result.amount);
    loyaltyContext = { pointsToCommit: result.pointsRedeemed };
  }

  applied.totalDiscount = round2(
    (applied.discount?.amount ?? 0) + (applied.coupon?.amount ?? 0) + (applied.loyalty?.amount ?? 0),
  );

  return { applied, loyaltyContext };
}

/**
 * Persist side-effects after an invoice is generated successfully.
 */
export async function commitPromotions(
  applied: PromotionApplied,
  order: OrderDocument,
  loyaltyContext?: { pointsToCommit: number },
  actorId?: string,
) {
  if (applied.discount) {
    await incrementDiscountUsage(new Types.ObjectId(applied.discount.id));
  }
  if (applied.coupon) {
    await recordCouponRedemption(
      applied.coupon.id,
      order._id,
      applied.coupon.amount,
      order.customerId,
      order.guestPhone,
    );
  }
  if (loyaltyContext && order.customerId) {
    await commitRedeem(order.customerId, loyaltyContext.pointsToCommit, order._id, { actorId });
  }
}

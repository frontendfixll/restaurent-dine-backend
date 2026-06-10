import { Types } from 'mongoose';
import { LoyaltyConfigModel, LoyaltyConfigDocument } from './loyaltyConfig.model';
import { LoyaltyAccountModel, LoyaltyAccountDocument, LoyaltyHistoryType } from './loyaltyAccount.model';
import { OrderModel } from '@modules/orders/order.model';
import { CustomerModel } from '@modules/customers/customer.model';
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

export async function getConfig(): Promise<LoyaltyConfigDocument> {
  let cfg = await LoyaltyConfigModel.findOne({ singleton: 'main' });
  if (!cfg) cfg = await LoyaltyConfigModel.create({ singleton: 'main' });
  return cfg;
}

export async function updateConfig(
  input: Partial<{
    isActive: boolean;
    earnRate: number;
    redeemRate: number;
    minRedeem: number;
    maxRedeemPercent: number;
    earnOn: 'subtotal' | 'grand';
    excludeWhenDiscounted: boolean;
    pointsExpiryDays: number;
    welcomeBonus: number;
  }>,
  ctx: ActorCtx,
) {
  const cfg = await getConfig();
  const before = cfg.toObject();
  if (typeof input.isActive === 'boolean') cfg.isActive = input.isActive;
  if (input.earnRate !== undefined) cfg.earnRate = input.earnRate;
  if (input.redeemRate !== undefined) cfg.redeemRate = input.redeemRate;
  if (input.minRedeem !== undefined) cfg.minRedeem = input.minRedeem;
  if (input.maxRedeemPercent !== undefined) cfg.maxRedeemPercent = input.maxRedeemPercent;
  if (input.earnOn !== undefined) cfg.earnOn = input.earnOn;
  if (typeof input.excludeWhenDiscounted === 'boolean') cfg.excludeWhenDiscounted = input.excludeWhenDiscounted;
  if (input.pointsExpiryDays !== undefined) cfg.pointsExpiryDays = input.pointsExpiryDays;
  if (input.welcomeBonus !== undefined) cfg.welcomeBonus = input.welcomeBonus;
  await cfg.save();
  await writeAuditLog({
    ...ctx,
    action: 'loyalty.config.update',
    entity: 'LoyaltyConfig',
    entityId: String(cfg._id),
    before,
    after: cfg.toObject(),
  });
  return cfg.toObject();
}

async function getOrCreateAccount(customerId: Types.ObjectId | string): Promise<LoyaltyAccountDocument> {
  const id = new Types.ObjectId(String(customerId));
  let acct = await LoyaltyAccountModel.findOne({ customerId: id });
  if (acct) return acct;
  const cfg = await getConfig();
  acct = await LoyaltyAccountModel.create({ customerId: id });
  if (cfg.welcomeBonus > 0 && cfg.isActive) {
    acct.points = cfg.welcomeBonus;
    acct.lifetimeEarned = cfg.welcomeBonus;
    acct.history.push({
      _id: new Types.ObjectId(),
      type: 'welcome',
      points: cfg.welcomeBonus,
      balanceAfter: cfg.welcomeBonus,
      reason: 'Welcome bonus',
      at: new Date(),
    });
    await acct.save();
  }
  return acct;
}

export async function getAccount(customerId: string) {
  const customer = await CustomerModel.findById(customerId).select('_id name phone').lean();
  if (!customer) throw AppError.notFound('Customer not found');
  const acct = await getOrCreateAccount(customer._id);
  return { customer, account: acct.toObject() };
}

function logHistory(
  acct: LoyaltyAccountDocument,
  type: LoyaltyHistoryType,
  points: number,
  opts: { orderId?: Types.ObjectId; reason?: string; actorId?: string } = {},
) {
  acct.history.push({
    _id: new Types.ObjectId(),
    type,
    points,
    balanceAfter: acct.points,
    orderId: opts.orderId,
    reason: opts.reason,
    actorId: opts.actorId ? new Types.ObjectId(opts.actorId) : undefined,
    at: new Date(),
  });
}

export async function adjustPoints(
  customerId: string,
  delta: number,
  reason: string,
  ctx: ActorCtx,
) {
  const acct = await getOrCreateAccount(customerId);
  if (acct.points + delta < 0) throw AppError.badRequest('Adjustment would make balance negative');
  acct.points += delta;
  if (delta > 0) acct.lifetimeEarned += delta;
  logHistory(acct, 'adjusted', delta, { reason, actorId: ctx.actorId });
  await acct.save();
  await writeAuditLog({
    ...ctx,
    action: 'loyalty.adjust',
    entity: 'LoyaltyAccount',
    entityId: String(acct._id),
    metadata: { customerId, delta, reason },
  });
  return acct.toObject();
}

export interface LoyaltyRedeemInput {
  customerId: Types.ObjectId;
  pointsRequested: number;
  billGrand: number; // current grand BEFORE loyalty redemption
}

export interface LoyaltyRedeemResult {
  valid: boolean;
  reason?: string;
  pointsRedeemed: number;
  amount: number;
}

export async function previewRedeem({
  customerId,
  pointsRequested,
  billGrand,
}: LoyaltyRedeemInput): Promise<LoyaltyRedeemResult> {
  const cfg = await getConfig();
  if (!cfg.isActive) return { valid: false, reason: 'Loyalty disabled', pointsRedeemed: 0, amount: 0 };
  if (pointsRequested < cfg.minRedeem) {
    return {
      valid: false,
      reason: `Minimum ${cfg.minRedeem} points required`,
      pointsRedeemed: 0,
      amount: 0,
    };
  }
  const acct = await getOrCreateAccount(customerId);
  const available = acct.points;
  if (available < pointsRequested) {
    return { valid: false, reason: 'Not enough points', pointsRedeemed: 0, amount: 0 };
  }
  const maxRedeemValue = round2((billGrand * cfg.maxRedeemPercent) / 100);
  const requestedValue = round2(pointsRequested * cfg.redeemRate);
  const finalValue = Math.min(requestedValue, maxRedeemValue, billGrand);
  const finalPoints = Math.floor(finalValue / cfg.redeemRate);
  if (finalPoints < cfg.minRedeem) {
    return {
      valid: false,
      reason: `After cap, only ${finalPoints} points would apply (min ${cfg.minRedeem})`,
      pointsRedeemed: 0,
      amount: 0,
    };
  }
  return { valid: true, pointsRedeemed: finalPoints, amount: round2(finalPoints * cfg.redeemRate) };
}

export async function commitRedeem(
  customerId: Types.ObjectId,
  points: number,
  orderId: Types.ObjectId,
  ctx: ActorCtx = {},
) {
  const acct = await getOrCreateAccount(customerId);
  if (acct.points < points) throw AppError.conflict('Insufficient points at commit time');
  acct.points -= points;
  acct.lifetimeRedeemed += points;
  logHistory(acct, 'redeemed', -points, { orderId, actorId: ctx.actorId });
  await acct.save();
  await writeAuditLog({
    ...ctx,
    action: 'loyalty.redeem',
    entity: 'LoyaltyAccount',
    entityId: String(acct._id),
    metadata: { customerId: String(customerId), points, orderId: String(orderId) },
  });
  return acct;
}

// Called from payment.service maybeSettleOrder via dynamic import
export async function earnPointsForOrder(orderId: Types.ObjectId | string) {
  const order = await OrderModel.findById(orderId).lean();
  if (!order || !order.customerId) return;
  if (order.status !== 'settled') return;
  const cfg = await getConfig();
  if (!cfg.isActive) return;
  if (cfg.excludeWhenDiscounted && order.totals.discount > 0) return;

  const base = cfg.earnOn === 'grand' ? order.totals.grand : order.totals.subtotal + order.totals.modifierTotal;
  const points = Math.floor(base / cfg.earnRate);
  if (points <= 0) return;

  const acct = await getOrCreateAccount(order.customerId);
  // Idempotency: skip if a prior "earned" entry for this order exists.
  if (acct.history.some((h) => h.type === 'earned' && h.orderId && String(h.orderId) === String(order._id))) {
    return;
  }
  acct.points += points;
  acct.lifetimeEarned += points;
  logHistory(acct, 'earned', points, { orderId: order._id, reason: `Order ${order.orderNumber}` });
  await acct.save();
}

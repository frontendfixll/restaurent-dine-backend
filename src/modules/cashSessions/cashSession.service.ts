import { Types } from 'mongoose';
import { CashSessionModel } from './cashSession.model';
import { PaymentModel } from '@modules/payments/payment.model';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  actorName?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface OpenSessionInput {
  openingFloat: number;
  notes?: string;
}

export async function openSession(input: OpenSessionInput, ctx: ActorCtx) {
  if (!ctx.actorId) throw AppError.unauthorized();
  const existing = await CashSessionModel.findOne({
    cashierId: new Types.ObjectId(ctx.actorId),
    status: 'open',
  });
  if (existing) throw AppError.conflict('You already have an open cash session');
  const session = await CashSessionModel.create({
    cashierId: new Types.ObjectId(ctx.actorId),
    cashierName: ctx.actorName ?? ctx.actorEmail,
    openingFloat: round2(input.openingFloat),
    expectedCash: round2(input.openingFloat),
    notes: input.notes,
  });
  await writeAuditLog({
    ...ctx,
    action: 'cash_session.open',
    entity: 'CashSession',
    entityId: String(session._id),
    metadata: { openingFloat: session.openingFloat },
  });
  return session;
}

export interface CloseSessionInput {
  actualCash: number;
  denominations?: Record<string, number>;
  notes?: string;
}

export async function closeSession(id: string, input: CloseSessionInput, ctx: ActorCtx) {
  const session = await CashSessionModel.findById(id);
  if (!session) throw AppError.notFound('Cash session not found');
  if (session.status === 'closed') throw AppError.conflict('Session already closed');
  if (ctx.actorId && String(session.cashierId) !== ctx.actorId && ctx.actorRole !== 'owner' && ctx.actorRole !== 'manager') {
    throw AppError.forbidden('Cannot close another cashier’s session');
  }

  // Recalculate expectedCash from payments
  const payments = await PaymentModel.find({
    cashSessionId: session._id,
    mode: 'cash',
    status: 'success',
  }).lean();
  const collected = payments.reduce((s, p) => s + (p.amount - p.refundedAmount), 0);
  const expected = round2(session.openingFloat + collected);
  session.expectedCash = expected;
  session.actualCash = round2(input.actualCash);
  session.variance = round2(input.actualCash - expected);
  if (input.denominations) session.denominations = input.denominations;
  if (input.notes) session.notes = (session.notes ? `${session.notes}\n` : '') + input.notes;
  session.status = 'closed';
  session.closedAt = new Date();
  await session.save();

  await writeAuditLog({
    ...ctx,
    action: 'cash_session.close',
    entity: 'CashSession',
    entityId: String(session._id),
    metadata: { expected, actual: input.actualCash, variance: session.variance },
  });
  return session;
}

export async function getCurrentSession(cashierId: string) {
  return CashSessionModel.findOne({
    cashierId: new Types.ObjectId(cashierId),
    status: 'open',
  }).lean();
}

export async function listSessions(opts: { cashierId?: string; status?: 'open' | 'closed'; from?: Date; to?: Date; page?: number; limit?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const filter: Record<string, unknown> = {};
  if (opts.cashierId) filter.cashierId = new Types.ObjectId(opts.cashierId);
  if (opts.status) filter.status = opts.status;
  if (opts.from || opts.to) {
    filter.openedAt = {
      ...(opts.from ? { $gte: opts.from } : {}),
      ...(opts.to ? { $lte: opts.to } : {}),
    };
  }
  const [items, total] = await Promise.all([
    CashSessionModel.find(filter).sort({ openedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CashSessionModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

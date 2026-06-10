import { Types } from 'mongoose';
import { PaymentModel, PaymentMode, PaymentProvider } from './payment.model';
import { RefundModel, RefundMethod } from './refund.model';
import { InvoiceModel } from '@modules/invoices/invoice.model';
import { OrderModel } from '@modules/orders/order.model';
import { CashSessionModel } from '@modules/cashSessions/cashSession.model';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';
import { refreshInvoicePaymentState } from '@modules/invoices/invoice.service';
import { createOrder as createRazorpayOrder } from '@providers/razorpay.provider';
import { config } from '@config/index';
import { emitToStaff } from '@modules/orders/orderEvents';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  actorName?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface RecordPaymentInput {
  invoiceId: string;
  splitId?: string;
  mode: PaymentMode;
  amount: number;
  provider?: PaymentProvider;
  txnRef?: string;
  cashTendered?: number;
  notes?: string;
  status?: 'pending' | 'success';
}

async function findOpenCashSession(cashierId?: string) {
  if (!cashierId) return null;
  return CashSessionModel.findOne({ cashierId: new Types.ObjectId(cashierId), status: 'open' });
}

export async function recordPayment(input: RecordPaymentInput, ctx: ActorCtx) {
  const invoice = await InvoiceModel.findById(input.invoiceId);
  if (!invoice) throw AppError.notFound('Invoice not found');
  if (invoice.status !== 'final') throw AppError.conflict('Invoice is void');
  if (invoice.paymentStatus === 'paid') throw AppError.conflict('Invoice already paid');
  if (input.amount <= 0) throw AppError.badRequest('Amount must be > 0');

  let splitRef: Types.ObjectId | undefined;
  if (input.splitId) {
    const split = invoice.splits.find((s) => String(s._id) === input.splitId);
    if (!split) throw AppError.notFound('Split not found on invoice');
    if (split.status === 'paid') throw AppError.conflict('Split already paid');
    splitRef = split._id;
  }

  const status = input.status ?? 'success';
  const cashSession = input.mode === 'cash' ? await findOpenCashSession(ctx.actorId) : null;

  let changeReturned: number | undefined;
  if (input.mode === 'cash' && input.cashTendered !== undefined) {
    changeReturned = round2(input.cashTendered - input.amount);
    if (changeReturned < 0) throw AppError.badRequest('Cash tendered less than amount');
  }

  const payment = await PaymentModel.create({
    invoiceId: invoice._id,
    orderId: invoice.orderId,
    splitId: splitRef,
    mode: input.mode,
    provider: input.provider,
    amount: round2(input.amount),
    status,
    txnRef: input.txnRef,
    cashTendered: input.cashTendered,
    changeReturned,
    cashierId: ctx.actorId ? new Types.ObjectId(ctx.actorId) : undefined,
    cashSessionId: cashSession?._id,
    receivedAt: status === 'success' ? new Date() : undefined,
    notes: input.notes,
  });

  if (status === 'success') {
    if (splitRef) {
      const split = invoice.splits.find((s) => String(s._id) === String(splitRef));
      if (split) {
        split.paidAmount = round2(split.paidAmount + payment.amount);
        if (split.paidAmount + 0.5 >= split.amount) split.status = 'paid';
        else split.status = 'partial';
        await invoice.save();
      }
    }
    await refreshInvoicePaymentState(invoice._id);
    if (cashSession) {
      cashSession.expectedCash = round2(cashSession.expectedCash + payment.amount);
      await cashSession.save();
    }
    await maybeSettleOrder(invoice.orderId, ctx);
  }

  await writeAuditLog({
    ...ctx,
    action: 'payment.record',
    entity: 'Payment',
    entityId: String(payment._id),
    metadata: { invoiceId: String(invoice._id), mode: payment.mode, amount: payment.amount, status },
  });

  emitToStaff('order:settled', { orderId: String(invoice.orderId), invoiceId: String(invoice._id) });
  return payment;
}

async function maybeSettleOrder(orderId: Types.ObjectId, ctx: ActorCtx) {
  const fresh = await InvoiceModel.findOne({ orderId, status: 'final' });
  if (!fresh || fresh.paymentStatus !== 'paid') return;
  const order = await OrderModel.findById(orderId);
  if (!order) return;
  if (order.status === 'settled') return;
  order.status = 'settled';
  order.paymentStatus = 'paid';
  order.timeline.push({
    _id: new Types.ObjectId(),
    status: 'settled',
    at: new Date(),
    byUserId: ctx.actorId ? new Types.ObjectId(ctx.actorId) : undefined,
    byName: ctx.actorName ?? ctx.actorEmail,
  });
  await order.save();
  emitToStaff('order:status_changed', { id: String(order._id), status: 'settled' });

  // For dine-in: close the table session and flip table to cleaning
  if (order.tableSessionId) {
    const { TableSessionModel } = await import('@modules/tables/tableSession.model');
    const { TableModel } = await import('@modules/tables/table.model');
    const session = await TableSessionModel.findById(order.tableSessionId);
    if (session && session.status === 'open') {
      session.status = 'closed';
      session.closedAt = new Date();
      await session.save();
    }
    if (order.tableId) {
      await TableModel.updateOne(
        { _id: order.tableId },
        { $set: { status: 'cleaning', currentSessionId: undefined } },
      );
      emitToStaff('table:status_changed', { id: String(order.tableId), to: 'cleaning' });
    }
  }

  // Recipe-based inventory deduction. Fire-and-forget — a deduction failure
  // must never block the settle. The function is idempotent so retries are safe.
  import('@modules/inventory/inventoryDeduction.service')
    .then(({ deductOrderInventory }) => deductOrderInventory(orderId))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Inventory deduction failed for order', String(orderId), err);
    });

  // Update customer lifetime metrics (visit count, LTV, favorites). Fire-and-forget.
  import('@modules/customers/customer.service')
    .then(({ creditCustomerForOrder }) => creditCustomerForOrder(orderId))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Customer credit failed for order', String(orderId), err);
    });

  // Loyalty points earn. Fire-and-forget, idempotent.
  import('@modules/promotions/loyalty.service')
    .then(({ earnPointsForOrder }) => earnPointsForOrder(orderId))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Loyalty earn failed for order', String(orderId), err);
    });

  // Bill copy to guest if we have their phone. Fire-and-forget.
  Promise.all([
    import('@modules/orders/order.model'),
    import('@modules/invoices/invoice.model'),
    import('@modules/restaurant/restaurant.service'),
    import('@modules/notifications/notification.service'),
  ])
    .then(async ([{ OrderModel }, { InvoiceModel }, { getOrCreateRestaurant }, { dispatchSafe }]) => {
      const order = await OrderModel.findById(orderId).lean();
      if (!order || !order.guestPhone) return;
      const invoice = await InvoiceModel.findOne({ orderId, status: 'final' }).lean();
      if (!invoice) return;
      const r = await getOrCreateRestaurant();
      dispatchSafe({
        eventKey: 'order.settled.guest',
        to: order.guestPhone,
        payload: {
          restaurantName: r.brand.name,
          orderNumber: order.orderNumber,
          invoiceNumber: invoice.invoiceNumber,
          grand: invoice.grand,
          amountInWords: invoice.amountInWords,
        },
        relatedOrderId: order._id,
        relatedInvoiceId: invoice._id,
      });
    })
    .catch(() => undefined);
}

export interface CreateUpiQrInput {
  invoiceId: string;
}

export async function createUpiQrPayment(input: CreateUpiQrInput, ctx: ActorCtx) {
  const invoice = await InvoiceModel.findById(input.invoiceId);
  if (!invoice) throw AppError.notFound('Invoice not found');
  if (invoice.paymentStatus === 'paid') throw AppError.conflict('Invoice already paid');

  const order = await createRazorpayOrder({
    amount: invoice.amountDue,
    receipt: invoice.invoiceNumber,
    notes: { invoiceId: String(invoice._id), orderId: String(invoice.orderId) },
  });

  const payment = await PaymentModel.create({
    invoiceId: invoice._id,
    orderId: invoice.orderId,
    mode: 'upi',
    provider: 'razorpay',
    amount: round2(invoice.amountDue),
    status: 'pending',
    gatewayOrderId: order.orderId,
    cashierId: ctx.actorId ? new Types.ObjectId(ctx.actorId) : undefined,
    notes: order.mocked ? 'Mock — Razorpay not configured' : undefined,
  });

  await writeAuditLog({
    ...ctx,
    action: 'payment.upi_qr',
    entity: 'Payment',
    entityId: String(payment._id),
    metadata: { invoiceId: String(invoice._id), gatewayOrderId: order.orderId, mocked: order.mocked },
  });

  return {
    paymentId: String(payment._id),
    gatewayOrderId: order.orderId,
    amount: invoice.amountDue,
    currency: 'INR',
    mocked: order.mocked,
    upiDeeplink: order.upiDeeplink,
    razorpayKeyId: config.razorpay.keyId || null,
  };
}

interface RazorpayWebhookEvent {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id: string;
        order_id: string;
        amount: number;
        status: string;
      };
    };
  };
}

export async function handleRazorpayWebhook(event: RazorpayWebhookEvent) {
  const entity = event.payload?.payment?.entity;
  if (!entity) return { ok: false, reason: 'no payment entity' };

  const payment = await PaymentModel.findOne({ gatewayOrderId: entity.order_id });
  if (!payment) return { ok: false, reason: 'payment not found' };
  if (payment.status === 'success') return { ok: true, idempotent: true };

  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    payment.status = 'success';
    payment.gatewayPaymentId = entity.id;
    payment.txnRef = entity.id;
    payment.receivedAt = new Date();
    payment.gatewayPayload = entity as unknown as Record<string, unknown>;
    await payment.save();
    await refreshInvoicePaymentState(payment.invoiceId);
    await maybeSettleOrder(payment.orderId, {});
    emitToStaff('order:settled', {
      orderId: String(payment.orderId),
      invoiceId: String(payment.invoiceId),
    });
  } else if (event.event === 'payment.failed') {
    payment.status = 'failed';
    payment.gatewayPayload = entity as unknown as Record<string, unknown>;
    await payment.save();
  }
  return { ok: true };
}

export interface RefundPaymentInput {
  paymentId: string;
  amount: number;
  reason: string;
  method?: RefundMethod;
}

export async function refundPayment(input: RefundPaymentInput, ctx: ActorCtx) {
  const payment = await PaymentModel.findById(input.paymentId);
  if (!payment) throw AppError.notFound('Payment not found');
  if (payment.status !== 'success') throw AppError.conflict('Only successful payments can be refunded');
  if (input.amount <= 0) throw AppError.badRequest('Refund amount must be > 0');
  const refundable = round2(payment.amount - payment.refundedAmount);
  if (input.amount > refundable) {
    throw AppError.badRequest(`Refund exceeds remaining ${refundable}`);
  }

  const method = input.method ?? (payment.mode === 'cash' ? 'cash' : 'gateway');
  const refund = await RefundModel.create({
    invoiceId: payment.invoiceId,
    paymentId: payment._id,
    amount: round2(input.amount),
    reason: input.reason,
    method,
    status: 'processed',
    approvedById: ctx.actorId ? new Types.ObjectId(ctx.actorId) : undefined,
    processedAt: new Date(),
  });

  payment.refundedAmount = round2(payment.refundedAmount + input.amount);
  if (payment.refundedAmount + 0.5 >= payment.amount) payment.status = 'refunded';
  await payment.save();

  await refreshInvoicePaymentState(payment.invoiceId);
  const invoice = await InvoiceModel.findById(payment.invoiceId);
  if (invoice && invoice.amountPaid <= 0) {
    invoice.paymentStatus = 'refunded';
    await invoice.save();
  }

  await writeAuditLog({
    ...ctx,
    action: 'payment.refund',
    entity: 'Payment',
    entityId: String(payment._id),
    metadata: { amount: input.amount, reason: input.reason, refundId: String(refund._id) },
  });

  return refund;
}

export interface ListPaymentsOpts {
  invoiceId?: string;
  orderId?: string;
  cashSessionId?: string;
  mode?: PaymentMode;
  status?: 'pending' | 'success' | 'failed' | 'refunded' | 'cancelled';
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export async function listPayments(opts: ListPaymentsOpts) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const filter: Record<string, unknown> = {};
  if (opts.invoiceId) filter.invoiceId = new Types.ObjectId(opts.invoiceId);
  if (opts.orderId) filter.orderId = new Types.ObjectId(opts.orderId);
  if (opts.cashSessionId) filter.cashSessionId = new Types.ObjectId(opts.cashSessionId);
  if (opts.mode) filter.mode = opts.mode;
  if (opts.status) filter.status = opts.status;
  if (opts.from || opts.to) {
    filter.createdAt = {
      ...(opts.from ? { $gte: opts.from } : {}),
      ...(opts.to ? { $lte: opts.to } : {}),
    };
  }
  const [items, total] = await Promise.all([
    PaymentModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    PaymentModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

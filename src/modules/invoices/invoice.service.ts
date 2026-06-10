import { Types, FilterQuery } from 'mongoose';
import { InvoiceModel, InvoiceDocument, InvoiceLineItem } from './invoice.model';
import { OrderModel } from '@modules/orders/order.model';
import { TableModel } from '@modules/tables/table.model';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';
import { getOrCreateRestaurant } from '@modules/restaurant/restaurant.service';
import { computeTotals } from '@modules/orders/pricing';
import { nextInvoiceNumber } from './invoiceNumbering';
import { rupeesToWords } from '@utils/numberToWords';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  actorName?: string;
}

function buildLineItems(
  order: { items: Array<{ _id: Types.ObjectId; name: string; variantName?: string; qty: number; basePrice: number; modifiers: Array<{ priceDelta: number }>; lineTotal: number; status: string }> },
  itemTaxRates: Array<{ name: string; type: string; rate: number }>,
): InvoiceLineItem[] {
  return order.items
    .filter((it) => it.status !== 'cancelled')
    .map((it) => {
      const modifierTotal = it.modifiers.reduce((s, m) => s + (m.priceDelta || 0), 0) * it.qty;
      const lineSubtotal = round2(it.basePrice * it.qty + modifierTotal);
      // Tax breakup is computed at invoice-level (not per line) for v1 — keep here as zero
      const taxBreakup = itemTaxRates.map((t) => ({ ...t, amount: 0 }));
      return {
        orderItemId: it._id,
        name: it.name,
        variantName: it.variantName,
        qty: it.qty,
        unitPrice: it.basePrice,
        modifierTotal: round2(modifierTotal),
        lineSubtotal,
        taxBreakup,
        lineTotal: round2(it.lineTotal),
      };
    });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface GenerateInvoiceInput {
  orderId: string;
  discount?: number;
  discountId?: string;
  couponCode?: string;
  loyaltyPoints?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerGstin?: string;
}

export async function generateInvoiceForOrder(input: GenerateInvoiceInput, ctx: ActorCtx) {
  const order = await OrderModel.findById(input.orderId);
  if (!order) throw AppError.notFound('Order not found');
  if (order.status === 'cancelled') throw AppError.conflict('Cannot bill a cancelled order');
  if (order.status === 'settled') {
    const existing = await InvoiceModel.findOne({ orderId: order._id, status: 'final' });
    if (existing) return existing;
  }

  const existing = await InvoiceModel.findOne({ orderId: order._id, status: 'final' });
  if (existing && existing.paymentStatus === 'paid') {
    throw AppError.conflict('Invoice for this order is already paid');
  }

  // Compute base totals first so we know the order subtotal, then apply promotions
  // on top to determine a single combined "discount" value that pricing.ts consumes.
  const restaurant = await getOrCreateRestaurant();

  let promotionsBreakdown:
    | { discount?: { id: string; name: string; amount: number }; coupon?: { id: string; code: string; amount: number }; loyalty?: { pointsRedeemed: number; amount: number }; totalDiscount: number }
    | undefined;
  let loyaltyCommitCtx: { pointsToCommit: number } | undefined;
  let combinedDiscount = input.discount ?? 0;

  if (input.discountId || input.couponCode || input.loyaltyPoints) {
    // Compute line totals once so the promotions service has accurate amounts.
    computeTotals({ items: order.items, restaurant, discount: 0 });
    const { applyPromotions } = await import('@modules/promotions/promotions.service');
    const result = await applyPromotions(order, {
      discountId: input.discountId,
      couponCode: input.couponCode,
      loyaltyPoints: input.loyaltyPoints,
    });
    promotionsBreakdown = result.applied;
    loyaltyCommitCtx = result.loyaltyContext;
    combinedDiscount = round2(combinedDiscount + result.applied.totalDiscount);
  }

  const totals = computeTotals({
    items: order.items,
    restaurant,
    discount: combinedDiscount,
  });
  order.totals = totals;
  await order.save();

  if (existing && existing.paymentStatus !== 'paid') {
    existing.subtotal = totals.subtotal;
    existing.modifierTotal = totals.modifierTotal;
    existing.discount = totals.discount;
    existing.serviceCharge = totals.serviceCharge;
    existing.tax = totals.tax;
    existing.taxBreakup = totals.taxBreakup;
    existing.roundOff = totals.roundOff;
    existing.grand = totals.grand;
    existing.amountDue = round2(totals.grand - existing.amountPaid);
    existing.amountInWords = rupeesToWords(totals.grand);
    existing.lineItems = buildLineItems(order, totals.taxBreakup.map((t) => ({ name: t.name, type: t.type, rate: t.rate })));
    if (input.customerName !== undefined) existing.customerName = input.customerName;
    if (input.customerPhone !== undefined) existing.customerPhone = input.customerPhone;
    if (input.customerEmail !== undefined) existing.customerEmail = input.customerEmail;
    if (input.customerGstin !== undefined) existing.customerGstin = input.customerGstin;
    await existing.save();
    await writeAuditLog({
      ...ctx,
      action: 'invoice.recompute',
      entity: 'Invoice',
      entityId: String(existing._id),
      metadata: { orderId: String(order._id) },
    });
    return existing;
  }

  const table = order.tableId ? await TableModel.findById(order.tableId).lean() : null;
  const invoiceNumber = await nextInvoiceNumber();

  const invoice = await InvoiceModel.create({
    invoiceNumber,
    orderId: order._id,
    orderNumberSnapshot: order.orderNumber,
    issueDate: new Date(),
    billedAt: new Date(),
    cashierId: ctx.actorId ? new Types.ObjectId(ctx.actorId) : undefined,
    cashierName: ctx.actorName ?? ctx.actorEmail,

    customerName: input.customerName ?? order.guestName,
    customerPhone: input.customerPhone ?? order.guestPhone,
    customerEmail: input.customerEmail,
    customerGstin: input.customerGstin,
    tableNumber: table?.number,
    channel: order.channel,

    restaurantSnapshot: {
      name: restaurant.brand.name,
      gstin: restaurant.tax.gstin,
      fssai: restaurant.receipt.fssaiLicense,
      address: restaurant.brand.address,
      contactPhone: restaurant.brand.contactPhone,
      contactEmail: restaurant.brand.contactEmail,
      brandColor: restaurant.brand.brandColor,
      logoUrl: restaurant.brand.logoUrl,
      headerLines: restaurant.receipt.headerLines,
      footerLines: restaurant.receipt.footerLines,
    },

    lineItems: buildLineItems(order, totals.taxBreakup.map((t) => ({ name: t.name, type: t.type, rate: t.rate }))),

    subtotal: totals.subtotal,
    modifierTotal: totals.modifierTotal,
    discount: totals.discount,
    serviceCharge: totals.serviceCharge,
    taxBreakup: totals.taxBreakup,
    tax: totals.tax,
    roundOff: totals.roundOff,
    grand: totals.grand,
    amountInWords: rupeesToWords(totals.grand),

    amountPaid: 0,
    amountDue: totals.grand,
    paymentStatus: 'unpaid',

    splitMode: 'none',
    status: 'final',
    promotions: promotionsBreakdown
      ? {
          discount: promotionsBreakdown.discount,
          coupon: promotionsBreakdown.coupon,
          loyalty: promotionsBreakdown.loyalty,
        }
      : undefined,
  });

  // Commit promotion side-effects only after the invoice is durable.
  if (promotionsBreakdown) {
    const { commitPromotions } = await import('@modules/promotions/promotions.service');
    await commitPromotions(promotionsBreakdown, order, loyaltyCommitCtx, ctx.actorId);
    if (input.couponCode) order.couponCode = promotionsBreakdown.coupon?.code;
    await order.save();
  }

  await writeAuditLog({
    ...ctx,
    action: 'invoice.create',
    entity: 'Invoice',
    entityId: String(invoice._id),
    metadata: {
      orderId: String(order._id),
      invoiceNumber,
      grand: invoice.grand,
      promotions: promotionsBreakdown
        ? {
            discount: promotionsBreakdown.discount?.amount,
            coupon: promotionsBreakdown.coupon?.code,
            loyaltyPoints: promotionsBreakdown.loyalty?.pointsRedeemed,
          }
        : undefined,
    },
  });

  return invoice;
}

export interface SplitInput {
  mode: 'equal' | 'item' | 'custom';
  splits?: Array<{ label: string; amount?: number; orderItemIds?: string[] }>;
  equalCount?: number;
}

export async function splitInvoice(invoiceId: string, input: SplitInput, ctx: ActorCtx) {
  const invoice = await InvoiceModel.findById(invoiceId);
  if (!invoice) throw AppError.notFound('Invoice not found');
  if (invoice.status !== 'final') throw AppError.conflict('Invoice is void');
  if (invoice.paymentStatus === 'paid') throw AppError.conflict('Invoice already paid');
  if (invoice.amountPaid > 0) throw AppError.conflict('Cannot split — partial payment recorded');

  const splits: InvoiceDocument['splits'] = [];

  if (input.mode === 'equal') {
    const count = Math.max(2, Math.min(20, input.equalCount ?? 2));
    const each = round2(invoice.grand / count);
    const remainder = round2(invoice.grand - each * count);
    for (let i = 0; i < count; i++) {
      splits.push({
        _id: new Types.ObjectId(),
        label: `Guest ${i + 1}`,
        amount: i === 0 ? each + remainder : each,
        orderItemIds: [],
        paidAmount: 0,
        status: 'unpaid',
      });
    }
  } else if (input.mode === 'item') {
    if (!input.splits || !input.splits.length) {
      throw AppError.badRequest('Provide splits with orderItemIds per guest');
    }
    const accountedFor = new Set<string>();
    for (const s of input.splits) {
      if (!s.orderItemIds || !s.orderItemIds.length) {
        throw AppError.badRequest('Each item-split needs orderItemIds');
      }
      let amount = 0;
      for (const oid of s.orderItemIds) {
        if (accountedFor.has(oid)) throw AppError.badRequest(`Item ${oid} assigned twice`);
        accountedFor.add(oid);
        const li = invoice.lineItems.find((l) => String(l.orderItemId) === oid);
        if (!li) throw AppError.badRequest(`Item ${oid} not on invoice`);
        amount += li.lineTotal;
      }
      // Distribute tax proportionally
      const ratio = amount / (invoice.subtotal + invoice.modifierTotal || 1);
      amount = round2(
        amount + invoice.serviceCharge * ratio + invoice.tax * ratio + invoice.roundOff * ratio - invoice.discount * ratio,
      );
      splits.push({
        _id: new Types.ObjectId(),
        label: s.label,
        amount,
        orderItemIds: s.orderItemIds.map((id) => new Types.ObjectId(id)),
        paidAmount: 0,
        status: 'unpaid',
      });
    }
  } else if (input.mode === 'custom') {
    if (!input.splits || !input.splits.length) {
      throw AppError.badRequest('Provide splits with amounts');
    }
    let total = 0;
    for (const s of input.splits) {
      if (s.amount === undefined || s.amount < 0) {
        throw AppError.badRequest('Each custom split needs amount');
      }
      total += s.amount;
      splits.push({
        _id: new Types.ObjectId(),
        label: s.label,
        amount: round2(s.amount),
        orderItemIds: [],
        paidAmount: 0,
        status: 'unpaid',
      });
    }
    const sumDiff = Math.abs(round2(total) - invoice.grand);
    if (sumDiff > 0.5) {
      throw AppError.badRequest(`Splits sum to ${round2(total)} but invoice is ${invoice.grand}`);
    }
  }

  invoice.splitMode = input.mode;
  invoice.splits = splits;
  await invoice.save();

  await writeAuditLog({
    ...ctx,
    action: 'invoice.split',
    entity: 'Invoice',
    entityId: String(invoice._id),
    metadata: { mode: input.mode, count: splits.length },
  });

  return invoice;
}

export async function applyDiscount(invoiceId: string, amount: number, ctx: ActorCtx) {
  const invoice = await InvoiceModel.findById(invoiceId);
  if (!invoice) throw AppError.notFound('Invoice not found');
  if (invoice.status !== 'final') throw AppError.conflict('Invoice is void');
  if (invoice.paymentStatus === 'paid') throw AppError.conflict('Invoice already paid');
  if (amount < 0) throw AppError.badRequest('Discount must be non-negative');
  if (amount > invoice.subtotal + invoice.modifierTotal) {
    throw AppError.badRequest('Discount exceeds subtotal');
  }

  // Recompute totals using updated discount via the order
  const order = await OrderModel.findById(invoice.orderId);
  if (!order) throw AppError.notFound('Underlying order missing');
  return generateInvoiceForOrder(
    { orderId: String(order._id), discount: amount },
    ctx,
  );
}

export async function voidInvoice(invoiceId: string, reason: string, ctx: ActorCtx) {
  const invoice = await InvoiceModel.findById(invoiceId);
  if (!invoice) throw AppError.notFound('Invoice not found');
  if (invoice.status === 'void') throw AppError.badRequest('Already void');
  if (invoice.paymentStatus === 'paid') {
    throw AppError.conflict('Refund payments before voiding a paid invoice');
  }
  invoice.status = 'void';
  invoice.voidReason = reason;
  invoice.voidedAt = new Date();
  invoice.voidedById = ctx.actorId ? new Types.ObjectId(ctx.actorId) : undefined;
  await invoice.save();
  await writeAuditLog({
    ...ctx,
    action: 'invoice.void',
    entity: 'Invoice',
    entityId: String(invoice._id),
    metadata: { reason },
  });
  return invoice;
}

export interface ListInvoicesOpts {
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'refunded';
  status?: 'final' | 'void';
  channel?: 'dine_in' | 'window' | 'assisted';
  from?: Date;
  to?: Date;
  q?: string;
  page?: number;
  limit?: number;
}

export async function listInvoices(opts: ListInvoicesOpts) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const filter: FilterQuery<InvoiceDocument> = {};
  if (opts.paymentStatus) filter.paymentStatus = opts.paymentStatus;
  if (opts.status) filter.status = opts.status;
  if (opts.channel) filter.channel = opts.channel;
  if (opts.from || opts.to) {
    filter.issueDate = {
      ...(opts.from ? { $gte: opts.from } : {}),
      ...(opts.to ? { $lte: opts.to } : {}),
    };
  }
  if (opts.q) {
    const rx = new RegExp(opts.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ invoiceNumber: rx }, { customerPhone: rx }, { customerName: rx }];
  }
  const [items, total] = await Promise.all([
    InvoiceModel.find(filter).sort({ issueDate: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    InvoiceModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getInvoice(id: string) {
  const inv = await InvoiceModel.findById(id).lean();
  if (!inv) throw AppError.notFound('Invoice not found');
  return inv;
}

// Called by payment service when payments settle — refreshes amountPaid/Due/Status.
export async function refreshInvoicePaymentState(invoiceId: Types.ObjectId | string) {
  const invoice = await InvoiceModel.findById(invoiceId);
  if (!invoice) return null;
  const { PaymentModel } = await import('@modules/payments/payment.model');
  const payments = await PaymentModel.find({ invoiceId: invoice._id, status: 'success' }).lean();
  const paid = round2(payments.reduce((s, p) => s + (p.amount - p.refundedAmount), 0));
  invoice.amountPaid = paid;
  invoice.amountDue = round2(invoice.grand - paid);
  if (paid <= 0) invoice.paymentStatus = 'unpaid';
  else if (paid + 0.5 < invoice.grand) invoice.paymentStatus = 'partial';
  else invoice.paymentStatus = 'paid';
  await invoice.save();
  return invoice;
}

import { OrderModel } from '@modules/orders/order.model';
import { InvoiceModel } from '@modules/invoices/invoice.model';
import { PaymentModel } from '@modules/payments/payment.model';
import { RefundModel } from '@modules/payments/refund.model';
import { CashSessionModel } from '@modules/cashSessions/cashSession.model';
import { writeAuditLog } from '@modules/audit/audit.service';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  actorName?: string;
}

function startOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function buildDayClose(date = new Date()) {
  const from = startOfDay(date);
  const to = endOfDay(date);
  const range = { $gte: from, $lte: to };

  const [orders, invoices, payments, refunds, openCashSessions, topItems] = await Promise.all([
    OrderModel.find({ createdAt: range }).lean(),
    InvoiceModel.find({ issueDate: range }).lean(),
    PaymentModel.find({ createdAt: range, status: 'success' }).lean(),
    RefundModel.find({ createdAt: range, status: 'processed' }).lean(),
    CashSessionModel.find({ status: 'open' }).lean(),
    OrderModel.aggregate([
      { $match: { createdAt: range, status: { $nin: ['cancelled'] } } },
      { $unwind: '$items' },
      { $match: { 'items.status': { $ne: 'cancelled' } } },
      {
        $group: {
          _id: '$items.name',
          qty: { $sum: '$items.qty' },
          revenue: { $sum: '$items.lineTotal' },
        },
      },
      { $sort: { qty: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const orderCounts = {
    total: orders.length,
    settled: orders.filter((o) => o.status === 'settled').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
    open: orders.filter((o) => !['settled', 'cancelled'].includes(o.status)).length,
    dine_in: orders.filter((o) => o.channel === 'dine_in').length,
    window: orders.filter((o) => o.channel === 'window').length,
    assisted: orders.filter((o) => o.channel === 'assisted').length,
  };

  const grossSales = round2(invoices.filter((i) => i.status === 'final').reduce((s, i) => s + i.grand, 0));
  const voids = invoices.filter((i) => i.status === 'void').length;
  const discounts = round2(invoices.reduce((s, i) => s + i.discount, 0));
  const taxCollected = round2(invoices.filter((i) => i.status === 'final').reduce((s, i) => s + i.tax, 0));
  const taxByType = aggregateTaxBreakup(invoices);

  const paymentsByMode = ['cash', 'upi', 'card', 'wallet', 'online_prepay'].reduce<Record<string, number>>(
    (acc, m) => {
      acc[m] = round2(
        payments.filter((p) => p.mode === m).reduce((s, p) => s + (p.amount - p.refundedAmount), 0),
      );
      return acc;
    },
    {},
  );
  const netCollections = round2(Object.values(paymentsByMode).reduce((s, v) => s + v, 0));
  const totalRefunds = round2(refunds.reduce((s, r) => s + r.amount, 0));

  return {
    date: from.toISOString().slice(0, 10),
    orderCounts,
    sales: {
      gross: grossSales,
      discounts,
      taxCollected,
      taxByType,
      net: round2(grossSales - discounts),
      voids,
    },
    payments: {
      byMode: paymentsByMode,
      total: netCollections,
      refunds: totalRefunds,
    },
    cashSessions: {
      openCount: openCashSessions.length,
      openSessions: openCashSessions.map((s) => ({
        id: String(s._id),
        cashierName: s.cashierName,
        openedAt: s.openedAt,
        expectedCash: s.expectedCash,
      })),
    },
    topItems: topItems.map((t) => ({ name: t._id, qty: t.qty, revenue: round2(t.revenue) })),
  };
}

function aggregateTaxBreakup(invoices: Array<{ taxBreakup: Array<{ name: string; amount: number }> }>) {
  const m = new Map<string, number>();
  for (const inv of invoices) {
    for (const t of inv.taxBreakup) {
      m.set(t.name, round2((m.get(t.name) ?? 0) + t.amount));
    }
  }
  return Object.fromEntries(m);
}

export async function recordDayClose(date: Date, ctx: ActorCtx) {
  const summary = await buildDayClose(date);
  await writeAuditLog({
    ...ctx,
    action: 'day.close',
    entity: 'Order',
    metadata: {
      date: summary.date,
      gross: summary.sales.gross,
      net: summary.sales.net,
      openCashSessions: summary.cashSessions.openCount,
    },
  });
  return summary;
}

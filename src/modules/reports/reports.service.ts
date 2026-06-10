import { Types } from 'mongoose';
import { OrderModel } from '@modules/orders/order.model';
import { InvoiceModel } from '@modules/invoices/invoice.model';
import { PaymentModel } from '@modules/payments/payment.model';
import { RefundModel } from '@modules/payments/refund.model';
import { ItemModel } from '@modules/menu/item.model';
import { TableSessionModel } from '@modules/tables/tableSession.model';
import { StockMovementModel } from '@modules/inventory/stockMovement.model';
import { InventoryItemModel } from '@modules/inventory/inventoryItem.model';
import { FeedbackModel } from '@modules/feedback/feedback.model';

export type GroupBy = 'day' | 'week' | 'month';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtForGroup(g: GroupBy): string {
  if (g === 'day') return '%Y-%m-%d';
  if (g === 'week') return '%G-W%V';
  return '%Y-%m';
}

interface RangeOpts {
  from?: Date;
  to?: Date;
}

function rangeFilter(opts: RangeOpts, field = 'createdAt') {
  const f: Record<string, Date> = {};
  if (opts.from) f.$gte = opts.from;
  if (opts.to) f.$lte = opts.to;
  return Object.keys(f).length ? { [field]: f } : {};
}

// ===== SALES =====
export interface SalesReportOpts extends RangeOpts {
  groupBy?: GroupBy;
  channel?: 'dine_in' | 'window' | 'assisted';
}

export async function salesReport(opts: SalesReportOpts) {
  const groupBy = opts.groupBy ?? 'day';
  const match: Record<string, unknown> = {
    status: 'final',
    ...rangeFilter(opts, 'issueDate'),
  };
  if (opts.channel) match.channel = opts.channel;

  const buckets = await InvoiceModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: fmtForGroup(groupBy), date: '$issueDate' } },
        invoiceCount: { $sum: 1 },
        gross: { $sum: '$grand' },
        discount: { $sum: '$discount' },
        tax: { $sum: '$tax' },
        serviceCharge: { $sum: '$serviceCharge' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byChannel = await InvoiceModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$channel',
        invoiceCount: { $sum: 1 },
        gross: { $sum: '$grand' },
      },
    },
  ]);

  const totals = buckets.reduce(
    (acc, b) => {
      acc.invoiceCount += b.invoiceCount;
      acc.gross = round2(acc.gross + b.gross);
      acc.discount = round2(acc.discount + b.discount);
      acc.tax = round2(acc.tax + b.tax);
      acc.serviceCharge = round2(acc.serviceCharge + b.serviceCharge);
      return acc;
    },
    { invoiceCount: 0, gross: 0, discount: 0, tax: 0, serviceCharge: 0 },
  );

  return {
    groupBy,
    range: { from: opts.from, to: opts.to },
    buckets: buckets.map((b) => ({
      bucket: b._id,
      invoiceCount: b.invoiceCount,
      gross: round2(b.gross),
      discount: round2(b.discount),
      tax: round2(b.tax),
      serviceCharge: round2(b.serviceCharge),
      net: round2(b.gross - b.discount),
    })),
    byChannel: byChannel.map((c) => ({
      channel: c._id,
      invoiceCount: c.invoiceCount,
      gross: round2(c.gross),
    })),
    totals,
  };
}

// ===== ITEMS =====
export interface ItemsReportOpts extends RangeOpts {
  sortBy?: 'top' | 'slow';
  limit?: number;
}

export async function itemsReport(opts: ItemsReportOpts) {
  const limit = Math.max(1, Math.min(100, opts.limit ?? 20));
  const match: Record<string, unknown> = {
    status: { $nin: ['cancelled'] },
    ...rangeFilter(opts, 'createdAt'),
  };
  const agg = await OrderModel.aggregate([
    { $match: match },
    { $unwind: '$items' },
    { $match: { 'items.status': { $ne: 'cancelled' }, 'items.itemId': { $ne: null } } },
    {
      $group: {
        _id: { itemId: '$items.itemId', name: '$items.name' },
        qty: { $sum: '$items.qty' },
        revenue: { $sum: '$items.lineTotal' },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: opts.sortBy === 'slow' ? { qty: 1 } : { qty: -1 } },
    { $limit: limit },
  ]);

  return {
    range: { from: opts.from, to: opts.to },
    sortBy: opts.sortBy ?? 'top',
    items: agg.map((a) => ({
      itemId: String(a._id.itemId),
      name: a._id.name,
      qty: a.qty,
      revenue: round2(a.revenue),
      orderCount: a.orderCount,
    })),
  };
}

// ===== TAX =====
export async function taxReport(opts: RangeOpts) {
  const match: Record<string, unknown> = {
    status: 'final',
    ...rangeFilter(opts, 'issueDate'),
  };
  const breakup = await InvoiceModel.aggregate([
    { $match: match },
    { $unwind: '$taxBreakup' },
    {
      $group: {
        _id: { name: '$taxBreakup.name', type: '$taxBreakup.type', rate: '$taxBreakup.rate' },
        amount: { $sum: '$taxBreakup.amount' },
      },
    },
    { $sort: { '_id.type': 1, '_id.rate': 1 } },
  ]);
  const aggregate = await InvoiceModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        invoiceCount: { $sum: 1 },
        taxableTurnover: { $sum: { $subtract: ['$grand', '$tax'] } },
        totalTax: { $sum: '$tax' },
      },
    },
  ]);

  return {
    range: { from: opts.from, to: opts.to },
    breakup: breakup.map((b) => ({
      name: b._id.name,
      type: b._id.type,
      rate: b._id.rate,
      amount: round2(b.amount),
    })),
    summary: aggregate[0]
      ? {
          invoiceCount: aggregate[0].invoiceCount,
          taxableTurnover: round2(aggregate[0].taxableTurnover),
          totalTax: round2(aggregate[0].totalTax),
        }
      : { invoiceCount: 0, taxableTurnover: 0, totalTax: 0 },
  };
}

// ===== PAYMENTS =====
export async function paymentsReport(opts: RangeOpts) {
  const match: Record<string, unknown> = {
    status: 'success',
    ...rangeFilter(opts, 'createdAt'),
  };
  const byMode = await PaymentModel.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$mode',
        count: { $sum: 1 },
        gross: { $sum: '$amount' },
        refunded: { $sum: '$refundedAmount' },
      },
    },
  ]);
  const refundsMatch: Record<string, unknown> = {
    status: 'processed',
    ...rangeFilter(opts, 'createdAt'),
  };
  const refundsByMethod = await RefundModel.aggregate([
    { $match: refundsMatch },
    { $group: { _id: '$method', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
  ]);
  const voids = await InvoiceModel.countDocuments({
    status: 'void',
    ...rangeFilter(opts, 'voidedAt'),
  });

  return {
    range: { from: opts.from, to: opts.to },
    byMode: byMode.map((m) => ({
      mode: m._id,
      count: m.count,
      gross: round2(m.gross),
      refunded: round2(m.refunded),
      net: round2(m.gross - m.refunded),
    })),
    refunds: refundsByMethod.map((r) => ({
      method: r._id,
      count: r.count,
      amount: round2(r.amount),
    })),
    voidedInvoices: voids,
  };
}

// ===== STAFF =====
export async function staffReport(opts: RangeOpts) {
  const orderMatch: Record<string, unknown> = rangeFilter(opts, 'createdAt');
  const invoiceMatch: Record<string, unknown> = {
    status: 'final',
    ...rangeFilter(opts, 'issueDate'),
  };

  const byWaiter = await OrderModel.aggregate([
    { $match: { ...orderMatch, waiterId: { $exists: true } } },
    {
      $group: {
        _id: '$waiterId',
        orderCount: { $sum: 1 },
        gross: { $sum: '$totals.grand' },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { name: 1, email: 1 } }],
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $sort: { gross: -1 } },
  ]);

  const byCashier = await InvoiceModel.aggregate([
    { $match: { ...invoiceMatch, cashierId: { $exists: true } } },
    {
      $group: {
        _id: '$cashierId',
        invoiceCount: { $sum: 1 },
        gross: { $sum: '$grand' },
        discount: { $sum: '$discount' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { name: 1, email: 1 } }],
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $sort: { gross: -1 } },
  ]);

  const itemVoidsByActor = await OrderModel.aggregate([
    { $match: orderMatch },
    { $unwind: '$items' },
    { $match: { 'items.status': 'cancelled', 'items.voidedById': { $exists: true } } },
    { $group: { _id: '$items.voidedById', count: { $sum: 1 } } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { name: 1, email: 1 } }],
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $sort: { count: -1 } },
  ]);

  return {
    range: { from: opts.from, to: opts.to },
    waiters: byWaiter.map((w) => ({
      userId: String(w._id),
      name: w.user?.name,
      email: w.user?.email,
      orderCount: w.orderCount,
      gross: round2(w.gross),
      cancelled: w.cancelled,
    })),
    cashiers: byCashier.map((c) => ({
      userId: String(c._id),
      name: c.user?.name,
      email: c.user?.email,
      invoiceCount: c.invoiceCount,
      gross: round2(c.gross),
      discount: round2(c.discount),
    })),
    itemVoidsByActor: itemVoidsByActor.map((v) => ({
      userId: String(v._id),
      name: v.user?.name,
      email: v.user?.email,
      voidCount: v.count,
    })),
  };
}

// ===== FOOTFALL =====
export async function footfallReport(opts: RangeOpts) {
  const orderMatch: Record<string, unknown> = rangeFilter(opts, 'createdAt');

  const byChannel = await OrderModel.aggregate([
    { $match: orderMatch },
    { $group: { _id: '$channel', count: { $sum: 1 } } },
  ]);

  const peakHours = await OrderModel.aggregate([
    { $match: orderMatch },
    {
      $group: {
        _id: { $hour: '$createdAt' },
        count: { $sum: 1 },
        gross: { $sum: '$totals.grand' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const dwell = await TableSessionModel.aggregate([
    { $match: { status: 'closed', closedAt: { $exists: true }, ...rangeFilter(opts, 'openedAt') } },
    {
      $project: {
        durationMin: {
          $divide: [{ $subtract: ['$closedAt', '$openedAt'] }, 60000],
        },
        runningTotal: 1,
        guestCount: 1,
      },
    },
    {
      $group: {
        _id: null,
        sessionCount: { $sum: 1 },
        avgDurationMin: { $avg: '$durationMin' },
        avgTicket: { $avg: '$runningTotal' },
        avgGuestCount: { $avg: '$guestCount' },
      },
    },
  ]);

  return {
    range: { from: opts.from, to: opts.to },
    channelMix: byChannel.map((c) => ({ channel: c._id, count: c.count })),
    peakHours: peakHours.map((h) => ({ hour: h._id, count: h.count, gross: round2(h.gross) })),
    diningRoom: dwell[0]
      ? {
          sessionCount: dwell[0].sessionCount,
          avgDwellMinutes: Math.round(dwell[0].avgDurationMin),
          avgTicket: round2(dwell[0].avgTicket),
          avgGuestCount: round2(dwell[0].avgGuestCount),
        }
      : { sessionCount: 0, avgDwellMinutes: 0, avgTicket: 0, avgGuestCount: 0 },
  };
}

// ===== INVENTORY =====
export async function inventoryReport(opts: RangeOpts) {
  const match: Record<string, unknown> = rangeFilter(opts, 'createdAt');

  const consumption = await StockMovementModel.aggregate([
    { $match: { ...match, type: 'recipe_deduction' } },
    {
      $group: {
        _id: '$inventoryItemId',
        consumed: { $sum: { $abs: '$qty' } },
        unit: { $first: '$unit' },
      },
    },
    {
      $lookup: {
        from: 'inventoryitems',
        localField: '_id',
        foreignField: '_id',
        as: 'item',
        pipeline: [{ $project: { name: 1, costPerUnit: 1 } }],
      },
    },
    { $unwind: '$item' },
    { $sort: { consumed: -1 } },
  ]);

  const wastage = await StockMovementModel.aggregate([
    { $match: { ...match, type: 'waste' } },
    {
      $group: {
        _id: '$inventoryItemId',
        wasted: { $sum: { $abs: '$qty' } },
        unit: { $first: '$unit' },
      },
    },
    {
      $lookup: {
        from: 'inventoryitems',
        localField: '_id',
        foreignField: '_id',
        as: 'item',
        pipeline: [{ $project: { name: 1, costPerUnit: 1 } }],
      },
    },
    { $unwind: '$item' },
    { $sort: { wasted: -1 } },
  ]);

  const lowStock = await InventoryItemModel.find({
    isActive: true,
    $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
  })
    .select('name unit currentStock lowStockThreshold')
    .lean();

  return {
    range: { from: opts.from, to: opts.to },
    consumption: consumption.map((c) => ({
      inventoryItemId: String(c._id),
      name: c.item.name,
      consumed: round2(c.consumed),
      unit: c.unit,
      costValue: c.item.costPerUnit ? round2(c.consumed * c.item.costPerUnit) : null,
    })),
    wastage: wastage.map((w) => ({
      inventoryItemId: String(w._id),
      name: w.item.name,
      wasted: round2(w.wasted),
      unit: w.unit,
      costValue: w.item.costPerUnit ? round2(w.wasted * w.item.costPerUnit) : null,
    })),
    lowStock: lowStock.map((l) => ({
      id: String(l._id),
      name: l.name,
      unit: l.unit,
      currentStock: l.currentStock,
      threshold: l.lowStockThreshold,
    })),
  };
}

// ===== FEEDBACK =====
export async function feedbackReport(opts: RangeOpts) {
  const match: Record<string, unknown> = rangeFilter(opts, 'createdAt');
  const [stats, tagStats, byChannel, trend] = await Promise.all([
    FeedbackModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          avgRating: { $avg: '$rating' },
          positive: { $sum: { $cond: [{ $eq: ['$sentiment', 'positive'] }, 1, 0] } },
          neutral: { $sum: { $cond: [{ $eq: ['$sentiment', 'neutral'] }, 1, 0] } },
          negative: { $sum: { $cond: [{ $eq: ['$sentiment', 'negative'] }, 1, 0] } },
        },
      },
    ]),
    FeedbackModel.aggregate([
      { $match: match },
      { $unwind: '$tagChips' },
      { $group: { _id: '$tagChips', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    FeedbackModel.aggregate([
      { $match: match },
      { $group: { _id: '$channel', count: { $sum: 1 }, avg: { $avg: '$rating' } } },
    ]),
    FeedbackModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          avg: { $avg: '$rating' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    range: { from: opts.from, to: opts.to },
    summary: stats[0]
      ? {
          total: stats[0].total,
          avgRating: round2(stats[0].avgRating ?? 0),
          positive: stats[0].positive,
          neutral: stats[0].neutral,
          negative: stats[0].negative,
        }
      : { total: 0, avgRating: 0, positive: 0, neutral: 0, negative: 0 },
    tagDistribution: tagStats.map((t: { _id: string; count: number }) => ({ tag: t._id, count: t.count })),
    byChannel: byChannel.map((c) => ({
      channel: c._id,
      count: c.count,
      avgRating: round2(c.avg ?? 0),
    })),
    trend: trend.map((t: { _id: string; count: number; avg: number }) => ({
      day: t._id,
      count: t.count,
      avgRating: round2(t.avg ?? 0),
    })),
  };
}

// ===== KPI DASHBOARD =====
function startOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function startOfWeek(d = new Date()): Date {
  const s = startOfDay(d);
  s.setDate(s.getDate() - s.getDay());
  return s;
}
function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function kpiDashboard() {
  const now = new Date();
  const today = startOfDay(now);
  const week = startOfWeek(now);
  const month = startOfMonth(now);

  const [todayAgg, weekAgg, monthAgg, openOrders, totalCustomers, lowStockCount, todayFb] =
    await Promise.all([
      InvoiceModel.aggregate([
        { $match: { status: 'final', issueDate: { $gte: today } } },
        { $group: { _id: null, count: { $sum: 1 }, gross: { $sum: '$grand' } } },
      ]),
      InvoiceModel.aggregate([
        { $match: { status: 'final', issueDate: { $gte: week } } },
        { $group: { _id: null, count: { $sum: 1 }, gross: { $sum: '$grand' } } },
      ]),
      InvoiceModel.aggregate([
        { $match: { status: 'final', issueDate: { $gte: month } } },
        { $group: { _id: null, count: { $sum: 1 }, gross: { $sum: '$grand' } } },
      ]),
      OrderModel.countDocuments({ status: { $nin: ['settled', 'cancelled'] } }),
      (await import('@modules/customers/customer.model')).CustomerModel.estimatedDocumentCount(),
      InventoryItemModel.countDocuments({
        isActive: true,
        $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
      }),
      FeedbackModel.aggregate([
        { $match: { createdAt: { $gte: today } } },
        { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } },
      ]),
    ]);

  return {
    today: {
      orders: todayAgg[0]?.count ?? 0,
      gross: round2(todayAgg[0]?.gross ?? 0),
    },
    week: {
      orders: weekAgg[0]?.count ?? 0,
      gross: round2(weekAgg[0]?.gross ?? 0),
    },
    month: {
      orders: monthAgg[0]?.count ?? 0,
      gross: round2(monthAgg[0]?.gross ?? 0),
    },
    openOrders,
    totalCustomers,
    lowStockCount,
    todayFeedback: {
      count: todayFb[0]?.count ?? 0,
      avgRating: round2(todayFb[0]?.avg ?? 0),
    },
  };
}

// ===== Item profitability (uses recipe + cost) =====
export async function profitabilityReport(opts: RangeOpts) {
  const sales = await OrderModel.aggregate([
    { $match: { status: { $nin: ['cancelled'] }, ...rangeFilter(opts, 'createdAt') } },
    { $unwind: '$items' },
    { $match: { 'items.status': { $ne: 'cancelled' }, 'items.itemId': { $ne: null } } },
    {
      $group: {
        _id: '$items.itemId',
        name: { $first: '$items.name' },
        qty: { $sum: '$items.qty' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
  ]);
  if (!sales.length) return { range: { from: opts.from, to: opts.to }, items: [] };

  const itemIds = sales.map((s: { _id: Types.ObjectId }) => s._id);
  const { RecipeModel } = await import('@modules/inventory/recipe.model');
  const recipes = await RecipeModel.find({
    itemId: { $in: itemIds },
    variantId: { $exists: false },
  }).lean();
  const recipeByItem = new Map(recipes.map((r) => [String(r.itemId), r]));
  const inventoryIds = recipes.flatMap((r) => r.ingredients.map((i) => i.inventoryItemId));
  const inventory = await InventoryItemModel.find({ _id: { $in: inventoryIds } })
    .select('costPerUnit unit')
    .lean();
  const invById = new Map(inventory.map((i) => [String(i._id), i]));

  const items = sales.map((s: { _id: Types.ObjectId; name: string; qty: number; revenue: number }) => {
    const recipe = recipeByItem.get(String(s._id));
    let costPerUnit = 0;
    if (recipe) {
      for (const ing of recipe.ingredients) {
        const inv = invById.get(String(ing.inventoryItemId));
        if (inv?.costPerUnit) costPerUnit += inv.costPerUnit * ing.qty;
      }
    }
    const totalCost = round2(costPerUnit * s.qty);
    const revenue = round2(s.revenue);
    return {
      itemId: String(s._id),
      name: s.name,
      qty: s.qty,
      revenue,
      cost: totalCost,
      grossProfit: round2(revenue - totalCost),
      margin: revenue > 0 ? round2(((revenue - totalCost) / revenue) * 100) : 0,
    };
  });
  items.sort((a, b) => b.grossProfit - a.grossProfit);

  return { range: { from: opts.from, to: opts.to }, items };
}

// Keep ItemModel referenced for tree-shaking sanity (not actually used directly here)
void ItemModel;

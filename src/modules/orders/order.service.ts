import { Types } from 'mongoose';
import { OrderModel, OrderDocument, OrderItem, OrderItemStatus, OrderStatus } from './order.model';
import { ItemModel } from '@modules/menu/item.model';
import { ComboModel } from '@modules/menu/combo.model';
import { ModifierGroupModel } from '@modules/menu/modifierGroup.model';
import { TableModel } from '@modules/tables/table.model';
import { TableSessionModel } from '@modules/tables/tableSession.model';
import { QrCodeModel } from '@modules/qr/qrCode.model';
import { getOrCreateRestaurant } from '@modules/restaurant/restaurant.service';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';
import { computeTotals, estimatePrepMinutes } from './pricing';
import { nextOrderNumber, nextWindowToken } from './numbering';
import {
  emitToStaff,
  emitToKdsStation,
  emitToKdsAll,
  emitToGuestOrder,
  emitToNowServing,
} from './orderEvents';
import { recordOrderAttribution } from '@modules/qr/qrCode.service';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  actorName?: string;
}

export interface ItemInput {
  itemId?: string;
  comboId?: string;
  variantId?: string;
  qty: number;
  notes?: string;
  modifiers?: Array<{ groupId: string; modifierId: string }>;
}

interface ResolvedItem {
  build: Omit<OrderItem, '_id' | 'lineTotal'>;
}

async function resolveItems(inputs: ItemInput[]): Promise<ResolvedItem[]> {
  if (!inputs.length) throw AppError.badRequest('Order must contain at least one item');
  const itemIds = inputs.filter((i) => i.itemId).map((i) => i.itemId!) as string[];
  const comboIds = inputs.filter((i) => i.comboId).map((i) => i.comboId!) as string[];
  const [items, combos] = await Promise.all([
    itemIds.length ? ItemModel.find({ _id: { $in: itemIds } }).lean() : [],
    comboIds.length ? ComboModel.find({ _id: { $in: comboIds } }).lean() : [],
  ]);
  const itemById = new Map(items.map((i) => [String(i._id), i]));
  const comboById = new Map(combos.map((c) => [String(c._id), c]));

  const modGroupIds = new Set<string>();
  for (const inp of inputs) for (const m of inp.modifiers ?? []) modGroupIds.add(m.groupId);
  const modGroups = modGroupIds.size
    ? await ModifierGroupModel.find({ _id: { $in: Array.from(modGroupIds) } }).lean()
    : [];
  const modGroupById = new Map(modGroups.map((g) => [String(g._id), g]));

  const resolved: ResolvedItem[] = [];
  for (const inp of inputs) {
    if (!inp.itemId && !inp.comboId) throw AppError.badRequest('Each line needs itemId or comboId');
    if (inp.qty < 1) throw AppError.badRequest('Quantity must be >= 1');

    if (inp.itemId) {
      const item = itemById.get(inp.itemId);
      if (!item) throw AppError.badRequest(`Item not found: ${inp.itemId}`);
      if (item.is86 || !item.isActive) throw AppError.conflict(`Item unavailable: ${item.name}`);

      let basePrice = item.basePrice;
      let variantName: string | undefined;
      let variantId: Types.ObjectId | undefined;
      if (inp.variantId) {
        const variant = item.variants.find((v) => String(v._id) === inp.variantId);
        if (!variant) throw AppError.badRequest(`Variant not found for ${item.name}`);
        if (variant.is86) throw AppError.conflict(`Variant unavailable: ${variant.name}`);
        basePrice = variant.absolutePrice ?? item.basePrice + variant.priceDelta;
        variantName = variant.name;
        variantId = variant._id;
      }

      const modifiers = (inp.modifiers ?? []).map((m) => {
        const g = modGroupById.get(m.groupId);
        if (!g) throw AppError.badRequest(`Modifier group not found: ${m.groupId}`);
        if (!item.modifierGroupIds.some((id) => String(id) === m.groupId)) {
          throw AppError.badRequest(`Modifier group "${g.name}" not attached to item "${item.name}"`);
        }
        const mod = g.modifiers.find((md) => String(md._id) === m.modifierId);
        if (!mod) throw AppError.badRequest(`Modifier not found in group "${g.name}"`);
        if (mod.is86) throw AppError.conflict(`Modifier unavailable: ${mod.name}`);
        return {
          groupId: g._id,
          groupName: g.name,
          modifierId: mod._id,
          modifierName: mod.name,
          priceDelta: mod.priceDelta,
        };
      });

      const groupedCounts = new Map<string, number>();
      for (const m of modifiers) {
        const k = String(m.groupId);
        groupedCounts.set(k, (groupedCounts.get(k) ?? 0) + 1);
      }
      for (const g of modGroups) {
        const c = groupedCounts.get(String(g._id)) ?? 0;
        if (item.modifierGroupIds.some((id) => String(id) === String(g._id))) {
          if (g.isRequired && c < g.minSelections) {
            throw AppError.badRequest(`Group "${g.name}" requires at least ${g.minSelections} selection(s)`);
          }
          if (c > g.maxSelections) {
            throw AppError.badRequest(`Group "${g.name}" allows at most ${g.maxSelections} selection(s)`);
          }
        }
      }

      resolved.push({
        build: {
          itemId: item._id,
          variantId,
          name: item.name,
          variantName,
          qty: inp.qty,
          basePrice,
          modifiers,
          notes: inp.notes,
          station: item.station,
          status: 'pending',
        },
      });
    } else {
      const combo = comboById.get(inp.comboId!);
      if (!combo) throw AppError.badRequest(`Combo not found: ${inp.comboId}`);
      if (combo.is86 || !combo.isActive) throw AppError.conflict(`Combo unavailable: ${combo.name}`);
      resolved.push({
        build: {
          comboId: combo._id,
          name: combo.name,
          qty: inp.qty,
          basePrice: combo.price,
          modifiers: [],
          notes: inp.notes,
          status: 'pending',
        },
      });
    }
  }
  return resolved;
}

function pushTimeline(
  order: OrderDocument,
  status: string,
  ctx: ActorCtx | undefined,
  note?: string,
) {
  order.timeline.push({
    _id: new Types.ObjectId(),
    status: status as OrderStatus,
    at: new Date(),
    byUserId: ctx?.actorId ? new Types.ObjectId(ctx.actorId) : undefined,
    byName: ctx?.actorName ?? ctx?.actorEmail,
    note,
  });
}

interface PlaceOrderCommon {
  items: ItemInput[];
  guestPhone?: string;
  guestName?: string;
  guestNotes?: string;
  customerId?: string;
  couponCode?: string;
}

export interface PlaceDineInInput extends PlaceOrderCommon {
  qrSlug?: string;
  tableId?: string;
}

export async function placeDineInOrder(input: PlaceDineInInput, ctx?: ActorCtx) {
  let tableId: Types.ObjectId | undefined;
  let qrCodeId: Types.ObjectId | undefined;
  if (input.qrSlug) {
    const qr = await QrCodeModel.findOne({ slug: input.qrSlug, isActive: true });
    if (!qr) throw AppError.badRequest('QR code not found');
    if (qr.type !== 'table') throw AppError.badRequest('QR is not a table QR');
    if (!qr.tableId) throw AppError.badRequest('QR is not bound to a table');
    tableId = qr.tableId;
    qrCodeId = qr._id;
  } else if (input.tableId) {
    tableId = new Types.ObjectId(input.tableId);
  } else {
    throw AppError.badRequest('Provide qrSlug or tableId');
  }

  const table = await TableModel.findById(tableId);
  if (!table) throw AppError.badRequest('Table not found');
  if (table.mergedIntoTableId) tableId = table.mergedIntoTableId;

  let session = table.currentSessionId
    ? await TableSessionModel.findById(table.currentSessionId)
    : null;
  if (!session || session.status !== 'open') {
    session = await TableSessionModel.create({
      tableId,
      guestCount: 1,
      status: 'open',
    });
    table.currentSessionId = session._id;
  }
  if (!['ordered', 'seated'].includes(table.status)) table.status = 'seated';
  await table.save();

  return finalizeOrder({
    ...input,
    channel: 'dine_in',
    tableId,
    tableSessionId: session._id,
    qrCodeId,
  }, ctx);
}

export interface PlaceWindowInput extends PlaceOrderCommon {
  qrSlug?: string;
  pickupAt?: Date;
}

export async function placeWindowOrder(
  input: PlaceWindowInput,
  guestPhone: string,
  ctx?: ActorCtx,
) {
  let qrCodeId: Types.ObjectId | undefined;
  if (input.qrSlug) {
    const qr = await QrCodeModel.findOne({ slug: input.qrSlug, isActive: true });
    if (!qr) throw AppError.badRequest('QR code not found');
    if (qr.type !== 'window') throw AppError.badRequest('QR is not a window QR');
    qrCodeId = qr._id;
  }
  const restaurant = await getOrCreateRestaurant();
  if (!restaurant.operatingModes.takeaway) {
    throw AppError.conflict('Takeaway is currently disabled');
  }
  return finalizeOrder(
    {
      channel: 'window',
      guestPhone,
      qrCodeId,
      ...input,
    },
    ctx,
  );
}

export interface PlaceAssistedInput extends PlaceOrderCommon {
  tableId?: string;
}

export async function placeAssistedOrder(input: PlaceAssistedInput, ctx: ActorCtx) {
  let tableId: Types.ObjectId | undefined;
  let tableSessionId: Types.ObjectId | undefined;

  if (input.tableId) {
    const table = await TableModel.findById(input.tableId);
    if (!table) throw AppError.badRequest('Table not found');
    tableId = table.mergedIntoTableId ?? table._id;

    let session = table.currentSessionId
      ? await TableSessionModel.findById(table.currentSessionId)
      : null;
    if (!session || session.status !== 'open') {
      session = await TableSessionModel.create({ tableId, guestCount: 1, status: 'open' });
      table.currentSessionId = session._id;
    }
    if (!['ordered', 'seated'].includes(table.status)) table.status = 'seated';
    await table.save();
    tableSessionId = session._id;
  }

  return finalizeOrder({ ...input, channel: 'assisted', tableId, tableSessionId }, ctx);
}

interface FinalizeArgs extends PlaceOrderCommon {
  channel: 'dine_in' | 'window' | 'assisted';
  tableId?: Types.ObjectId;
  tableSessionId?: Types.ObjectId;
  qrCodeId?: Types.ObjectId;
  pickupAt?: Date;
}

async function finalizeOrder(args: FinalizeArgs, ctx?: ActorCtx): Promise<OrderDocument> {
  const resolved = await resolveItems(args.items);
  const restaurant = await getOrCreateRestaurant();

  // Auto-create / attach Customer when a phone is provided. Failure must not
  // block order placement, so we swallow errors here.
  let customerIdToUse: Types.ObjectId | undefined = args.customerId
    ? new Types.ObjectId(args.customerId)
    : undefined;
  if (!customerIdToUse && args.guestPhone) {
    try {
      const { ensureCustomerByPhone } = await import('@modules/customers/customer.service');
      const customer = await ensureCustomerByPhone(args.guestPhone, args.guestName);
      if (customer) customerIdToUse = customer._id;
    } catch {
      /* ignore — customer linkage is optional */
    }
  }

  const order = new OrderModel({
    orderNumber: await nextOrderNumber(),
    channel: args.channel,
    status: 'placed',
    tableId: args.tableId,
    tableSessionId: args.tableSessionId,
    qrCodeId: args.qrCodeId,
    waiterId: ctx?.actorId ? new Types.ObjectId(ctx.actorId) : undefined,
    customerId: customerIdToUse,
    guestPhone: args.guestPhone,
    guestName: args.guestName,
    guestNotes: args.guestNotes,
    couponCode: args.couponCode,
    pickupAt: args.pickupAt,
  });

  for (const r of resolved) {
    order.items.push({ _id: new Types.ObjectId(), lineTotal: 0, ...r.build });
  }
  order.totals = computeTotals({ items: order.items, restaurant });
  order.estimatedPrepMinutes = estimatePrepMinutes(order.items);

  if (args.channel === 'window') order.windowToken = await nextWindowToken();
  pushTimeline(order, 'placed', ctx);
  await order.save();

  if (args.tableSessionId) {
    await TableSessionModel.updateOne(
      { _id: args.tableSessionId },
      { $push: { orderIds: order._id }, $inc: { runningTotal: order.totals.grand } },
    );
  }
  if (args.tableId) {
    await TableModel.updateOne({ _id: args.tableId }, { $set: { status: 'ordered' } });
  }
  if (args.qrCodeId) await recordOrderAttribution(args.qrCodeId, order.totals.grand);

  emitToStaff('order:new', toListDTO(order));
  emitToKdsAll('order:new', toKdsDTO(order));
  if (args.channel === 'window') emitToNowServing({ windowToken: order.windowToken, status: 'placed' });

  if (order.guestPhone) {
    void import('@modules/notifications/notification.service').then(({ dispatchSafe }) =>
      dispatchSafe({
        eventKey: 'order.placed.guest',
        to: order.guestPhone!,
        payload: {
          restaurantName: restaurant.brand.name,
          orderNumber: order.orderNumber,
          channel: order.channel,
          windowToken: order.windowToken ?? '',
          grand: order.totals.grand,
          estimatedPrepMinutes: order.estimatedPrepMinutes,
        },
        relatedOrderId: order._id,
      }),
    );
  }

  await writeAuditLog({
    ...ctx,
    action: 'order.placed',
    entity: 'Order',
    entityId: String(order._id),
    metadata: { channel: args.channel, total: order.totals.grand, orderNumber: order.orderNumber },
  });

  return order;
}

export async function addItemsToOrder(orderId: string, items: ItemInput[], ctx: ActorCtx) {
  const order = await OrderModel.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  if (['settled', 'cancelled'].includes(order.status)) {
    throw AppError.conflict(`Cannot add items — order is ${order.status}`);
  }
  const resolved = await resolveItems(items);
  for (const r of resolved) {
    order.items.push({ _id: new Types.ObjectId(), lineTotal: 0, ...r.build });
  }
  const restaurant = await getOrCreateRestaurant();
  order.totals = computeTotals({ items: order.items, restaurant });
  order.estimatedPrepMinutes = estimatePrepMinutes(order.items);
  pushTimeline(order, 'item_added', ctx, `${resolved.length} item(s) added`);
  await order.save();
  if (order.tableSessionId) {
    await TableSessionModel.updateOne(
      { _id: order.tableSessionId },
      { $set: { runningTotal: order.totals.grand } },
    );
  }
  emitToStaff('order:updated', toListDTO(order));
  emitToKdsAll('order:updated', toKdsDTO(order));
  emitToGuestOrder(String(order._id), 'order:updated', toGuestDTO(order));
  await writeAuditLog({
    ...ctx,
    action: 'order.items.add',
    entity: 'Order',
    entityId: String(order._id),
    metadata: { addedCount: resolved.length },
  });
  return order;
}

export interface ListOrdersOpts {
  status?: OrderStatus;
  channel?: 'dine_in' | 'window' | 'assisted';
  tableId?: string;
  waiterId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export async function listOrders(opts: ListOrdersOpts) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const filter: Record<string, unknown> = {};
  if (opts.status) filter.status = opts.status;
  if (opts.channel) filter.channel = opts.channel;
  if (opts.tableId) filter.tableId = new Types.ObjectId(opts.tableId);
  if (opts.waiterId) filter.waiterId = new Types.ObjectId(opts.waiterId);
  if (opts.from || opts.to) {
    filter.createdAt = {
      ...(opts.from ? { $gte: opts.from } : {}),
      ...(opts.to ? { $lte: opts.to } : {}),
    };
  }
  const [items, total] = await Promise.all([
    OrderModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    OrderModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getOrder(id: string) {
  const o = await OrderModel.findById(id).lean();
  if (!o) throw AppError.notFound('Order not found');
  return o;
}

export async function acceptOrder(id: string, ctx: ActorCtx) {
  const order = await OrderModel.findById(id);
  if (!order) throw AppError.notFound('Order not found');
  if (order.status !== 'placed') throw AppError.conflict(`Cannot accept from "${order.status}"`);
  order.status = 'accepted';
  order.acceptedById = ctx.actorId ? new Types.ObjectId(ctx.actorId) : undefined;
  for (const it of order.items) {
    if (it.status === 'pending') {
      it.status = 'accepted';
      it.acceptedAt = new Date();
    }
  }
  pushTimeline(order, 'accepted', ctx);
  await order.save();
  emitToStaff('order:status_changed', { id: String(order._id), status: 'accepted' });
  emitToKdsAll('order:updated', toKdsDTO(order));
  emitToGuestOrder(String(order._id), 'order:status_changed', { status: 'accepted' });
  await writeAuditLog({
    ...ctx,
    action: 'order.accepted',
    entity: 'Order',
    entityId: String(order._id),
  });
  return order;
}

export async function voidItem(orderId: string, itemId: string, reason: string, ctx: ActorCtx) {
  const order = await OrderModel.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  if (['settled', 'cancelled'].includes(order.status)) {
    throw AppError.conflict(`Cannot void — order is ${order.status}`);
  }
  const item = order.items.find((i) => String(i._id) === itemId);
  if (!item) throw AppError.notFound('Order item not found');
  if (item.status === 'cancelled') throw AppError.badRequest('Item already voided');
  item.status = 'cancelled';
  item.voidReason = reason;
  item.voidedById = ctx.actorId ? new Types.ObjectId(ctx.actorId) : undefined;
  const restaurant = await getOrCreateRestaurant();
  order.totals = computeTotals({ items: order.items, restaurant });
  pushTimeline(order, 'item_voided', ctx, reason);
  await order.save();
  if (order.tableSessionId) {
    await TableSessionModel.updateOne(
      { _id: order.tableSessionId },
      { $set: { runningTotal: order.totals.grand } },
    );
  }
  emitToStaff('order:updated', toListDTO(order));
  emitToKdsAll('order:updated', toKdsDTO(order));
  await writeAuditLog({
    ...ctx,
    action: 'order.item.void',
    entity: 'Order',
    entityId: String(order._id),
    metadata: { itemId, reason },
  });
  return order;
}

export async function cancelOrder(id: string, reason: string, ctx: ActorCtx) {
  const order = await OrderModel.findById(id);
  if (!order) throw AppError.notFound('Order not found');
  if (['settled', 'cancelled'].includes(order.status)) {
    throw AppError.conflict(`Cannot cancel from "${order.status}"`);
  }
  order.status = 'cancelled';
  for (const it of order.items) if (it.status !== 'cancelled') it.status = 'cancelled';
  pushTimeline(order, 'cancelled', ctx, reason);
  await order.save();
  if (order.tableSessionId) {
    await TableSessionModel.updateOne(
      { _id: order.tableSessionId },
      { $inc: { runningTotal: -order.totals.grand } },
    );
  }
  emitToStaff('order:status_changed', { id: String(order._id), status: 'cancelled' });
  emitToKdsAll('order:cancelled', { id: String(order._id) });
  emitToGuestOrder(String(order._id), 'order:status_changed', { status: 'cancelled' });
  await writeAuditLog({
    ...ctx,
    action: 'order.cancelled',
    entity: 'Order',
    entityId: String(order._id),
    metadata: { reason },
  });
  return order;
}

export async function markServed(id: string, ctx: ActorCtx) {
  const order = await OrderModel.findById(id);
  if (!order) throw AppError.notFound('Order not found');
  if (order.status !== 'ready') throw AppError.conflict(`Cannot serve from "${order.status}"`);
  order.status = 'served';
  for (const it of order.items) {
    if (it.status === 'ready') {
      it.status = 'served';
      it.servedAt = new Date();
    }
  }
  pushTimeline(order, 'served', ctx);
  await order.save();
  emitToStaff('order:status_changed', { id: String(order._id), status: 'served' });
  emitToGuestOrder(String(order._id), 'order:status_changed', { status: 'served' });
  await writeAuditLog({
    ...ctx,
    action: 'order.served',
    entity: 'Order',
    entityId: String(order._id),
  });
  return order;
}

export async function markPickedUp(windowToken: string, ctx: ActorCtx) {
  const order = await OrderModel.findOne({ windowToken, channel: 'window' });
  if (!order) throw AppError.notFound('Order not found for that token');
  if (order.status !== 'ready') throw AppError.conflict(`Cannot pick up from "${order.status}"`);
  order.status = 'served';
  order.pickedUpAt = new Date();
  pushTimeline(order, 'served', ctx, 'Picked up');
  await order.save();
  emitToStaff('order:status_changed', { id: String(order._id), status: 'served' });
  emitToNowServing({ windowToken: order.windowToken, status: 'picked_up' });
  emitToGuestOrder(String(order._id), 'order:status_changed', { status: 'served' });
  await writeAuditLog({
    ...ctx,
    action: 'order.picked_up',
    entity: 'Order',
    entityId: String(order._id),
    metadata: { windowToken },
  });
  return order;
}

export async function addGuestRequest(
  orderId: string,
  type: 'call_waiter' | 'water' | 'bill' | 'other',
  message?: string,
) {
  const order = await OrderModel.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  const req = {
    _id: new Types.ObjectId(),
    type,
    message,
    at: new Date(),
    resolved: false,
  };
  order.guestRequests.push(req);
  await order.save();
  emitToStaff('order:guest_request', {
    orderId: String(order._id),
    request: req,
    table: order.tableId,
  });
  return req;
}

export async function resolveGuestRequest(orderId: string, requestId: string, ctx: ActorCtx) {
  const order = await OrderModel.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  const req = order.guestRequests.find((r) => String(r._id) === requestId);
  if (!req) throw AppError.notFound('Request not found');
  req.resolved = true;
  req.resolvedAt = new Date();
  req.resolvedById = ctx.actorId ? new Types.ObjectId(ctx.actorId) : undefined;
  await order.save();
  emitToStaff('order:guest_request', { orderId: String(order._id), request: req, resolved: true });
  return req;
}

// Called by KDS when item statuses change — recalculates overall order status
export async function recomputeOrderStatus(orderId: string) {
  const order = await OrderModel.findById(orderId);
  if (!order) return;
  const active = order.items.filter((i) => i.status !== 'cancelled');
  if (!active.length) return;
  const allReady = active.every((i) => i.status === 'ready' || i.status === 'served');
  const anyPreparing = active.some((i) => i.status === 'preparing');
  const anyAccepted = active.some((i) => i.status === 'accepted' || i.status === 'pending');

  let next: OrderStatus | null = null;
  if (allReady && order.status !== 'served' && order.status !== 'settled') next = 'ready';
  else if (anyPreparing && order.status === 'accepted') next = 'preparing';
  else if (anyAccepted && order.status === 'placed') next = 'accepted';

  if (next && next !== order.status) {
    order.status = next;
    pushTimeline(order, next, undefined);
    await order.save();
    emitToStaff('order:status_changed', { id: String(order._id), status: next });
    emitToGuestOrder(String(order._id), 'order:status_changed', { status: next });
    if (next === 'ready' && order.channel === 'window') {
      emitToNowServing({ windowToken: order.windowToken, status: 'ready' });
      if (order.guestPhone) {
        const restaurant = await getOrCreateRestaurant();
        void import('@modules/notifications/notification.service').then(({ dispatchSafe }) =>
          dispatchSafe({
            eventKey: 'order.ready.window',
            to: order.guestPhone!,
            payload: {
              restaurantName: restaurant.brand.name,
              windowToken: order.windowToken,
              orderNumber: order.orderNumber,
            },
            relatedOrderId: order._id,
          }),
        );
      }
    }
  }
}

export async function updateItemStatus(
  orderId: string,
  itemId: string,
  next: OrderItemStatus,
  station: string | undefined,
  ctx: ActorCtx,
) {
  const order = await OrderModel.findById(orderId);
  if (!order) throw AppError.notFound('Order not found');
  const item = order.items.find((i) => String(i._id) === itemId);
  if (!item) throw AppError.notFound('Order item not found');
  if (station && item.station !== station) throw AppError.forbidden(`Item not at station "${station}"`);
  if (item.status === 'cancelled') throw AppError.badRequest('Item is cancelled');

  const order_ok: Record<OrderItemStatus, OrderItemStatus[]> = {
    pending: ['accepted', 'cancelled'],
    accepted: ['preparing', 'ready', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['served'],
    served: [],
    cancelled: [],
  };
  if (!order_ok[item.status].includes(next)) {
    throw AppError.badRequest(`Cannot transition item from "${item.status}" to "${next}"`);
  }
  item.status = next;
  const now = new Date();
  if (next === 'accepted') item.acceptedAt = now;
  if (next === 'preparing') item.preparingAt = now;
  if (next === 'ready') item.readyAt = now;
  if (next === 'served') item.servedAt = now;
  await order.save();
  await recomputeOrderStatus(orderId);

  emitToKdsAll('order:item_status_changed', {
    orderId: String(order._id),
    itemId,
    status: next,
    station: item.station,
  });
  emitToStaff('order:item_status_changed', {
    orderId: String(order._id),
    itemId,
    status: next,
  });
  await writeAuditLog({
    ...ctx,
    action: 'order.item.status',
    entity: 'Order',
    entityId: String(order._id),
    metadata: { itemId, status: next, station: item.station },
  });
  return order;
}

// === DTO helpers for sockets ===

export function toListDTO(o: OrderDocument) {
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    channel: o.channel,
    status: o.status,
    tableId: o.tableId ? String(o.tableId) : undefined,
    windowToken: o.windowToken,
    itemCount: o.items.filter((i) => i.status !== 'cancelled').length,
    grand: o.totals.grand,
    createdAt: o.createdAt,
  };
}

export function toKdsDTO(o: OrderDocument) {
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    channel: o.channel,
    tableId: o.tableId ? String(o.tableId) : undefined,
    windowToken: o.windowToken,
    items: o.items
      .filter((i) => i.status !== 'cancelled' && i.status !== 'served')
      .map((i) => ({
        id: String(i._id),
        name: i.name,
        variantName: i.variantName,
        qty: i.qty,
        notes: i.notes,
        station: i.station,
        status: i.status,
        modifiers: i.modifiers.map((m) => m.modifierName),
      })),
    createdAt: o.createdAt,
  };
}

export function toGuestDTO(o: OrderDocument) {
  return {
    id: String(o._id),
    orderNumber: o.orderNumber,
    status: o.status,
    windowToken: o.windowToken,
    estimatedPrepMinutes: o.estimatedPrepMinutes,
    totals: o.totals,
    items: o.items.map((i) => ({
      id: String(i._id),
      name: i.name,
      variantName: i.variantName,
      qty: i.qty,
      status: i.status,
      modifiers: i.modifiers.map((m) => m.modifierName),
    })),
  };
}

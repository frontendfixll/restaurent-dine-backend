import { OrderModel, OrderItem } from '@modules/orders/order.model';
import { AppError } from '@utils/AppError';

const ACTIVE_ITEM_STATUSES = ['pending', 'accepted', 'preparing'] as const;
const ACTIVE_ORDER_STATUSES = ['placed', 'accepted', 'preparing', 'ready'] as const;

export interface KdsItemDto {
  id: string;
  name: string;
  variantName?: string;
  qty: number;
  notes?: string;
  station?: string;
  status: string;
  modifiers: string[];
  acceptedAt?: Date;
  preparingAt?: Date;
  readyAt?: Date;
}

export interface KdsOrderDto {
  id: string;
  orderNumber: string;
  channel: string;
  tableId?: string;
  windowToken?: string;
  createdAt: Date;
  ageSeconds: number;
  items: KdsItemDto[];
}

function ageSecondsFrom(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / 1000);
}

function buildItemDto(it: OrderItem): KdsItemDto {
  return {
    id: String(it._id),
    name: it.name,
    variantName: it.variantName,
    qty: it.qty,
    notes: it.notes,
    station: it.station,
    status: it.status,
    modifiers: it.modifiers.map((m) => m.modifierName),
    acceptedAt: it.acceptedAt,
    preparingAt: it.preparingAt,
    readyAt: it.readyAt,
  };
}

export async function getQueue(station?: string): Promise<KdsOrderDto[]> {
  const filter: Record<string, unknown> = { status: { $in: ACTIVE_ORDER_STATUSES } };
  if (station) filter['items.station'] = station;
  const orders = await OrderModel.find(filter).sort({ createdAt: 1 }).lean();
  return orders
    .map((o) => {
      const items = o.items
        .filter((i) => ACTIVE_ITEM_STATUSES.includes(i.status as (typeof ACTIVE_ITEM_STATUSES)[number]))
        .filter((i) => !station || i.station === station)
        .map(buildItemDto);
      return {
        id: String(o._id),
        orderNumber: o.orderNumber,
        channel: o.channel,
        tableId: o.tableId ? String(o.tableId) : undefined,
        windowToken: o.windowToken,
        createdAt: o.createdAt,
        ageSeconds: ageSecondsFrom(o.createdAt),
        items,
      };
    })
    .filter((o) => o.items.length > 0);
}

export async function snapshot(): Promise<{ stations: Record<string, KdsOrderDto[]>; total: number }> {
  const orders = await OrderModel.find({ status: { $in: ACTIVE_ORDER_STATUSES } })
    .sort({ createdAt: 1 })
    .lean();
  const stations: Record<string, KdsOrderDto[]> = {};
  let total = 0;
  for (const o of orders) {
    for (const it of o.items) {
      if (!ACTIVE_ITEM_STATUSES.includes(it.status as (typeof ACTIVE_ITEM_STATUSES)[number])) continue;
      const station = it.station || 'default';
      if (!stations[station]) stations[station] = [];
      let dto = stations[station].find((d) => d.id === String(o._id));
      if (!dto) {
        dto = {
          id: String(o._id),
          orderNumber: o.orderNumber,
          channel: o.channel,
          tableId: o.tableId ? String(o.tableId) : undefined,
          windowToken: o.windowToken,
          createdAt: o.createdAt,
          ageSeconds: ageSecondsFrom(o.createdAt),
          items: [],
        };
        stations[station].push(dto);
      }
      dto.items.push(buildItemDto(it));
      total++;
    }
  }
  return { stations, total };
}

export async function recall(orderId: string) {
  const order = await OrderModel.findById(orderId).lean();
  if (!order) throw AppError.notFound('Order not found');
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    channel: order.channel,
    status: order.status,
    tableId: order.tableId ? String(order.tableId) : undefined,
    windowToken: order.windowToken,
    items: order.items.map(buildItemDto),
    timeline: order.timeline,
  };
}

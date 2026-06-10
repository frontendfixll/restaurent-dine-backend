import { Types, FilterQuery } from 'mongoose';
import { CustomerModel, CustomerDocument } from './customer.model';
import { OrderModel } from '@modules/orders/order.model';
import { InvoiceModel } from '@modules/invoices/invoice.model';
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

/**
 * Find or create a Customer by phone. Called automatically when an order is
 * placed with a guestPhone. Never blocks order placement on failure.
 */
export async function ensureCustomerByPhone(
  phone: string,
  name?: string,
  email?: string,
): Promise<CustomerDocument | null> {
  try {
    const found = await CustomerModel.findOne({ phone });
    if (found) {
      let dirty = false;
      if (name && !found.name) {
        found.name = name;
        dirty = true;
      }
      if (email && !found.email) {
        found.email = email;
        dirty = true;
      }
      if (dirty) await found.save();
      return found;
    }
    return await CustomerModel.create({ phone, name, email });
  } catch {
    return null;
  }
}

/**
 * Update a customer's lifetime metrics after an order settles. Idempotency is
 * derived from order timeline check — call only once per settled order.
 */
export async function creditCustomerForOrder(orderId: Types.ObjectId | string) {
  const order = await OrderModel.findById(orderId).lean();
  if (!order || !order.customerId) return;
  if (order.status !== 'settled') return;

  const customer = await CustomerModel.findById(order.customerId);
  if (!customer) return;

  customer.visitCount += 1;
  customer.lifetimeValue = round2(customer.lifetimeValue + order.totals.grand);
  customer.averageBill = round2(customer.lifetimeValue / customer.visitCount);
  if (!customer.firstVisitAt) customer.firstVisitAt = order.createdAt;
  customer.lastVisitAt = new Date();

  // Update favorites
  const byId = new Map(customer.favoriteItems.map((f) => [String(f.itemId), f]));
  for (const oi of order.items) {
    if (oi.status === 'cancelled' || !oi.itemId) continue;
    const key = String(oi.itemId);
    const existing = byId.get(key);
    if (existing) {
      existing.count += oi.qty;
      existing.lastAt = new Date();
    } else {
      byId.set(key, {
        itemId: oi.itemId,
        name: oi.name,
        count: oi.qty,
        lastAt: new Date(),
      });
    }
  }
  const merged = Array.from(byId.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  customer.set('favoriteItems', merged);

  await customer.save();
}

export interface ListCustomersOpts {
  q?: string;
  tag?: string;
  hasPhone?: boolean;
  page?: number;
  limit?: number;
}

export async function listCustomers(opts: ListCustomersOpts) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const filter: FilterQuery<CustomerDocument> = {};
  if (opts.tag) filter.tags = opts.tag.toLowerCase();
  if (opts.hasPhone) filter.phone = { $exists: true };
  if (opts.q) {
    const rx = new RegExp(opts.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { phone: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    CustomerModel.find(filter).sort({ lastVisitAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    CustomerModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getCustomer(id: string) {
  const c = await CustomerModel.findById(id).lean();
  if (!c) throw AppError.notFound('Customer not found');
  return c;
}

export async function lookupByPhone(phone: string) {
  return CustomerModel.findOne({ phone }).lean();
}

export interface CreateCustomerInput {
  phone?: string;
  name?: string;
  email?: string;
  tags?: string[];
  allergens?: string[];
  notes?: string;
  marketingOptIn?: boolean;
}

export async function createCustomer(input: CreateCustomerInput, ctx: ActorCtx) {
  if (input.phone) {
    const dup = await CustomerModel.findOne({ phone: input.phone });
    if (dup) throw AppError.conflict('Customer with this phone already exists');
  }
  const c = await CustomerModel.create({
    phone: input.phone,
    name: input.name,
    email: input.email,
    tags: (input.tags ?? []).map((t) => t.toLowerCase()),
    allergens: input.allergens ?? [],
    notes: input.notes,
    marketingOptIn: input.marketingOptIn ?? false,
  });
  await writeAuditLog({
    ...ctx,
    action: 'customer.create',
    entity: 'Customer',
    entityId: String(c._id),
    after: c.toObject(),
  });
  return c.toObject();
}

export interface UpdateCustomerInput {
  name?: string;
  email?: string;
  phone?: string;
  allergens?: string[];
  notes?: string;
  marketingOptIn?: boolean;
}

export async function updateCustomer(id: string, input: UpdateCustomerInput, ctx: ActorCtx) {
  const c = await CustomerModel.findById(id);
  if (!c) throw AppError.notFound('Customer not found');
  if (input.phone && input.phone !== c.phone) {
    const dup = await CustomerModel.findOne({ phone: input.phone, _id: { $ne: c._id } });
    if (dup) throw AppError.conflict('Phone already taken by another customer');
    c.phone = input.phone;
  }
  const before = c.toObject();
  if (input.name !== undefined) c.name = input.name;
  if (input.email !== undefined) c.email = input.email;
  if (input.allergens !== undefined) c.allergens = input.allergens;
  if (input.notes !== undefined) c.notes = input.notes;
  if (typeof input.marketingOptIn === 'boolean') c.marketingOptIn = input.marketingOptIn;
  await c.save();
  await writeAuditLog({
    ...ctx,
    action: 'customer.update',
    entity: 'Customer',
    entityId: String(c._id),
    before,
    after: c.toObject(),
  });
  return c.toObject();
}

export async function addTag(id: string, tag: string, ctx: ActorCtx) {
  const t = tag.toLowerCase().trim();
  if (!t) throw AppError.badRequest('Tag is empty');
  const c = await CustomerModel.findById(id);
  if (!c) throw AppError.notFound('Customer not found');
  if (!c.tags.includes(t)) {
    c.tags.push(t);
    await c.save();
    await writeAuditLog({
      ...ctx,
      action: 'customer.tag.add',
      entity: 'Customer',
      entityId: String(c._id),
      metadata: { tag: t },
    });
  }
  return c.toObject();
}

export async function removeTag(id: string, tag: string, ctx: ActorCtx) {
  const t = tag.toLowerCase().trim();
  const c = await CustomerModel.findById(id);
  if (!c) throw AppError.notFound('Customer not found');
  if (c.tags.includes(t)) {
    c.tags = c.tags.filter((x) => x !== t);
    await c.save();
    await writeAuditLog({
      ...ctx,
      action: 'customer.tag.remove',
      entity: 'Customer',
      entityId: String(c._id),
      metadata: { tag: t },
    });
  }
  return c.toObject();
}

export async function getHistory(id: string, opts: { page?: number; limit?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const customer = await CustomerModel.findById(id).lean();
  if (!customer) throw AppError.notFound('Customer not found');

  const orders = await OrderModel.find({ customerId: customer._id })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  const total = await OrderModel.countDocuments({ customerId: customer._id });

  const orderIds = orders.map((o) => o._id);
  const invByOrder = orderIds.length
    ? await InvoiceModel.find({ orderId: { $in: orderIds }, status: 'final' }).lean()
    : [];
  const invMap = new Map(invByOrder.map((i) => [String(i.orderId), i]));

  return {
    customer,
    orders: orders.map((o) => {
      const inv = invMap.get(String(o._id));
      return {
        id: String(o._id),
        orderNumber: o.orderNumber,
        channel: o.channel,
        status: o.status,
        grand: o.totals.grand,
        itemCount: o.items.filter((i) => i.status !== 'cancelled').length,
        createdAt: o.createdAt,
        invoiceNumber: inv?.invoiceNumber,
        paymentStatus: inv?.paymentStatus,
      };
    }),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

import { Types, FilterQuery } from 'mongoose';
import { InventoryItemModel, InventoryItemDocument, InventoryUnit } from './inventoryItem.model';
import { StockMovementModel, StockMovementType } from './stockMovement.model';
import { RecipeModel } from './recipe.model';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';
import { getIo } from '@sockets/index';
import { logger } from '@utils/logger';
import { convert } from './units';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  actorName?: string;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function emitLowStock(payload: unknown) {
  try {
    getIo().of('/staff').emit('inventory:low_stock', payload);
  } catch (err) {
    logger.debug({ err }, 'Skip low-stock broadcast');
  }
}

export interface CreateInventoryInput {
  name: string;
  sku?: string;
  unit: InventoryUnit;
  currentStock?: number;
  lowStockThreshold?: number;
  costPerUnit?: number;
  supplierName?: string;
  notes?: string;
}

export async function listInventory(opts: {
  q?: string;
  lowStock?: boolean;
  isActive?: boolean;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const filter: FilterQuery<InventoryItemDocument> = {};
  if (typeof opts.isActive === 'boolean') filter.isActive = opts.isActive;
  if (opts.q) {
    const rx = new RegExp(opts.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { supplierName: rx }];
  }
  if (opts.lowStock) filter.$expr = { $lte: ['$currentStock', '$lowStockThreshold'] };
  const [items, total] = await Promise.all([
    InventoryItemModel.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    InventoryItemModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getInventoryItem(id: string) {
  const it = await InventoryItemModel.findById(id).lean();
  if (!it) throw AppError.notFound('Inventory item not found');
  return it;
}

export async function listLowStock() {
  return InventoryItemModel.find({
    isActive: true,
    $expr: { $lte: ['$currentStock', '$lowStockThreshold'] },
  })
    .sort({ name: 1 })
    .lean();
}

export async function createInventoryItem(input: CreateInventoryInput, ctx: ActorCtx) {
  const existing = await InventoryItemModel.findOne({ name: input.name });
  if (existing) throw AppError.conflict(`Inventory item "${input.name}" exists`);
  const it = await InventoryItemModel.create({
    name: input.name,
    sku: input.sku,
    unit: input.unit,
    currentStock: input.currentStock ?? 0,
    lowStockThreshold: input.lowStockThreshold ?? 0,
    costPerUnit: input.costPerUnit,
    supplierName: input.supplierName,
    notes: input.notes,
  });
  await writeAuditLog({
    ...ctx,
    action: 'inventory.create',
    entity: 'InventoryItem',
    entityId: String(it._id),
    after: it.toObject(),
  });
  return it.toObject();
}

export interface UpdateInventoryInput {
  name?: string;
  sku?: string;
  unit?: InventoryUnit;
  lowStockThreshold?: number;
  costPerUnit?: number;
  supplierName?: string;
  notes?: string;
  isActive?: boolean;
}

export async function updateInventoryItem(
  id: string,
  input: UpdateInventoryInput,
  ctx: ActorCtx,
) {
  const it = await InventoryItemModel.findById(id);
  if (!it) throw AppError.notFound('Inventory item not found');
  const before = it.toObject();
  if (input.name !== undefined) it.name = input.name;
  if (input.sku !== undefined) it.sku = input.sku;
  if (input.unit !== undefined) it.unit = input.unit;
  if (input.lowStockThreshold !== undefined) it.lowStockThreshold = input.lowStockThreshold;
  if (input.costPerUnit !== undefined) it.costPerUnit = input.costPerUnit;
  if (input.supplierName !== undefined) it.supplierName = input.supplierName;
  if (input.notes !== undefined) it.notes = input.notes;
  if (typeof input.isActive === 'boolean') it.isActive = input.isActive;
  await it.save();
  await writeAuditLog({
    ...ctx,
    action: 'inventory.update',
    entity: 'InventoryItem',
    entityId: String(it._id),
    before,
    after: it.toObject(),
  });
  return it.toObject();
}

export async function deleteInventoryItem(id: string, ctx: ActorCtx) {
  const it = await InventoryItemModel.findById(id);
  if (!it) throw AppError.notFound('Inventory item not found');
  const usage = await RecipeModel.countDocuments({ 'ingredients.inventoryItemId': it._id });
  if (usage > 0) throw AppError.conflict(`Inventory item is used by ${usage} recipe(s)`);
  await InventoryItemModel.deleteOne({ _id: it._id });
  await writeAuditLog({
    ...ctx,
    action: 'inventory.delete',
    entity: 'InventoryItem',
    entityId: String(it._id),
    before: it.toObject(),
  });
}

export interface MovementInput {
  qty: number;
  unit?: InventoryUnit;
  reason?: string;
  costPerUnit?: number;
  supplierName?: string;
}

export async function stockIn(id: string, input: MovementInput, ctx: ActorCtx) {
  return applyMovement(id, 'in', Math.abs(input.qty), input, ctx);
}

export async function stockOut(id: string, input: MovementInput, ctx: ActorCtx) {
  return applyMovement(id, 'out', -Math.abs(input.qty), input, ctx);
}

export async function recordWaste(id: string, input: MovementInput, ctx: ActorCtx) {
  return applyMovement(id, 'waste', -Math.abs(input.qty), input, ctx);
}

export async function adjustStock(
  id: string,
  delta: number,
  reason: string,
  ctx: ActorCtx,
) {
  return applyMovement(id, 'adjustment', delta, { qty: Math.abs(delta), reason }, ctx);
}

async function applyMovement(
  id: string,
  type: StockMovementType,
  signedQty: number,
  input: MovementInput,
  ctx: ActorCtx,
) {
  const it = await InventoryItemModel.findById(id);
  if (!it) throw AppError.notFound('Inventory item not found');

  let qtyInItemUnit = signedQty;
  if (input.unit && input.unit !== it.unit) {
    const converted = convert(Math.abs(signedQty), input.unit, it.unit);
    qtyInItemUnit = signedQty < 0 ? -converted : converted;
  }
  const resulting = round3(it.currentStock + qtyInItemUnit);

  it.currentStock = resulting;
  if (type === 'in') {
    it.lastStockInAt = new Date();
    if (input.supplierName) it.supplierName = input.supplierName;
    if (input.costPerUnit !== undefined) it.costPerUnit = input.costPerUnit;
  }
  await it.save();

  const movement = await StockMovementModel.create({
    inventoryItemId: it._id,
    type,
    qty: round3(qtyInItemUnit),
    unit: it.unit,
    costPerUnit: input.costPerUnit,
    reason: input.reason,
    supplierName: input.supplierName,
    actorId: ctx.actorId ? new Types.ObjectId(ctx.actorId) : undefined,
    resultingStock: resulting,
  });

  await writeAuditLog({
    ...ctx,
    action: `inventory.${type}`,
    entity: 'InventoryItem',
    entityId: String(it._id),
    metadata: { qty: qtyInItemUnit, unit: it.unit, reason: input.reason },
  });

  if (it.currentStock <= it.lowStockThreshold) {
    emitLowStock({
      id: String(it._id),
      name: it.name,
      currentStock: it.currentStock,
      threshold: it.lowStockThreshold,
      unit: it.unit,
    });
    void import('@modules/restaurant/restaurant.service').then(async ({ getOrCreateRestaurant }) => {
      const r = await getOrCreateRestaurant();
      const { dispatchSafe } = await import('@modules/notifications/notification.service');
      const payload = {
        itemName: it.name,
        currentStock: it.currentStock,
        threshold: it.lowStockThreshold,
        unit: it.unit,
      };
      if (r.brand.contactPhone) {
        dispatchSafe({
          eventKey: 'inventory.low_stock.owner',
          channel: 'sms',
          to: r.brand.contactPhone,
          payload,
        });
      }
      if (r.brand.contactEmail) {
        dispatchSafe({
          eventKey: 'inventory.low_stock.owner',
          channel: 'email',
          to: r.brand.contactEmail,
          payload,
        });
      }
    }).catch(() => undefined);
  }

  return { item: it.toObject(), movement: movement.toObject() };
}

export async function listMovements(opts: {
  inventoryItemId?: string;
  type?: StockMovementType;
  orderId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const filter: Record<string, unknown> = {};
  if (opts.inventoryItemId) filter.inventoryItemId = new Types.ObjectId(opts.inventoryItemId);
  if (opts.type) filter.type = opts.type;
  if (opts.orderId) filter.orderId = new Types.ObjectId(opts.orderId);
  if (opts.from || opts.to) {
    filter.createdAt = {
      ...(opts.from ? { $gte: opts.from } : {}),
      ...(opts.to ? { $lte: opts.to } : {}),
    };
  }
  const [items, total] = await Promise.all([
    StockMovementModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    StockMovementModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function buildSnapshot() {
  const items = await InventoryItemModel.find({ isActive: true }).sort({ name: 1 }).lean();
  const lowStock = items.filter((i) => i.currentStock <= i.lowStockThreshold);
  const totalValue = items.reduce(
    (s, i) => s + (i.costPerUnit ? i.currentStock * i.costPerUnit : 0),
    0,
  );
  return {
    at: new Date().toISOString(),
    itemCount: items.length,
    lowStockCount: lowStock.length,
    estimatedValue: Math.round(totalValue * 100) / 100,
    items: items.map((i) => ({
      id: String(i._id),
      name: i.name,
      unit: i.unit,
      currentStock: i.currentStock,
      lowStockThreshold: i.lowStockThreshold,
      isLow: i.currentStock <= i.lowStockThreshold,
      costPerUnit: i.costPerUnit,
      value: i.costPerUnit ? Math.round(i.currentStock * i.costPerUnit * 100) / 100 : undefined,
    })),
  };
}

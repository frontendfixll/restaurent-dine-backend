import { Types } from 'mongoose';
import { TableModel, TableDocument, TableStatus } from './table.model';
import { TableSessionModel } from './tableSession.model';
import { QrCodeModel } from '@modules/qr/qrCode.model';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';
import { getIo } from '@sockets/index';
import { logger } from '@utils/logger';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

const VALID_TRANSITIONS: Record<TableStatus, TableStatus[]> = {
  vacant: ['seated', 'cleaning'],
  seated: ['ordered', 'awaiting_bill', 'cleaning', 'vacant'],
  ordered: ['awaiting_bill', 'cleaning'],
  awaiting_bill: ['cleaning', 'vacant'],
  cleaning: ['vacant'],
};

function emitTableEvent(event: string, payload: unknown) {
  try {
    getIo().of('/staff').emit(event, payload);
  } catch (err) {
    logger.debug({ err }, 'Skip table event broadcast');
  }
}

export async function listTables(opts: { status?: TableStatus; zone?: string; includeInactive?: boolean } = {}) {
  const filter: Record<string, unknown> = { mergedIntoTableId: { $exists: false } };
  if (opts.status) filter.status = opts.status;
  if (opts.zone) filter.zone = opts.zone;
  if (!opts.includeInactive) filter.isActive = true;
  return TableModel.find(filter).sort({ sortOrder: 1, number: 1 }).lean();
}

export async function getTable(id: string) {
  const t = await TableModel.findById(id).lean();
  if (!t) throw AppError.notFound('Table not found');
  return t;
}

export interface CreateTableInput {
  number: string;
  zone?: string;
  capacity?: number;
  sortOrder?: number;
}

export async function createTable(input: CreateTableInput, ctx: ActorCtx) {
  const existing = await TableModel.findOne({ number: input.number });
  if (existing) throw AppError.conflict(`Table "${input.number}" already exists`);
  const t = await TableModel.create({
    number: input.number,
    zone: input.zone,
    capacity: input.capacity ?? 4,
    sortOrder: input.sortOrder ?? 0,
  });
  await writeAuditLog({
    ...ctx,
    action: 'table.create',
    entity: 'Table',
    entityId: String(t._id),
    after: t.toObject(),
  });
  emitTableEvent('table:updated', { id: String(t._id), action: 'create' });
  return t.toObject();
}

export interface BulkCreateInput {
  tables: CreateTableInput[];
}

export async function bulkCreateTables(input: BulkCreateInput, ctx: ActorCtx) {
  const numbers = input.tables.map((t) => t.number);
  const existing = await TableModel.find({ number: { $in: numbers } }).select('number').lean();
  if (existing.length) {
    throw AppError.conflict(`Tables already exist: ${existing.map((e) => e.number).join(', ')}`);
  }
  const docs = await TableModel.insertMany(
    input.tables.map((t, i) => ({
      number: t.number,
      zone: t.zone,
      capacity: t.capacity ?? 4,
      sortOrder: t.sortOrder ?? i,
    })),
  );
  await writeAuditLog({
    ...ctx,
    action: 'table.bulk_create',
    entity: 'Table',
    metadata: { count: docs.length, numbers },
  });
  emitTableEvent('table:updated', { action: 'bulk_create', count: docs.length });
  return docs.map((d) => d.toObject());
}

export interface UpdateTableInput {
  number?: string;
  zone?: string;
  capacity?: number;
  sortOrder?: number;
  isActive?: boolean;
}

export async function updateTable(id: string, input: UpdateTableInput, ctx: ActorCtx) {
  const t = await TableModel.findById(id);
  if (!t) throw AppError.notFound('Table not found');
  const before = t.toObject();
  if (input.number !== undefined && input.number !== t.number) {
    const dup = await TableModel.findOne({ number: input.number, _id: { $ne: t._id } });
    if (dup) throw AppError.conflict(`Table "${input.number}" already exists`);
    t.number = input.number;
  }
  if (input.zone !== undefined) t.zone = input.zone;
  if (input.capacity !== undefined) t.capacity = input.capacity;
  if (input.sortOrder !== undefined) t.sortOrder = input.sortOrder;
  if (typeof input.isActive === 'boolean') t.isActive = input.isActive;
  await t.save();
  await writeAuditLog({
    ...ctx,
    action: 'table.update',
    entity: 'Table',
    entityId: String(t._id),
    before,
    after: t.toObject(),
  });
  emitTableEvent('table:updated', { id: String(t._id), action: 'update' });
  return t.toObject();
}

export async function deleteTable(id: string, ctx: ActorCtx) {
  const t = await TableModel.findById(id);
  if (!t) throw AppError.notFound('Table not found');
  const open = await TableSessionModel.exists({ tableId: t._id, status: 'open' });
  if (open) throw AppError.conflict('Table has an open session — close it first');
  const qrCount = await QrCodeModel.countDocuments({ tableId: t._id });
  if (qrCount > 0) throw AppError.conflict(`Table has ${qrCount} QR code(s) — remove them first`);
  await TableModel.deleteOne({ _id: t._id });
  await writeAuditLog({
    ...ctx,
    action: 'table.delete',
    entity: 'Table',
    entityId: String(t._id),
    before: t.toObject(),
  });
  emitTableEvent('table:updated', { id: String(t._id), action: 'delete' });
}

export async function transitionStatus(id: string, next: TableStatus, ctx: ActorCtx) {
  const t = await TableModel.findById(id);
  if (!t) throw AppError.notFound('Table not found');
  if (t.status === next) return t.toObject();
  const allowed = VALID_TRANSITIONS[t.status];
  if (!allowed.includes(next)) {
    throw AppError.badRequest(`Cannot transition table from "${t.status}" to "${next}"`);
  }
  const before = t.status;
  t.status = next;
  // Clear current session when going to vacant
  if (next === 'vacant') t.currentSessionId = undefined;
  await t.save();
  await writeAuditLog({
    ...ctx,
    action: 'table.status_change',
    entity: 'Table',
    entityId: String(t._id),
    metadata: { from: before, to: next },
  });
  emitTableEvent('table:status_changed', { id: String(t._id), from: before, to: next });
  return t.toObject();
}

export async function mergeTables(primaryId: string, secondaryIds: string[], ctx: ActorCtx) {
  if (secondaryIds.includes(primaryId)) throw AppError.badRequest('Primary cannot be in secondaries');
  const primary = await TableModel.findById(primaryId);
  if (!primary) throw AppError.notFound('Primary table not found');
  const secondaries = await TableModel.find({ _id: { $in: secondaryIds } });
  if (secondaries.length !== secondaryIds.length) throw AppError.badRequest('One or more secondary tables not found');

  for (const sec of secondaries) {
    if (sec.mergedIntoTableId) throw AppError.badRequest(`Table "${sec.number}" already merged`);
    sec.mergedIntoTableId = primary._id;
    await sec.save();
  }
  primary.mergedWithTableIds.push(...secondaryIds.map((id) => new Types.ObjectId(id)));
  primary.capacity = primary.capacity + secondaries.reduce((sum, s) => sum + s.capacity, 0);
  await primary.save();

  await writeAuditLog({
    ...ctx,
    action: 'table.merge',
    entity: 'Table',
    entityId: String(primary._id),
    metadata: { primaryId, secondaryIds },
  });
  emitTableEvent('table:merged', { primaryId, secondaryIds });
  return primary.toObject();
}

export async function splitTables(primaryId: string, ctx: ActorCtx) {
  const primary = await TableModel.findById(primaryId);
  if (!primary) throw AppError.notFound('Table not found');
  if (!primary.mergedWithTableIds.length) throw AppError.badRequest('Table is not merged');
  const secondaries = await TableModel.find({ _id: { $in: primary.mergedWithTableIds } });
  const originalSecondariesCapacity = secondaries.reduce((sum, s) => sum + s.capacity, 0);
  for (const sec of secondaries) {
    sec.mergedIntoTableId = undefined;
    await sec.save();
  }
  primary.mergedWithTableIds = [];
  primary.capacity = Math.max(1, primary.capacity - originalSecondariesCapacity);
  await primary.save();
  await writeAuditLog({
    ...ctx,
    action: 'table.split',
    entity: 'Table',
    entityId: String(primary._id),
  });
  emitTableEvent('table:split', { primaryId });
  return primary.toObject();
}

export async function moveSession(fromTableId: string, toTableId: string, ctx: ActorCtx) {
  if (fromTableId === toTableId) throw AppError.badRequest('Source and destination are the same');
  const from = await TableModel.findById(fromTableId);
  const to = await TableModel.findById(toTableId);
  if (!from || !to) throw AppError.notFound('Table not found');
  if (!from.currentSessionId) throw AppError.badRequest('Source table has no active session');
  if (to.currentSessionId) throw AppError.conflict('Destination table is already occupied');

  const sessionId = from.currentSessionId;
  to.currentSessionId = sessionId;
  to.status = from.status === 'vacant' ? 'seated' : from.status;
  from.currentSessionId = undefined;
  from.status = 'cleaning';
  await Promise.all([from.save(), to.save()]);
  await TableSessionModel.updateOne({ _id: sessionId }, { $set: { tableId: to._id } });
  await writeAuditLog({
    ...ctx,
    action: 'table.move',
    entity: 'Table',
    metadata: { fromTableId, toTableId, sessionId: String(sessionId) },
  });
  emitTableEvent('table:moved', { fromTableId, toTableId });
  return { from: from.toObject(), to: to.toObject() };
}

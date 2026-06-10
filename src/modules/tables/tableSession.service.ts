import { Types } from 'mongoose';
import { TableSessionModel } from './tableSession.model';
import { TableModel } from './table.model';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';
import { getIo } from '@sockets/index';
import { logger } from '@utils/logger';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

function emit(event: string, payload: unknown) {
  try {
    getIo().of('/staff').emit(event, payload);
  } catch (err) {
    logger.debug({ err }, 'Skip table-session event broadcast');
  }
}

export interface OpenSessionInput {
  tableId: string;
  guestCount?: number;
  waiterId?: string;
  customerId?: string;
}

export async function openSession(input: OpenSessionInput, ctx: ActorCtx) {
  const table = await TableModel.findById(input.tableId);
  if (!table) throw AppError.notFound('Table not found');
  if (table.mergedIntoTableId) throw AppError.badRequest('Table is merged — use the primary table');
  if (table.currentSessionId) throw AppError.conflict('Table already has an open session');
  if (!['vacant', 'cleaning'].includes(table.status)) {
    throw AppError.conflict(`Table is in status "${table.status}"`);
  }

  const session = await TableSessionModel.create({
    tableId: table._id,
    guestCount: input.guestCount ?? 1,
    waiterId: input.waiterId ? new Types.ObjectId(input.waiterId) : undefined,
    customerId: input.customerId ? new Types.ObjectId(input.customerId) : undefined,
  });
  table.currentSessionId = session._id;
  table.status = 'seated';
  await table.save();

  await writeAuditLog({
    ...ctx,
    action: 'table_session.open',
    entity: 'TableSession',
    entityId: String(session._id),
    metadata: { tableId: String(table._id), guestCount: session.guestCount },
  });
  emit('table:status_changed', { id: String(table._id), to: 'seated' });
  return session.toObject();
}

export async function getSession(id: string) {
  const s = await TableSessionModel.findById(id).lean();
  if (!s) throw AppError.notFound('Session not found');
  return s;
}

export async function closeSession(id: string, ctx: ActorCtx) {
  const session = await TableSessionModel.findById(id);
  if (!session) throw AppError.notFound('Session not found');
  if (session.status === 'closed') throw AppError.badRequest('Session already closed');

  session.status = 'closed';
  session.closedAt = new Date();
  await session.save();

  const table = await TableModel.findById(session.tableId);
  if (table) {
    table.currentSessionId = undefined;
    table.status = 'cleaning';
    await table.save();
    emit('table:status_changed', { id: String(table._id), to: 'cleaning' });
  }

  await writeAuditLog({
    ...ctx,
    action: 'table_session.close',
    entity: 'TableSession',
    entityId: String(session._id),
    metadata: { tableId: String(session.tableId), runningTotal: session.runningTotal },
  });
  return session.toObject();
}

export async function listOpenSessions() {
  return TableSessionModel.find({ status: 'open' }).sort({ openedAt: -1 }).lean();
}

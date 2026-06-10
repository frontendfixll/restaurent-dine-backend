import { Types } from 'mongoose';
import { AuditLogModel } from './auditLog.model';
import { logger } from '@utils/logger';

export interface AuditEntry {
  actorId?: Types.ObjectId | string;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  ip?: string;
  requestId?: string;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await AuditLogModel.create({
      ...entry,
      actorId: entry.actorId ? new Types.ObjectId(String(entry.actorId)) : undefined,
      at: new Date(),
    });
  } catch (err) {
    logger.error({ err, entry }, 'Failed to write audit log');
  }
}

export interface ListAuditOptions {
  actorId?: string;
  entity?: string;
  entityId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export async function listAuditLogs(opts: ListAuditOptions) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const filter: Record<string, unknown> = {};
  if (opts.actorId) filter.actorId = new Types.ObjectId(opts.actorId);
  if (opts.entity) filter.entity = opts.entity;
  if (opts.entityId) filter.entityId = opts.entityId;
  if (opts.action) filter.action = opts.action;
  if (opts.from || opts.to) {
    filter.at = {
      ...(opts.from ? { $gte: opts.from } : {}),
      ...(opts.to ? { $lte: opts.to } : {}),
    };
  }
  const [items, total] = await Promise.all([
    AuditLogModel.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLogModel.countDocuments(filter),
  ]);
  return {
    items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

import { Types } from 'mongoose';
import { NotificationLogModel } from './notificationLog.model';

export interface ListLogsOpts {
  eventKey?: string;
  channel?: 'sms' | 'whatsapp' | 'email' | 'push';
  status?: 'queued' | 'sent' | 'failed' | 'skipped' | 'mocked';
  to?: string;
  relatedOrderId?: string;
  from?: Date;
  to_?: Date;
  page?: number;
  limit?: number;
}

export async function listLogs(opts: ListLogsOpts) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const filter: Record<string, unknown> = {};
  if (opts.eventKey) filter.eventKey = opts.eventKey;
  if (opts.channel) filter.channel = opts.channel;
  if (opts.status) filter.status = opts.status;
  if (opts.to) filter.to = opts.to;
  if (opts.relatedOrderId) filter.relatedOrderId = new Types.ObjectId(opts.relatedOrderId);
  if (opts.from || opts.to_) {
    filter.createdAt = {
      ...(opts.from ? { $gte: opts.from } : {}),
      ...(opts.to_ ? { $lte: opts.to_ } : {}),
    };
  }
  const [items, total] = await Promise.all([
    NotificationLogModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    NotificationLogModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

import { Types, FilterQuery } from 'mongoose';
import {
  FeedbackModel,
  FeedbackDocument,
  FEEDBACK_TAG_CHIPS,
  FeedbackTagChip,
  FeedbackChannel,
} from './feedback.model';
import { OrderModel } from '@modules/orders/order.model';
import { CustomerModel } from '@modules/customers/customer.model';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';
import { sendSms, sendWhatsapp } from '@providers/sms.provider';
import { sendEmail } from '@providers/email.provider';
import { getOrCreateRestaurant } from '@modules/restaurant/restaurant.service';
import { dispatchSafe } from '@modules/notifications/notification.service';
import { getIo } from '@sockets/index';
import { logger } from '@utils/logger';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  actorName?: string;
}

function sentimentFor(rating: number): 'positive' | 'neutral' | 'negative' {
  if (rating >= 4) return 'positive';
  if (rating === 3) return 'neutral';
  return 'negative';
}

function emitFeedback(event: string, payload: unknown) {
  try {
    getIo().of('/staff').emit(event, payload);
  } catch (err) {
    logger.debug({ err }, 'Skip feedback broadcast');
  }
}

export interface SubmitFeedbackInput {
  rating: number;
  text?: string;
  tagChips?: string[];
}

export async function submitFeedback(orderId: string, input: SubmitFeedbackInput) {
  const order = await OrderModel.findById(orderId).lean();
  if (!order) throw AppError.notFound('Order not found');
  if (!['served', 'settled'].includes(order.status)) {
    throw AppError.conflict('Feedback can be left only after the order is served');
  }
  const existing = await FeedbackModel.findOne({ orderId: order._id });
  if (existing) throw AppError.conflict('Feedback already submitted for this order');

  const chips = (input.tagChips ?? [])
    .map((c) => c.toLowerCase())
    .filter((c): c is FeedbackTagChip => (FEEDBACK_TAG_CHIPS as readonly string[]).includes(c));

  const sentiment = sentimentFor(input.rating);

  let customerId: Types.ObjectId | undefined = order.customerId ?? undefined;
  let customerPhone = order.guestPhone;
  let customerName = order.guestName;
  if (!customerId && order.guestPhone) {
    const c = await CustomerModel.findOne({ phone: order.guestPhone }).select('_id name').lean();
    if (c) {
      customerId = c._id;
      if (!customerName && c.name) customerName = c.name;
    }
  }

  const feedback = await FeedbackModel.create({
    orderId: order._id,
    orderNumber: order.orderNumber,
    customerId,
    customerPhone,
    customerName,
    rating: input.rating,
    text: input.text,
    tagChips: chips,
    sentiment,
    channel: order.channel,
  });

  emitFeedback('feedback:new', {
    id: String(feedback._id),
    rating: feedback.rating,
    sentiment: feedback.sentiment,
    text: feedback.text,
    orderNumber: feedback.orderNumber,
  });
  if (sentiment === 'negative') {
    emitFeedback('feedback:negative_alert', {
      id: String(feedback._id),
      rating: feedback.rating,
      text: feedback.text,
      orderNumber: feedback.orderNumber,
    });
  }

  await writeAuditLog({
    action: 'feedback.submit',
    entity: 'Feedback',
    entityId: String(feedback._id),
    metadata: { orderId: String(order._id), rating: input.rating, sentiment },
  });

  return feedback;
}

export interface ListFeedbackOpts {
  rating?: number;
  minRating?: number;
  maxRating?: number;
  sentiment?: 'positive' | 'neutral' | 'negative';
  hasReply?: boolean;
  acknowledged?: boolean;
  channel?: 'dine_in' | 'window' | 'assisted';
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export async function listFeedback(opts: ListFeedbackOpts) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const filter: FilterQuery<FeedbackDocument> = {};
  if (opts.rating) filter.rating = opts.rating;
  if (opts.minRating || opts.maxRating) {
    filter.rating = {
      ...(opts.minRating ? { $gte: opts.minRating } : {}),
      ...(opts.maxRating ? { $lte: opts.maxRating } : {}),
    };
  }
  if (opts.sentiment) filter.sentiment = opts.sentiment;
  if (opts.channel) filter.channel = opts.channel;
  if (typeof opts.acknowledged === 'boolean') filter.acknowledged = opts.acknowledged;
  if (typeof opts.hasReply === 'boolean') filter.reply = opts.hasReply ? { $exists: true } : { $exists: false };
  if (opts.from || opts.to) {
    filter.createdAt = {
      ...(opts.from ? { $gte: opts.from } : {}),
      ...(opts.to ? { $lte: opts.to } : {}),
    };
  }
  const [items, total] = await Promise.all([
    FeedbackModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    FeedbackModel.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
}

export async function getFeedback(id: string) {
  const f = await FeedbackModel.findById(id).lean();
  if (!f) throw AppError.notFound('Feedback not found');
  return f;
}

export async function acknowledge(id: string, ctx: ActorCtx) {
  const f = await FeedbackModel.findById(id);
  if (!f) throw AppError.notFound('Feedback not found');
  f.acknowledged = true;
  await f.save();
  await writeAuditLog({
    ...ctx,
    action: 'feedback.acknowledge',
    entity: 'Feedback',
    entityId: String(f._id),
  });
  return f.toObject();
}

export interface ReplyInput {
  text: string;
  via: FeedbackChannel;
}

export async function replyToFeedback(id: string, input: ReplyInput, ctx: ActorCtx) {
  const f = await FeedbackModel.findById(id);
  if (!f) throw AppError.notFound('Feedback not found');
  if (!f.customerPhone && input.via !== 'email') {
    throw AppError.badRequest('No customer phone — reply via email or none');
  }

  let mocked = false;
  if (input.via === 'sms' && f.customerPhone) {
    const r = await sendSms({ to: f.customerPhone, body: input.text });
    mocked = r.mocked;
  } else if (input.via === 'whatsapp' && f.customerPhone) {
    const r = await sendWhatsapp({ to: f.customerPhone, body: input.text });
    mocked = r.mocked;
  } else if (input.via === 'email') {
    let email: string | undefined;
    if (f.customerId) {
      const { CustomerModel } = await import('@modules/customers/customer.model');
      const c = await CustomerModel.findById(f.customerId).select('email').lean();
      email = c?.email;
    }
    if (!email) throw AppError.badRequest('No customer email on file');
    const r = await sendEmail({
      to: email,
      subject: `Re: Order ${f.orderNumber}`,
      text: input.text,
    });
    mocked = r.mocked;
  }

  f.reply = {
    text: input.text,
    sentVia: input.via,
    sentAt: new Date(),
    sentById: ctx.actorId ? new Types.ObjectId(ctx.actorId) : undefined,
  };
  f.acknowledged = true;
  await f.save();
  await writeAuditLog({
    ...ctx,
    action: 'feedback.reply',
    entity: 'Feedback',
    entityId: String(f._id),
    metadata: { via: input.via, mocked },
  });
  return { feedback: f.toObject(), mocked };
}

export async function getSummary(opts: { from?: Date; to?: Date } = {}) {
  const match: Record<string, unknown> = {};
  if (opts.from || opts.to) {
    match.createdAt = {
      ...(opts.from ? { $gte: opts.from } : {}),
      ...(opts.to ? { $lte: opts.to } : {}),
    };
  }
  const [stats, tagStats] = await Promise.all([
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
          replied: { $sum: { $cond: [{ $ifNull: ['$reply', false] }, 1, 0] } },
        },
      },
    ]),
    FeedbackModel.aggregate([
      { $match: match },
      { $unwind: '$tagChips' },
      { $group: { _id: '$tagChips', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);
  return {
    total: stats[0]?.total ?? 0,
    avgRating: stats[0]?.avgRating ?? null,
    sentiment: {
      positive: stats[0]?.positive ?? 0,
      neutral: stats[0]?.neutral ?? 0,
      negative: stats[0]?.negative ?? 0,
    },
    replied: stats[0]?.replied ?? 0,
    tagDistribution: tagStats.map((t: { _id: string; count: number }) => ({ tag: t._id, count: t.count })),
  };
}

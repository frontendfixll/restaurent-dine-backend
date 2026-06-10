import { NotificationTemplateModel } from './notificationTemplate.model';
import { findEvent, NOTIFICATION_EVENTS, NotificationChannel } from './events';
import { extractVariables, renderTemplate } from './template.engine';
import { AppError } from '@utils/AppError';
import { writeAuditLog } from '@modules/audit/audit.service';

interface ActorCtx {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

const DEFAULT_TEMPLATES: Array<{
  eventKey: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
}> = [
  {
    eventKey: 'order.placed.guest',
    channel: 'sms',
    body: 'Thanks! Your order {{orderNumber}} at {{restaurantName}} is placed. Estimated time: {{estimatedPrepMinutes}} min.',
  },
  {
    eventKey: 'order.ready.window',
    channel: 'sms',
    body: 'Hi! Your order {{windowToken}} at {{restaurantName}} is ready for pickup. Show this SMS at the window.',
  },
  {
    eventKey: 'order.ready.window',
    channel: 'whatsapp',
    body: '✅ *{{restaurantName}}*\nOrder *{{windowToken}}* is ready for pickup!\nShow this message at the window.',
  },
  {
    eventKey: 'order.settled.guest',
    channel: 'sms',
    body: 'Thanks for visiting {{restaurantName}}! Invoice {{invoiceNumber}}: {{amountInWords}}.',
  },
  {
    eventKey: 'feedback.negative.manager',
    channel: 'sms',
    body: 'Negative feedback for order {{orderNumber}} — {{rating}}/5: "{{text}}"',
  },
  {
    eventKey: 'feedback.negative.manager',
    channel: 'email',
    subject: 'Negative feedback for order {{orderNumber}}',
    body: 'A {{rating}}/5 review was just submitted for order {{orderNumber}}.\n\nText: "{{text}}"\n\nCustomer phone: {{customerPhone}}',
  },
  {
    eventKey: 'feedback.reply.customer',
    channel: 'sms',
    body: '{{restaurantName}} re: order {{orderNumber}} — {{replyText}}',
  },
  {
    eventKey: 'inventory.low_stock.owner',
    channel: 'sms',
    body: 'Low stock: {{itemName}} at {{currentStock}}{{unit}} (threshold {{threshold}}{{unit}}).',
  },
  {
    eventKey: 'inventory.low_stock.owner',
    channel: 'email',
    subject: 'Low stock alert: {{itemName}}',
    body: '{{itemName}} is below threshold.\nCurrent: {{currentStock}} {{unit}}\nThreshold: {{threshold}} {{unit}}',
  },
  {
    eventKey: 'daily.summary.owner',
    channel: 'email',
    subject: '{{restaurantName}} — Daily summary {{date}}',
    body: 'Day: {{date}}\nOrders: {{orderCount}}\nGross sales: ₹{{grossSales}}\nNet collections: ₹{{netCollections}}\nTop item: {{topItem}}\nCash variance: ₹{{cashVariance}}',
  },
  {
    eventKey: 'bill.share.customer',
    channel: 'whatsapp',
    body: 'Bill {{invoiceNumber}} from {{restaurantName}}: ₹{{grand}}. ({{amountInWords}})',
  },
];

export async function ensureDefaultTemplates() {
  for (const def of DEFAULT_TEMPLATES) {
    const existing = await NotificationTemplateModel.findOne({
      eventKey: def.eventKey,
      channel: def.channel,
    });
    if (!existing) {
      await NotificationTemplateModel.create({ ...def, isSystem: true });
    }
  }
}

export async function listEvents() {
  return NOTIFICATION_EVENTS;
}

export async function listTemplates(opts: { eventKey?: string; channel?: NotificationChannel } = {}) {
  const filter: Record<string, unknown> = {};
  if (opts.eventKey) filter.eventKey = opts.eventKey;
  if (opts.channel) filter.channel = opts.channel;
  return NotificationTemplateModel.find(filter).sort({ eventKey: 1, channel: 1 }).lean();
}

export async function getTemplate(id: string) {
  const t = await NotificationTemplateModel.findById(id).lean();
  if (!t) throw AppError.notFound('Template not found');
  return t;
}

export interface CreateTemplateInput {
  eventKey: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  notes?: string;
}

function validateBody(body: string, eventKey: string, channel: NotificationChannel) {
  const event = findEvent(eventKey);
  if (!event) throw AppError.badRequest(`Unknown event "${eventKey}"`);
  if (!event.channels.includes(channel)) {
    throw AppError.badRequest(`Event "${eventKey}" does not support channel "${channel}"`);
  }
  const used = extractVariables(body);
  const known = new Set(event.variables);
  const unknown = used.filter((u) => !known.has(u));
  if (unknown.length) {
    throw AppError.badRequest(
      `Template references unknown variables: ${unknown.join(', ')}. Allowed: ${event.variables.join(', ')}`,
    );
  }
}

export async function createTemplate(input: CreateTemplateInput, ctx: ActorCtx) {
  validateBody(input.body, input.eventKey, input.channel);
  if (input.subject) validateBody(input.subject, input.eventKey, input.channel);
  const dup = await NotificationTemplateModel.findOne({
    eventKey: input.eventKey,
    channel: input.channel,
  });
  if (dup) throw AppError.conflict('A template for this event+channel already exists');
  const t = await NotificationTemplateModel.create(input);
  await writeAuditLog({
    ...ctx,
    action: 'notification.template.create',
    entity: 'NotificationTemplate',
    entityId: String(t._id),
    after: t.toObject(),
  });
  return t.toObject();
}

export interface UpdateTemplateInput {
  subject?: string;
  body?: string;
  notes?: string;
  isActive?: boolean;
}

export async function updateTemplate(id: string, input: UpdateTemplateInput, ctx: ActorCtx) {
  const t = await NotificationTemplateModel.findById(id);
  if (!t) throw AppError.notFound('Template not found');
  const before = t.toObject();
  if (input.body !== undefined) {
    validateBody(input.body, t.eventKey, t.channel);
    t.body = input.body;
  }
  if (input.subject !== undefined) {
    if (input.subject) validateBody(input.subject, t.eventKey, t.channel);
    t.subject = input.subject;
  }
  if (input.notes !== undefined) t.notes = input.notes;
  if (typeof input.isActive === 'boolean') t.isActive = input.isActive;
  await t.save();
  await writeAuditLog({
    ...ctx,
    action: 'notification.template.update',
    entity: 'NotificationTemplate',
    entityId: String(t._id),
    before,
    after: t.toObject(),
  });
  return t.toObject();
}

export async function deleteTemplate(id: string, ctx: ActorCtx) {
  const t = await NotificationTemplateModel.findById(id);
  if (!t) throw AppError.notFound('Template not found');
  if (t.isSystem) throw AppError.forbidden('Cannot delete a system template — disable it instead');
  await NotificationTemplateModel.deleteOne({ _id: t._id });
  await writeAuditLog({
    ...ctx,
    action: 'notification.template.delete',
    entity: 'NotificationTemplate',
    entityId: String(t._id),
    before: t.toObject(),
  });
}

export interface PreviewInput {
  body: string;
  subject?: string;
  payload: Record<string, unknown>;
}

export async function previewTemplate(input: PreviewInput) {
  const body = renderTemplate(input.body, input.payload);
  const subject = input.subject ? renderTemplate(input.subject, input.payload) : undefined;
  return {
    body: body.rendered,
    subject: subject?.rendered,
    missing: Array.from(new Set([...body.missing, ...(subject?.missing ?? [])])),
  };
}

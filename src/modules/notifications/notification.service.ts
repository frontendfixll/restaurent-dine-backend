import { Types } from 'mongoose';
import { NotificationTemplateModel } from './notificationTemplate.model';
import { NotificationLogModel, NotificationStatus } from './notificationLog.model';
import { NotificationChannel, findEvent } from './events';
import { renderTemplate } from './template.engine';
import { sendSms, sendWhatsapp } from '@providers/sms.provider';
import { sendEmail } from '@providers/email.provider';
import { logger } from '@utils/logger';

export interface DispatchInput {
  eventKey: string;
  to: string;
  channel?: NotificationChannel;
  payload: Record<string, unknown>;
  subjectOverride?: string;
  bodyOverride?: string;
  relatedOrderId?: Types.ObjectId | string;
  relatedInvoiceId?: Types.ObjectId | string;
  relatedCustomerId?: Types.ObjectId | string;
  triggeredById?: string;
}

export interface DispatchResult {
  attempted: number;
  sent: number;
  mocked: number;
  failed: number;
  skipped: number;
  logIds: string[];
}

async function loadTemplates(eventKey: string, channel?: NotificationChannel) {
  const filter: Record<string, unknown> = { eventKey, isActive: true };
  if (channel) filter.channel = channel;
  return NotificationTemplateModel.find(filter).lean();
}

async function dispatchSingle(
  channel: NotificationChannel,
  to: string,
  body: string,
  subject?: string,
): Promise<{ status: NotificationStatus; providerMessageId?: string; errorMessage?: string }> {
  try {
    if (channel === 'sms') {
      const r = await sendSms({ to, body });
      return {
        status: r.mocked ? 'mocked' : 'sent',
        providerMessageId: r.sid,
      };
    }
    if (channel === 'whatsapp') {
      const r = await sendWhatsapp({ to, body });
      return {
        status: r.mocked ? 'mocked' : 'sent',
        providerMessageId: r.sid,
      };
    }
    if (channel === 'email') {
      const r = await sendEmail({ to, subject: subject || 'SmartDine', text: body, html: undefined });
      return {
        status: r.mocked ? 'mocked' : 'sent',
        providerMessageId: r.messageId,
      };
    }
    if (channel === 'push') {
      logger.warn('Push channel not yet implemented');
      return { status: 'skipped' };
    }
    return { status: 'failed', errorMessage: `Unknown channel ${channel}` };
  } catch (err) {
    return { status: 'failed', errorMessage: (err as Error).message };
  }
}

function toObjectId(value: Types.ObjectId | string | undefined): Types.ObjectId | undefined {
  if (!value) return undefined;
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
}

/**
 * Dispatch a notification for the given eventKey. If no channel is specified,
 * sends through every active template registered for the event. Logs every
 * attempt — never throws (notifications are best-effort).
 */
export async function dispatchNotification(input: DispatchInput): Promise<DispatchResult> {
  const event = findEvent(input.eventKey);
  if (!event) {
    logger.warn({ eventKey: input.eventKey }, 'Unknown notification eventKey');
  }
  const templates = input.bodyOverride
    ? [
        {
          eventKey: input.eventKey,
          channel: input.channel ?? 'sms',
          body: input.bodyOverride,
          subject: input.subjectOverride,
        },
      ]
    : await loadTemplates(input.eventKey, input.channel);

  const result: DispatchResult = { attempted: 0, sent: 0, mocked: 0, failed: 0, skipped: 0, logIds: [] };
  if (!templates.length) {
    logger.debug({ eventKey: input.eventKey, channel: input.channel }, 'No active templates — skipping');
    return result;
  }

  for (const tpl of templates) {
    const { rendered } = renderTemplate(tpl.body, input.payload);
    const subject = tpl.subject ? renderTemplate(tpl.subject, input.payload).rendered : undefined;
    result.attempted++;

    if (!input.to) {
      const log = await NotificationLogModel.create({
        eventKey: input.eventKey,
        channel: tpl.channel,
        to: '(missing)',
        subject,
        body: rendered,
        status: 'skipped',
        errorMessage: 'No recipient',
        relatedOrderId: toObjectId(input.relatedOrderId),
        relatedInvoiceId: toObjectId(input.relatedInvoiceId),
        relatedCustomerId: toObjectId(input.relatedCustomerId),
        triggeredById: toObjectId(input.triggeredById),
      });
      result.skipped++;
      result.logIds.push(String(log._id));
      continue;
    }

    const outcome = await dispatchSingle(tpl.channel, input.to, rendered, subject);
    const log = await NotificationLogModel.create({
      eventKey: input.eventKey,
      channel: tpl.channel,
      to: input.to,
      subject,
      body: rendered,
      status: outcome.status,
      providerMessageId: outcome.providerMessageId,
      errorMessage: outcome.errorMessage,
      sentAt: outcome.status === 'sent' || outcome.status === 'mocked' ? new Date() : undefined,
      relatedOrderId: toObjectId(input.relatedOrderId),
      relatedInvoiceId: toObjectId(input.relatedInvoiceId),
      relatedCustomerId: toObjectId(input.relatedCustomerId),
      triggeredById: toObjectId(input.triggeredById),
    });
    result.logIds.push(String(log._id));
    if (outcome.status === 'sent') result.sent++;
    else if (outcome.status === 'mocked') result.mocked++;
    else if (outcome.status === 'failed') result.failed++;
    else if (outcome.status === 'skipped') result.skipped++;
  }

  return result;
}

/**
 * Convenience helper — call fire-and-forget from any hot path.
 */
export function dispatchSafe(input: DispatchInput): void {
  dispatchNotification(input).catch((err) =>
    logger.error({ err, eventKey: input.eventKey }, 'dispatchNotification failed'),
  );
}

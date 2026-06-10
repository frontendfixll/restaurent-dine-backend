import twilio from 'twilio';
import { config } from '@config/index';
import { logger } from '@utils/logger';

let client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!config.twilio.enabled) return null;
  if (!client) client = twilio(config.twilio.accountSid, config.twilio.authToken);
  return client;
}

export interface SendSmsInput {
  to: string;
  body: string;
}

export async function sendSms({ to, body }: SendSmsInput): Promise<{ sid?: string; mocked: boolean }> {
  const c = getClient();
  if (!c || !config.twilio.smsFrom) {
    logger.warn({ to, body }, '[SMS:MOCK] Twilio not configured — printing instead of sending');
    return { mocked: true };
  }
  const msg = await c.messages.create({ to, from: config.twilio.smsFrom, body });
  return { sid: msg.sid, mocked: false };
}

export async function sendWhatsapp({ to, body }: SendSmsInput): Promise<{ sid?: string; mocked: boolean }> {
  const c = getClient();
  if (!c || !config.twilio.whatsappFrom) {
    logger.warn({ to, body }, '[WHATSAPP:MOCK] Twilio not configured — printing instead of sending');
    return { mocked: true };
  }
  const toAddr = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const msg = await c.messages.create({ to: toAddr, from: config.twilio.whatsappFrom, body });
  return { sid: msg.sid, mocked: false };
}

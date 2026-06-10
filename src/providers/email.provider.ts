import nodemailer, { Transporter } from 'nodemailer';
import { config } from '@config/index';
import { logger } from '@utils/logger';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!config.smtp.enabled) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

export interface EmailResult {
  mocked: boolean;
  messageId?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<EmailResult> {
  const t = getTransporter();
  if (!t) {
    logger.warn(
      { to: input.to, subject: input.subject },
      '[EMAIL:MOCK] SMTP not configured — logging instead of sending',
    );
    return { mocked: true };
  }
  const info = await t.sendMail({
    from: config.smtp.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html ?? input.text,
    attachments: input.attachments,
  });
  return { mocked: false, messageId: info.messageId };
}

export async function verifyEmailTransport(): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.verify();
    return true;
  } catch {
    return false;
  }
}

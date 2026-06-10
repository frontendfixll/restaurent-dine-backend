import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { OtpModel, OtpPurpose, OtpChannel } from './otp.model';
import { config } from '@config/index';
import { AppError } from '@utils/AppError';
import { sendSms } from '@providers/sms.provider';
import { logger } from '@utils/logger';

function generateNumericCode(length: number): string {
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return n.toString().padStart(length, '0');
}

export interface IssueOtpInput {
  identifier: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
  metadata?: Record<string, unknown>;
}

export async function issueOtp({ identifier, channel, purpose, metadata }: IssueOtpInput) {
  await OtpModel.updateMany(
    { identifier, purpose, consumedAt: { $exists: false } },
    { $set: { consumedAt: new Date(), 'metadata.invalidated': true } },
  );

  const code = generateNumericCode(config.otp.length);
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + config.otp.expiresInMin * 60_000);

  await OtpModel.create({
    identifier,
    channel,
    purpose,
    codeHash,
    expiresAt,
    attempts: 0,
    maxAttempts: config.otp.maxAttempts,
    metadata,
  });

  const body = `Your SmartDine verification code is ${code}. Valid for ${config.otp.expiresInMin} minutes.`;

  if (channel === 'sms') {
    const result = await sendSms({ to: identifier, body });
    if (result.mocked) logger.info(`[DEV OTP] ${identifier} → ${code}`);
  }

  return { expiresAt, mocked: !config.twilio.enabled };
}

export interface VerifyOtpInput {
  identifier: string;
  purpose: OtpPurpose;
  code: string;
}

export async function verifyOtp({ identifier, purpose, code }: VerifyOtpInput): Promise<void> {
  const otp = await OtpModel.findOne({
    identifier,
    purpose,
    consumedAt: { $exists: false },
  }).sort({ createdAt: -1 });

  if (!otp) throw AppError.unauthorized('No active OTP. Request a new one.');
  if (otp.expiresAt.getTime() < Date.now()) throw AppError.unauthorized('OTP expired. Request a new one.');
  if (otp.attempts >= otp.maxAttempts) {
    otp.consumedAt = new Date();
    await otp.save();
    throw AppError.unauthorized('Too many attempts. Request a new OTP.');
  }

  const ok = await bcrypt.compare(code, otp.codeHash);
  otp.attempts += 1;
  if (!ok) {
    await otp.save();
    throw AppError.unauthorized('Invalid OTP code.');
  }

  otp.consumedAt = new Date();
  await otp.save();
}

import { Types } from 'mongoose';
import ms from './ms';
import { SessionModel } from './session.model';
import { hashRefreshToken, generateRefreshToken } from './token.service';
import { config } from '@config/index';

export interface CreateSessionInput {
  userId: Types.ObjectId | string;
  ip?: string;
  userAgent?: string;
}

export async function createSession({ userId, ip, userAgent }: CreateSessionInput) {
  const { token, hash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + ms(config.jwt.refreshExpiresIn));
  await SessionModel.create({
    userId: new Types.ObjectId(String(userId)),
    refreshTokenHash: hash,
    ip,
    userAgent,
    expiresAt,
  });
  return { refreshToken: token, expiresAt };
}

export async function findActiveSessionByToken(refreshToken: string) {
  const hash = hashRefreshToken(refreshToken);
  return SessionModel.findOne({
    refreshTokenHash: hash,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
}

export async function revokeSessionByToken(refreshToken: string) {
  const hash = hashRefreshToken(refreshToken);
  await SessionModel.updateOne(
    { refreshTokenHash: hash, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllUserSessions(userId: Types.ObjectId | string) {
  await SessionModel.updateMany(
    { userId: new Types.ObjectId(String(userId)), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

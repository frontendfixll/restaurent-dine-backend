import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '@config/index';

export interface AccessTokenPayload {
  sub: string; // userId
  roleKey: string;
  type: 'access';
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
  if (decoded.type !== 'access') throw new Error('Wrong token type');
  return decoded;
}

export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface GuestTokenPayload {
  phone: string;
  type: 'guest_verified';
}

export function signGuestToken(phone: string): string {
  return jwt.sign({ phone, type: 'guest_verified' }, config.jwt.accessSecret, {
    expiresIn: '30m',
  } as SignOptions);
}

export function verifyGuestToken(token: string): { phone: string } {
  const decoded = jwt.verify(token, config.jwt.accessSecret) as GuestTokenPayload;
  if (decoded.type !== 'guest_verified') throw new Error('Wrong token type');
  return { phone: decoded.phone };
}

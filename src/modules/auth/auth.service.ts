import { Types } from 'mongoose';
import { UserModel } from '@modules/users/user.model';
import { RoleModel } from '@modules/roles/role.model';
import { AppError } from '@utils/AppError';
import { comparePassword, signAccessToken, signGuestToken } from './token.service';
import {
  createSession,
  findActiveSessionByToken,
  revokeSessionByToken,
  revokeAllUserSessions,
} from './session.service';
import { issueOtp, verifyOtp } from './otp.service';
import { writeAuditLog } from '@modules/audit/audit.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60_000;

export interface StaffLoginInput {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
}

export async function staffLogin({ email, password, ip, userAgent }: StaffLoginInput) {
  const user = await UserModel.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) throw AppError.unauthorized('Invalid credentials');
  if (!user.isActive) throw AppError.forbidden('Account is disabled');
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw AppError.forbidden('Account temporarily locked. Try again later.');
  }

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    throw AppError.unauthorized('Invalid credentials');
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;

  const role = await RoleModel.findById(user.roleId).lean();
  if (!role) throw AppError.internal('User role not found');

  if (user.twoFactorEnabled && user.twoFactorPhone) {
    await issueOtp({
      identifier: user.twoFactorPhone,
      channel: 'sms',
      purpose: 'staff_2fa',
      metadata: { userId: String(user._id) },
    });
    await user.save();
    return {
      mfaRequired: true as const,
      userId: String(user._id),
      maskedPhone: maskPhone(user.twoFactorPhone),
    };
  }

  user.lastLoginAt = new Date();
  await user.save();

  const { refreshToken, expiresAt } = await createSession({ userId: user._id, ip, userAgent });
  const accessToken = signAccessToken({ sub: String(user._id), roleKey: role.key });

  await writeAuditLog({
    actorId: user._id,
    actorEmail: user.email,
    actorRole: role.key,
    action: 'auth.login',
    entity: 'User',
    entityId: String(user._id),
    ip,
  });

  return {
    mfaRequired: false as const,
    accessToken,
    refreshToken,
    refreshExpiresAt: expiresAt,
    user: sanitizeUser(user, role),
  };
}

export interface StaffVerify2faInput {
  userId: string;
  code: string;
  ip?: string;
  userAgent?: string;
}

export async function staffVerify2fa({ userId, code, ip, userAgent }: StaffVerify2faInput) {
  const user = await UserModel.findById(userId);
  if (!user || !user.isActive) throw AppError.unauthorized('Invalid session');
  if (!user.twoFactorEnabled || !user.twoFactorPhone) throw AppError.badRequest('2FA not enabled');

  await verifyOtp({ identifier: user.twoFactorPhone, purpose: 'staff_2fa', code });

  const role = await RoleModel.findById(user.roleId).lean();
  if (!role) throw AppError.internal('User role not found');

  user.lastLoginAt = new Date();
  await user.save();

  const { refreshToken, expiresAt } = await createSession({ userId: user._id, ip, userAgent });
  const accessToken = signAccessToken({ sub: String(user._id), roleKey: role.key });

  await writeAuditLog({
    actorId: user._id,
    actorEmail: user.email,
    actorRole: role.key,
    action: 'auth.login.2fa',
    entity: 'User',
    entityId: String(user._id),
    ip,
  });

  return {
    accessToken,
    refreshToken,
    refreshExpiresAt: expiresAt,
    user: sanitizeUser(user, role),
  };
}

export async function refreshSession(refreshToken: string) {
  const session = await findActiveSessionByToken(refreshToken);
  if (!session) throw AppError.unauthorized('Invalid or expired session');
  const user = await UserModel.findById(session.userId);
  if (!user || !user.isActive) throw AppError.unauthorized('Invalid session');
  const role = await RoleModel.findById(user.roleId).lean();
  if (!role) throw AppError.internal('User role not found');

  const accessToken = signAccessToken({ sub: String(user._id), roleKey: role.key });
  return { accessToken, user: sanitizeUser(user, role) };
}

export async function logout(refreshToken: string | undefined, userId?: string) {
  if (refreshToken) await revokeSessionByToken(refreshToken);
  if (userId) {
    await writeAuditLog({ actorId: userId, action: 'auth.logout', entity: 'User', entityId: userId });
  }
}

export async function setup2fa(userId: string, phone: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  await issueOtp({
    identifier: phone,
    channel: 'sms',
    purpose: 'staff_2fa',
    metadata: { userId, intent: 'setup' },
  });
  return { sentTo: maskPhone(phone) };
}

export async function confirm2faSetup(userId: string, phone: string, code: string) {
  await verifyOtp({ identifier: phone, purpose: 'staff_2fa', code });
  const user = await UserModel.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  user.twoFactorEnabled = true;
  user.twoFactorPhone = phone;
  await user.save();
  await writeAuditLog({
    actorId: userId,
    action: 'user.2fa.enabled',
    entity: 'User',
    entityId: userId,
  });
  return { enabled: true };
}

export async function disable2fa(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  user.twoFactorEnabled = false;
  user.twoFactorPhone = undefined;
  await user.save();
  await revokeAllUserSessions(userId);
  await writeAuditLog({
    actorId: userId,
    action: 'user.2fa.disabled',
    entity: 'User',
    entityId: userId,
  });
}

export async function requestGuestOtp(phone: string) {
  await issueOtp({ identifier: phone, channel: 'sms', purpose: 'guest_signin' });
  return { sentTo: maskPhone(phone) };
}

export async function verifyGuestOtp(phone: string, code: string) {
  await verifyOtp({ identifier: phone, purpose: 'guest_signin', code });
  const token = signGuestToken(phone);
  return { verified: true, phone, guestToken: token, expiresInMin: 30 };
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return `${phone.slice(0, 3)}****${phone.slice(-2)}`;
}

function sanitizeUser(
  user: { _id: Types.ObjectId; email: string; name: string; phone?: string },
  role: { key: string; name: string; permissions: string[] },
) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: { key: role.key, name: role.name, permissions: role.permissions },
  };
}

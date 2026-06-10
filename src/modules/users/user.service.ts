import { Types } from 'mongoose';
import { UserModel } from './user.model';
import { RoleModel } from '@modules/roles/role.model';
import { AppError } from '@utils/AppError';
import { hashPassword } from '@modules/auth/token.service';
import { revokeAllUserSessions } from '@modules/auth/session.service';
import { writeAuditLog } from '@modules/audit/audit.service';

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
  roleKey: string;
}

export async function createUser(input: CreateUserInput, actorId?: string) {
  const role = await RoleModel.findOne({ key: input.roleKey.toLowerCase() });
  if (!role) throw AppError.badRequest(`Role "${input.roleKey}" not found`);
  if (role.key === 'owner') {
    const existingOwner = await UserModel.findOne({ roleId: role._id });
    if (existingOwner) throw AppError.conflict('Owner already exists');
  }
  const existing = await UserModel.findOne({ email: input.email.toLowerCase() });
  if (existing) throw AppError.conflict('Email already in use');

  const passwordHash = await hashPassword(input.password);
  const user = await UserModel.create({
    email: input.email.toLowerCase(),
    passwordHash,
    name: input.name,
    phone: input.phone,
    roleId: role._id,
  });

  await writeAuditLog({
    actorId,
    action: 'user.create',
    entity: 'User',
    entityId: String(user._id),
    after: { email: user.email, name: user.name, roleKey: role.key },
  });

  return toDTO(user, role);
}

export interface ListUsersOptions {
  q?: string;
  roleKey?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export async function listUsers(opts: ListUsersOptions) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
  const filter: Record<string, unknown> = {};
  if (typeof opts.isActive === 'boolean') filter.isActive = opts.isActive;
  if (opts.roleKey) {
    const role = await RoleModel.findOne({ key: opts.roleKey.toLowerCase() });
    if (role) filter.roleId = role._id;
    else return { items: [], meta: { page, limit, total: 0, totalPages: 0 } };
  }
  if (opts.q) {
    const rx = new RegExp(escapeRegex(opts.q), 'i');
    filter.$or = [{ email: rx }, { name: rx }, { phone: rx }];
  }
  const [users, total] = await Promise.all([
    UserModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    UserModel.countDocuments(filter),
  ]);
  const roles = await RoleModel.find({ _id: { $in: users.map((u) => u.roleId) } }).lean();
  const roleMap = new Map(roles.map((r) => [String(r._id), r]));
  return {
    items: users.map((u) => toDTO(u, roleMap.get(String(u.roleId)))),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

export async function getUserById(id: string) {
  const user = await UserModel.findById(id).lean();
  if (!user) throw AppError.notFound('User not found');
  const role = await RoleModel.findById(user.roleId).lean();
  return toDTO(user, role);
}

export interface UpdateUserInput {
  name?: string;
  phone?: string;
  roleKey?: string;
  isActive?: boolean;
  password?: string;
}

export async function updateUser(id: string, input: UpdateUserInput, actorId?: string) {
  const user = await UserModel.findById(id);
  if (!user) throw AppError.notFound('User not found');

  const before = { name: user.name, phone: user.phone, isActive: user.isActive, roleId: String(user.roleId) };

  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;
  if (typeof input.isActive === 'boolean') user.isActive = input.isActive;
  if (input.password) user.passwordHash = await hashPassword(input.password);

  if (input.roleKey) {
    const role = await RoleModel.findOne({ key: input.roleKey.toLowerCase() });
    if (!role) throw AppError.badRequest(`Role "${input.roleKey}" not found`);
    if (role.key === 'owner') throw AppError.forbidden('Cannot reassign Owner role');
    user.roleId = role._id;
  }
  await user.save();

  if (input.password || input.isActive === false) {
    await revokeAllUserSessions(user._id);
  }

  const role = await RoleModel.findById(user.roleId).lean();
  await writeAuditLog({
    actorId,
    action: 'user.update',
    entity: 'User',
    entityId: String(user._id),
    before,
    after: { name: user.name, phone: user.phone, isActive: user.isActive, roleId: String(user.roleId) },
  });
  return toDTO(user, role);
}

export async function deleteUser(id: string, actorId?: string) {
  const user = await UserModel.findById(id);
  if (!user) throw AppError.notFound('User not found');
  const role = await RoleModel.findById(user.roleId).lean();
  if (role?.key === 'owner') throw AppError.forbidden('Cannot delete Owner');
  if (String(user._id) === actorId) throw AppError.forbidden('Cannot delete yourself');

  await revokeAllUserSessions(user._id);
  await UserModel.deleteOne({ _id: user._id });

  await writeAuditLog({
    actorId,
    action: 'user.delete',
    entity: 'User',
    entityId: String(user._id),
    before: { email: user.email, name: user.name },
  });
}

function toDTO(
  user: { _id: Types.ObjectId; email: string; name: string; phone?: string; isActive: boolean; lastLoginAt?: Date; twoFactorEnabled: boolean },
  role?: { key: string; name: string; permissions: string[] } | null,
) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    phone: user.phone,
    isActive: user.isActive,
    twoFactorEnabled: user.twoFactorEnabled,
    lastLoginAt: user.lastLoginAt,
    role: role ? { key: role.key, name: role.name, permissions: role.permissions } : null,
  };
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

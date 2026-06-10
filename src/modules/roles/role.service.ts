import { Types } from 'mongoose';
import { RoleModel } from './role.model';
import { UserModel } from '@modules/users/user.model';
import { AppError } from '@utils/AppError';
import { isValidPermission, PERMISSIONS } from './permissions';
import { writeAuditLog } from '@modules/audit/audit.service';

export interface CreateRoleInput {
  key: string;
  name: string;
  description?: string;
  permissions: string[];
}

function validatePerms(perms: string[]) {
  const invalid = perms.filter((p) => !isValidPermission(p));
  if (invalid.length) throw AppError.badRequest(`Unknown permissions: ${invalid.join(', ')}`);
}

export async function listRoles() {
  return RoleModel.find().sort({ isSystem: -1, key: 1 }).lean();
}

export async function getRole(id: string) {
  const role = await RoleModel.findById(id).lean();
  if (!role) throw AppError.notFound('Role not found');
  return role;
}

export async function listPermissionRegistry() {
  return { permissions: [...PERMISSIONS], wildcard: '*' };
}

export async function createRole(input: CreateRoleInput, actorId?: string) {
  const key = input.key.toLowerCase().trim();
  if (key === 'owner') throw AppError.forbidden('Cannot create another Owner role');
  validatePerms(input.permissions);
  const existing = await RoleModel.findOne({ key });
  if (existing) throw AppError.conflict('Role key already exists');
  const role = await RoleModel.create({
    key,
    name: input.name,
    description: input.description,
    permissions: input.permissions,
    isSystem: false,
  });
  await writeAuditLog({
    actorId,
    action: 'role.create',
    entity: 'Role',
    entityId: String(role._id),
    after: { key, permissions: input.permissions },
  });
  return role.toObject();
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  permissions?: string[];
}

export async function updateRole(id: string, input: UpdateRoleInput, actorId?: string) {
  const role = await RoleModel.findById(id);
  if (!role) throw AppError.notFound('Role not found');
  if (role.isSystem && input.permissions) {
    if (role.key === 'owner') throw AppError.forbidden('Cannot modify Owner permissions');
  }
  if (input.permissions) validatePerms(input.permissions);
  const before = { name: role.name, description: role.description, permissions: [...role.permissions] };
  if (input.name !== undefined) role.name = input.name;
  if (input.description !== undefined) role.description = input.description;
  if (input.permissions !== undefined) role.permissions = input.permissions;
  await role.save();
  await writeAuditLog({
    actorId,
    action: 'role.update',
    entity: 'Role',
    entityId: String(role._id),
    before,
    after: { name: role.name, description: role.description, permissions: role.permissions },
  });
  return role.toObject();
}

export async function deleteRole(id: string, actorId?: string) {
  const role = await RoleModel.findById(id);
  if (!role) throw AppError.notFound('Role not found');
  if (role.isSystem) throw AppError.forbidden('Cannot delete a system role');
  const inUse = await UserModel.countDocuments({ roleId: role._id });
  if (inUse > 0) throw AppError.conflict(`Role is assigned to ${inUse} user(s)`);
  await RoleModel.deleteOne({ _id: role._id });
  await writeAuditLog({
    actorId,
    action: 'role.delete',
    entity: 'Role',
    entityId: String(role._id),
    before: { key: role.key, name: role.name },
  });
}

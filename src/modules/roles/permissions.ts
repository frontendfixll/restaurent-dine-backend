/**
 * Permission registry — every guarded action in the system.
 * Format: `<namespace>:<action>`. Wildcard `*` means "all permissions".
 */

export const PERMISSIONS = [
  'restaurant:read',
  'restaurant:update',

  'user:read',
  'user:create',
  'user:update',
  'user:delete',

  'role:read',
  'role:create',
  'role:update',
  'role:delete',

  'menu:read',
  'menu:create',
  'menu:update',
  'menu:delete',
  'menu:publish',
  'menu:86',
  'menu:import',
  'menu:export',

  'table:read',
  'table:create',
  'table:update',
  'table:delete',

  'qr:read',
  'qr:create',
  'qr:update',
  'qr:delete',

  'order:read',
  'order:create',
  'order:accept',
  'order:modify',
  'order:void',
  'order:cancel',
  'order:refund',

  'kds:read',
  'kds:update',

  'billing:read',
  'billing:create',
  'billing:discount',
  'billing:settle',

  'payment:read',
  'payment:create',
  'payment:refund',

  'inventory:read',
  'inventory:create',
  'inventory:update',
  'inventory:delete',
  'inventory:stockin',
  'inventory:stockout',

  'customer:read',
  'customer:update',

  'feedback:read',
  'feedback:reply',

  'discount:read',
  'discount:create',
  'discount:update',
  'discount:delete',
  'discount:apply',

  'coupon:read',
  'coupon:create',
  'coupon:update',
  'coupon:delete',

  'loyalty:read',
  'loyalty:config',
  'loyalty:redeem',

  'notification:read',
  'notification:template',
  'notification:send',

  'report:read',
  'report:export',

  'audit:read',

  'day:close',
] as const;

export type Permission = (typeof PERMISSIONS)[number] | '*';

export const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function isValidPermission(p: string): p is Permission {
  return p === '*' || PERMISSION_SET.has(p);
}

export function hasPermission(granted: readonly string[], required: Permission): boolean {
  if (granted.includes('*')) return true;
  return granted.includes(required);
}

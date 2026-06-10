import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone (use E.164)');

const boolFromQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1'));

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
  phone: phone.optional(),
  roleKey: z.string().min(2).max(40),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: phone.optional(),
  roleKey: z.string().min(2).max(40).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
});

export const listUsersQuerySchema = z.object({
  q: z.string().optional(),
  roleKey: z.string().optional(),
  isActive: boolFromQuery.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const idParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id'),
});

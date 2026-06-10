import { z } from 'zod';

export const createRoleSchema = z.object({
  key: z.string().min(2).max(40).regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  permissions: z.array(z.string()).min(1),
});

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional(),
  permissions: z.array(z.string()).optional(),
});

export const idParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id'),
});

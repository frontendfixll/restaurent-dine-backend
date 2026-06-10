import { z } from 'zod';
import { mongoId, boolFromQuery } from '@utils/zod';

const phone = z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone');

export const createCustomerSchema = z.object({
  phone: phone.optional(),
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  allergens: z.array(z.string().min(1).max(40)).max(20).optional(),
  notes: z.string().max(500).optional(),
  marketingOptIn: z.boolean().optional(),
});

export const updateCustomerSchema = z
  .object({
    phone,
    name: z.string().min(1).max(120),
    email: z.string().email(),
    allergens: z.array(z.string().min(1).max(40)).max(20),
    notes: z.string().max(500),
    marketingOptIn: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const tagSchema = z.object({
  tag: z.string().min(1).max(40),
});

export const lookupSchema = z.object({
  phone,
});

export const listCustomersQuerySchema = z.object({
  q: z.string().max(80).optional(),
  tag: z.string().max(40).optional(),
  hasPhone: boolFromQuery.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const idParamSchema = z.object({ id: mongoId() });
export const tagParamSchema = z.object({ id: mongoId(), tag: z.string().min(1).max(40) });

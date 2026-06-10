import { z } from 'zod';
import { mongoId, boolFromQuery } from '@utils/zod';

const channel = z.enum(['dine_in', 'window', 'assisted']);
const scope = z.enum(['bill', 'category', 'item', 'channel']);
const type = z.enum(['percent', 'flat']);

const code = z.string().min(2).max(40).regex(/^[A-Z0-9_-]+$/i);

export const createCouponSchema = z.object({
  code,
  description: z.string().max(300).optional(),
  type,
  value: z.number().min(0),
  maxDiscount: z.number().min(0).optional(),
  scope: scope.optional(),
  categoryIds: z.array(mongoId()).optional(),
  itemIds: z.array(mongoId()).optional(),
  channels: z.array(channel).optional(),
  minBillAmount: z.number().min(0).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  usageLimit: z.number().int().min(1).optional(),
  perUserLimit: z.number().int().min(1).optional(),
});

export const updateCouponSchema = createCouponSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const validateCouponSchema = z.object({
  code,
  orderId: mongoId(),
});

export const listCouponsQuerySchema = z.object({
  isActive: boolFromQuery.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const idParamSchema = z.object({ id: mongoId() });

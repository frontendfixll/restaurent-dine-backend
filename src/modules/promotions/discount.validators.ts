import { z } from 'zod';
import { mongoId, hhmm, boolFromQuery } from '@utils/zod';

const channel = z.enum(['dine_in', 'window', 'assisted']);
const scope = z.enum(['bill', 'category', 'item', 'channel']);
const type = z.enum(['percent', 'flat']);

export const createDiscountSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  type,
  value: z.number().min(0),
  maxDiscount: z.number().min(0).optional(),
  scope,
  categoryIds: z.array(mongoId()).optional(),
  itemIds: z.array(mongoId()).optional(),
  channels: z.array(channel).optional(),
  minBillAmount: z.number().min(0).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  startTime: hhmm().optional(),
  endTime: hhmm().optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  maxTotalUses: z.number().int().min(1).optional(),
});

export const updateDiscountSchema = createDiscountSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const listDiscountsQuerySchema = z.object({
  isActive: boolFromQuery.optional(),
  scope: scope.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const idParamSchema = z.object({ id: mongoId() });

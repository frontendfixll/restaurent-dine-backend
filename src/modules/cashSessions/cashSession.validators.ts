import { z } from 'zod';
import { mongoId } from '@utils/zod';

export const openCashSessionSchema = z.object({
  openingFloat: z.number().min(0),
  notes: z.string().max(300).optional(),
});

export const closeCashSessionSchema = z.object({
  actualCash: z.number().min(0),
  denominations: z.record(z.string(), z.number().int().min(0)).optional(),
  notes: z.string().max(500).optional(),
});

export const listCashSessionsQuerySchema = z.object({
  cashierId: mongoId().optional(),
  status: z.enum(['open', 'closed']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const idParamSchema = z.object({ id: mongoId() });

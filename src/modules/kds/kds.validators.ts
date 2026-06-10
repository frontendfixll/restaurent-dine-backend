import { z } from 'zod';
import { mongoId } from '@utils/zod';

export const queueQuerySchema = z.object({
  station: z.string().min(1).max(40).optional(),
});

export const itemStatusSchema = z.object({
  status: z.enum(['accepted', 'preparing', 'ready', 'served', 'cancelled']),
  station: z.string().min(1).max(40).optional(),
});

export const orderItemParamSchema = z.object({
  orderId: mongoId(),
  itemId: mongoId(),
});

export const orderIdParamSchema = z.object({ orderId: mongoId() });

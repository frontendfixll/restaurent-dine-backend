import { z } from 'zod';
import { mongoId } from '@utils/zod';

export const openSessionSchema = z.object({
  tableId: mongoId(),
  guestCount: z.number().int().min(1).max(50).optional(),
  waiterId: mongoId().optional(),
  customerId: mongoId().optional(),
});

export const idParamSchema = z.object({ id: mongoId() });

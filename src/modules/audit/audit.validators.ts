import { z } from 'zod';

export const listAuditQuerySchema = z.object({
  actorId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  entity: z.string().min(1).max(64).optional(),
  entityId: z.string().min(1).max(64).optional(),
  action: z.string().min(1).max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

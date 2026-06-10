import { z } from 'zod';

export const publicMenuQuerySchema = z.object({
  lang: z.string().min(2).max(8).optional(),
  channel: z.enum(['dine_in', 'window']).optional(),
});

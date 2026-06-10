import { z } from 'zod';
import { mongoId, hhmm, slug } from '@utils/zod';

const comboItemSchema = z.object({
  itemId: mongoId(),
  variantId: mongoId().optional(),
  qty: z.number().int().min(1).max(20),
});

const availabilityWindowSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: hhmm(),
  endTime: hhmm(),
});

const translationsSchema = z.record(
  z.string().min(2).max(8),
  z.object({ name: z.string().min(1).max(120), description: z.string().max(500).optional() }),
);

export const createComboSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slug().optional(),
  description: z.string().max(1000).optional(),
  price: z.number().min(0),
  items: z.array(comboItemSchema).min(1).max(20),
  modifierGroupIds: z.array(mongoId()).max(20).optional(),
  availabilityWindows: z.array(availabilityWindowSchema).max(8).optional(),
  translations: translationsSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateComboSchema = createComboSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const toggleCombo86Schema = z.object({ is86: z.boolean() });

export const idParamSchema = z.object({ id: mongoId() });

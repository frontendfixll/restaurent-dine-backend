import { z } from 'zod';
import { mongoId, hhmm, slug, boolFromQuery } from '@utils/zod';

const variantSchema = z.object({
  name: z.string().min(1).max(60),
  priceDelta: z.number().optional(),
  absolutePrice: z.number().min(0).optional(),
  sku: z.string().max(60).optional(),
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

const foodType = z.enum(['veg', 'non_veg', 'egg', 'vegan']);

export const createItemSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slug().optional(),
  description: z.string().max(1000).optional(),
  categoryId: mongoId(),
  basePrice: z.number().min(0),
  prepTimeMinutes: z.number().int().min(0).max(240).optional(),
  foodType,
  spiceLevel: z.number().int().min(0).max(5).optional(),
  calories: z.number().int().min(0).max(10000).optional(),
  allergens: z.array(z.string().min(1).max(40)).max(20).optional(),
  hsnCode: z.string().max(20).optional(),
  variants: z.array(variantSchema).max(20).optional(),
  modifierGroupIds: z.array(mongoId()).max(20).optional(),
  availabilityWindows: z.array(availabilityWindowSchema).max(8).optional(),
  station: z.string().max(40).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  translations: translationsSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateItemSchema = createItemSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const toggle86Schema = z.object({ is86: z.boolean() });

export const listItemsQuerySchema = z.object({
  q: z.string().min(1).max(80).optional(),
  categoryId: mongoId().optional(),
  foodType: foodType.optional(),
  is86: boolFromQuery.optional(),
  isActive: boolFromQuery.optional(),
  station: z.string().max(40).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const idParamSchema = z.object({ id: mongoId() });

export const bulkPriceSchema = z.object({
  updates: z.array(z.object({ id: mongoId(), basePrice: z.number().min(0) })).min(1).max(500),
});

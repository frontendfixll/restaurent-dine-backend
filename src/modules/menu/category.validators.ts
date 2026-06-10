import { z } from 'zod';
import { mongoId, slug, boolFromQuery } from '@utils/zod';

const translationsSchema = z.record(
  z.string().min(2).max(8),
  z.object({ name: z.string().min(1).max(120), description: z.string().max(500).optional() }),
);

export const createCategorySchema = z.object({
  name: z.string().min(1).max(80),
  slug: slug().optional(),
  description: z.string().max(300).optional(),
  sortOrder: z.number().int().min(0).optional(),
  translations: translationsSchema.optional(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(80),
    slug: slug(),
    description: z.string().max(300),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0),
    translations: translationsSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const reorderCategoriesSchema = z.object({
  order: z.array(mongoId()).min(1),
});

export const idParamSchema = z.object({ id: mongoId() });

export const listCategoriesQuerySchema = z.object({
  includeInactive: boolFromQuery.optional(),
});

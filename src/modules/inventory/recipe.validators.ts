import { z } from 'zod';
import { mongoId } from '@utils/zod';

const unit = z.enum(['kg', 'g', 'L', 'ml', 'pcs']);

const ingredientSchema = z.object({
  inventoryItemId: mongoId(),
  qty: z.number().positive(),
  unit,
  optional: z.boolean().optional(),
});

export const createRecipeSchema = z.object({
  itemId: mongoId(),
  variantId: mongoId().optional(),
  ingredients: z.array(ingredientSchema).min(1).max(40),
  notes: z.string().max(500).optional(),
});

export const updateRecipeSchema = z
  .object({
    ingredients: z.array(ingredientSchema).min(1).max(40),
    notes: z.string().max(500),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const listRecipesQuerySchema = z.object({
  itemId: mongoId().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const idParamSchema = z.object({ id: mongoId() });

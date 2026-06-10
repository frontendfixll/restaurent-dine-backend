import { z } from 'zod';
import { mongoId, boolFromQuery } from '@utils/zod';

const unit = z.enum(['kg', 'g', 'L', 'ml', 'pcs']);

export const createInventorySchema = z.object({
  name: z.string().min(1).max(80),
  sku: z.string().max(40).optional(),
  unit,
  currentStock: z.number().min(0).optional(),
  lowStockThreshold: z.number().min(0).optional(),
  costPerUnit: z.number().min(0).optional(),
  supplierName: z.string().max(120).optional(),
  notes: z.string().max(300).optional(),
});

export const updateInventorySchema = z
  .object({
    name: z.string().min(1).max(80),
    sku: z.string().max(40),
    unit,
    lowStockThreshold: z.number().min(0),
    costPerUnit: z.number().min(0),
    supplierName: z.string().max(120),
    notes: z.string().max(300),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const stockInSchema = z.object({
  qty: z.number().positive(),
  unit: unit.optional(),
  costPerUnit: z.number().min(0).optional(),
  supplierName: z.string().max(120).optional(),
  reason: z.string().max(300).optional(),
});

export const stockOutSchema = z.object({
  qty: z.number().positive(),
  unit: unit.optional(),
  reason: z.string().min(3).max(300),
});

export const adjustSchema = z.object({
  delta: z.number(),
  reason: z.string().min(3).max(300),
});

export const listInventoryQuerySchema = z.object({
  q: z.string().max(80).optional(),
  lowStock: boolFromQuery.optional(),
  isActive: boolFromQuery.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const listMovementsQuerySchema = z.object({
  inventoryItemId: mongoId().optional(),
  type: z.enum(['in', 'out', 'waste', 'adjustment', 'recipe_deduction']).optional(),
  orderId: mongoId().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const idParamSchema = z.object({ id: mongoId() });

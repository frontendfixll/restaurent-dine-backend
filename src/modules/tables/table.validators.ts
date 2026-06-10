import { z } from 'zod';
import { mongoId, boolFromQuery } from '@utils/zod';

const tableNumber = z.string().min(1).max(20).trim();
const status = z.enum(['vacant', 'seated', 'ordered', 'awaiting_bill', 'cleaning']);
const shape = z.enum(['round', 'square', 'rect']);
const position = z.object({
  x: z.number().min(-2000).max(2000),
  y: z.number().min(-2000).max(2000),
});

export const createTableSchema = z.object({
  number: tableNumber,
  zone: z.string().max(40).optional(),
  capacity: z.number().int().min(1).max(50).optional(),
  shape: shape.optional(),
  position: position.optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateTableSchema = z
  .object({
    number: tableNumber,
    zone: z.string().max(40),
    capacity: z.number().int().min(1).max(50),
    shape: shape,
    position: position.nullable(),
    sortOrder: z.number().int().min(0),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const bulkCreateTablesSchema = z.object({
  tables: z.array(createTableSchema).min(1).max(200),
});

export const transitionStatusSchema = z.object({
  status,
});

export const mergeTablesSchema = z.object({
  secondaryIds: z.array(mongoId()).min(1).max(10),
});

export const moveSessionSchema = z.object({
  toTableId: mongoId(),
});

export const listTablesQuerySchema = z.object({
  status: status.optional(),
  zone: z.string().max(40).optional(),
  includeInactive: boolFromQuery.optional(),
});

export const idParamSchema = z.object({ id: mongoId() });

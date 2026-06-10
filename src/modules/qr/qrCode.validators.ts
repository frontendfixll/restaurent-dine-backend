import { z } from 'zod';
import { mongoId } from '@utils/zod';

const qrType = z.enum(['table', 'window']);
const qrStyle = z.enum(['plain', 'branded', 'designed']);

export const createQrSchema = z
  .object({
    type: qrType,
    tableId: mongoId().optional(),
    label: z.string().min(1).max(80),
    style: qrStyle.optional(),
  })
  .refine((v) => v.type !== 'table' || !!v.tableId, {
    message: 'tableId is required when type=table',
  });

export const updateQrSchema = z
  .object({
    label: z.string().min(1).max(80),
    style: qrStyle,
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const bulkQrSchema = z.object({
  tableIds: z.array(mongoId()).min(1).max(200),
  style: qrStyle.optional(),
});

export const listQrQuerySchema = z.object({
  type: qrType.optional(),
  tableId: mongoId().optional(),
});

export const idParamSchema = z.object({ id: mongoId() });
export const slugParamSchema = z.object({ slug: z.string().min(3).max(20) });

import { z } from 'zod';
import { mongoId } from '@utils/zod';

const channel = z.enum(['sms', 'whatsapp', 'email', 'push']);

export const createTemplateSchema = z.object({
  eventKey: z.string().min(3).max(80),
  channel,
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(4000),
  notes: z.string().max(500).optional(),
});

export const updateTemplateSchema = z
  .object({
    subject: z.string().max(200),
    body: z.string().min(1).max(4000),
    notes: z.string().max(500),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const previewSchema = z.object({
  body: z.string().min(1).max(4000),
  subject: z.string().max(200).optional(),
  payload: z.record(z.unknown()),
});

export const testSendSchema = z.object({
  eventKey: z.string().min(3).max(80),
  channel: channel.optional(),
  to: z.string().min(3).max(200),
  payload: z.record(z.unknown()),
});

export const listTemplatesQuerySchema = z.object({
  eventKey: z.string().optional(),
  channel: channel.optional(),
});

export const listLogsQuerySchema = z.object({
  eventKey: z.string().optional(),
  channel: channel.optional(),
  status: z.enum(['queued', 'sent', 'failed', 'skipped', 'mocked']).optional(),
  to: z.string().optional(),
  relatedOrderId: mongoId().optional(),
  from: z.coerce.date().optional(),
  to_: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const idParamSchema = z.object({ id: mongoId() });

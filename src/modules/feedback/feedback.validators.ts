import { z } from 'zod';
import { mongoId, boolFromQuery } from '@utils/zod';
import { FEEDBACK_TAG_CHIPS } from './feedback.model';

export const submitFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().max(1000).optional(),
  tagChips: z.array(z.enum(FEEDBACK_TAG_CHIPS)).max(8).optional(),
});

export const replySchema = z.object({
  text: z.string().min(1).max(800),
  via: z.enum(['sms', 'whatsapp', 'email']),
});

export const listFeedbackQuerySchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  maxRating: z.coerce.number().int().min(1).max(5).optional(),
  sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
  hasReply: boolFromQuery.optional(),
  acknowledged: boolFromQuery.optional(),
  channel: z.enum(['dine_in', 'window', 'assisted']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const summaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const idParamSchema = z.object({ id: mongoId() });
export const orderIdParamSchema = z.object({ id: mongoId() });

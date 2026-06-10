import { z } from 'zod';
import { mongoId } from '@utils/zod';

export const recordPaymentSchema = z.object({
  splitId: mongoId().optional(),
  mode: z.enum(['cash', 'upi', 'card', 'wallet', 'online_prepay']),
  amount: z.number().positive(),
  provider: z.enum(['razorpay', 'phonepe', 'stripe']).optional(),
  txnRef: z.string().max(120).optional(),
  cashTendered: z.number().min(0).optional(),
  notes: z.string().max(300).optional(),
});

export const upiQrSchema = z.object({
  invoiceId: mongoId(),
});

export const refundSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().min(3).max(300),
  method: z.enum(['cash', 'gateway', 'wallet', 'manual']).optional(),
});

export const listPaymentsQuerySchema = z.object({
  invoiceId: mongoId().optional(),
  orderId: mongoId().optional(),
  cashSessionId: mongoId().optional(),
  mode: z.enum(['cash', 'upi', 'card', 'wallet', 'online_prepay']).optional(),
  status: z.enum(['pending', 'success', 'failed', 'refunded', 'cancelled']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const idParamSchema = z.object({ id: mongoId() });
export const invoiceIdParamSchema = z.object({ invoiceId: mongoId() });

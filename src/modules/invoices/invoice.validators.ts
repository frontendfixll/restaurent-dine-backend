import { z } from 'zod';
import { mongoId } from '@utils/zod';

export const generateInvoiceSchema = z.object({
  discount: z.number().min(0).optional(),
  discountId: mongoId().optional(),
  couponCode: z.string().min(2).max(40).optional(),
  loyaltyPoints: z.number().int().min(0).optional(),
  customerName: z.string().max(120).optional(),
  customerPhone: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/)
    .optional(),
  customerEmail: z.string().email().optional(),
  customerGstin: z.string().max(20).optional(),
});

export const splitInvoiceSchema = z
  .object({
    mode: z.enum(['equal', 'item', 'custom']),
    equalCount: z.number().int().min(2).max(20).optional(),
    splits: z
      .array(
        z.object({
          label: z.string().min(1).max(40),
          amount: z.number().min(0).optional(),
          orderItemIds: z.array(mongoId()).optional(),
        }),
      )
      .optional(),
  })
  .refine(
    (v) => v.mode !== 'equal' || (v.equalCount && v.equalCount >= 2),
    { message: 'equalCount required for mode=equal' },
  )
  .refine(
    (v) => v.mode === 'equal' || (v.splits && v.splits.length > 0),
    { message: 'splits required for item/custom mode' },
  );

export const applyDiscountSchema = z.object({
  amount: z.number().min(0),
});

export const voidInvoiceSchema = z.object({
  reason: z.string().min(3).max(300),
});

export const listInvoicesQuerySchema = z.object({
  paymentStatus: z.enum(['unpaid', 'partial', 'paid', 'refunded']).optional(),
  status: z.enum(['final', 'void']).optional(),
  channel: z.enum(['dine_in', 'window', 'assisted']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().max(80).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const idParamSchema = z.object({ id: mongoId() });
export const orderIdParamSchema = z.object({ id: mongoId() });

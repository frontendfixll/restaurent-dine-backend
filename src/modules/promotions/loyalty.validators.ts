import { z } from 'zod';
import { mongoId } from '@utils/zod';

export const updateLoyaltyConfigSchema = z
  .object({
    isActive: z.boolean(),
    earnRate: z.number().min(1).max(10000),
    redeemRate: z.number().min(0).max(100),
    minRedeem: z.number().int().min(0),
    maxRedeemPercent: z.number().min(0).max(100),
    earnOn: z.enum(['subtotal', 'grand']),
    excludeWhenDiscounted: z.boolean(),
    pointsExpiryDays: z.number().int().min(1),
    welcomeBonus: z.number().int().min(0).max(10000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' });

export const adjustPointsSchema = z.object({
  delta: z.number().int(),
  reason: z.string().min(3).max(300),
});

export const previewRedeemSchema = z.object({
  customerId: mongoId(),
  pointsRequested: z.number().int().positive(),
  billGrand: z.number().positive(),
});

export const customerIdParamSchema = z.object({ customerId: mongoId() });

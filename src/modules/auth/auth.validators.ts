import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone (use E.164 like +919812345678)');

export const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const staffVerify2faSchema = z.object({
  userId: z.string().min(8),
  code: z.string().regex(/^\d{4,8}$/),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

export const setup2faSchema = z.object({
  phone,
});

export const confirm2faSchema = z.object({
  phone,
  code: z.string().regex(/^\d{4,8}$/),
});

export const guestOtpRequestSchema = z.object({ phone });
export const guestOtpVerifySchema = z.object({
  phone,
  code: z.string().regex(/^\d{4,8}$/),
});

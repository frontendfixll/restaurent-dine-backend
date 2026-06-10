import rateLimit from 'express-rate-limit';

/**
 * Strict limiter for password-based endpoints — slows down credential stuffing.
 * 10 requests per 15 minutes per IP.
 */
export const authStrictLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } },
});

/**
 * OTP request limiter — prevents SMS-bombing.
 * 5 requests per 5 minutes per IP.
 */
export const otpRequestLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many OTP requests. Try again in a few minutes.' } },
});

/**
 * OTP verify limiter — prevents brute-force on the code.
 * 10 attempts per 5 minutes per IP.
 */
export const otpVerifyLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Public menu / guest endpoints. Generous but throttles scrapers.
 */
export const publicReadLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Public guest order placement — lower than menu since each call writes.
 */
export const guestWriteLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

/**
 * Webhook limiter — high ceiling since legitimate providers can burst.
 */
export const webhookLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

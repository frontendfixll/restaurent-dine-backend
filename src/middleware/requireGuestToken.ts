import { NextFunction, Request, Response } from 'express';
import { verifyGuestToken } from '@modules/auth/token.service';
import { AppError } from '@utils/AppError';

declare module 'express-serve-static-core' {
  interface Request {
    guest?: { phone: string };
  }
}

export function requireGuestToken(req: Request, _res: Response, next: NextFunction) {
  try {
    const header =
      (req.headers['x-guest-token'] as string | undefined) ??
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice('Bearer '.length).trim()
        : undefined);
    if (!header) throw AppError.unauthorized('Missing guest token (verify OTP first)');
    const decoded = verifyGuestToken(header);
    req.guest = { phone: decoded.phone };
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(AppError.unauthorized('Invalid or expired guest token'));
  }
}

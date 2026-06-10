import { Request, Response } from 'express';
import { ok } from '@utils/apiResponse';
import { asyncHandler } from '@utils/asyncHandler';
import * as svc from './auth.service';
import { AppError } from '@utils/AppError';

function ipOf(req: Request) {
  return req.ip ?? (req.headers['x-forwarded-for'] as string | undefined);
}

export const staffLogin = asyncHandler(async (req: Request, res: Response) => {
  const result = await svc.staffLogin({
    email: req.body.email,
    password: req.body.password,
    ip: ipOf(req),
    userAgent: req.headers['user-agent'],
  });
  return ok(res, result);
});

export const staffVerify2fa = asyncHandler(async (req: Request, res: Response) => {
  const result = await svc.staffVerify2fa({
    userId: req.body.userId,
    code: req.body.code,
    ip: ipOf(req),
    userAgent: req.headers['user-agent'],
  });
  return ok(res, result);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const result = await svc.refreshSession(req.body.refreshToken);
  return ok(res, result);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await svc.logout(req.body?.refreshToken, req.user?.id);
  return ok(res, { ok: true });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  return ok(res, req.user);
});

export const setup2fa = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const result = await svc.setup2fa(req.user.id, req.body.phone);
  return ok(res, result);
});

export const confirm2fa = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  const result = await svc.confirm2faSetup(req.user.id, req.body.phone, req.body.code);
  return ok(res, result);
});

export const disable2fa = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  await svc.disable2fa(req.user.id);
  return ok(res, { disabled: true });
});

export const requestGuestOtp = asyncHandler(async (req: Request, res: Response) => {
  const result = await svc.requestGuestOtp(req.body.phone);
  return ok(res, result);
});

export const verifyGuestOtp = asyncHandler(async (req: Request, res: Response) => {
  const result = await svc.verifyGuestOtp(req.body.phone, req.body.code);
  return ok(res, result);
});

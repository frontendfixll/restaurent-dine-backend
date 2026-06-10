import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok } from '@utils/apiResponse';
import { AppError } from '@utils/AppError';
import * as svc from './restaurant.service';

export const getRestaurant = asyncHandler(async (_req: Request, res: Response) => {
  const r = await svc.getRestaurant();
  return ok(res, r);
});

export const updateRestaurant = asyncHandler(async (req: Request, res: Response) => {
  const r = await svc.updateRestaurant(
    req.body,
    req.user?.id,
    req.user?.email,
    req.user?.role.key,
  );
  return ok(res, r);
});

export const uploadLogo = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest('Missing "logo" file field');
  const result = await svc.uploadLogo(
    req.file.buffer,
    req.file.originalname,
    req.user?.id,
    req.user?.email,
    req.user?.role.key,
  );
  return ok(res, result);
});

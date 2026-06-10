import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '@utils/asyncHandler';
import { ok } from '@utils/apiResponse';
import * as svc from './loyalty.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const getConfig = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await svc.getConfig());
});

export const updateConfig = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.updateConfig(req.body, ctx(req)));
});

export const getAccount = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getAccount(req.params.customerId));
});

export const adjust = asyncHandler(async (req: Request, res: Response) => {
  return ok(
    res,
    await svc.adjustPoints(req.params.customerId, req.body.delta, req.body.reason, ctx(req)),
  );
});

export const preview = asyncHandler(async (req: Request, res: Response) => {
  const { customerId, pointsRequested, billGrand } = req.body;
  return ok(
    res,
    await svc.previewRedeem({
      customerId: new Types.ObjectId(customerId),
      pointsRequested,
      billGrand,
    }),
  );
});

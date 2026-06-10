import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, paginated, noContent } from '@utils/apiResponse';
import * as svc from './discount.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await svc.listDiscounts(
    req.query as Parameters<typeof svc.listDiscounts>[0],
  );
  return paginated(res, items, meta);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getDiscount(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.createDiscount(req.body, ctx(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.updateDiscount(req.params.id, req.body, ctx(req)));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteDiscount(req.params.id, ctx(req));
  return noContent(res);
});

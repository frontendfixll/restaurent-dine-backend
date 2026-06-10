import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, noContent } from '@utils/apiResponse';
import * as svc from './category.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const items = await svc.listCategories({
    includeInactive: (req.query as { includeInactive?: boolean }).includeInactive,
  });
  return ok(res, items);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getCategory(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.createCategory(req.body, ctx(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.updateCategory(req.params.id, req.body, ctx(req)));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteCategory(req.params.id, ctx(req));
  return noContent(res);
});

export const reorder = asyncHandler(async (req: Request, res: Response) => {
  await svc.reorderCategories(req.body.order, ctx(req));
  return ok(res, { reordered: req.body.order.length });
});

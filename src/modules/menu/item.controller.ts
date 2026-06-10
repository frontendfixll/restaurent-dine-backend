import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, paginated, noContent } from '@utils/apiResponse';
import { AppError } from '@utils/AppError';
import * as svc from './item.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await svc.listItems(req.query as svc.ListItemsOptions);
  return paginated(res, items, meta);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getItem(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.createItem(req.body, ctx(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.updateItem(req.params.id, req.body, ctx(req)));
});

export const toggle86 = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.toggle86(req.params.id, req.body.is86, ctx(req)));
});

export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest('Missing "image" file field');
  return ok(
    res,
    await svc.uploadItemImage(req.params.id, req.file.buffer, req.file.originalname, ctx(req)),
  );
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteItem(req.params.id, ctx(req));
  return noContent(res);
});

export const bulkPrice = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.bulkUpdatePrices(req.body.updates, ctx(req)));
});

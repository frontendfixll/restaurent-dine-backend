import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, paginated } from '@utils/apiResponse';
import * as svc from './customer.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await svc.listCustomers(req.query as svc.ListCustomersOpts);
  return paginated(res, items, meta);
});

export const lookup = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.lookupByPhone(req.body.phone));
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getCustomer(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.createCustomer(req.body, ctx(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.updateCustomer(req.params.id, req.body, ctx(req)));
});

export const addTag = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.addTag(req.params.id, req.body.tag, ctx(req)));
});

export const removeTag = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.removeTag(req.params.id, req.params.tag, ctx(req)));
});

export const history = asyncHandler(async (req: Request, res: Response) => {
  return ok(
    res,
    await svc.getHistory(req.params.id, req.query as Parameters<typeof svc.getHistory>[1]),
  );
});

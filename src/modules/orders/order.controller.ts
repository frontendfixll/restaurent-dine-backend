import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, paginated } from '@utils/apiResponse';
import * as svc from './order.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
  actorName: req.user?.name,
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await svc.listOrders(req.query as svc.ListOrdersOpts);
  return paginated(res, items, meta);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getOrder(req.params.id));
});

export const placeAssisted = asyncHandler(async (req: Request, res: Response) => {
  const order = await svc.placeAssistedOrder(req.body, ctx(req));
  return created(res, order);
});

export const addItems = asyncHandler(async (req: Request, res: Response) => {
  const order = await svc.addItemsToOrder(req.params.id, req.body.items, ctx(req));
  return ok(res, order);
});

export const accept = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.acceptOrder(req.params.id, ctx(req)));
});

export const voidItem = asyncHandler(async (req: Request, res: Response) => {
  const order = await svc.voidItem(req.params.id, req.params.itemId, req.body.reason, ctx(req));
  return ok(res, order);
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.cancelOrder(req.params.id, req.body.reason, ctx(req)));
});

export const serve = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.markServed(req.params.id, ctx(req)));
});

export const tokenScan = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.markPickedUp(req.body.windowToken, ctx(req)));
});

export const resolveRequest = asyncHandler(async (req: Request, res: Response) => {
  const r = await svc.resolveGuestRequest(req.params.id, req.params.requestId, ctx(req));
  return ok(res, r);
});

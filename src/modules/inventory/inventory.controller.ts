import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, paginated, noContent } from '@utils/apiResponse';
import * as svc from './inventory.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
  actorName: req.user?.name,
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await svc.listInventory(req.query as Parameters<typeof svc.listInventory>[0]);
  return paginated(res, items, meta);
});

export const lowStock = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await svc.listLowStock());
});

export const snapshot = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await svc.buildSnapshot());
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getInventoryItem(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.createInventoryItem(req.body, ctx(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.updateInventoryItem(req.params.id, req.body, ctx(req)));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteInventoryItem(req.params.id, ctx(req));
  return noContent(res);
});

export const stockIn = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.stockIn(req.params.id, req.body, ctx(req)));
});

export const stockOut = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.stockOut(req.params.id, req.body, ctx(req)));
});

export const adjust = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.adjustStock(req.params.id, req.body.delta, req.body.reason, ctx(req)));
});

export const movements = asyncHandler(async (req: Request, res: Response) => {
  const q = { ...(req.query as Parameters<typeof svc.listMovements>[0]), inventoryItemId: req.params.id };
  const { items, meta } = await svc.listMovements(q);
  return paginated(res, items, meta);
});

export const allMovements = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await svc.listMovements(
    req.query as Parameters<typeof svc.listMovements>[0],
  );
  return paginated(res, items, meta);
});

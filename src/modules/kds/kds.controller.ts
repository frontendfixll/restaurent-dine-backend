import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok } from '@utils/apiResponse';
import * as svc from './kds.service';
import { updateItemStatus } from '@modules/orders/order.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
  actorName: req.user?.name,
});

export const queue = asyncHandler(async (req: Request, res: Response) => {
  const station = (req.query as { station?: string }).station;
  return ok(res, await svc.getQueue(station));
});

export const snapshot = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await svc.snapshot());
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const { orderId, itemId } = req.params;
  const { status, station } = req.body;
  const order = await updateItemStatus(orderId, itemId, status, station, ctx(req));
  return ok(res, { id: String(order._id), status: order.status });
});

export const recall = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.recall(req.params.orderId));
});

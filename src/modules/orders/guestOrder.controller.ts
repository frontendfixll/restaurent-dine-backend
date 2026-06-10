import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created } from '@utils/apiResponse';
import { AppError } from '@utils/AppError';
import * as svc from './order.service';
import { toGuestDTO } from './order.service';

export const placeDineIn = asyncHandler(async (req: Request, res: Response) => {
  const order = await svc.placeDineInOrder(req.body);
  return created(res, toGuestDTO(order));
});

export const placeWindow = asyncHandler(async (req: Request, res: Response) => {
  if (!req.guest?.phone) throw AppError.unauthorized('Guest token required');
  const order = await svc.placeWindowOrder(req.body, req.guest.phone);
  return created(res, toGuestDTO(order));
});

export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const order = await svc.getOrder(req.params.id);
  return ok(res, {
    id: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    windowToken: order.windowToken,
    estimatedPrepMinutes: order.estimatedPrepMinutes,
    items: order.items.map((i) => ({
      id: String(i._id),
      name: i.name,
      qty: i.qty,
      status: i.status,
    })),
    totals: order.totals,
  });
});

export const sendRequest = asyncHandler(async (req: Request, res: Response) => {
  const r = await svc.addGuestRequest(req.params.id, req.body.type, req.body.message);
  return created(res, r);
});

export const addItems = asyncHandler(async (req: Request, res: Response) => {
  const order = await svc.addItemsToOrder(req.params.id, req.body.items, {});
  return ok(res, toGuestDTO(order));
});

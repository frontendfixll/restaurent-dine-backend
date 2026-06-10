import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, paginated, noContent } from '@utils/apiResponse';
import { AppError } from '@utils/AppError';
import * as svc from './coupon.service';
import { OrderModel } from '@modules/orders/order.model';
import { buildDiscountContext } from './promotions.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await svc.listCoupons(req.query as Parameters<typeof svc.listCoupons>[0]);
  return paginated(res, items, meta);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getCoupon(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.createCoupon(req.body, ctx(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.updateCoupon(req.params.id, req.body, ctx(req)));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteCoupon(req.params.id, ctx(req));
  return noContent(res);
});

export const validate = asyncHandler(async (req: Request, res: Response) => {
  const order = await OrderModel.findById(req.body.orderId);
  if (!order) throw AppError.notFound('Order not found');
  const context = await buildDiscountContext(order);
  const result = await svc.validateCoupon({
    code: req.body.code,
    customerPhone: order.guestPhone,
    customerId: order.customerId ? String(order.customerId) : undefined,
    context,
  });
  return ok(res, result);
});

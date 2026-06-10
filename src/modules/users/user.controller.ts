import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, paginated, noContent } from '@utils/apiResponse';
import * as svc from './user.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const user = await svc.createUser(req.body, req.user?.id);
  return created(res, user);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await svc.listUsers(req.query as svc.ListUsersOptions);
  return paginated(res, items, meta);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const user = await svc.getUserById(req.params.id);
  return ok(res, user);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const user = await svc.updateUser(req.params.id, req.body, req.user?.id);
  return ok(res, user);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteUser(req.params.id, req.user?.id);
  return noContent(res);
});

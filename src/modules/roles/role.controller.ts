import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, noContent } from '@utils/apiResponse';
import * as svc from './role.service';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const items = await svc.listRoles();
  return ok(res, items);
});

export const permissions = asyncHandler(async (_req: Request, res: Response) => {
  const data = await svc.listPermissionRegistry();
  return ok(res, data);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const role = await svc.getRole(req.params.id);
  return ok(res, role);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const role = await svc.createRole(req.body, req.user?.id);
  return created(res, role);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const role = await svc.updateRole(req.params.id, req.body, req.user?.id);
  return ok(res, role);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteRole(req.params.id, req.user?.id);
  return noContent(res);
});

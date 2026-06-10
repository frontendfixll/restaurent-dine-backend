import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, noContent } from '@utils/apiResponse';
import * as svc from './modifierGroup.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const list = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await svc.listModifierGroups());
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getModifierGroup(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.createModifierGroup(req.body, ctx(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.updateModifierGroup(req.params.id, req.body, ctx(req)));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteModifierGroup(req.params.id, ctx(req));
  return noContent(res);
});

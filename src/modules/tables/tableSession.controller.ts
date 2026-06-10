import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created } from '@utils/apiResponse';
import * as svc from './tableSession.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const open = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.openSession(req.body, ctx(req)));
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getSession(req.params.id));
});

export const close = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.closeSession(req.params.id, ctx(req)));
});

export const listOpen = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await svc.listOpenSessions());
});

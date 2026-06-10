import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, paginated } from '@utils/apiResponse';
import { AppError } from '@utils/AppError';
import * as svc from './cashSession.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
  actorName: req.user?.name,
});

export const open = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.openSession(req.body, ctx(req)));
});

export const close = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.closeSession(req.params.id, req.body, ctx(req)));
});

export const current = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw AppError.unauthorized();
  return ok(res, await svc.getCurrentSession(req.user.id));
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await svc.listSessions(
    req.query as Parameters<typeof svc.listSessions>[0],
  );
  return paginated(res, items, meta);
});

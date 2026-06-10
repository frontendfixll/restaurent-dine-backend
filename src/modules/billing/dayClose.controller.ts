import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok } from '@utils/apiResponse';
import { buildDayClose, recordDayClose } from './dayClose.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
  actorName: req.user?.name,
});

export const preview = asyncHandler(async (req: Request, res: Response) => {
  const date = (req.query as { date?: string }).date
    ? new Date((req.query as { date?: string }).date as string)
    : new Date();
  return ok(res, await buildDayClose(date));
});

export const close = asyncHandler(async (req: Request, res: Response) => {
  const date = (req.body as { date?: string }).date
    ? new Date((req.body as { date?: string }).date as string)
    : new Date();
  return ok(res, await recordDayClose(date, ctx(req)));
});

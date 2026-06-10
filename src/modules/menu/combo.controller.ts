import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, noContent } from '@utils/apiResponse';
import { AppError } from '@utils/AppError';
import * as svc from './combo.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const list = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await svc.listCombos());
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getCombo(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.createCombo(req.body, ctx(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.updateCombo(req.params.id, req.body, ctx(req)));
});

export const toggle86 = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.toggleCombo86(req.params.id, req.body.is86, ctx(req)));
});

export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest('Missing "image" file field');
  return ok(
    res,
    await svc.uploadComboImage(req.params.id, req.file.buffer, req.file.originalname, ctx(req)),
  );
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteCombo(req.params.id, ctx(req));
  return noContent(res);
});

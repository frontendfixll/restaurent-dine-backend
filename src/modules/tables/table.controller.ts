import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, noContent } from '@utils/apiResponse';
import * as svc from './table.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Parameters<typeof svc.listTables>[0];
  return ok(res, await svc.listTables(q));
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getTable(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.createTable(req.body, ctx(req)));
});

export const bulkCreate = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.bulkCreateTables(req.body, ctx(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.updateTable(req.params.id, req.body, ctx(req)));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteTable(req.params.id, ctx(req));
  return noContent(res);
});

export const transition = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.transitionStatus(req.params.id, req.body.status, ctx(req)));
});

export const merge = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.mergeTables(req.params.id, req.body.secondaryIds, ctx(req)));
});

export const split = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.splitTables(req.params.id, ctx(req)));
});

export const move = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.moveSession(req.params.id, req.body.toTableId, ctx(req)));
});

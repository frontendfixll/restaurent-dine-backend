import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, paginated, noContent } from '@utils/apiResponse';
import * as tpl from './template.service';
import * as log from './log.service';
import { dispatchNotification } from './notification.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const events = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await tpl.listEvents());
});

export const listTemplates = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await tpl.listTemplates(req.query as Parameters<typeof tpl.listTemplates>[0]));
});

export const getTemplate = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await tpl.getTemplate(req.params.id));
});

export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await tpl.createTemplate(req.body, ctx(req)));
});

export const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await tpl.updateTemplate(req.params.id, req.body, ctx(req)));
});

export const deleteTemplate = asyncHandler(async (req: Request, res: Response) => {
  await tpl.deleteTemplate(req.params.id, ctx(req));
  return noContent(res);
});

export const preview = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await tpl.previewTemplate(req.body));
});

export const testSend = asyncHandler(async (req: Request, res: Response) => {
  const result = await dispatchNotification({
    eventKey: req.body.eventKey,
    channel: req.body.channel,
    to: req.body.to,
    payload: req.body.payload,
    triggeredById: req.user?.id,
  });
  return ok(res, result);
});

export const listLogs = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await log.listLogs(req.query as log.ListLogsOpts);
  return paginated(res, items, meta);
});

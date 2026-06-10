import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, paginated } from '@utils/apiResponse';
import * as svc from './feedback.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
  actorName: req.user?.name,
});

export const submitGuest = asyncHandler(async (req: Request, res: Response) => {
  const feedback = await svc.submitFeedback(req.params.id, req.body);
  return created(res, {
    id: String(feedback._id),
    rating: feedback.rating,
    sentiment: feedback.sentiment,
    thanksMessage: 'Thanks for your feedback!',
  });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await svc.listFeedback(req.query as svc.ListFeedbackOpts);
  return paginated(res, items, meta);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getFeedback(req.params.id));
});

export const acknowledge = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.acknowledge(req.params.id, ctx(req)));
});

export const reply = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.replyToFeedback(req.params.id, req.body, ctx(req)));
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  return ok(
    res,
    await svc.getSummary(req.query as Parameters<typeof svc.getSummary>[0]),
  );
});

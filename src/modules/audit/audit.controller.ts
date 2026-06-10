import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { paginated } from '@utils/apiResponse';
import * as svc from './audit.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await svc.listAuditLogs(req.query as svc.ListAuditOptions);
  return paginated(res, items, meta);
});

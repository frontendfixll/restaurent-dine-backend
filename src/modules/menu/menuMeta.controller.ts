import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok } from '@utils/apiResponse';
import { AppError } from '@utils/AppError';
import { getPublicMenu } from './publicMenu.service';
import { importMenu, exportMenu } from './menuBulk.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const publicMenu = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as { lang?: string; channel?: 'dine_in' | 'window' };
  return ok(res, await getPublicMenu({ lang: query.lang, channel: query.channel }));
});

export const importHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest('Missing "file" upload field (csv/xlsx)');
  const summary = await importMenu(req.file.buffer, ctx(req));
  return ok(res, summary);
});

export const exportHandler = asyncHandler(async (_req: Request, res: Response) => {
  const buffer = await exportMenu();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="menu-export.csv"');
  res.send(buffer);
});

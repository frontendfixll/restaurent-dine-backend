import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok, created, noContent } from '@utils/apiResponse';
import { AppError } from '@utils/AppError';
import * as svc from './qrCode.service';
import { renderPng, renderSvg, renderPdf } from './qrRender.service';
import { getOrCreateRestaurant } from '@modules/restaurant/restaurant.service';

const ctx = (req: Request) => ({
  actorId: req.user?.id,
  actorEmail: req.user?.email,
  actorRole: req.user?.role.key,
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as Parameters<typeof svc.listQrCodes>[0];
  return ok(res, await svc.listQrCodes(q));
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getQr(req.params.id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.createQr(req.body, ctx(req)));
});

export const bulkCreate = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await svc.bulkCreateForTables(req.body, ctx(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.updateQr(req.params.id, req.body, ctx(req)));
});

export const regenerate = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.regenerateSlug(req.params.id, ctx(req)));
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await svc.deleteQr(req.params.id, ctx(req));
  return noContent(res);
});

export const analytics = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.getAnalytics(req.params.id));
});

async function buildRenderCtx(id: string) {
  const qr = await svc.getQr(id);
  const restaurant = await getOrCreateRestaurant();
  return {
    url: svc.targetUrlFor({ type: qr.type, slug: qr.slug }),
    label: qr.label,
    restaurantName: restaurant.brand.name,
  };
}

export const downloadPng = asyncHandler(async (req: Request, res: Response) => {
  const r = await buildRenderCtx(req.params.id);
  const buf = await renderPng(r);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="${r.label.replace(/\s+/g, '_')}.png"`);
  res.send(buf);
});

export const downloadSvg = asyncHandler(async (req: Request, res: Response) => {
  const r = await buildRenderCtx(req.params.id);
  const svg = await renderSvg(r);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Content-Disposition', `inline; filename="${r.label.replace(/\s+/g, '_')}.svg"`);
  res.send(svg);
});

export const downloadPdf = asyncHandler(async (req: Request, res: Response) => {
  const r = await buildRenderCtx(req.params.id);
  const buf = await renderPdf(r);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${r.label.replace(/\s+/g, '_')}.pdf"`);
  res.send(buf);
});

// Public redirect — no auth. Increments scan counter and 302 redirects.
export const publicRedirect = asyncHandler(async (req: Request, res: Response) => {
  const qr = await svc.recordScan(req.params.slug);
  if (!qr) throw AppError.notFound('QR code not found');
  return res.redirect(302, svc.resolveScanRedirect(qr));
});

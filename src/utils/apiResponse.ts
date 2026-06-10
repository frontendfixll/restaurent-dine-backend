import { Response } from 'express';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const ok = <T>(res: Response, data: T, status = 200) =>
  res.status(status).json({ success: true, data });

export const created = <T>(res: Response, data: T) => ok(res, data, 201);

export const paginated = <T>(res: Response, data: T[], meta: PageMeta) =>
  res.status(200).json({ success: true, data, meta });

export const noContent = (res: Response) => res.status(204).send();

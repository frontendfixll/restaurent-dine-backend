import { NextFunction, Request, Response } from 'express';
import { AppError } from '@utils/AppError';

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

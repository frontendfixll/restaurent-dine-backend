import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '@utils/AppError';
import { logger } from '@utils/logger';
import { config } from '@config/index';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    logger.warn({ reqId: req.id, code: err.code, message: err.message }, 'AppError');
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.flatten().fieldErrors,
      },
    });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Database validation failed',
        details: err.errors,
      },
    });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: `Invalid ${err.path}: ${err.value}` },
    });
  }

  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: number }).code === 11000
  ) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Duplicate key',
        details: (err as { keyValue?: unknown }).keyValue,
      },
    });
  }

  logger.error({ reqId: req.id, err }, 'Unhandled error');
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL',
      message: 'Internal server error',
      ...(config.isProd ? {} : { stack: err instanceof Error ? err.stack : String(err) }),
    },
  });
}

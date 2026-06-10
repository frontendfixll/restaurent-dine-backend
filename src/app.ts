import express, { Application, Request, RequestHandler, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import { config } from '@config/index';
import { requestId } from '@middleware/requestId';
import { httpLogger } from '@middleware/httpLogger';
import { notFound } from '@middleware/notFound';
import { errorHandler } from '@middleware/errorHandler';
import apiRoutes from './routes';
import qrRedirectRoutes from '@modules/qr/qrRedirect.routes';
import docsRoutes from '@/docs/docs.routes';

export function createApp(): Application {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(helmet() as unknown as RequestHandler);
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        // Stash raw body for HMAC verification (e.g. Razorpay webhook).
        (req as unknown as { rawBody?: Buffer }).rawBody = buf;
      },
    }) as unknown as RequestHandler,
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }) as unknown as RequestHandler);
  app.use(mongoSanitize());
  app.use(httpLogger as unknown as RequestHandler);

  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        env: config.env,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Public QR redirect — what a scanned QR code resolves to.
  app.use('/r', qrRedirectRoutes);

  // Interactive API docs (Swagger UI + raw spec at /docs/openapi.json).
  app.use('/docs', docsRoutes);

  app.use(config.apiPrefix, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

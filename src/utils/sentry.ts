import { logger } from './logger';

let initialized = false;

/**
 * Optional Sentry integration. Only initialized if SENTRY_DSN is set.
 * Loaded via dynamic import so projects without Sentry don't pull it in.
 */
export async function initSentry(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || initialized) return;
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    });
    initialized = true;
    logger.info('Sentry initialized');
  } catch (err) {
    logger.warn({ err }, 'Failed to initialize Sentry — install @sentry/node to enable');
  }
}

export async function captureException(err: unknown, context?: Record<string, unknown>): Promise<void> {
  if (!initialized) return;
  try {
    const Sentry = await import('@sentry/node');
    Sentry.withScope((scope) => {
      if (context) scope.setContext('app', context);
      Sentry.captureException(err);
    });
  } catch {
    /* swallow */
  }
}

import http from 'http';
import { createApp } from './app';
import { config } from '@config/index';
import { connectDatabase, disconnectDatabase } from '@db/connect';
import { logger } from '@utils/logger';
import { initSockets } from '@sockets/index';
import { initSentry, captureException } from '@utils/sentry';
import { startScheduler, stopScheduler } from '@jobs/scheduler';

async function bootstrap() {
  await initSentry();
  await connectDatabase();

  const app = createApp();
  const httpServer = http.createServer(app);
  initSockets(httpServer);

  try {
    await startScheduler();
  } catch (err) {
    logger.error({ err }, 'Scheduler failed to start — continuing without it');
  }

  httpServer.listen(config.port, () => {
    logger.info(
      `SmartDine API listening on http://localhost:${config.port} (env=${config.env}, prefix=${config.apiPrefix})`,
    );
    logger.info(`Docs: http://localhost:${config.port}/docs`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    httpServer.close(async () => {
      try {
        await stopScheduler();
      } catch (err) {
        logger.warn({ err }, 'Failed to stop scheduler cleanly');
      }
      await disconnectDatabase();
      logger.info('Bye.');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forcing shutdown after 10s');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandledRejection');
    void captureException(reason);
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException');
    void captureException(err);
    process.exit(1);
  });
}

void bootstrap();

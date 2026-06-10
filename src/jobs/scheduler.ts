import Agenda from 'agenda';
import { config } from '@config/index';
import { logger } from '@utils/logger';
import { defineDailySummaryJob } from './dailySummary.job';
import { defineCleanupJobs } from './cleanup.job';

let agenda: Agenda | null = null;

export async function startScheduler(): Promise<Agenda> {
  if (agenda) return agenda;
  agenda = new Agenda({
    db: { address: config.mongo.uri, collection: 'agendaJobs' },
    processEvery: '1 minute',
    defaultLockLifetime: 10 * 60_000,
  });

  agenda.on('start', (job) => logger.debug({ name: job.attrs.name }, 'job started'));
  agenda.on('success', (job) => logger.debug({ name: job.attrs.name }, 'job succeeded'));
  agenda.on('fail', (err, job) => logger.error({ name: job.attrs.name, err }, 'job failed'));

  defineDailySummaryJob(agenda);
  defineCleanupJobs(agenda);

  await agenda.start();

  // Schedule recurring jobs (idempotent — agenda dedupes by name+nextRunAt)
  await agenda.every('30 23 * * *', 'daily-summary-email');
  await agenda.every('0 * * * *', 'cleanup-expired-sessions');

  logger.info('Agenda scheduler started');
  return agenda;
}

export async function stopScheduler(): Promise<void> {
  if (!agenda) return;
  await agenda.stop();
  agenda = null;
}

export function getAgenda(): Agenda | null {
  return agenda;
}

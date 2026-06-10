import Agenda from 'agenda';
import { SessionModel } from '@modules/auth/session.model';
import { OtpModel } from '@modules/auth/otp.model';
import { logger } from '@utils/logger';

export function defineCleanupJobs(agenda: Agenda) {
  agenda.define('cleanup-expired-sessions', async () => {
    const now = new Date();
    const sessionRes = await SessionModel.deleteMany({
      $or: [{ expiresAt: { $lt: now } }, { revokedAt: { $lt: new Date(now.getTime() - 7 * 86_400_000) } }],
    });
    const otpRes = await OtpModel.deleteMany({ expiresAt: { $lt: now } });
    logger.info({ sessions: sessionRes.deletedCount, otps: otpRes.deletedCount }, 'cleanup complete');
  });
}

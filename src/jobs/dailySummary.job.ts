import Agenda from 'agenda';
import { buildDayClose } from '@modules/billing/dayClose.service';
import { getOrCreateRestaurant } from '@modules/restaurant/restaurant.service';
import { dispatchNotification } from '@modules/notifications/notification.service';
import { logger } from '@utils/logger';

export function defineDailySummaryJob(agenda: Agenda) {
  agenda.define('daily-summary-email', async () => {
    const summary = await buildDayClose(new Date());
    const restaurant = await getOrCreateRestaurant();
    if (!restaurant.brand.contactEmail) {
      logger.warn('daily-summary-email: restaurant has no contactEmail; skipping');
      return;
    }
    const topItem = summary.topItems[0]?.name ?? '—';
    const cashVariance = summary.cashSessions.openSessions.reduce((s, c) => s + (c.expectedCash || 0), 0);

    await dispatchNotification({
      eventKey: 'daily.summary.owner',
      channel: 'email',
      to: restaurant.brand.contactEmail,
      payload: {
        restaurantName: restaurant.brand.name,
        date: summary.date,
        grossSales: summary.sales.gross,
        orderCount: summary.orderCounts.total,
        topItem,
        netCollections: summary.payments.total,
        cashVariance,
      },
    });
  });
}

/**
 * Registry of supported notification events. Each event declares the variables
 * its template can interpolate, so the template editor UI can offer hints and
 * so unrecognized vars fail loudly during preview.
 */

export type NotificationChannel = 'sms' | 'whatsapp' | 'email' | 'push';
export type NotificationAudience = 'customer' | 'staff' | 'owner';

export interface NotificationEventDef {
  key: string;
  description: string;
  audience: NotificationAudience;
  channels: NotificationChannel[];
  variables: string[];
}

export const NOTIFICATION_EVENTS: NotificationEventDef[] = [
  {
    key: 'order.placed.guest',
    description: 'Sent to guest immediately after their order is placed.',
    audience: 'customer',
    channels: ['sms', 'whatsapp'],
    variables: ['restaurantName', 'orderNumber', 'channel', 'tableNumber', 'windowToken', 'grand', 'estimatedPrepMinutes'],
  },
  {
    key: 'order.ready.window',
    description: 'Window-order pickup notification.',
    audience: 'customer',
    channels: ['sms', 'whatsapp'],
    variables: ['restaurantName', 'windowToken', 'orderNumber'],
  },
  {
    key: 'order.settled.guest',
    description: 'Bill copy / settled receipt to guest.',
    audience: 'customer',
    channels: ['sms', 'whatsapp', 'email'],
    variables: ['restaurantName', 'orderNumber', 'invoiceNumber', 'grand', 'amountInWords'],
  },
  {
    key: 'feedback.negative.manager',
    description: 'Alerts the manager when a negative rating comes in.',
    audience: 'staff',
    channels: ['sms', 'whatsapp', 'email'],
    variables: ['orderNumber', 'rating', 'text', 'customerPhone'],
  },
  {
    key: 'feedback.reply.customer',
    description: 'Manager reply back to a guest.',
    audience: 'customer',
    channels: ['sms', 'whatsapp', 'email'],
    variables: ['restaurantName', 'replyText', 'orderNumber'],
  },
  {
    key: 'inventory.low_stock.owner',
    description: 'Low stock alert for the owner.',
    audience: 'owner',
    channels: ['sms', 'whatsapp', 'email'],
    variables: ['itemName', 'currentStock', 'threshold', 'unit'],
  },
  {
    key: 'daily.summary.owner',
    description: 'End-of-day summary email to the owner.',
    audience: 'owner',
    channels: ['email'],
    variables: [
      'restaurantName',
      'date',
      'grossSales',
      'orderCount',
      'topItem',
      'netCollections',
      'cashVariance',
    ],
  },
  {
    key: 'bill.share.customer',
    description: 'Manually share an invoice with the customer.',
    audience: 'customer',
    channels: ['sms', 'whatsapp', 'email'],
    variables: ['restaurantName', 'invoiceNumber', 'grand', 'amountInWords'],
  },
];

export const EVENT_KEYS = NOTIFICATION_EVENTS.map((e) => e.key);

export function findEvent(key: string): NotificationEventDef | undefined {
  return NOTIFICATION_EVENTS.find((e) => e.key === key);
}

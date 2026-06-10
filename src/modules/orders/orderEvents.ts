import { getIo } from '@sockets/index';
import { logger } from '@utils/logger';

type StaffEvent =
  | 'order:new'
  | 'order:updated'
  | 'order:status_changed'
  | 'order:item_status_changed'
  | 'order:guest_request'
  | 'order:settled'
  | 'table:status_changed';

function safe(fn: () => void) {
  try {
    fn();
  } catch (err) {
    logger.debug({ err }, 'Skip order event broadcast');
  }
}

export function emitToStaff(event: StaffEvent, payload: unknown): void {
  safe(() => getIo().of('/staff').emit(event, payload));
}

export function emitToKdsStation(station: string, event: string, payload: unknown): void {
  safe(() => getIo().of('/kds').to(`station:${station}`).emit(event, payload));
}

export function emitToKdsAll(event: string, payload: unknown): void {
  safe(() => getIo().of('/kds').emit(event, payload));
}

export function emitToGuestOrder(orderId: string, event: string, payload: unknown): void {
  safe(() => getIo().of('/guest').to(`order:${orderId}`).emit(event, payload));
}

export function emitToNowServing(payload: unknown): void {
  safe(() => getIo().of('/now-serving').emit('window:update', payload));
}

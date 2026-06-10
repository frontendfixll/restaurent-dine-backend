import { getIo } from '@sockets/index';
import { logger } from '@utils/logger';

type MenuEvent =
  | 'menu:updated'
  | 'category:updated'
  | 'item:updated'
  | 'item:86_changed'
  | 'modifier_group:updated'
  | 'combo:updated'
  | 'combo:86_changed';

export function emitMenuEvent(event: MenuEvent, payload?: unknown): void {
  try {
    const io = getIo();
    io.of('/menu').emit(event, { event, payload, at: new Date().toISOString() });
    io.of('/staff').emit('menu:updated', { event, payload, at: new Date().toISOString() });
  } catch (err) {
    logger.debug({ err, event }, 'Skip menu event broadcast (sockets not ready)');
  }
}

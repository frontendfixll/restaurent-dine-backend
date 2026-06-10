import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { config } from '@config/index';
import { logger } from '@utils/logger';

let io: SocketServer | null = null;

export function initSockets(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: { origin: config.corsOrigin, credentials: true },
    transports: ['websocket', 'polling'],
  });

  io.of('/kds').on('connection', (socket: Socket) => {
    logger.info({ id: socket.id }, 'KDS socket connected');
    socket.on('station:join', (station: string) => socket.join(`station:${station}`));
    socket.on('disconnect', () => logger.info({ id: socket.id }, 'KDS socket disconnected'));
  });

  io.of('/staff').on('connection', (socket: Socket) => {
    logger.info({ id: socket.id }, 'Staff socket connected');
    socket.on('disconnect', () => logger.info({ id: socket.id }, 'Staff socket disconnected'));
  });

  io.of('/guest').on('connection', (socket: Socket) => {
    const { orderId } = socket.handshake.query;
    if (typeof orderId === 'string') socket.join(`order:${orderId}`);
  });

  io.of('/now-serving').on('connection', (socket: Socket) => {
    logger.info({ id: socket.id }, 'Now-serving board connected');
  });

  io.of('/menu').on('connection', (socket: Socket) => {
    logger.debug({ id: socket.id }, 'Menu listener connected');
  });

  return io;
}

export function getIo(): SocketServer {
  if (!io) throw new Error('Socket.IO not initialized — call initSockets first');
  return io;
}

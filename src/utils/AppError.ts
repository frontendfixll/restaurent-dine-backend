export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'SERVICE_UNAVAILABLE';

const codeToStatus: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
};

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly status: number;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = codeToStatus[code];
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new AppError('BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Unauthorized', details?: unknown) {
    return new AppError('UNAUTHORIZED', message, details);
  }
  static forbidden(message = 'Forbidden', details?: unknown) {
    return new AppError('FORBIDDEN', message, details);
  }
  static notFound(message = 'Not found', details?: unknown) {
    return new AppError('NOT_FOUND', message, details);
  }
  static conflict(message = 'Conflict', details?: unknown) {
    return new AppError('CONFLICT', message, details);
  }
  static unprocessable(message = 'Unprocessable entity', details?: unknown) {
    return new AppError('UNPROCESSABLE', message, details);
  }
  static internal(message = 'Internal server error', details?: unknown) {
    return new AppError('INTERNAL', message, details);
  }
}

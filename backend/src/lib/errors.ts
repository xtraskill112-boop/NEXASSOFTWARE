export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(entity = 'Resource') {
    return new AppError(404, 'NOT_FOUND', `${entity} not found`);
  }
  static conflict(message: string, details?: unknown) {
    return new AppError(409, 'CONFLICT', message, details);
  }
  static insufficientStock(details: { available: number; requested: number; productId: string; warehouseId: string }) {
    return new AppError(
      409,
      'INSUFFICIENT_STOCK',
      `Insufficient stock: requested ${details.requested}, only ${details.available} available`,
      details,
    );
  }
}

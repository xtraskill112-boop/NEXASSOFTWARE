import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { env } from '../config/env';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

function send(res: Response, status: number, body: ErrorBody) {
  res.status(status).json(body);
}

export function notFoundHandler(req: Request, res: Response) {
  send(res, 404, { error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return send(res, err.status, { error: { code: err.code, message: err.message, details: err.details } });
  }

  if (err instanceof ZodError) {
    return send(res, 400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = (err.meta?.target as string[] | string | undefined) ?? 'field';
        const fields = Array.isArray(target) ? target.join(', ') : target;
        return send(res, 409, { error: { code: 'CONFLICT', message: `A record with this ${fields} already exists` } });
      }
      case 'P2025':
        return send(res, 404, { error: { code: 'NOT_FOUND', message: 'Resource not found' } });
      case 'P2003':
        return send(res, 409, {
          error: { code: 'CONFLICT', message: 'Operation conflicts with related records' },
        });
      case 'P2034':
        return send(res, 409, {
          error: { code: 'CONFLICT', message: 'Concurrent update detected. Please retry the operation.' },
        });
      case 'P2010': {
        // Raw query failure: surface CHECK constraint violations (e.g. negative stock) as conflicts.
        const pgCode = (err.meta as { code?: string } | undefined)?.code;
        if (pgCode === '23514') {
          return send(res, 409, { error: { code: 'INSUFFICIENT_STOCK', message: 'Stock cannot become negative' } });
        }
        break;
      }
      default:
        break;
    }
  }

  // Body parser errors (malformed JSON, payload too large)
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const e = err as { type?: string; status?: number };
    if (e.type === 'entity.parse.failed') {
      return send(res, 400, { error: { code: 'BAD_REQUEST', message: 'Malformed JSON request body' } });
    }
    if (e.type === 'entity.too.large') {
      return send(res, 413, { error: { code: 'BAD_REQUEST', message: 'Request body is too large' } });
    }
  }

  if (env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.error('[unhandled error]', err);
  }
  return send(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}

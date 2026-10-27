import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` },
  });
};

interface MongoDuplicateError {
  code: number;
  keyValue?: Record<string, unknown>;
}

const isDuplicateKey = (err: unknown): err is MongoDuplicateError =>
  typeof err === 'object' && err !== null && (err as MongoDuplicateError).code === 11000;

/** Central error handler: never leaks stack traces or internals to clients. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  if (isDuplicateKey(err)) {
    res.status(409).json({
      error: {
        code: 'DUPLICATE_KEY',
        message: `Duplicate value for ${Object.keys(err.keyValue ?? {}).join(', ') || 'unique field'}`,
        details: err.keyValue,
      },
    });
    return;
  }
  if (err?.name === 'CastError' || err?.name === 'ValidationError') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid data supplied' } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } });
    return;
  }

  logger.error({ err, path: req.originalUrl }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};

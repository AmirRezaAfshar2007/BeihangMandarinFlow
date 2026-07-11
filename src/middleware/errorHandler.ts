import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.ts';
import { env } from '../config/env.ts';

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Must keep all 4 params (err, req, res, next) — Express identifies error
// middleware by function arity.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  // Mongoose duplicate-key error (e.g. re-registering a studentId under a race).
  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    return res.status(409).json({ error: 'This record already exists.' });
  }

  // Mongoose validation error.
  if (err instanceof Error && err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error.',
    // Never leak stack traces / internals to clients in production.
    ...(env.isProduction ? {} : { detail: err instanceof Error ? err.message : String(err) }),
  });
}

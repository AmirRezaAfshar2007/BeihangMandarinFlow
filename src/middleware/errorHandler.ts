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

  // Mongoose CastError — a malformed id/query value reached a database query.
  // Treated as "not found" rather than a server fault: it is bad input, and the
  // services already answer 404 for ids that don't exist, so a junk id looking
  // identical to a missing one avoids confirming anything to a prober.
  if (err instanceof Error && err.name === 'CastError') {
    return res.status(404).json({ error: 'Not found.' });
  }

  // The database is unreachable or still selecting a server. Reporting 503 (not
  // 500) matters at pilot scale: it tells the client the request is worth
  // retrying, which is exactly right for the transient Atlas hiccups and
  // free-tier idle disconnects this deployment will actually see.
  if (
    err instanceof Error &&
    (err.name === 'MongoServerSelectionError' ||
      err.name === 'MongooseServerSelectionError' ||
      err.name === 'MongoNetworkError')
  ) {
    console.error('[error] Database unavailable:', err.message);
    return res
      .status(503)
      .json({ error: 'The service is temporarily unable to reach its database. Please try again shortly.' });
  }

  // body-parser rejects an oversized or malformed JSON body by throwing a plain
  // error tagged with a `type`. Without this branch an over-limit upload — e.g.
  // a very long voice recording — came back as a bare 500 "Internal server
  // error.", which reads like a bug rather than a size limit.
  if (typeof err === 'object' && err !== null) {
    const parseErr = err as { type?: string; status?: number };
    if (parseErr.type === 'entity.too.large' || parseErr.status === 413) {
      return res.status(413).json({
        error: 'That request is too large to process. Please send a shorter recording.',
      });
    }
    if (parseErr.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'The request body was not valid JSON.' });
    }
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error.',
    // Never leak stack traces / internals to clients in production.
    ...(env.isProduction ? {} : { detail: err instanceof Error ? err.message : String(err) }),
  });
}

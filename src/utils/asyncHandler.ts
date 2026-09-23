import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRouteHandler<Req extends Request = Request> = (
  req: Req,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

/**
 * Express doesn't forward rejected promises from async handlers to
 * next(err) automatically. This wrapper catches them so the centralized
 * errorHandler middleware always runs (instead of the request hanging or
 * crashing the process on an unhandled rejection).
 */
export function asyncHandler<Req extends Request = Request>(
  fn: AsyncRouteHandler<Req>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
}

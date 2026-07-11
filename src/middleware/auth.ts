import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types/express.d.ts';
import { verifyAccessToken } from '../services/auth.service.ts';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';

export const requireAuth = asyncHandler<AuthRequest>(async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing token.');
  }

  const token = authHeader.slice('Bearer '.length);
  req.user = await verifyAccessToken(token);
  next();
});

export const requireAdmin = [
  requireAuth,
  (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenError('Admin access required.');
    }
    next();
  },
];

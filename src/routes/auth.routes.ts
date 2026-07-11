import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.ts';
import type { AuthRequest } from '../types/express.d.ts';
import { requireAuth } from '../middleware/auth.ts';
import { loginLimiter, sensitiveAuthLimiter } from '../middleware/rateLimit.ts';
import {
  assertValidStudentId,
  assertValidFullName,
  assertValidPassword,
} from '../utils/validators.ts';
import { AppError } from '../utils/errors.ts';
import * as authService from '../services/auth.service.ts';

const router = Router();

router.post(
  '/register',
  sensitiveAuthLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { studentId, fullName, password } = req.body ?? {};
    if (!studentId || !fullName || !password) {
      throw new AppError('Student ID, Full Name, and Password are required.', 400);
    }
    assertValidStudentId(studentId);
    assertValidFullName(fullName);
    assertValidPassword(password);

    const result = await authService.registerStudent(studentId, fullName.trim(), password);
    res.status(201).json(result);
  })
);

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { studentId, password } = req.body ?? {};
    if (!studentId || !password) {
      throw new AppError('Student ID and Password are required.', 400);
    }
    const result = await authService.loginStudent(studentId, password);
    res.json(result);
  })
);

router.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      await authService.logoutSession(authHeader.slice('Bearer '.length));
    }
    res.json({ success: true, message: 'You have been signed out successfully.' });
  })
);

router.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

router.post(
  '/forgot-password',
  sensitiveAuthLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { studentId, fullName, newPassword } = req.body ?? {};
    if (!studentId || !fullName || !newPassword) {
      throw new AppError(
        'Student ID, Full Name, and New Password are required for verification.',
        400
      );
    }
    assertValidPassword(newPassword);
    await authService.forgotPassword(studentId, fullName, newPassword);
    res.json({ message: 'Password has been successfully updated.' });
  })
);

export default router;

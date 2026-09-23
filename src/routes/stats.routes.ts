import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.ts';
import type { AuthRequest } from '../types/express.d.ts';
import { requireAuth } from '../middleware/auth.ts';
import { getStudentDashboardStats } from '../services/stats.service.ts';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const data = await getStudentDashboardStats(req.user!.studentId);
    res.json({
      studentId: req.user!.studentId,
      fullName: req.user!.fullName,
      ...data,
    });
  })
);

export default router;

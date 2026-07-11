import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.ts';
import type { AuthRequest } from '../types/express.d.ts';
import { requireAdmin } from '../middleware/auth.ts';
import { assertValidPassword } from '../utils/validators.ts';
import { AppError } from '../utils/errors.ts';
import { getAdminOverview } from '../services/stats.service.ts';
import * as adminService from '../services/admin.service.ts';

const router = Router();
router.use(requireAdmin);

router.get(
  '/overview',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.json(await getAdminOverview());
  })
);

router.post(
  '/students/reset-password',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { studentId, newPassword } = req.body ?? {};
    if (!studentId || !newPassword) {
      throw new AppError('Student ID and new password are required.', 400);
    }
    assertValidPassword(newPassword);
    await adminService.adminResetPassword(studentId, newPassword);
    res.json({ success: true, message: `Password for Student ${studentId} was successfully updated.` });
  })
);

router.post(
  '/students/toggle-status',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { studentId } = req.body ?? {};
    if (!studentId) {
      throw new AppError('Student ID is required.', 400);
    }
    const disabled = await adminService.adminToggleStatus(studentId);
    res.json({ success: true, disabled, message: 'Student status successfully changed.' });
  })
);

router.delete(
  '/students/:studentId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await adminService.adminDeleteStudent(req.params.studentId);
    res.json({
      success: true,
      message: `Student account ${req.params.studentId} and all associated data have been permanently purged.`,
    });
  })
);

export default router;

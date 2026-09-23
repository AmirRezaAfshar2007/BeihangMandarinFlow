import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.ts';
import type { AuthRequest } from '../types/express.d.ts';
import { requireAdmin } from '../middleware/auth.ts';
import {
  assertValidPassword,
  assertValidStudentId,
  assertValidFullName,
  parseCharacterListInput,
} from '../utils/validators.ts';
import { AppError } from '../utils/errors.ts';
import { getAdminOverview } from '../services/stats.service.ts';
import * as adminService from '../services/admin.service.ts';
import * as authService from '../services/auth.service.ts';

const router = Router();
router.use(requireAdmin);

router.get(
  '/overview',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.json(await getAdminOverview());
  })
);

/**
 * Creates a student account.
 *
 * This is the admin-only counterpart to the (now disabled) public sign-up
 * route. Account creation used to go through /api/auth/register, which meant
 * the administrative path shared the anonymous route's IP budget — fine while
 * a teacher made a handful of accounts, but throttled to ten per hour it made
 * onboarding a whole class take most of a day. It also meant no account could
 * be created at all once self-registration was switched off.
 */
router.post(
  '/students',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { studentId, fullName, password } = req.body ?? {};
    if (!studentId || !fullName || !password) {
      throw new AppError('Student ID, Full Name, and Password are required.', 400);
    }
    assertValidStudentId(studentId);
    assertValidFullName(fullName);
    assertValidPassword(password);

    const user = await authService.createStudentAccount(studentId.trim(), fullName.trim(), password);
    res.status(201).json({
      success: true,
      user,
      message: `Account for ${user.fullName} (${user.studentId}) was created successfully.`,
    });
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

router.post(
  '/broadcast-folder',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { folderName, description, category, color, icon, charactersText } = req.body ?? {};

    if (typeof folderName !== 'string' || folderName.trim().length < 1 || folderName.trim().length > 60) {
      throw new AppError('Folder name must be between 1 and 60 characters.', 400);
    }
    if (description !== undefined && (typeof description !== 'string' || description.length > 300)) {
      throw new AppError('Description must be a string of at most 300 characters.', 400);
    }
    if (category !== undefined && (typeof category !== 'string' || category.length > 40)) {
      throw new AppError('Category must be a string of at most 40 characters.', 400);
    }

    // Same parser handles a hand-typed textarea and a pasted-in CSV file's
    // text content — both are just comma/newline separated characters.
    const { valid, invalid } = parseCharacterListInput(charactersText);
    if (valid.length === 0) {
      throw new AppError(
        `None of the provided entries were valid single Chinese characters.${
          invalid.length ? ` Rejected: ${invalid.slice(0, 10).join(', ')}` : ''
        }`,
        400
      );
    }

    const result = await adminService.broadcastCharactersToStudents(
      { name: folderName, description, category, color, icon },
      valid
    );

    res.status(201).json({
      success: true,
      ...result,
      invalidEntries: invalid,
      message: `Folder "${folderName.trim()}" pushed to ${result.studentsAffected} student${
        result.studentsAffected === 1 ? '' : 's'
      }. ${result.charactersAddedTotal} character${result.charactersAddedTotal === 1 ? '' : 's'} newly added across all decks (${result.alreadyOwnedSkips} already owned were left untouched).`,
    });
  })
);

export default router;

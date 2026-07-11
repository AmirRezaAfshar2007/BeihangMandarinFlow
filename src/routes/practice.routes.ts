import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.ts';
import type { AuthRequest } from '../types/express.d.ts';
import { requireAuth } from '../middleware/auth.ts';
import { assertValidQuizMode, assertValidScore } from '../utils/validators.ts';
import { AppError } from '../utils/errors.ts';
import * as practiceService from '../services/practice.service.ts';

const router = Router();
router.use(requireAuth);

router.post(
  '/log',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { characterId, quizMode, score, durationSeconds } = req.body ?? {};
    if (!characterId) {
      throw new AppError('Missing practice results payload details.', 400);
    }
    assertValidQuizMode(quizMode);
    assertValidScore(score);

    const result = await practiceService.logPractice({
      studentId: req.user!.studentId,
      characterId,
      quizMode,
      score,
      durationSeconds: typeof durationSeconds === 'number' ? durationSeconds : undefined,
    });
    res.json(result);
  })
);

export default router;

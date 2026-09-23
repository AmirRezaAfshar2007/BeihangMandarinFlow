import { Response, Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.ts';
import type { AuthRequest } from '../types/express.d.ts';
import { requireAuth, requireAdmin } from '../middleware/auth.ts';
import { homeFeedbackLimiter } from '../middleware/rateLimit.ts';
import * as homeService from '../services/home.service.ts';

/**
 * Public landing page ("Home") API.
 *
 * Everything a visitor needs before signing in lives above the `requireAuth`
 * line below: the aggregate questionnaire totals and the questionnaire
 * submission itself. Only the analytics endpoint is admin-gated.
 */
const router = Router();

/* ------------------------------------------------------------------ */
/* Public — reachable without a session                                */
/* ------------------------------------------------------------------ */

/** Aggregate totals only — no per-respondent data ever leaves this route. */
router.get(
  '/',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.json(await homeService.getPublicFeedback());
  })
);

router.post(
  '/feedback',
  homeFeedbackLimiter,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await homeService.submitFeedback(req.body ?? {});
    res.status(201).json(result);
  })
);

/* ------------------------------------------------------------------ */
/* Admin — questionnaire analytics                                     */
/* ------------------------------------------------------------------ */

router.get(
  '/admin/feedback',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.json(await homeService.getFeedbackStats());
  })
);

export default router;

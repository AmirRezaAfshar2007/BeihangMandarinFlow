import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.ts';
import type { AuthRequest } from '../types/express.d.ts';
import { requireAuth } from '../middleware/auth.ts';
import { assertSingleHanzi } from '../utils/validators.ts';
import * as characterService from '../services/character.service.ts';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const chars = await characterService.listCharacters(req.user!.studentId);
    res.json(chars);
  })
);

router.post(
  '/add',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { character } = req.body ?? {};
    assertSingleHanzi(character);
    const newCharItem = await characterService.addCharacter(req.user!.studentId, character);
    res.status(201).json(newCharItem);
  })
);

router.delete(
  '/:charId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await characterService.deleteCharacter(req.user!.studentId, req.params.charId);
    res.json({ success: true, message: 'Character successfully removed from your training deck.' });
  })
);

export default router;

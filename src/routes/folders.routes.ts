import { Router, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.ts';
import type { AuthRequest } from '../types/express.d.ts';
import { requireAuth } from '../middleware/auth.ts';
import { AppError } from '../utils/errors.ts';
import * as folderService from '../services/folder.service.ts';

const router = Router();
router.use(requireAuth);

function assertValidFolderName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 60) {
    throw new AppError('Folder name must be between 1 and 60 characters.', 400);
  }
}

function assertValidOptionalText(value: unknown, field: string, maxLength: number) {
  if (value !== undefined && (typeof value !== 'string' || value.length > maxLength)) {
    throw new AppError(`${field} must be a string of at most ${maxLength} characters.`, 400);
  }
}

router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const folders = await folderService.listFolders(req.user!.studentId);
    res.json(folders);
  })
);

router.post(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, description, category, color, icon, customDate } = req.body ?? {};
    assertValidFolderName(name);
    assertValidOptionalText(description, 'Description', 300);
    assertValidOptionalText(category, 'Category', 40);

    const folder = await folderService.createFolder(req.user!.studentId, {
      name,
      description,
      category,
      color,
      icon,
      customDate,
    });
    res.status(201).json(folder);
  })
);

router.patch(
  '/:folderId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, description, category, color, icon, isFavorite, customDate } = req.body ?? {};
    if (name !== undefined) assertValidFolderName(name);
    assertValidOptionalText(description, 'Description', 300);
    assertValidOptionalText(category, 'Category', 40);

    const folder = await folderService.updateFolder(req.user!.studentId, req.params.folderId, {
      name,
      description,
      category,
      color,
      icon,
      isFavorite,
      customDate,
    });
    res.json(folder);
  })
);

router.delete(
  '/:folderId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await folderService.deleteFolder(req.user!.studentId, req.params.folderId);
    res.json({
      success: true,
      message: 'Folder deleted. Its characters were moved to Unfiled, not removed.',
    });
  })
);

router.post(
  '/assign',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { characterId, folderId } = req.body ?? {};
    if (typeof characterId !== 'string' || !characterId) {
      throw new AppError('characterId is required.', 400);
    }
    const character = await folderService.assignCharacterToFolder(
      req.user!.studentId,
      characterId,
      folderId ?? null
    );
    res.json(character);
  })
);

export default router;

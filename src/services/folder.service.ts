import { Types } from 'mongoose';
import { Folder } from '../models/Folder.ts';
import { Character } from '../models/Character.ts';
import { ConflictError, NotFoundError } from '../utils/errors.ts';

export interface FolderInput {
  name?: string;
  description?: string;
  category?: string;
  color?: string;
  icon?: string;
  isFavorite?: boolean;
  customDate?: string | null;
}

function serializeFolder(folder: any, characterCount: number) {
  return {
    ...folder,
    id: folder._id.toString(),
    _id: undefined,
    characterCount,
  };
}

export async function listFolders(studentId: string) {
  const folders = await Folder.find({ studentId }).sort({ createdAt: -1 }).lean();

  const counts = await Character.aggregate([
    { $match: { studentId, folderId: { $ne: null } } },
    { $group: { _id: '$folderId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map<string, number>(counts.map((c: any) => [c._id.toString(), c.count]));

  return folders.map((f: any) => serializeFolder(f, countMap.get(f._id.toString()) || 0));
}

export async function createFolder(studentId: string, data: FolderInput) {
  const name = (data.name ?? '').trim();

  const alreadyExists = await Folder.exists({ studentId, name });
  if (alreadyExists) {
    throw new ConflictError('You already have a folder with this name.');
  }

  const folder = await Folder.create({
    studentId,
    name,
    description: (data.description ?? '').trim(),
    category: (data.category ?? '').trim() || 'General',
    color: data.color || 'emerald',
    icon: data.icon || '📁',
    customDate: data.customDate ? new Date(data.customDate) : null,
  });

  return serializeFolder(folder.toObject(), 0);
}

export async function updateFolder(studentId: string, folderId: string, data: FolderInput) {
  if (!Types.ObjectId.isValid(folderId)) {
    throw new NotFoundError('Folder not found.');
  }

  if (data.name !== undefined) {
    const name = data.name.trim();
    const duplicate = await Folder.exists({ studentId, name, _id: { $ne: folderId } });
    if (duplicate) {
      throw new ConflictError('You already have a folder with this name.');
    }
  }

  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.description !== undefined) update.description = data.description.trim();
  if (data.category !== undefined) update.category = data.category.trim() || 'General';
  if (data.color !== undefined) update.color = data.color;
  if (data.icon !== undefined) update.icon = data.icon;
  if (data.isFavorite !== undefined) update.isFavorite = data.isFavorite;
  if (data.customDate !== undefined) update.customDate = data.customDate ? new Date(data.customDate) : null;

  const folder = await Folder.findOneAndUpdate({ _id: folderId, studentId }, update, {
    new: true,
  }).lean();
  if (!folder) {
    throw new NotFoundError('Folder not found.');
  }

  const characterCount = await Character.countDocuments({ studentId, folderId });
  return serializeFolder(folder, characterCount);
}

export async function deleteFolder(studentId: string, folderId: string) {
  if (!Types.ObjectId.isValid(folderId)) {
    throw new NotFoundError('Folder not found.');
  }

  const folder = await Folder.findOneAndDelete({ _id: folderId, studentId });
  if (!folder) {
    throw new NotFoundError('Folder not found.');
  }

  // Characters aren't deleted with their folder — they just fall back to Unfiled.
  await Character.updateMany({ studentId, folderId }, { $set: { folderId: null } });
}

export async function assignCharacterToFolder(
  studentId: string,
  charId: string,
  folderId: string | null
) {
  if (!Types.ObjectId.isValid(charId)) {
    throw new NotFoundError('Character not found in your learning deck.');
  }

  if (folderId) {
    if (!Types.ObjectId.isValid(folderId)) {
      throw new NotFoundError('Folder not found.');
    }
    const folderExists = await Folder.exists({ _id: folderId, studentId });
    if (!folderExists) {
      throw new NotFoundError('Folder not found.');
    }
  }

  const character = await Character.findOneAndUpdate(
    { _id: charId, studentId },
    { $set: { folderId: folderId || null } },
    { new: true }
  ).lean();

  if (!character) {
    throw new NotFoundError('Character not found in your learning deck.');
  }

  return { ...(character as any), id: (character as any)._id.toString() };
}

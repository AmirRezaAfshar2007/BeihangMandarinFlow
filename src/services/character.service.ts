import { Types } from 'mongoose';
import { Character } from '../models/Character.ts';
import { Folder } from '../models/Folder.ts';
import { Stats } from '../models/Stats.ts';
import { parseHanziWithSino3D } from './qwen.service.ts';
import { ConflictError, NotFoundError, AppError } from '../utils/errors.ts';
import { fetchAuthoritativeStrokeCount } from '../utils/hanziStroke.ts';

// Caps how many characters a single student can keep in their deck. Without
// this, one student could add characters indefinitely — inflating the
// database without limit and, since every add also triggers an AI dictionary
// lookup + stroke-count fetch (see addCharacter below), running up the AI
// bill the same way an unbounded speaking quota would. 200 is generous
// enough to never get in a genuinely studying student's way while still
// giving the database and AI cost a predictable ceiling per student.
export const MAX_CHARACTERS_PER_STUDENT = 200;

export interface CharacterUsage {
  used: number;
  limit: number;
  remaining: number;
}

export async function getCharacterUsage(studentId: string): Promise<CharacterUsage> {
  const used = await Character.countDocuments({ studentId });
  return {
    used,
    limit: MAX_CHARACTERS_PER_STUDENT,
    remaining: Math.max(0, MAX_CHARACTERS_PER_STUDENT - used),
  };
}

export async function listCharacters(studentId: string) {
  const chars = await Character.find({ studentId }).sort({ createdAt: -1 }).lean();
  return chars.map((c: any) => ({
    ...c,
    id: c._id.toString(),
  }));
}

export async function addCharacter(
  studentId: string,
  rawCharacter: string,
  folderId?: string | null
) {
  const character = rawCharacter.trim();

  // Reject before touching the duplicate check or the AI lookup at all if
  // this student's deck is already at the per-student cap — cheap rejection
  // instead of doing the expensive work first and discarding it (same
  // reasoning as assertUnderDailySpeakingLimit in speaking.service.ts).
  const usage = await getCharacterUsage(studentId);
  if (usage.remaining <= 0) {
    throw new AppError(
      `You've reached the maximum of ${MAX_CHARACTERS_PER_STUDENT} characters in your learning deck. Remove one before adding another.`,
      429
    );
  }

  const alreadyAdded = await Character.exists({ studentId, character });
  if (alreadyAdded) {
    throw new ConflictError('This character is already in your learning deck.');
  }

  let resolvedFolderId: string | null = null;
  if (folderId) {
    if (!Types.ObjectId.isValid(folderId)) {
      throw new NotFoundError('Folder not found.');
    }
    const folderExists = await Folder.exists({ _id: folderId, studentId });
    if (!folderExists) {
      throw new NotFoundError('Folder not found.');
    }
    resolvedFolderId = folderId;
  }

  // Run AI dictionary lookup and authoritative stroke count fetch in parallel
  // so we don't pay the CDN latency on top of the AI round-trip. The stroke
  // fetch is cached and time-bounded (see utils/hanziStroke.ts), so even when
  // the CDN is unreachable it gives up quickly and we fall back below instead
  // of leaving the "add character" request hanging.
  const [dictData, authoritativeStrokes] = await Promise.all([
    parseHanziWithSino3D(character),
    fetchAuthoritativeStrokeCount(character),
  ]);

  // Use the HanziWriter dataset as ground truth for stroke count when
  // available — it is curated data derived from authoritative sources and is
  // what the stroke-order animations are based on, so it must match exactly.
  // Fall back to the AI value only when the character is absent from the dataset.
  const finalStrokeCount =
    authoritativeStrokes !== null ? authoritativeStrokes : (dictData.strokeCount || 1);

  const newCharItem = await Character.create({
    studentId,
    character: dictData.character,
    simplified: dictData.simplified,
    traditional: dictData.traditional,
    pinyin: dictData.pinyin,
    englishMeaning: dictData.englishMeaning,
    persianMeaning: '',
    radicals: dictData.radicals?.length ? dictData.radicals : [character],
    strokeCount: finalStrokeCount,
    hskLevel: dictData.hskLevel || 1,
    frequencyRank: dictData.frequencyRank || 9999,
    exampleWords: dictData.exampleWords || [],
    exampleSentences: dictData.exampleSentences || [],
    audioPronunciation: '',
    lastReviewed: null,
    reviewCount: 0,
    learningLevel: 0,
    memoryStability: 10,
    interval: 1,
    nextReviewDate: new Date().toISOString().split('T')[0],
    folderId: resolvedFolderId,
  });

  // Reward XP for growing the deck.
  await Stats.updateOne({ studentId }, { $inc: { totalXp: 15 } });

  return {
    ...newCharItem.toObject(),
    id: newCharItem._id.toString(),
  };
}

export async function deleteCharacter(studentId: string, charId: string) {
  if (!Types.ObjectId.isValid(charId)) {
    throw new NotFoundError('Character not found in your learning deck.');
  }
  const result = await Character.deleteOne({ _id: charId, studentId });
  if (result.deletedCount === 0) {
    throw new NotFoundError('Character not found in your learning deck.');
  }
}

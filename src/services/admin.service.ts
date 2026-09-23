import bcrypt from 'bcryptjs';
import { User } from '../models/User.ts';
import { Character } from '../models/Character.ts';
import { Folder } from '../models/Folder.ts';
import { PracticeLog } from '../models/PracticeLog.ts';
import { Stats } from '../models/Stats.ts';
import { Achievement } from '../models/Achievement.ts';
import { Session } from '../models/Session.ts';
import { AppError, NotFoundError } from '../utils/errors.ts';
import { parseHanziWithSino3D } from './qwen.service.ts';
import { fetchAuthoritativeStrokeCount } from '../utils/hanziStroke.ts';

const BCRYPT_COST = 12;
// Dictionary lookups call an external AI service one character at a time, so
// this keeps only a few in flight at once — fast enough for a teacher's
// batch, gentle enough not to trip provider rate limits.
const LOOKUP_CONCURRENCY = 4;
// XP reward per character, kept identical to the student's own "add a
// character" action (character.service.ts) so a broadcast character is
// worth the same as one a student added themselves.
const XP_PER_CHARACTER = 15;

export async function adminResetPassword(studentId: string, newPassword: string) {
  const student = await User.findOne({ studentId });
  if (!student) {
    throw new NotFoundError('Student account not found.');
  }
  student.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await student.save();
  // Force re-login everywhere with the new password.
  await Session.deleteMany({ studentId });
}

export async function adminToggleStatus(studentId: string) {
  const student = await User.findOne({ studentId });
  if (!student) {
    throw new NotFoundError('Student account not found.');
  }
  if (student.role === 'admin') {
    throw new AppError('Cannot disable another administrator.', 400);
  }
  student.disabled = !student.disabled;
  await student.save();
  if (student.disabled) {
    // Kick any active sessions immediately on disable.
    await Session.deleteMany({ studentId });
  }
  return student.disabled;
}

export async function adminDeleteStudent(studentId: string) {
  const student = await User.findOne({ studentId });
  if (!student) {
    throw new NotFoundError('Student account not found.');
  }
  if (student.role === 'admin') {
    throw new AppError('Cannot delete an administrator account.', 400);
  }

  await Promise.all([
    User.deleteOne({ studentId }),
    Character.deleteMany({ studentId }),
    PracticeLog.deleteMany({ studentId }),
    Stats.deleteMany({ studentId }),
    Achievement.deleteMany({ studentId }),
    Session.deleteMany({ studentId }),
  ]);
}

export interface BroadcastFolderInput {
  name: string;
  description?: string;
  category?: string;
  color?: string;
  icon?: string;
}

export interface BroadcastResult {
  studentsAffected: number;
  charactersResolved: number;
  charactersAddedTotal: number;
  alreadyOwnedSkips: number;
  lookupFailures: string[];
}

/**
 * Pushes one shared folder into every student's account and drops a batch of
 * characters into it, all at once. Used by the admin panel's "broadcast"
 * feature (add-for-everyone) so a teacher doesn't have to add the same
 * character to each student's deck by hand.
 *
 * Deliberately non-destructive and idempotent-ish:
 * - If a student already has a folder with this exact name (their own, or
 *   from an earlier broadcast), it is reused as-is rather than overwritten —
 *   a second broadcast with the same folder name never clobbers a student's
 *   own edits to that folder.
 * - If a student already has one of the broadcast characters in their deck
 *   (in any folder), it is left untouched and just counted as skipped —
 *   broadcasting never duplicates or moves a student's existing card.
 * - Dictionary lookups happen once per unique character, not once per
 *   student, then are fanned out — the expensive part never repeats.
 */
export async function broadcastCharactersToStudents(
  folderInput: BroadcastFolderInput,
  characters: string[]
): Promise<BroadcastResult> {
  const folderName = folderInput.name.trim();
  if (!folderName || folderName.length > 60) {
    throw new AppError('Folder name must be between 1 and 60 characters.', 400);
  }
  if (characters.length === 0) {
    throw new AppError('Please provide at least one Chinese character.', 400);
  }

  // 1. Resolve dictionary data for each unique character exactly once,
  // regardless of how many students will receive it.
  const dictCache = new Map<string, { dictData: Awaited<ReturnType<typeof parseHanziWithSino3D>>; strokeCount: number }>();
  const lookupFailures: string[] = [];

  for (let i = 0; i < characters.length; i += LOOKUP_CONCURRENCY) {
    const batch = characters.slice(i, i + LOOKUP_CONCURRENCY);
    await Promise.all(
      batch.map(async (ch) => {
        try {
          const [dictData, authoritativeStrokes] = await Promise.all([
            parseHanziWithSino3D(ch),
            fetchAuthoritativeStrokeCount(ch),
          ]);
          dictCache.set(ch, {
            dictData,
            strokeCount: authoritativeStrokes !== null ? authoritativeStrokes : dictData.strokeCount || 1,
          });
        } catch {
          // A single character failing dictionary lookup (AI hiccup, rate
          // limit, truly obscure glyph) must never sink the whole batch —
          // it's reported back and simply excluded below.
          lookupFailures.push(ch);
        }
      })
    );
  }

  const resolvedCharacters = characters.filter((c) => dictCache.has(c));
  if (resolvedCharacters.length === 0) {
    throw new AppError(
      'None of the provided characters could be resolved by the dictionary lookup. Nothing was added.',
      422
    );
  }

  // 2. Every current student account is a broadcast target — including
  // disabled ones, so the content is already waiting if they're re-enabled.
  const students = await User.find({ role: 'student' }, { studentId: 1 }).lean();
  if (students.length === 0) {
    throw new AppError('There are no student accounts to broadcast to yet.', 400);
  }
  const studentIds = students.map((s) => s.studentId);

  // 3. Ensure every student has the folder, without touching it if it
  // already exists (see function doc comment above).
  await Promise.all(
    studentIds.map((studentId) =>
      Folder.findOneAndUpdate(
        { studentId, name: folderName },
        {
          $setOnInsert: {
            studentId,
            name: folderName,
            description: (folderInput.description ?? '').trim(),
            category: (folderInput.category ?? '').trim() || 'General',
            color: folderInput.color || 'emerald',
            icon: folderInput.icon || '📚',
            isFavorite: false,
            customDate: null,
          },
        },
        { upsert: true, new: true }
      )
    )
  );

  const folders = await Folder.find(
    { studentId: { $in: studentIds }, name: folderName },
    { studentId: 1, _id: 1 }
  ).lean();
  const folderIdByStudent = new Map(folders.map((f) => [f.studentId, f._id]));

  // 4. Skip any (student, character) pair the student already owns —
  // broadcasting must never duplicate or relocate an existing card.
  const existing = await Character.find(
    { studentId: { $in: studentIds }, character: { $in: resolvedCharacters } },
    { studentId: 1, character: 1 }
  ).lean();
  const existingKeys = new Set(existing.map((e) => `${e.studentId}\u0000${e.character}`));

  const today = new Date().toISOString().split('T')[0];
  const docsToInsert: Record<string, unknown>[] = [];
  let alreadyOwnedSkips = 0;

  for (const studentId of studentIds) {
    const folderId = folderIdByStudent.get(studentId) ?? null;
    for (const ch of resolvedCharacters) {
      if (existingKeys.has(`${studentId}\u0000${ch}`)) {
        alreadyOwnedSkips++;
        continue;
      }
      const cached = dictCache.get(ch)!;
      const { dictData, strokeCount } = cached;
      docsToInsert.push({
        studentId,
        character: dictData.character,
        simplified: dictData.simplified,
        traditional: dictData.traditional,
        pinyin: dictData.pinyin,
        englishMeaning: dictData.englishMeaning,
        persianMeaning: '',
        radicals: dictData.radicals?.length ? dictData.radicals : [ch],
        strokeCount,
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
        nextReviewDate: today,
        folderId,
      });
    }
  }

  let insertedDocs: Array<{ studentId: string }> = [];
  if (docsToInsert.length > 0) {
    try {
      insertedDocs = (await Character.insertMany(docsToInsert, { ordered: false })) as unknown as Array<{
        studentId: string;
      }>;
    } catch (err: any) {
      // ordered:false means independent inserts still succeed even if one
      // hits a duplicate-key race (e.g. the student added that exact
      // character themselves half a second earlier) — Mongoose reports the
      // successful ones on the error itself instead of throwing all-or-nothing.
      insertedDocs = Array.isArray(err?.insertedDocs) ? err.insertedDocs : [];
    }
  }

  // 5. Reward XP per character actually persisted (computed from what really
  // landed in the database, not what was planned, so a partial/raced insert
  // never over-credits a student).
  const addCountByStudent = new Map<string, number>();
  for (const doc of insertedDocs) {
    addCountByStudent.set(doc.studentId, (addCountByStudent.get(doc.studentId) || 0) + 1);
  }
  if (addCountByStudent.size > 0) {
    await Stats.bulkWrite(
      Array.from(addCountByStudent.entries()).map(([studentId, count]) => ({
        updateOne: {
          filter: { studentId },
          update: { $inc: { totalXp: count * XP_PER_CHARACTER } },
        },
      }))
    );
  }

  return {
    studentsAffected: studentIds.length,
    charactersResolved: resolvedCharacters.length,
    charactersAddedTotal: insertedDocs.length,
    alreadyOwnedSkips,
    lookupFailures,
  };
}

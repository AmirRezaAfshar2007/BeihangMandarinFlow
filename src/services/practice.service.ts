import { Character } from '../models/Character.ts';
import { PracticeLog, QuizMode } from '../models/PracticeLog.ts';
import { Stats } from '../models/Stats.ts';
import { Achievement, IAchievement } from '../models/Achievement.ts';
import { applySrsUpdate } from './srs.service.ts';
import { NotFoundError } from '../utils/errors.ts';

interface LogPracticeInput {
  studentId: string;
  characterId: string;
  quizMode: QuizMode;
  score: number;
  durationSeconds?: number;
}

// Every SRS review writes one PracticeLog row, and unlike Character (capped
// at 200/student) or SpeakingAttempt (capped at 5/student), this collection
// had no ceiling at all — a student reviewing daily for months could put it
// well past every other collection combined. Nothing in the app reads a
// PracticeLog row once it's older than this many most-recent-per-student
// (the UI only ever asks for the newest 10 — see recentPracticeLogs in
// stats.service.ts), and the numbers that DO need the full lifetime history
// (average accuracy, admin's all-time practice count) are read from the
// running totals on Stats instead of from PracticeLog itself, so pruning
// here changes nothing the user or admin can see. 500 comfortably covers
// several months of typical daily review activity per student.
const MAX_PRACTICE_LOGS_PER_STUDENT = 500;

/** Deletes all but the newest MAX_PRACTICE_LOGS_PER_STUDENT logs for a
 * student. Safe under concurrent writes: whatever the newest N are at prune
 * time are always kept, and anything older is removed. */
async function pruneLogHistory(studentId: string) {
  const latest = await PracticeLog.find({ studentId })
    .sort({ timestamp: -1 })
    .limit(MAX_PRACTICE_LOGS_PER_STUDENT)
    .select('_id')
    .lean();
  const keepIds = latest.map((l) => l._id);
  await PracticeLog.deleteMany({ studentId, _id: { $nin: keepIds } });
}

/** Attempts to unlock an achievement; silently no-ops if already unlocked
 * (relies on the unique {studentId,title} index rather than an in-memory
 * Set, which is race-safe across concurrent requests). */
async function tryUnlockAchievement(
  studentId: string,
  title: string,
  description: string,
  icon: string
): Promise<IAchievement | null> {
  try {
    return await Achievement.create({ studentId, title, description, icon });
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
      return null; // already unlocked
    }
    throw err;
  }
}

export async function logPractice(input: LogPracticeInput) {
  const { studentId, characterId, quizMode, score, durationSeconds } = input;

  const charItem = await Character.findOne({ _id: characterId, studentId });
  if (!charItem) {
    throw new NotFoundError('Character record not found.');
  }

  const srs = applySrsUpdate(
    {
      interval: charItem.interval,
      memoryStability: charItem.memoryStability,
      learningLevel: charItem.learningLevel,
    },
    score
  );

  charItem.reviewCount += 1;
  charItem.lastReviewed = new Date();
  charItem.interval = srs.interval;
  charItem.memoryStability = srs.memoryStability;
  charItem.learningLevel = srs.learningLevel;
  charItem.nextReviewDate = srs.nextReviewDate;
  await charItem.save();

  const newLog = await PracticeLog.create({
    studentId,
    characterId: charItem._id,
    character: charItem.character,
    quizMode,
    success: srs.isSuccess,
    score,
    timestamp: new Date(),
  });
  await pruneLogHistory(studentId);

  const statsUpdate: Record<string, number> = {
    totalXp: srs.awardedXp,
    // Lifetime counters that back averageAccuracy / admin totals — kept
    // separate from the raw PracticeLog rows so pruneLogHistory can safely
    // delete old rows without shifting those numbers. See Stats.ts.
    totalPracticeCount: 1,
    totalPracticeScoreSum: score,
  };
  if (durationSeconds) statsUpdate.studyTimeSeconds = durationSeconds;
  await Stats.updateOne({ studentId }, { $inc: statsUpdate });

  const newUnlocked: IAchievement[] = [];

  const masteredCount = await Character.countDocuments({ studentId, learningLevel: 3 });
  if (masteredCount >= 3) {
    const ach = await tryUnlockAchievement(
      studentId,
      'Mandarin Master',
      'Mastered 3 or more Chinese characters under active SM-2 retention.',
      '🏆'
    );
    if (ach) {
      newUnlocked.push(ach);
      await Stats.updateOne({ studentId }, { $inc: { totalXp: 100 } });
    }
  }

  const stats = await Stats.findOne({ studentId }).lean();
  if (stats && stats.totalXp >= 500) {
    const ach = await tryUnlockAchievement(
      studentId,
      'Scholar Elite',
      'Accumulate more than 500 learning XP on the platform.',
      '🎓'
    );
    if (ach) {
      newUnlocked.push(ach);
      await Stats.updateOne({ studentId }, { $inc: { totalXp: 150 } });
    }
  }

  return {
    success: true,
    character: {
      ...charItem.toObject(),
      id: charItem._id.toString()
    },
    log: newLog,
    awardedXp: srs.awardedXp,
    newUnlockedAchievements: newUnlocked,
  };
}

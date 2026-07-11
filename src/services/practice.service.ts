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

  const statsUpdate: Record<string, number> = { totalXp: srs.awardedXp };
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

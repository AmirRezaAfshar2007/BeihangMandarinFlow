import { Character } from '../models/Character.ts';
import { PracticeLog } from '../models/PracticeLog.ts';
import { Stats } from '../models/Stats.ts';
import { Achievement } from '../models/Achievement.ts';
import { User } from '../models/User.ts';

/**
 * Dashboard stats for a single student. Uses a $facet aggregation on the
 * Character collection to compute total/mastered/due-for-review counts in a
 * single DB round trip, plus a separate aggregate for average accuracy —
 * all pushed down to MongoDB instead of loading every row into memory.
 */
export async function getStudentDashboardStats(studentId: string) {
  const todayStr = new Date().toISOString().split('T')[0];

  const [charAgg] = await Character.aggregate([
    { $match: { studentId } },
    {
      $facet: {
        total: [{ $count: 'count' }],
        mastered: [{ $match: { learningLevel: 3 } }, { $count: 'count' }],
        dueForReview: [{ $match: { nextReviewDate: { $lte: todayStr } } }, { $count: 'count' }],
      },
    },
  ]);

  const [accuracyAgg] = await PracticeLog.aggregate([
    { $match: { studentId } },
    { $group: { _id: null, avgScore: { $avg: '$score' }, count: { $sum: 1 } } },
  ]);

  const [stats, achievements, recentPracticeLogs] = await Promise.all([
    Stats.findOne({ studentId }).lean(),
    Achievement.find({ studentId }).sort({ unlockedAt: -1 }).lean(),
    PracticeLog.find({ studentId }).sort({ timestamp: -1 }).limit(10).lean(),
  ]);

  return {
    stats: stats ?? { studentId, currentStreak: 0, totalXp: 0, studyTimeSeconds: 0, lastActiveDate: null },
    totalCharacters: charAgg?.total?.[0]?.count ?? 0,
    masteredCharacters: charAgg?.mastered?.[0]?.count ?? 0,
    charactersToReview: charAgg?.dueForReview?.[0]?.count ?? 0,
    averageAccuracy: accuracyAgg ? Math.round(accuracyAgg.avgScore) : 0,
    achievements,
    practiceLogCount: accuracyAgg?.count ?? 0,
    recentPracticeLogs,
  };
}

/**
 * Admin overview: every student joined with their stats and deck size via
 * a single $lookup-based aggregation pipeline, rather than N+1 in-memory
 * .find() calls per student. passwordHash is excluded at the $project stage
 * so it never leaves the database layer.
 */
export async function getAdminOverview() {
  const students = await User.aggregate([
    {
      $lookup: {
        from: 'stats',
        localField: 'studentId',
        foreignField: 'studentId',
        as: 'stats',
      },
    },
    {
      $lookup: {
        from: 'characters',
        localField: 'studentId',
        foreignField: 'studentId',
        as: 'characters',
      },
    },
    {
      $project: {
        id: '$_id',
        studentId: 1,
        fullName: 1,
        role: 1,
        disabled: 1,
        createdAt: 1,
        stats: {
          $ifNull: [
            { $arrayElemAt: ['$stats', 0] },
            { currentStreak: 0, totalXp: 0, studyTimeSeconds: 0, lastActiveDate: null },
          ],
        },
        deckCount: { $size: '$characters' },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  const [totalUsers, totalCharactersLoaded, totalPracticeLogsRecorded] = await Promise.all([
    User.countDocuments(),
    Character.countDocuments(),
    PracticeLog.countDocuments(),
  ]);

  return {
    students,
    overview: { totalUsers, totalCharactersLoaded, totalPracticeLogsRecorded },
  };
}

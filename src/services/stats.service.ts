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

  const [stats, achievements, recentPracticeLogs] = await Promise.all([
    Stats.findOne({ studentId }).lean(),
    Achievement.find({ studentId }).sort({ unlockedAt: -1 }).lean(),
    PracticeLog.find({ studentId }).sort({ timestamp: -1 }).limit(10).lean(),
  ]);

  // Read from Stats' lifetime running totals rather than aggregating
  // PracticeLog directly — PracticeLog is pruned to a recent window per
  // student (see pruneLogHistory in practice.service.ts), but these totals
  // are incremented on every log and never pruned, so the reported accuracy
  // and count always reflect the student's entire history, not just what's
  // still in the raw collection.
  const totalPracticeCount = stats?.totalPracticeCount ?? 0;
  const totalPracticeScoreSum = stats?.totalPracticeScoreSum ?? 0;

  return {
    stats: stats ?? { studentId, currentStreak: 0, totalXp: 0, studyTimeSeconds: 0, lastActiveDate: null },
    totalCharacters: charAgg?.total?.[0]?.count ?? 0,
    masteredCharacters: charAgg?.mastered?.[0]?.count ?? 0,
    charactersToReview: charAgg?.dueForReview?.[0]?.count ?? 0,
    averageAccuracy: totalPracticeCount > 0 ? Math.round(totalPracticeScoreSum / totalPracticeCount) : 0,
    achievements,
    practiceLogCount: totalPracticeCount,
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
      // The deck size is counted inside the database rather than by bringing
      // the cards back and taking their $size.
      //
      // This used to `$lookup` the whole characters array and then project
      // `{ $size: '$characters' }`, which meant loading every card of every
      // student — each one carrying radicals, example words and example
      // sentences — into the aggregation pipeline purely to be counted and
      // thrown away. At the 200-characters-per-student cap that is tens of
      // thousands of fat documents per dashboard load: the single most
      // memory-hungry query in the app, and the one most likely to slow the
      // teacher's dashboard to a crawl as a class fills up its decks. The
      // sub-pipeline returns one number per student instead, and the
      // { studentId: 1 } index on characters serves the match.
      $lookup: {
        from: 'characters',
        let: { sid: '$studentId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$studentId', '$$sid'] } } },
          { $count: 'count' },
        ],
        as: 'characterCount',
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
        deckCount: { $ifNull: [{ $arrayElemAt: ['$characterCount.count', 0] }, 0] },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);

  // totalPracticeLogsRecorded reads the sum of each student's lifetime
  // Stats.totalPracticeCount rather than PracticeLog.countDocuments() —
  // PracticeLog itself is pruned to a recent window per student (see
  // pruneLogHistory in practice.service.ts), so counting it directly would
  // under-report how much practice has actually happened over time.
  const [totalUsers, totalCharactersLoaded, practiceCountAgg] = await Promise.all([
    User.countDocuments(),
    Character.countDocuments(),
    Stats.aggregate([{ $group: { _id: null, total: { $sum: '$totalPracticeCount' } } }]),
  ]);
  const totalPracticeLogsRecorded = practiceCountAgg?.[0]?.total ?? 0;

  return {
    students,
    overview: { totalUsers, totalCharactersLoaded, totalPracticeLogsRecorded },
  };
}

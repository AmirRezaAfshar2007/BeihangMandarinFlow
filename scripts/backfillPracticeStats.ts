/**
 * One-time backfill for the `totalPracticeCount` / `totalPracticeScoreSum`
 * fields added to Stats.
 *
 * Why this exists: averageAccuracy and the admin's all-time practice count
 * used to be computed by aggregating every PracticeLog document. Now that
 * PracticeLog is pruned to a recent window per student (see
 * pruneLogHistory in src/services/practice.service.ts, added to cap
 * unbounded collection growth), those numbers are read instead from two
 * running counters on Stats that get incremented on every new practice log.
 *
 * Those counters start at 0 for every student. If this app already has
 * real practice history sitting in MongoDB from before this change, running
 * this script once will compute each student's correct lifetime totals
 * from their existing PracticeLog rows and write them into Stats, BEFORE
 * pruning ever deletes any of that history. If this is a fresh database
 * with no practice history yet, this script is a no-op and safe to skip.
 *
 * Usage:
 *   npx tsx scripts/backfillPracticeStats.ts
 */
import { connectDB, disconnectDB } from '../src/config/database.ts';
import { PracticeLog } from '../src/models/PracticeLog.ts';
import { Stats } from '../src/models/Stats.ts';

async function main() {
  await connectDB();

  const totals = await PracticeLog.aggregate([
    { $group: { _id: '$studentId', count: { $sum: 1 }, scoreSum: { $sum: '$score' } } },
  ]);

  if (totals.length === 0) {
    console.log('No PracticeLog history found — nothing to backfill.');
    await disconnectDB();
    return;
  }

  console.log(`Backfilling lifetime practice totals for ${totals.length} student(s)...`);

  let updated = 0;
  for (const t of totals) {
    const result = await Stats.updateOne(
      { studentId: t._id },
      { $set: { totalPracticeCount: t.count, totalPracticeScoreSum: t.scoreSum } }
    );
    if (result.matchedCount > 0) updated += 1;
  }

  console.log(`Done. Updated ${updated} of ${totals.length} student Stats record(s).`);
  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

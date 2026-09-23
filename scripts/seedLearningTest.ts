import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../src/config/database.ts';
import { User } from '../src/models/User.ts';
import { Stats } from '../src/models/Stats.ts';

async function main() {
  await connectDB();
  const hash = await bcrypt.hash('TestPass123', 10);
  const entries: [string, string, 'admin' | 'student'][] = [
    ['999999901', 'Learning Hub Test Teacher', 'admin'],
    ['999999902', 'Learning Hub Test Student', 'student'],
  ];
  for (const [studentId, fullName, role] of entries) {
    const existing = await User.findOne({ studentId });
    if (!existing) {
      await User.create({ studentId, fullName, passwordHash: hash, role, disabled: false });
      await Stats.create({ studentId, currentStreak: 0, totalXp: 0, studyTimeSeconds: 0, lastActiveDate: null, totalPracticeCount: 0, totalPracticeScoreSum: 0 });
      console.log('created', studentId, role);
    } else {
      console.log('exists', studentId, existing.role);
    }
  }
  await disconnectDB();
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });

/**
 * One-time admin provisioning script.
 *
 * The old db.json seed created a hardcoded admin (studentId 401120000,
 * password "admin123") and a hardcoded demo student (password "password123")
 * on every fresh boot — a critical vulnerability if ever deployed as-is.
 * This script replaces that: run it once, by hand, against your real
 * MongoDB Atlas database, with a password YOU choose.
 *
 * Usage:
 *   npm run seed:admin -- --studentId=401120000 --fullName="Professor Zhang" --password="a-strong-passphrase"
 */
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../src/config/database.ts';
import { User } from '../src/models/User.ts';
import { Stats } from '../src/models/Stats.ts';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

async function main() {
  const studentId = getArg('studentId');
  const fullName = getArg('fullName');
  const password = getArg('password');

  if (!studentId || !fullName || !password) {
    console.error(
      'Usage: npm run seed:admin -- --studentId=<numeric id> --fullName="<name>" --password="<strong password>"'
    );
    process.exit(1);
  }
  if (!/^\d{5,15}$/.test(studentId)) {
    console.error('studentId must be 5-15 digits.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('password must be at least 8 characters.');
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ studentId });
  if (existing) {
    console.error(`A user with studentId ${studentId} already exists.`);
    await disconnectDB();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ studentId, fullName, passwordHash, role: 'admin', disabled: false });
  await Stats.create({ studentId, currentStreak: 0, totalXp: 0, studyTimeSeconds: 0, lastActiveDate: null });

  console.log(`Admin account created: ${studentId} (${fullName})`);
  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

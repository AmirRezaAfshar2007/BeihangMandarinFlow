/**
 * Admin account management script.
 *
 * Lets you list, create, promote, demote, reset-password, or delete admin
 * accounts directly against your MongoDB Atlas database, without going
 * through the app's UI.
 *
 * Usage:
 *   npm run manage:admin -- --list
 *   npm run manage:admin -- --create --studentId=401120000 --fullName="Professor Zhang" --password="a-strong-passphrase"
 *   npm run manage:admin -- --promote --studentId=401120145
 *   npm run manage:admin -- --demote --studentId=401120145
 *   npm run manage:admin -- --reset-password --studentId=401120000 --password="new-strong-pass"
 *   npm run manage:admin -- --delete --studentId=401120000
 */
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../src/config/database.ts';
import { User } from '../src/models/User.ts';
import { Stats } from '../src/models/Stats.ts';
import { Character } from '../src/models/Character.ts';
import { PracticeLog } from '../src/models/PracticeLog.ts';
import { Achievement } from '../src/models/Achievement.ts';
import { Session } from '../src/models/Session.ts';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function usageAndExit(): never {
  console.error(
    [
      'Usage:',
      '  npm run manage:admin -- --list',
      '  npm run manage:admin -- --create --studentId=<id> --fullName="<name>" --password="<strong password>"',
      '  npm run manage:admin -- --promote --studentId=<id>',
      '  npm run manage:admin -- --demote --studentId=<id>',
      '  npm run manage:admin -- --reset-password --studentId=<id> --password="<strong password>"',
      '  npm run manage:admin -- --delete --studentId=<id>',
    ].join('\n')
  );
  process.exit(1);
}

function validateStudentId(studentId: string | undefined): asserts studentId is string {
  if (!studentId || !/^\d{5,15}$/.test(studentId)) {
    console.error('studentId must be 5-15 digits.');
    process.exit(1);
  }
}

function validatePassword(password: string | undefined): asserts password is string {
  if (!password || password.length < 8) {
    console.error('password must be at least 8 characters.');
    process.exit(1);
  }
}

async function list() {
  const admins = await User.find({ role: 'admin' }).sort({ createdAt: 1 });
  if (admins.length === 0) {
    console.log('No admin accounts found.');
    return;
  }
  console.log(`Admin accounts (${admins.length}):`);
  for (const a of admins) {
    console.log(`  ${a.studentId}  ${a.fullName}  ${a.disabled ? '[disabled]' : ''}`.trimEnd());
  }
}

async function create() {
  const studentId = getArg('studentId');
  const fullName = getArg('fullName');
  const password = getArg('password');

  validateStudentId(studentId);
  if (!fullName) {
    console.error('--fullName is required.');
    process.exit(1);
  }
  validatePassword(password);

  const existing = await User.findOne({ studentId });
  if (existing) {
    console.error(`A user with studentId ${studentId} already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await User.create({ studentId, fullName, passwordHash, role: 'admin', disabled: false });
  await Stats.create({ studentId, currentStreak: 0, totalXp: 0, studyTimeSeconds: 0, lastActiveDate: null });

  console.log(`Admin account created: ${studentId} (${fullName})`);
}

async function promote() {
  const studentId = getArg('studentId');
  validateStudentId(studentId);

  const user = await User.findOne({ studentId });
  if (!user) {
    console.error(`No user with studentId ${studentId} found.`);
    process.exit(1);
  }
  if (user.role === 'admin') {
    console.log(`${studentId} is already an admin.`);
    return;
  }
  user.role = 'admin';
  await user.save();
  console.log(`${studentId} (${user.fullName}) promoted to admin.`);
}

async function demote() {
  const studentId = getArg('studentId');
  validateStudentId(studentId);

  const user = await User.findOne({ studentId });
  if (!user) {
    console.error(`No user with studentId ${studentId} found.`);
    process.exit(1);
  }
  if (user.role !== 'admin') {
    console.log(`${studentId} is not an admin.`);
    return;
  }

  const adminCount = await User.countDocuments({ role: 'admin' });
  if (adminCount <= 1) {
    console.error('Refusing to demote the last remaining admin — this would lock you out.');
    process.exit(1);
  }

  user.role = 'student';
  await user.save();
  console.log(`${studentId} (${user.fullName}) demoted to student.`);
}

async function resetPassword() {
  const studentId = getArg('studentId');
  const password = getArg('password');
  validateStudentId(studentId);
  validatePassword(password);

  const user = await User.findOne({ studentId });
  if (!user) {
    console.error(`No user with studentId ${studentId} found.`);
    process.exit(1);
  }

  user.passwordHash = await bcrypt.hash(password, 12);
  await user.save();
  console.log(`Password reset for ${studentId} (${user.fullName}).`);
}

async function del() {
  const studentId = getArg('studentId');
  validateStudentId(studentId);

  const user = await User.findOne({ studentId });
  if (!user) {
    console.error(`No user with studentId ${studentId} found.`);
    process.exit(1);
  }

  if (user.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      console.error('Refusing to delete the last remaining admin — this would lock you out.');
      process.exit(1);
    }
  }

  // Every collection that keys off studentId, not just User + Stats.
  //
  // This used to remove only the account and its stats, leaving the student's
  // deck, practice history, achievements and sessions behind — and because
  // Achievement carries a unique { studentId, title } index, the leftover
  // "First Step" row made the same Student ID impossible to register again:
  // creation died on a duplicate-key conflict that reads as "already
  // registered" even though the user document was gone. The Admin panel's
  // delete button (adminDeleteStudent) has always purged all six collections;
  // this keeps the operator script identical to it.
  await Promise.all([
    User.deleteOne({ studentId }),
    Stats.deleteOne({ studentId }),
    Character.deleteMany({ studentId }),
    PracticeLog.deleteMany({ studentId }),
    Achievement.deleteMany({ studentId }),
    Session.deleteMany({ studentId }),
  ]);
  console.log(`Deleted account ${studentId} (${user.fullName}) and all associated data.`);
}

async function main() {
  await connectDB();
  try {
    if (hasFlag('list')) return await list();
    if (hasFlag('create')) return await create();
    if (hasFlag('promote')) return await promote();
    if (hasFlag('demote')) return await demote();
    if (hasFlag('reset-password')) return await resetPassword();
    if (hasFlag('delete')) return await del();
    usageAndExit();
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

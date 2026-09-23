/**
 * مدیریت کاربران از CMD
 * 
 * ── ادمین ──────────────────────────────────────────────────────
 * اضافه کردن ادمین:
 *   npm run manage:users -- --add-admin --id=401120000 --name="استاد رضایی" --pass="رمز-قوی"
 *
 * ── دانشجو ─────────────────────────────────────────────────────
 * اضافه کردن یه دانشجو:
 *   npm run manage:users -- --add-student --id=401120001 --name="علی احمدی" --pass="رمز-قوی"
 *
 * اضافه کردن دانشجوها از فایل CSV:
 *   npm run manage:users -- --add-csv=students.csv
 *   (فرمت CSV: studentId,fullName,password)
 *
 * ── مشاهده ─────────────────────────────────────────────────────
 *   npm run manage:users -- --list               (همه کاربرا)
 *   npm run manage:users -- --list-students       (فقط دانشجوها)
 *   npm run manage:users -- --list-admins         (فقط ادمین‌ها)
 *
 * ── ویرایش ─────────────────────────────────────────────────────
 *   npm run manage:users -- --reset-pass --id=401120001 --pass="رمز-جدید"
 *   npm run manage:users -- --promote --id=401120001     (دانشجو → ادمین)
 *   npm run manage:users -- --demote  --id=401120000     (ادمین → دانشجو)
 *   npm run manage:users -- --disable --id=401120001     (غیرفعال کردن)
 *   npm run manage:users -- --enable  --id=401120001     (فعال کردن)
 *   npm run manage:users -- --delete  --id=401120001     (حذف کامل)
 */

import fs from 'fs';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../src/config/database.ts';
import { User } from '../src/models/User.ts';
import { Stats } from '../src/models/Stats.ts';

// ─── helpers ─────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function ok(msg: string) { console.log(`✅  ${msg}`); }
function fail(msg: string): never { console.error(`❌  ${msg}`); process.exit(1); }
function info(msg: string) { console.log(`ℹ️   ${msg}`); }

function validateId(id: string | undefined): asserts id is string {
  if (!id || !/^\d{5,15}$/.test(id)) fail('شماره دانشجویی باید ۵ تا ۱۵ رقم باشه. مثال: --id=401120001');
}

function validatePass(pass: string | undefined): asserts pass is string {
  if (!pass || pass.length < 6) fail('رمز عبور باید حداقل ۶ کاراکتر باشه.');
}

async function ensureStats(studentId: string) {
  const exists = await Stats.findOne({ studentId });
  if (!exists) {
    await Stats.create({
      studentId,
      currentStreak: 0,
      totalXp: 0,
      studyTimeSeconds: 0,
      lastActiveDate: null,
      totalPracticeCount: 0,
      totalPracticeScoreSum: 0,
    });
  }
}

// ─── actions ─────────────────────────────────────────────────────────────────

async function addUser(role: 'admin' | 'student') {
  const id   = arg('id');
  const name = arg('name');
  const pass = arg('pass');

  validateId(id);
  if (!name) fail('اسم رو وارد کن: --name="علی احمدی"');
  validatePass(pass);

  if (await User.findOne({ studentId: id })) fail(`کاربری با شماره ${id} قبلاً وجود داره.`);

  const passwordHash = await bcrypt.hash(pass, 12);
  await User.create({ studentId: id, fullName: name, passwordHash, role, disabled: false });
  await ensureStats(id);
  ok(`${role === 'admin' ? 'ادمین' : 'دانشجو'} اضافه شد: ${id} — ${name}`);
}

async function addFromCSV() {
  const csvPath = arg('add-csv');
  if (!csvPath) fail('مسیر فایل CSV رو بده: --add-csv=students.csv');
  if (!fs.existsSync(csvPath)) fail(`فایل پیدا نشد: ${csvPath}`);

  const lines = fs.readFileSync(csvPath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('studentId'));

  let added = 0, skipped = 0;

  for (const line of lines) {
    const parts = line.split(',').map((p) => p.trim());
    if (parts.length < 3) { info(`رد شد (فرمت اشتباه): ${line}`); skipped++; continue; }

    const [studentId, fullName, password] = parts;

    if (!/^\d{5,15}$/.test(studentId)) { info(`رد شد (شماره نامعتبر): ${studentId}`); skipped++; continue; }
    if (!fullName) { info(`رد شد (اسم خالی): ${studentId}`); skipped++; continue; }
    if (password.length < 6) { info(`رد شد (رمز کوتاه): ${studentId}`); skipped++; continue; }

    if (await User.findOne({ studentId })) { info(`قبلاً وجود داره، رد شد: ${studentId}`); skipped++; continue; }

    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({ studentId, fullName, passwordHash, role: 'student', disabled: false });
    await ensureStats(studentId);
    ok(`اضافه شد: ${studentId} — ${fullName}`);
    added++;
  }

  console.log(`\n📊  ${added} نفر اضافه شدن، ${skipped} نفر رد شدن.`);
}

async function listUsers(roleFilter?: 'admin' | 'student') {
  const query = roleFilter ? { role: roleFilter } : {};
  const users = await User.find(query).sort({ role: 1, studentId: 1 });

  if (users.length === 0) { info('هیچ کاربری پیدا نشد.'); return; }

  const label = roleFilter === 'admin' ? 'ادمین' : roleFilter === 'student' ? 'دانشجو' : 'همه کاربرا';
  console.log(`\n👥  ${label} (${users.length} نفر):\n`);
  console.log('  شماره         | نقش     | وضعیت    | اسم');
  console.log('  ' + '─'.repeat(55));

  for (const u of users) {
    const role   = u.role === 'admin' ? 'ادمین  ' : 'دانشجو ';
    const status = u.disabled ? '🔴 غیرفعال' : '🟢 فعال   ';
    console.log(`  ${u.studentId.padEnd(14)} | ${role} | ${status} | ${u.fullName}`);
  }
  console.log('');
}

async function resetPass() {
  const id   = arg('id');
  const pass = arg('pass');
  validateId(id);
  validatePass(pass);

  const user = await User.findOne({ studentId: id });
  if (!user) fail(`کاربری با شماره ${id} پیدا نشد.`);

  user.passwordHash = await bcrypt.hash(pass, 12);
  await user.save();
  ok(`رمز عوض شد: ${id} (${user.fullName})`);
}

async function changeRole(to: 'admin' | 'student') {
  const id = arg('id');
  validateId(id);

  const user = await User.findOne({ studentId: id });
  if (!user) fail(`کاربری با شماره ${id} پیدا نشد.`);
  if (user.role === to) { info(`${id} از قبل ${to === 'admin' ? 'ادمین' : 'دانشجو'} هست.`); return; }

  if (to === 'student') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) fail('نمیشه آخرین ادمین رو تبدیل به دانشجو کرد — قفل میشی!');
  }

  user.role = to;
  await user.save();
  ok(`${id} (${user.fullName}) → ${to === 'admin' ? 'ادمین' : 'دانشجو'}`);
}

async function setDisabled(state: boolean) {
  const id = arg('id');
  validateId(id);

  const user = await User.findOne({ studentId: id });
  if (!user) fail(`کاربری با شماره ${id} پیدا نشد.`);

  user.disabled = state;
  await user.save();
  ok(`${id} (${user.fullName}) ${state ? 'غیرفعال' : 'فعال'} شد.`);
}

async function deleteUser() {
  const id = arg('id');
  validateId(id);

  const user = await User.findOne({ studentId: id });
  if (!user) fail(`کاربری با شماره ${id} پیدا نشد.`);

  if (user.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) fail('نمیشه آخرین ادمین رو حذف کرد — قفل میشی!');
  }

  await User.deleteOne({ studentId: id });
  await Stats.deleteOne({ studentId: id });
  ok(`${id} (${user.fullName}) حذف شد.`);
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // چک کن .env وجود داشته باشه
  if (!process.env.MONGODB_URI && !fs.existsSync('.env')) {
    fail('.env پیدا نشد. فایل .env.example رو کپی کن به .env و MONGODB_URI رو پر کن.');
  }

  await connectDB();

  try {
    if (flag('add-admin'))    return await addUser('admin');
    if (flag('add-student'))  return await addUser('student');
    if (arg('add-csv'))       return await addFromCSV();
    if (flag('list'))         return await listUsers();
    if (flag('list-students'))return await listUsers('student');
    if (flag('list-admins'))  return await listUsers('admin');
    if (flag('reset-pass'))   return await resetPass();
    if (flag('promote'))      return await changeRole('admin');
    if (flag('demote'))       return await changeRole('student');
    if (flag('disable'))      return await setDisabled(true);
    if (flag('enable'))       return await setDisabled(false);
    if (flag('delete'))       return await deleteUser();

    // راهنما
    console.log(`
📚  راهنمای مدیریت کاربران:

  ─── اضافه کردن ───────────────────────────────────────────
  npm run manage:users -- --add-admin  --id=401120000 --name="استاد رضایی"  --pass="رمز"
  npm run manage:users -- --add-student --id=401120001 --name="علی احمدی"   --pass="رمز"
  npm run manage:users -- --add-csv=students.csv
     (فرمت CSV: studentId,fullName,password  — یه نفر در هر خط)

  ─── مشاهده ───────────────────────────────────────────────
  npm run manage:users -- --list
  npm run manage:users -- --list-students
  npm run manage:users -- --list-admins

  ─── ویرایش ───────────────────────────────────────────────
  npm run manage:users -- --reset-pass --id=401120001 --pass="رمز-جدید"
  npm run manage:users -- --promote    --id=401120001
  npm run manage:users -- --demote     --id=401120000
  npm run manage:users -- --disable    --id=401120001
  npm run manage:users -- --enable     --id=401120001
  npm run manage:users -- --delete     --id=401120001
    `);
  } finally {
    await disconnectDB();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User.ts';
import { Stats } from '../models/Stats.ts';
import { Achievement } from '../models/Achievement.ts';
import { Session } from '../models/Session.ts';
import { env } from '../config/env.ts';
import { UnauthorizedError, ForbiddenError, ConflictError, NotFoundError } from '../utils/errors.ts';
import type { AuthTokenPayload } from '../types/express.d.ts';

const BCRYPT_COST = 12;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches JWT expiry

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function issueSession(user: IUser): Promise<string> {
  const jti = crypto.randomUUID();
  const payload: AuthTokenPayload = {
    id: user._id.toString(),
    studentId: user.studentId,
    fullName: user.fullName,
    role: user.role,
    jti,
  };

  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });

  await Session.create({
    tokenHash: hashToken(token),
    studentId: user.studentId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });

  return token;
}

export function publicUser(user: IUser) {
  return { studentId: user.studentId, fullName: user.fullName, role: user.role };
}

/**
 * Creates the account row plus the empty Stats/Achievement records that the
 * rest of the app assumes exist for every student. Shared by self-service
 * registration and admin-driven account creation so the two can never drift
 * apart and leave a student without their starting documents.
 */
async function createStudentRecords(studentId: string, fullName: string, password: string): Promise<IUser> {
  const existing = await User.findOne({ studentId }).lean();
  if (existing) {
    throw new ConflictError('Student ID is already registered.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await User.create({
    studentId,
    fullName,
    passwordHash,
    role: 'student',
    disabled: false,
  });

  await Stats.create({
    studentId,
    currentStreak: 0,
    totalXp: 0,
    studyTimeSeconds: 0,
    lastActiveDate: null,
    totalPracticeCount: 0,
    totalPracticeScoreSum: 0,
  });
  await Achievement.create({
    studentId,
    title: 'First Step',
    description: 'Logged in to Beihang Mandarin Flow platform.',
    icon: '🚀',
  });

  return user;
}

/**
 * Public self-service sign-up: creates the account and signs it straight in.
 * Whether this route is reachable at all is controlled by
 * ALLOW_SELF_REGISTRATION (see routes/auth.routes.ts).
 */
export async function registerStudent(studentId: string, fullName: string, password: string) {
  const user = await createStudentRecords(studentId, fullName, password);
  const token = await issueSession(user);
  return { token, user: publicUser(user) };
}

/**
 * Creates a student account on an administrator's behalf, WITHOUT signing
 * anyone in. This is what the Admin panel's "create student" form uses.
 *
 * It deliberately does not reuse registerStudent: that path also mints a live
 * 7-day session for the new account, which is both pointless here (the admin
 * is not the student) and untidy — it leaves a usable session behind for an
 * account that has never been logged into.
 */
export async function createStudentAccount(studentId: string, fullName: string, password: string) {
  const user = await createStudentRecords(studentId, fullName, password);
  return publicUser(user);
}

export async function loginStudent(studentId: string, password: string) {
  const user = await User.findOne({ studentId }).select('+passwordHash');
  if (!user) {
    throw new UnauthorizedError('Invalid Student ID or password.');
  }
  if (user.disabled) {
    throw new ForbiddenError('Your student account has been disabled by the Administrator.');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid Student ID or password.');
  }

  await updateStreak(studentId);

  const token = await issueSession(user);
  return { token, user: publicUser(user) };
}

async function updateStreak(studentId: string): Promise<void> {
  const stats = await Stats.findOne({ studentId });
  if (!stats) return;

  const todayStr = new Date().toISOString().split('T')[0];
  if (stats.lastActiveDate === todayStr) return;

  if (stats.lastActiveDate) {
    const diffDays = Math.ceil(
      Math.abs(new Date(todayStr).getTime() - new Date(stats.lastActiveDate).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    stats.currentStreak = diffDays === 1 ? stats.currentStreak + 1 : 1;
  } else {
    stats.currentStreak = 1;
  }
  stats.lastActiveDate = todayStr;
  await stats.save();
}

export async function logoutSession(token: string): Promise<void> {
  await Session.deleteOne({ tokenHash: hashToken(token) });
}

/**
 * Verifies a bearer token's signature/expiry, confirms a matching
 * server-side session still exists (so logout / forced revocation actually
 * works, unlike a stateless-only JWT), and confirms the account isn't
 * disabled. Throws UnauthorizedError/ForbiddenError on any failure.
 */
export async function verifyAccessToken(token: string): Promise<AuthTokenPayload> {
  let decoded: AuthTokenPayload;
  try {
    decoded = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token.');
  }

  const session = await Session.findOne({ tokenHash: hashToken(token) }).lean();
  if (!session || session.expiresAt < new Date()) {
    throw new UnauthorizedError('Session invalidated or expired.');
  }

  const user = await User.findOne({ studentId: decoded.studentId }).select('disabled').lean();
  if (!user) {
    throw new UnauthorizedError('Account no longer exists.');
  }
  if (user.disabled) {
    throw new ForbiddenError('Account is disabled by Admin.');
  }

  return decoded;
}

/**
 * Self-service password reset by verifying studentId + fullName.
 *
 * SECURITY NOTE: full names are often not secret (class rosters, ID cards),
 * so this is weaker than a real email/SMS-based reset flow. It's rate
 * limited (see middleware/rateLimit.ts) to slow down guessing, but for a
 * real production rollout this should be replaced with an emailed one-time
 * code. See AUDIT_REPORT.md.
 */
export async function forgotPassword(studentId: string, fullName: string, newPassword: string) {
  const user = await User.findOne({ studentId });
  if (!user || user.fullName.toLowerCase() !== fullName.toLowerCase()) {
    throw new NotFoundError('Student record with matching Name and ID not found.');
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await user.save();

  // Invalidate all existing sessions for this account so a stolen token
  // (or the person who just "recovered" the account) can't ride the old
  // session past this point.
  await Session.deleteMany({ studentId });
}

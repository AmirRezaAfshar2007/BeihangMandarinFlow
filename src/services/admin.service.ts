import bcrypt from 'bcryptjs';
import { User } from '../models/User.ts';
import { Character } from '../models/Character.ts';
import { PracticeLog } from '../models/PracticeLog.ts';
import { Stats } from '../models/Stats.ts';
import { Achievement } from '../models/Achievement.ts';
import { Session } from '../models/Session.ts';
import { AppError, NotFoundError } from '../utils/errors.ts';

const BCRYPT_COST = 12;

export async function adminResetPassword(studentId: string, newPassword: string) {
  const student = await User.findOne({ studentId });
  if (!student) {
    throw new NotFoundError('Student account not found.');
  }
  student.passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await student.save();
  // Force re-login everywhere with the new password.
  await Session.deleteMany({ studentId });
}

export async function adminToggleStatus(studentId: string) {
  const student = await User.findOne({ studentId });
  if (!student) {
    throw new NotFoundError('Student account not found.');
  }
  if (student.role === 'admin') {
    throw new AppError('Cannot disable another administrator.', 400);
  }
  student.disabled = !student.disabled;
  await student.save();
  if (student.disabled) {
    // Kick any active sessions immediately on disable.
    await Session.deleteMany({ studentId });
  }
  return student.disabled;
}

export async function adminDeleteStudent(studentId: string) {
  const student = await User.findOne({ studentId });
  if (!student) {
    throw new NotFoundError('Student account not found.');
  }
  if (student.role === 'admin') {
    throw new AppError('Cannot delete an administrator account.', 400);
  }

  await Promise.all([
    User.deleteOne({ studentId }),
    Character.deleteMany({ studentId }),
    PracticeLog.deleteMany({ studentId }),
    Stats.deleteMany({ studentId }),
    Achievement.deleteMany({ studentId }),
    Session.deleteMany({ studentId }),
  ]);
}

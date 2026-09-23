import { Schema, model, Document, Model } from 'mongoose';

export interface IStats extends Document {
  studentId: string;
  currentStreak: number;
  totalXp: number;
  studyTimeSeconds: number;
  lastActiveDate: string | null; // YYYY-MM-DD
  // Lifetime running totals for practice accuracy. Kept here (rather than
  // computed by aggregating every PracticeLog document) so that pruning old
  // PracticeLog rows to cap collection growth never changes a student's
  // reported average accuracy or the admin's all-time practice count — see
  // pruneLogHistory in practice.service.ts.
  totalPracticeCount: number;
  totalPracticeScoreSum: number;
}

const statsSchema = new Schema<IStats>({
  studentId: { type: String, required: true, unique: true },
  currentStreak: { type: Number, default: 0, min: 0 },
  totalXp: { type: Number, default: 0, min: 0 },
  studyTimeSeconds: { type: Number, default: 0, min: 0 },
  lastActiveDate: { type: String, default: null },
  totalPracticeCount: { type: Number, default: 0, min: 0 },
  totalPracticeScoreSum: { type: Number, default: 0, min: 0 },
});

export const Stats: Model<IStats> = model<IStats>('Stats', statsSchema);

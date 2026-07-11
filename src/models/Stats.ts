import { Schema, model, Document, Model } from 'mongoose';

export interface IStats extends Document {
  studentId: string;
  currentStreak: number;
  totalXp: number;
  studyTimeSeconds: number;
  lastActiveDate: string | null; // YYYY-MM-DD
}

const statsSchema = new Schema<IStats>({
  studentId: { type: String, required: true, unique: true },
  currentStreak: { type: Number, default: 0, min: 0 },
  totalXp: { type: Number, default: 0, min: 0 },
  studyTimeSeconds: { type: Number, default: 0, min: 0 },
  lastActiveDate: { type: String, default: null },
});

export const Stats: Model<IStats> = model<IStats>('Stats', statsSchema);

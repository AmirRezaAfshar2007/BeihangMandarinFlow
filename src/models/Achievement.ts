import { Schema, model, Document, Model } from 'mongoose';

export interface IAchievement extends Document {
  studentId: string;
  title: string;
  description: string;
  unlockedAt: Date;
  icon: string;
}

const achievementSchema = new Schema<IAchievement>({
  studentId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  unlockedAt: { type: Date, default: Date.now },
  icon: { type: String, default: '🏆' },
});

// Prevents the same badge being unlocked twice for the same student, even
// under concurrent requests (previously enforced only in JS via a Set, which
// is not race-safe).
achievementSchema.index({ studentId: 1, title: 1 }, { unique: true });

export const Achievement: Model<IAchievement> = model<IAchievement>('Achievement', achievementSchema);

import { Schema, model, Document, Model } from 'mongoose';

export interface ISession extends Document {
  tokenHash: string; // SHA-256 of the issued JWT — we never store the raw token
  studentId: string;
  expiresAt: Date;
  createdAt: Date;
}

const sessionSchema = new Schema<ISession>({
  tokenHash: { type: String, required: true, unique: true },
  studentId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// TTL index: MongoDB automatically deletes the document once expiresAt passes,
// so logged-out / expired sessions are purged without a cron job.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session: Model<ISession> = model<ISession>('Session', sessionSchema);

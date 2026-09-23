import { Schema, model, Document, Model, Types } from 'mongoose';

export type QuizMode = 'stroke' | 'meaning' | 'pinyin' | 'typing' | 'multichoice' | 'flashcard';

export interface IPracticeLog extends Document {
  studentId: string;
  characterId: Types.ObjectId;
  character: string;
  quizMode: QuizMode;
  success: boolean;
  score: number;
  timestamp: Date;
}

const practiceLogSchema = new Schema<IPracticeLog>({
  studentId: { type: String, required: true, index: true },
  characterId: { type: Schema.Types.ObjectId, ref: 'Character', required: true },
  character: { type: String, required: true },
  quizMode: {
    type: String,
    enum: ['stroke', 'meaning', 'pinyin', 'typing', 'multichoice', 'flashcard'],
    required: true,
  },
  success: { type: Boolean, required: true },
  score: { type: Number, required: true, min: 0, max: 100 },
  timestamp: { type: Date, default: Date.now, index: true },
});

// Common query shape: "this student's logs, most recent first".
practiceLogSchema.index({ studentId: 1, timestamp: -1 });

export const PracticeLog: Model<IPracticeLog> = model<IPracticeLog>('PracticeLog', practiceLogSchema);

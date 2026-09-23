import { Schema, model, Document, Model, Types } from 'mongoose';
import type { ILearningQuestion, LearningQuestionType } from './LearningExercise.ts';

export type SubmissionStatus = 'submitted' | 'reviewed';

/** One answered question inside a submission. */
export interface ISubmissionAnswer {
  questionId: string; // matches ILearningQuestion.id
  type: LearningQuestionType;
  promptSnapshot: string; // frozen copy so later question edits don't rewrite history
  answer: string;
  /** Set by deterministic auto-grading for multiple_choice / fill_blank. */
  autoCorrect: boolean | null;
  earnedPoints: number;
  maxPoints: number;
}

export interface ILearningSubmission extends Document {
  studentId: string;
  lessonId: Types.ObjectId;
  exerciseId: Types.ObjectId;
  // Lesson title snapshot — review center shows the lesson name without joins.
  lessonTitle: string;
  exerciseTitle: string;
  answers: ISubmissionAnswer[];
  /** Sum of auto-gradable earned points; short_answer contributes 0 until reviewed. */
  autoScore: number;
  totalPoints: number;
  status: SubmissionStatus;
  teacherScore: number | null; // 0-100, set during review
  teacherFeedback: string;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const answerSchema = new Schema<ISubmissionAnswer>(
  {
    questionId: { type: String, required: true },
    type: { type: String, enum: ['short_answer', 'multiple_choice', 'fill_blank'], required: true },
    promptSnapshot: { type: String, default: '' },
    answer: { type: String, default: '', maxlength: 2000 },
    autoCorrect: { type: Boolean, default: null },
    earnedPoints: { type: Number, default: 0, min: 0 },
    maxPoints: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const learningSubmissionSchema = new Schema<ILearningSubmission>(
  {
    studentId: { type: String, required: true, index: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },
    exerciseId: { type: Schema.Types.ObjectId, ref: 'LearningExercise', required: true, index: true },
    lessonTitle: { type: String, default: '', maxlength: 160 },
    exerciseTitle: { type: String, default: '', maxlength: 160 },
    answers: { type: [answerSchema], default: [] },
    autoScore: { type: Number, default: 0, min: 0 },
    totalPoints: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['submitted', 'reviewed'], default: 'submitted', index: true },
    teacherScore: { type: Number, default: null, min: 0, max: 100 },
    teacherFeedback: { type: String, default: '', maxlength: 2000 },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The critical security index: one submission per (student, exercise). The
// service layer enforces this first with a ConflictError; this unique index
// makes duplicate-prevention race-proof at the database level.
learningSubmissionSchema.index({ studentId: 1, exerciseId: 1 }, { unique: true });
// Teacher review center listing.
learningSubmissionSchema.index({ lessonId: 1, createdAt: -1 });

export const LearningSubmission: Model<ILearningSubmission> = model<ILearningSubmission>(
  'LearningSubmission',
  learningSubmissionSchema
);

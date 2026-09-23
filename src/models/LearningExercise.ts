import { Schema, model, Document, Model, Types } from 'mongoose';

export type LearningQuestionType = 'short_answer' | 'multiple_choice' | 'fill_blank';

export interface ILearningQuestion {
  id: string; // stable id (uuid) used by the client when mapping answers
  type: LearningQuestionType;
  prompt: string;
  /** multiple_choice options; empty for other types */
  options: string[];
  /**
   * Correct answer. multiple_choice stores the exact option text;
   * fill_blank stores the expected text (checked case/punctuation-insensitively);
   * short_answer is graded by the teacher.
   */
  correctAnswer: string;
  points: number;
}

export interface ILearningExercise extends Document {
  lessonId: Types.ObjectId;
  teacherId: string;
  title: string;
  instructions: string;
  questions: ILearningQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<ILearningQuestion>(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ['short_answer', 'multiple_choice', 'fill_blank'], required: true },
    prompt: { type: String, required: true, maxlength: 600 },
    options: { type: [String], default: [] },
    correctAnswer: { type: String, default: '', maxlength: 600 },
    points: { type: Number, default: 1, min: 1, max: 100 },
  },
  { _id: false }
);

const learningExerciseSchema = new Schema<ILearningExercise>(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },
    teacherId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    instructions: { type: String, default: '', trim: true, maxlength: 600 },
    questions: { type: [questionSchema], default: [] },
  },
  { timestamps: true }
);

learningExerciseSchema.index({ lessonId: 1, createdAt: 1 });

export const LearningExercise: Model<ILearningExercise> = model<ILearningExercise>(
  'LearningExercise',
  learningExerciseSchema
);

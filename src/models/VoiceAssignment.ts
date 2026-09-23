import { Schema, model, Document, Model } from 'mongoose';

export type VoiceAssignmentStatus = 'draft' | 'published';

/** One line of text the student has to read aloud. */
export interface IVoiceSentence {
  /** Stable id (uuid) so the recorder can key per-sentence UI state. */
  id: string;
  text: string;
}

/**
 * A "Voice Recording Exercise" — the first assignment type of the School
 * section.
 *
 * Deliberately a sibling of LearningExercise rather than a variant of it:
 * a LearningExercise is a question set graded by auto-grading rules, while a
 * voice assignment is a prompt list whose submission is a single audio
 * artifact reviewed by a teacher. Trying to model both in one collection
 * would mean every exercise doc carrying an unused half.
 *
 * Like lessons, `status` gates student visibility and `teacherId` is
 * authorship/attribution (the admin role is the only teaching role — see the
 * Authorization scope note in learning.service.ts).
 */
export interface IVoiceAssignment extends Document {
  teacherId: string;
  title: string;
  instructions: string;
  sentences: IVoiceSentence[];
  status: VoiceAssignmentStatus;
  publishedAt: Date | null;
  /** Optional deadline; displayed to students, never blocks submission. */
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const sentenceSchema = new Schema<IVoiceSentence>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, maxlength: 400 },
  },
  { _id: false }
);

const voiceAssignmentSchema = new Schema<IVoiceAssignment>(
  {
    teacherId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    instructions: { type: String, default: '', trim: true, maxlength: 1200 },
    sentences: { type: [sentenceSchema], default: [] },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    publishedAt: { type: Date, default: null },
    dueDate: { type: Date, default: null },
  },
  { timestamps: true }
);

// Student list ordering (published, newest first) and the teacher list.
voiceAssignmentSchema.index({ status: 1, publishedAt: -1 });
voiceAssignmentSchema.index({ teacherId: 1, updatedAt: -1 });

export const VoiceAssignment: Model<IVoiceAssignment> = model<IVoiceAssignment>(
  'VoiceAssignment',
  voiceAssignmentSchema
);

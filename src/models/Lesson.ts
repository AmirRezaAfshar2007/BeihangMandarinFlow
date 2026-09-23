import { Schema, model, Document, Model, Types } from 'mongoose';

export type LessonPublicationStatus = 'draft' | 'published';

export interface ILesson extends Document {
  teacherId: string; // User.studentId of the author (admin/teacher)
  title: string;
  description: string;
  status: LessonPublicationStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const lessonSchema = new Schema<ILesson>(
  {
    // Ownership is keyed the same way every other model keys its owner — by
    // the authenticated studentId string from the JWT, never a client value.
    teacherId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    description: { type: String, default: '', trim: true, maxlength: 1200 },
    // Draft lessons are visible only to their author; published lessons to all students.
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Teacher dashboard listing: one teacher's lessons, newest first.
lessonSchema.index({ teacherId: 1, updatedAt: -1 });
// Student listing: published lessons, newest publication first.
lessonSchema.index({ status: 1, publishedAt: -1 });

// Exported so services can validate ObjectId route params the same way
// folder.service.ts validates them before touching the database.
export function isValidLessonId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

export const Lesson: Model<ILesson> = model<ILesson>('Lesson', lessonSchema);

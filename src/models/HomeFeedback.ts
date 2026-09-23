import { Schema, model, Document, Model } from 'mongoose';

export type HomeFeedbackChoice = 'interested' | 'not_interested';

/**
 * One questionnaire response per student ("Are you interested in this
 * project?").
 *
 * Responses are submitted from the PUBLIC landing page — before the visitor
 * signs in — so `fullName` is entered by the respondent rather than joined
 * from a User document (a visitor may not have an account at all).
 * `studentId` stays unique: resubmitting updates the existing response
 * instead of creating duplicates, so totals equal distinct participants.
 */
export interface IHomeFeedback extends Document {
  studentId: string;
  fullName: string;
  choice: HomeFeedbackChoice;
  createdAt: Date;
  updatedAt: Date;
}

const homeFeedbackSchema = new Schema<IHomeFeedback>(
  {
    studentId: { type: String, required: true, unique: true, index: true },
    // Defaulted rather than required so responses stored before the public
    // landing page existed still read cleanly (the admin view falls back to
    // the student ID when the name is empty).
    fullName: { type: String, default: '', maxlength: 120 },
    choice: { type: String, enum: ['interested', 'not_interested'], required: true },
  },
  { timestamps: true }
);

// Admin analytics lists the most recent responses first.
homeFeedbackSchema.index({ updatedAt: -1 });

export const HomeFeedback: Model<IHomeFeedback> = model<IHomeFeedback>('HomeFeedback', homeFeedbackSchema);

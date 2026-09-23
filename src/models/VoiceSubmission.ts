import { Schema, model, Document, Model, Types } from 'mongoose';

export type VoiceSubmissionStatus = 'submitted' | 'reviewed';

/** Storage coordinates for one student recording. */
export interface IVoiceAudio {
  gridFsFileId: Types.ObjectId;
  gridFsBucketName: string;
  mimeType: string;
  size: number;
  /** Length reported by the recording timer; advisory metadata only. */
  durationSeconds: number;
}

/**
 * One student's recording for one voice assignment.
 *
 * Ownership is `studentId`, taken from the authenticated JWT by the route —
 * never from the request body. `studentName` is a snapshot for resilient
 * display, but the live name is still resolved server-side from User on the
 * teacher's review screens (a renamed account shows its current name).
 *
 * `sentences` is a snapshot of the assignment prompt at submit time so the
 * teacher always sees the exact text the student was asked to read, even
 * after the assignment is edited later.
 */
export interface IVoiceSubmission extends Document {
  studentId: string;
  studentName: string;
  assignmentId: Types.ObjectId;
  assignmentTitle: string;
  sentences: { id: string; text: string }[];
  audio: IVoiceAudio;
  status: VoiceSubmissionStatus;
  /** 1 on first submission; increments on an explicit re-record. */
  submissionCount: number;
  teacherScore: number | null; // 0-100, set during review
  teacherFeedback: string;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const audioSchema = new Schema<IVoiceAudio>(
  {
    gridFsFileId: { type: Schema.Types.ObjectId, required: true },
    gridFsBucketName: { type: String, required: true, default: 'assignment_audio' },
    mimeType: { type: String, required: true, maxlength: 100 },
    size: { type: Number, required: true, min: 1 },
    durationSeconds: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const voiceSubmissionSchema = new Schema<IVoiceSubmission>(
  {
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, default: '', maxlength: 120 },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'VoiceAssignment', required: true, index: true },
    assignmentTitle: { type: String, default: '', maxlength: 160 },
    sentences: {
      type: [{ id: { type: String, required: true }, text: { type: String, default: '' } }],
      default: [],
      _id: false,
    },
    audio: { type: audioSchema, required: true },
    status: { type: String, enum: ['submitted', 'reviewed'], default: 'submitted', index: true },
    submissionCount: { type: Number, default: 1, min: 1 },
    teacherScore: { type: Number, default: null, min: 0, max: 100 },
    teacherFeedback: { type: String, default: '', maxlength: 2000 },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One live recording per (student, assignment). Re-recording replaces the
// stored row rather than adding a second one, so the unique index makes the
// "one submission per student" rule race-proof at the database level.
voiceSubmissionSchema.index({ studentId: 1, assignmentId: 1 }, { unique: true });
voiceSubmissionSchema.index({ assignmentId: 1, createdAt: -1 });

export const VoiceSubmission: Model<IVoiceSubmission> = model<IVoiceSubmission>(
  'VoiceSubmission',
  voiceSubmissionSchema
);

import { Schema, model, Document, Model, Types } from 'mongoose';

export type MaterialKind = 'pdf' | 'ppt' | 'pptx' | 'doc' | 'docx';

export interface ILearningMaterial extends Document {
  lessonId: Types.ObjectId;
  teacherId: string;
  originalName: string; // sanitized display name (never used for filesystem paths)
  kind: MaterialKind;
  mimeType: string; // server-verified canonical MIME type
  size: number; // bytes, from the server, not the client
  // GridFS identifiers. Files live inside MongoDB, which survives ephemeral
  // PaaS redeploys the same way the rest of the app's data does.
  gridFsFileId: Types.ObjectId;
  gridFsBucketName: string;
  createdAt: Date;
  updatedAt: Date;
}

const learningMaterialSchema = new Schema<ILearningMaterial>(
  {
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },
    teacherId: { type: String, required: true, index: true },
    // Stored exactly as the server sanitized it; the client never names files.
    originalName: { type: String, required: true, maxlength: 255 },
    kind: { type: String, enum: ['pdf', 'ppt', 'pptx', 'doc', 'docx'], required: true },
    mimeType: { type: String, required: true, maxlength: 100 },
    size: { type: Number, required: true, min: 1 },
    gridFsFileId: { type: Schema.Types.ObjectId, required: true },
    gridFsBucketName: { type: String, required: true, default: 'learning_materials' },
  },
  { timestamps: true }
);

// Frequently used: all materials of one lesson, ordered.
learningMaterialSchema.index({ lessonId: 1, createdAt: 1 });

export const LearningMaterial: Model<ILearningMaterial> = model<ILearningMaterial>(
  'LearningMaterial',
  learningMaterialSchema
);

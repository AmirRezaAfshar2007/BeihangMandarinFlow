import { Schema, model, Document, Model } from 'mongoose';

export interface IFolder extends Document {
  studentId: string;
  name: string;
  description: string;
  category: string;
  color: string;
  icon: string;
  isFavorite: boolean;
  customDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const folderSchema = new Schema<IFolder>(
  {
    studentId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: '', trim: true, maxlength: 300 },
    // Free-form grouping tag, e.g. "HSK 3", "Radicals", "Exam Prep".
    category: { type: String, default: 'General', trim: true, maxlength: 40 },
    // Tailwind color family name used to theme the folder's chip/card (see FOLDER_COLORS on the client).
    color: { type: String, default: 'emerald', maxlength: 20 },
    // Emoji or short glyph shown as the folder's icon.
    icon: { type: String, default: '📁', maxlength: 8 },
    isFavorite: { type: Boolean, default: false },
    // Optional user-supplied "created on" override, shown instead of the real createdAt when set.
    customDate: { type: Date, default: null },
  },
  { timestamps: true }
);

// A student can't have two folders with the same name.
folderSchema.index({ studentId: 1, name: 1 }, { unique: true });

export const Folder: Model<IFolder> = model<IFolder>('Folder', folderSchema);

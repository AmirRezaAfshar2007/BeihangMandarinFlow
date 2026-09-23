import { Schema, model, Document, Model } from 'mongoose';

export interface IAnnouncement extends Document {
  teacherId: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    teacherId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

// Hub listings: newest first.
announcementSchema.index({ createdAt: -1 });

export const Announcement: Model<IAnnouncement> = model<IAnnouncement>('Announcement', announcementSchema);

import { Schema, model, Document, Model } from 'mongoose';

export interface IUser extends Document {
  studentId: string;
  fullName: string;
  passwordHash: string;
  role: 'admin' | 'student';
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^\d{5,15}$/,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    // select: false -> never returned unless a query explicitly does .select('+passwordHash')
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'student'],
      default: 'student',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// studentId already has a unique index via `unique: true` above.

export const User: Model<IUser> = model<IUser>('User', userSchema);

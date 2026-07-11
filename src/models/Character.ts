import { Schema, model, Document, Model } from 'mongoose';

export interface IExampleWord {
  word: string;
  pinyin: string;
  meaning: string;
}

export interface IExampleSentence {
  sentence: string;
  pinyin: string;
  meaning: string;
}

export interface ICharacter extends Document {
  studentId: string;
  character: string;
  simplified: string;
  traditional: string;
  pinyin: string;
  englishMeaning: string;
  persianMeaning: string;
  radicals: string[];
  strokeCount: number;
  hskLevel: number;
  frequencyRank: number;
  exampleWords: IExampleWord[];
  exampleSentences: IExampleSentence[];
  audioPronunciation: string;
  lastReviewed: Date | null;
  reviewCount: number;
  learningLevel: number; // 0 New, 1 Learning, 2 Familiar, 3 Mastered
  memoryStability: number;
  interval: number;
  nextReviewDate: string; // YYYY-MM-DD, kept as string to match SM-2 day-granularity logic
  createdAt: Date;
  updatedAt: Date;
}

const exampleWordSchema = new Schema<IExampleWord>(
  { word: String, pinyin: String, meaning: String },
  { _id: false }
);

const exampleSentenceSchema = new Schema<IExampleSentence>(
  { sentence: String, pinyin: String, meaning: String },
  { _id: false }
);

const characterSchema = new Schema<ICharacter>(
  {
    studentId: { type: String, required: true, index: true },
    character: { type: String, required: true, trim: true, maxlength: 4 },
    simplified: { type: String, default: '' },
    traditional: { type: String, default: '' },
    pinyin: { type: String, default: '' },
    englishMeaning: { type: String, default: '' },
    persianMeaning: { type: String, default: '' },
    radicals: { type: [String], default: [] },
    strokeCount: { type: Number, default: 1, min: 0 },
    hskLevel: { type: Number, default: 1, min: 0 },
    frequencyRank: { type: Number, default: 9999 },
    exampleWords: { type: [exampleWordSchema], default: [] },
    exampleSentences: { type: [exampleSentenceSchema], default: [] },
    audioPronunciation: { type: String, default: '' },
    lastReviewed: { type: Date, default: null },
    reviewCount: { type: Number, default: 0, min: 0 },
    learningLevel: { type: Number, default: 0, min: 0, max: 3 },
    memoryStability: { type: Number, default: 10, min: 0, max: 100 },
    interval: { type: Number, default: 1, min: 1 },
    nextReviewDate: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

// A student can't add the same character to their deck twice.
characterSchema.index({ studentId: 1, character: 1 }, { unique: true });
// Speeds up "how many mastered characters does this student have" aggregations.
characterSchema.index({ studentId: 1, learningLevel: 1 });

export const Character: Model<ICharacter> = model<ICharacter>('Character', characterSchema);

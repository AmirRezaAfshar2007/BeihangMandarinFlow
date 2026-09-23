import { Schema, model, Document, Model } from 'mongoose';

export type SpeakingDifficulty = 'beginner' | 'intermediate' | 'advanced';

export interface ISpeakingScores {
  overall: number;
  pronunciation: number;
  grammar: number;
  fluency: number;
  vocabulary: number;
}

export interface ISpeakingAttempt extends Document {
  studentId: string;
  challengePrompt: string;
  difficulty: SpeakingDifficulty;
  durationSeconds: number;
  aiAvailable: boolean;
  // True when no audible/intelligible speech could be found in the
  // recording (silent, empty, too short, or unrecognizable). Scores are
  // forced to 0 in this case — see speaking.service.ts.
  noSpeechDetected: boolean;
  transcript: string;
  transcriptPinyin: string;
  scores: ISpeakingScores | null;
  strengths: string[];
  improvementTips: string[];
  mispronuncedWords: string[];
  suggestedPhrases: string[];
  analysisError: string;
  createdAt: Date;
  updatedAt: Date;
}

const scoresSchema = new Schema<ISpeakingScores>(
  {
    overall: { type: Number, min: 0, max: 100 },
    pronunciation: { type: Number, min: 0, max: 100 },
    grammar: { type: Number, min: 0, max: 100 },
    fluency: { type: Number, min: 0, max: 100 },
    vocabulary: { type: Number, min: 0, max: 100 },
  },
  { _id: false }
);

const speakingAttemptSchema = new Schema<ISpeakingAttempt>(
  {
    studentId: { type: String, required: true, index: true },
    challengePrompt: { type: String, required: true },
    difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
    durationSeconds: { type: Number, default: 0, min: 0 },
    // False when the AI coach could not be reached — the recording was still
    // logged, just without a real assessment attached to it.
    aiAvailable: { type: Boolean, default: true },
    noSpeechDetected: { type: Boolean, default: false },
    transcript: { type: String, default: '' },
    transcriptPinyin: { type: String, default: '' },
    scores: { type: scoresSchema, default: null },
    strengths: { type: [String], default: [] },
    improvementTips: { type: [String], default: [] },
    mispronuncedWords: { type: [String], default: [] },
    suggestedPhrases: { type: [String], default: [] },
    analysisError: { type: String, default: '' },
  },
  { timestamps: true }
);

speakingAttemptSchema.index({ studentId: 1, createdAt: -1 });

export const SpeakingAttempt: Model<ISpeakingAttempt> = model<ISpeakingAttempt>(
  'SpeakingAttempt',
  speakingAttemptSchema
);

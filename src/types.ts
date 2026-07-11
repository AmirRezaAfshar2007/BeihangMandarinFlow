/**
 * Shared Type Definitions for the Sino3D V2.0 Chinese Calligraphy & Learning Platform.
 */

export interface Student {
  id: string; // Internal unique ID
  studentId: string; // The login credential (e.g., "401120145")
  fullName: string;
  passwordHash: string;
  role: 'admin' | 'student';
  disabled: boolean;
  createdAt: string;
}

export interface ExampleWord {
  word: string;
  pinyin: string;
  meaning: string;
}

export interface ExampleSentence {
  sentence: string;
  pinyin: string;
  meaning: string;
}

export interface CharacterItem {
  id: string;
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
  exampleWords: ExampleWord[];
  exampleSentences: ExampleSentence[];
  audioPronunciation: string; // Base64 audio or TTS trigger
  dateAdded: string;
  lastReviewed: string | null;
  reviewCount: number;
  learningLevel: number; // 0 = New, 1 = Learning, 2 = Familiar, 3 = Mastered
  memoryStability: number; // SRS stability percentage (0 - 100)
  interval: number; // Next interval in days
  nextReviewDate: string; // ISO date string or YYYY-MM-DD
}

export interface PracticeLog {
  id: string;
  studentId: string;
  character: string;
  quizMode: 'stroke' | 'meaning' | 'pinyin' | 'typing' | 'multichoice' | 'flashcard';
  success: boolean;
  score: number; // 0-100
  timestamp: string;
}

export interface StudentStats {
  studentId: string;
  currentStreak: number;
  totalXp: number;
  studyTimeSeconds: number;
  lastActiveDate: string | null;
}

export interface Achievement {
  id: string;
  studentId: string;
  title: string;
  description: string;
  unlockedAt: string;
  icon: string;
}

export interface UserSession {
  token: string;
  studentId: string;
  expiresAt: string;
}

export interface DictionaryApiResponse {
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
  exampleWords: ExampleWord[];
  exampleSentences: ExampleSentence[];
}

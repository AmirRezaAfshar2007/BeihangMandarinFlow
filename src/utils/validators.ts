import { AppError } from './errors.ts';
import { QuizMode } from '../models/PracticeLog.ts';

const STUDENT_ID_RE = /^\d{5,15}$/;
// At least 8 chars, mixing letters and numbers — deliberately not overly strict
// so legitimate students aren't locked out, but strong enough to stop trivial
// passwords like "1234567".
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

export function assertValidStudentId(studentId: unknown): asserts studentId is string {
  if (typeof studentId !== 'string' || !STUDENT_ID_RE.test(studentId)) {
    throw new AppError('Invalid Student ID format. Must be numeric (e.g., 401120145).', 400);
  }
}

export function assertValidFullName(fullName: unknown): asserts fullName is string {
  if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 120) {
    throw new AppError('Full Name must be between 2 and 120 characters.', 400);
  }
}

export function assertValidPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || !PASSWORD_RE.test(password)) {
    throw new AppError(
      'Password must be at least 8 characters and include both letters and numbers.',
      400
    );
  }
}

export function assertSingleHanzi(character: unknown): asserts character is string {
  if (typeof character !== 'string' || character.trim().length !== 1) {
    throw new AppError('Please enter exactly one Chinese character.', 400);
  }
}

const QUIZ_MODES: QuizMode[] = ['stroke', 'meaning', 'pinyin', 'typing', 'multichoice', 'flashcard'];

export function assertValidQuizMode(quizMode: unknown): asserts quizMode is QuizMode {
  if (typeof quizMode !== 'string' || !QUIZ_MODES.includes(quizMode as QuizMode)) {
    throw new AppError('Invalid quiz mode.', 400);
  }
}

export function assertValidScore(score: unknown): asserts score is number {
  if (typeof score !== 'number' || Number.isNaN(score) || score < 0 || score > 100) {
    throw new AppError('Score must be a number between 0 and 100.', 400);
  }
}

// Same Chinese-character range the AI dictionary lookup uses (qwen.service.ts),
// kept in sync so nothing validated here is later rejected as "not Chinese"
// during the lookup step of a broadcast.
const HANZI_RE = /[\u4e00-\u9fa5]/;
const MAX_BROADCAST_CHARACTERS = 150;

/**
 * Parses a block of text into a deduplicated list of single Hanzi characters.
 * Accepts entries separated by a plain comma, a fullwidth/Arabic-Persian
 * comma, newlines, or tabs — this is the one shared format for both a
 * teacher/admin manually typing characters into a textarea and pasting the
 * contents of a simple CSV file (one line of comma-separated characters).
 * Anything that isn't exactly one Chinese character is reported back as
 * `invalid` instead of silently dropped, so the caller can surface it.
 */
export function parseCharacterListInput(raw: unknown): { valid: string[]; invalid: string[] } {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new AppError('Please provide at least one Chinese character.', 400);
  }

  const tokens = raw
    .split(/[,\uFF0C\u060C\n\r\t]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    throw new AppError('Please provide at least one Chinese character.', 400);
  }
  if (tokens.length > MAX_BROADCAST_CHARACTERS) {
    throw new AppError(
      `Too many characters in one batch (${tokens.length}). Please limit a single broadcast to ${MAX_BROADCAST_CHARACTERS} characters.`,
      400
    );
  }

  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.length === 1 && HANZI_RE.test(token)) {
      if (!seen.has(token)) {
        seen.add(token);
        valid.push(token);
      }
    } else if (!seen.has(token)) {
      invalid.push(token);
    }
  }
  return { valid, invalid };
}

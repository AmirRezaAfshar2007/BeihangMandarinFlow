import { HomeFeedback, HomeFeedbackChoice } from '../models/HomeFeedback.ts';
import { AppError } from '../utils/errors.ts';

/**
 * Public landing page ("Home") business logic.
 *
 * The landing page is anonymous: visitors answer the interest questionnaire
 * with their name + student ID before they ever sign in, so nothing here
 * touches the session. Responses are one row per student ID (see
 * models/HomeFeedback.ts) — resubmitting updates the row instead of creating
 * a duplicate, so the totals always equal distinct participants.
 */

const MAX_NAME_LENGTH = 120;
const MIN_NAME_LENGTH = 2;

/** Student IDs are numeric and 5-15 digits long, matching the User model. */
const STUDENT_ID_PATTERN = /^\d{5,15}$/;

/* ------------------------------------------------------------------ */
/* Serialization                                                       */
/* ------------------------------------------------------------------ */

export interface HomeFeedbackTotals {
  total: number;
  interested: number;
  notInterested: number;
  interestedPercent: number;
  notInterestedPercent: number;
}

function computeTotals(interested: number, notInterested: number): HomeFeedbackTotals {
  const total = interested + notInterested;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  return {
    total,
    interested,
    notInterested,
    interestedPercent: pct(interested),
    notInterestedPercent: pct(notInterested),
  };
}

async function getTotals(): Promise<HomeFeedbackTotals> {
  const [interested, notInterested] = await Promise.all([
    HomeFeedback.countDocuments({ choice: 'interested' }),
    HomeFeedback.countDocuments({ choice: 'not_interested' }),
  ]);
  return computeTotals(interested, notInterested);
}

/* ------------------------------------------------------------------ */
/* Public — questionnaire                                              */
/* ------------------------------------------------------------------ */

/** Aggregate-only view of the questionnaire, safe to serve anonymously. */
export async function getPublicFeedback(): Promise<{ totals: HomeFeedbackTotals }> {
  return { totals: await getTotals() };
}

export interface SubmitFeedbackInput {
  fullName?: unknown;
  studentId?: unknown;
  choice?: unknown;
}

/**
 * Records (or updates) one visitor's answer.
 *
 * Everything is validated server-side: the visitor supplies the name and ID,
 * so neither can be trusted beyond being display text and a lookup key.
 * Normalizing into typed locals up front keeps the narrowed types alive
 * across the awaits below.
 */
export async function submitFeedback(
  input: SubmitFeedbackInput
): Promise<{ choice: HomeFeedbackChoice; totals: HomeFeedbackTotals }> {
  const { fullName, studentId, choice } = input;

  if (choice !== 'interested' && choice !== 'not_interested') {
    throw new AppError('Choice must be either "interested" or "not_interested".', 400);
  }

  const cleanName = typeof fullName === 'string' ? fullName.replace(/\s+/g, ' ').trim() : '';
  if (cleanName.length < MIN_NAME_LENGTH) {
    throw new AppError('Please enter your name (at least 2 characters).', 400);
  }
  if (cleanName.length > MAX_NAME_LENGTH) {
    throw new AppError(`Name must be at most ${MAX_NAME_LENGTH} characters.`, 400);
  }

  const cleanStudentId = typeof studentId === 'string' ? studentId.trim() : '';
  if (!STUDENT_ID_PATTERN.test(cleanStudentId)) {
    throw new AppError('Student ID must be 5-15 digits.', 400);
  }

  await HomeFeedback.findOneAndUpdate(
    { studentId: cleanStudentId },
    { fullName: cleanName, choice },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { choice, totals: await getTotals() };
}

/* ------------------------------------------------------------------ */
/* Admin — questionnaire analytics                                     */
/* ------------------------------------------------------------------ */

export interface HomeFeedbackStats extends HomeFeedbackTotals {
  recent: {
    studentId: string;
    fullName: string;
    choice: HomeFeedbackChoice;
    updatedAt: string;
  }[];
}

export async function getFeedbackStats(): Promise<HomeFeedbackStats> {
  const [totals, recentRows] = await Promise.all([
    getTotals(),
    HomeFeedback.find().sort({ updatedAt: -1 }).limit(20).lean(),
  ]);

  return {
    ...totals,
    recent: recentRows.map((row) => ({
      studentId: row.studentId,
      // Responses submitted before the name field existed fall back to the ID.
      fullName: row.fullName || row.studentId,
      choice: row.choice,
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

/**
 * Shared types for the public Home / landing page.
 * Mirrors the serialized shapes returned by the backend (home.service.ts),
 * so the client and server contracts stay visually side by side.
 */

export type HomeFeedbackChoice = 'interested' | 'not_interested';

export interface HomeFeedbackTotals {
  total: number;
  interested: number;
  notInterested: number;
  interestedPercent: number;
  notInterestedPercent: number;
}

/** What the public GET /api/home returns to an anonymous visitor. */
export interface HomePublicData {
  totals: HomeFeedbackTotals;
}

export interface HomeFeedbackRecent {
  studentId: string;
  fullName: string;
  choice: HomeFeedbackChoice;
  updatedAt: string;
}

export interface HomeFeedbackStats extends HomeFeedbackTotals {
  recent: HomeFeedbackRecent[];
}

/** The questionnaire answer a visitor submits from the landing page. */
export interface HomeFeedbackSubmission {
  fullName: string;
  studentId: string;
  choice: HomeFeedbackChoice;
}

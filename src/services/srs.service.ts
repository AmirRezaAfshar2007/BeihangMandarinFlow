export interface SrsState {
  interval: number;
  memoryStability: number;
  learningLevel: number; // 0 New, 1 Learning, 2 Familiar, 3 Mastered
}

export interface SrsResult extends SrsState {
  nextReviewDate: string; // YYYY-MM-DD
  isSuccess: boolean;
  awardedXp: number;
}

/** score (0-100) -> classic SM-2 quality rating (0-5). */
function scoreToRating(score: number): number {
  if (score >= 90) return 5;
  if (score >= 80) return 4;
  if (score >= 70) return 3;
  if (score >= 50) return 2;
  if (score >= 30) return 1;
  return 0;
}

/**
 * Pure function computing the next SRS state for a character after a
 * practice attempt. Kept free of any DB access so it's trivially unit
 * testable and reusable outside the Express route handler.
 */
export function applySrsUpdate(current: SrsState, score: number): SrsResult {
  const isSuccess = score >= 70;
  const rating = scoreToRating(score);

  let { interval, memoryStability, learningLevel } = current;

  if (rating >= 3) {
    if (learningLevel === 0) {
      interval = 1;
      learningLevel = 1;
      memoryStability = 40;
    } else if (learningLevel === 1) {
      interval = 3;
      learningLevel = 2;
      memoryStability = 65;
    } else {
      interval = Math.min(180, Math.round(current.interval * 2.1));
      learningLevel = 3;
      memoryStability = Math.min(100, Math.round(current.memoryStability + 10));
    }
  } else {
    interval = 1;
    learningLevel = Math.max(0, learningLevel - 1);
    memoryStability = Math.max(10, Math.round(current.memoryStability - 20));
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return {
    interval,
    memoryStability,
    learningLevel,
    nextReviewDate: nextReview.toISOString().split('T')[0],
    isSuccess,
    awardedXp: isSuccess ? 25 : 10,
  };
}

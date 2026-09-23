import rateLimit from 'express-rate-limit';
import { keyByUserOrIp } from './rateLimitKeys.ts';

/**
 * Every limiter in this file is mounted on a route that already sits behind
 * `requireAuth`, so the caller's account is known by the time the limit is
 * spent. They are therefore keyed per student rather than per IP: a whole
 * class shares one campus NAT address, and a per-IP budget would mean the
 * first few uploads of the day silently consumed the allowance for everyone
 * else on the network. See rateLimitKeys.ts for the full reasoning.
 */

/**
 * Applied to /api/learning/materials (multipart uploads). Uploads are the
 * most bandwidth- and storage-heavy requests in the app, so they get their
 * own bounded budget separate from the general API limiter.
 */
export const materialUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: 'Too many uploads this hour. Please try again later.' },
});

/**
 * Applied to /api/learning/exercises/generate-ai. Each call costs real AI
 * tokens (same engine as the Speaking Coach), so it is bounded per hour
 * like speakingAnalysisLimiter.
 */
export const aiExerciseLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: 'AI generation limit reached for this hour. Please try again later.' },
});

/**
 * Applied to the School section's voice submission endpoint
 * (POST /api/school/student/assignments/:id/submissions).
 *
 * Generous enough for the real workflow — record, listen, re-record, submit,
 * sometimes several times — while still bounding how much audio one student
 * can push into GridFS per hour. Bytes are also capped per upload by
 * MAX_AUDIO_SIZE_BYTES.
 */
export const voiceSubmissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: 'Too many voice submissions this hour. Please try again later.' },
});

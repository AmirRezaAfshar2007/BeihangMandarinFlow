import rateLimit from 'express-rate-limit';
import { keyByAccountOrIp, keyByTokenOrIp } from './rateLimitKeys.ts';

/**
 * Applied to the whole /api surface. This is the blunt backstop against gross
 * abuse and scraping, so the ceiling is deliberately high — it exists to stop a
 * runaway client or a scraper, not to pace normal use.
 *
 * Keyed by token-or-IP (see rateLimitKeys.ts): with the original 300/15 min
 * per-IP budget, a single campus network shared by an entire class would have
 * exhausted the allowance after roughly two students browsed the app, and every
 * other student would have received 429s for the rest of the window. The real
 * per-account budgets live on the expensive routes below.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByTokenOrIp,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

/**
 * Applied to /api/auth/login. Brute-force protection that counts against the
 * *target account* rather than the caller's IP, so one shared campus connection
 * can't lock the class out and one account can't be hammered.
 * `skipSuccessfulRequests` means only failed attempts consume the budget.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByAccountOrIp,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

/**
 * A loose per-IP ceiling on the whole /api/auth surface, layered under the
 * per-account limits above. Its job is to bound anonymous flooding (and
 * account enumeration across many accounts), which is why it sits on the IP;
 * its numbers are loose enough that a full class signing in at once — 150
 * logins bursting through one NAT address — stays comfortably inside it.
 */
export const authFloodLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication requests from this network. Please try again shortly.' },
});

/**
 * Applied to forgot-password. Counts per target account so one account can't be
 * repeatedly attacked, while being generous enough that a campus full of
 * students who genuinely forgot a password in the same hour is still fine.
 */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByAccountOrIp,
  message: { error: 'Too many password reset attempts. Please try again in an hour.' },
});

/**
 * Applied to /api/auth/register, which is now an admin-driven flow: creating a
 * whole class of accounts is a legitimate burst from one machine, so the odd
 * old ceiling (10/hour/IP) would have throttled onboarding to ten students an
 * hour. Self-service sign-up is separately switched off server-side (see
 * ALLOW_SELF_REGISTRATION), so this only paces the administrative path.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many account creations from this network this hour. Please try again later.' },
});

/**
 * Applied to /api/speaking/analyze. Voice analysis is the single most
 * expensive request in the app (an ffmpeg transcode plus an AI call), so it
 * gets a tight budget — but keyed per student, since a class shares one IP.
 * A genuine per-student daily cap (DAILY_SPEAKING_LIMIT) sits on top of this.
 */
export const speakingAnalysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByTokenOrIp,
  message: { error: 'Too many speaking analyses this hour. Please try again later.' },
});

/**
 * Applied to /api/speaking/transcribe-chunk. Powers the live caption shown
 * while the user is still recording, so the frontend polls this every few
 * seconds for the duration of a recording (up to the recording cap, so ~30-40
 * calls for one long recording). That's much more frequent than /analyze
 * (called once per submission), so it needs its own, looser-per-call but still
 * bounded budget rather than sharing speakingAnalysisLimiter.
 */
export const speakingCaptionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByTokenOrIp,
  message: { error: 'Too many live caption requests. Please try again shortly.' },
});

/**
 * Applied to POST /api/home/feedback — the only anonymous write endpoint, on
 * the public landing page. The questionnaire is an upsert, so this only has to
 * stop spam rather than duplicates. The budget stays deliberately generous
 * because whole classrooms share one NAT'd campus IP: a tight per-IP limit
 * would lock out legitimate respondents after a handful of submissions.
 */
export const homeFeedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many feedback submissions. Please slow down and try again shortly.' },
});

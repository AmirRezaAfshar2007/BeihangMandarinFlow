import rateLimit from 'express-rate-limit';

/** Applied to the whole /api surface. Generous, just stops gross abuse/scraping. */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

/**
 * Applied to /api/auth/login. Brute-force protection: 5 attempts per 15
 * minutes per IP, as required by the security hardening spec.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

/**
 * Applied to registration and forgot-password, which are also attractive
 * targets for enumeration / spam but need a looser limit than login.
 */
export const sensitiveAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in an hour.' },
});

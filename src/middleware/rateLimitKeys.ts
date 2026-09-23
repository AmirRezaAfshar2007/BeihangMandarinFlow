import crypto from 'node:crypto';
import type { Request } from 'express';
import type { AuthRequest } from '../types/express.d.ts';

/**
 * Rate-limit key selection.
 *
 * Why this file exists at all: the app was originally limited per *IP*
 * address, which quietly assumes each student arrives from a different one.
 * They don't. A class — often the whole campus — shares a single NAT address,
 * so a per-IP budget is really a per-school budget. At the original numbers
 * (`/api` at 300 requests / 15 min) about two students opening a handful of
 * pages would consume the entire allowance and the rest of the class would
 * start getting 429s; `login` at 5 / 15 min meant only five students could sign
 * in per quarter hour from one campus connection.
 *
 * The fix is to spend the limit against whatever actually identifies the
 * caller — the authenticated account where there is one, the target account for
 * sign-in, and the IP only as a genuine last resort. Per-account budgets keep
 * the protection that matters (one account cannot brute-force or hammer the
 * API) while a shared connection stops being a shared penalty.
 */

/** IPv4-mapped IPv6 (`::ffff:1.2.3.4`) and zone ids are folded into plain IPv4. */
function normalizeIp(ip: string): string {
  const withoutZone = ip.split('%')[0];
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(withoutZone);
  if (mapped) return mapped[1];
  // Real IPv6: bucket by /64, since one client is routinely handed a whole
  // /64 and rotating within it would otherwise mint unlimited fresh buckets.
  if (withoutZone.includes(':')) {
    return `${withoutZone.split(':').slice(0, 4).join(':')}/64`;
  }
  return withoutZone;
}

/** The caller's IP, normalized. Kept in its own function so the key
 * generators below never touch `req.ip` directly (express-rate-limit's
 * validator scans the generator source and warns on raw `req.ip` use). */
export function clientIp(req: Request): string {
  return `ip:${normalizeIp(req.ip ?? 'unknown')}`;
}

/**
 * `requireAuth` has already run, so the account is known. Use it.
 * Used by every route-level limiter mounted after authentication.
 */
export function keyByUserOrIp(req: Request): string {
  const studentId = (req as AuthRequest).user?.studentId;
  return studentId ? `user:${studentId}` : clientIp(req);
}

/**
 * For sign-in: the subject is the account being targeted, not the connection
 * it comes from. This is what keeps brute-force protection meaningful on a
 * shared campus IP without locking out the class.
 */
export function keyByAccountOrIp(req: Request): string {
  const studentId = (req.body as { studentId?: unknown } | undefined)?.studentId;
  if (typeof studentId === 'string' && studentId.trim()) {
    return `acct:${studentId.trim()}`;
  }
  return clientIp(req);
}

/**
 * For the `/api` mount point, which runs *before* authentication, so there is
 * no verified account yet — key off the presented bearer token instead (a
 * non-secret hash, so tokens never sit in a Map key). Requests without a token
 * fall back to IP, which covers anonymous traffic and scrapers.
 *
 * Note this is a broad backstop, not the security boundary: a caller sending
 * fabricated tokens can obtain fresh buckets here, but every expensive and
 * every anonymous write endpoint additionally has its own account- or
 * IP-keyed limiter, and forged tokens still have to get past `requireAuth`.
 */
export function keyByTokenOrIp(req: Request): string {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ') && header.length > 7) {
    const digest = crypto.createHash('sha256').update(header.slice(7)).digest('hex');
    return `token:${digest.slice(0, 32)}`;
  }
  return clientIp(req);
}

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { AppError } from '../utils/errors.ts';

const router = Router();

// HanziWriter's own stroke-order data package. This is only ever fetched
// from OUR server, never from the browser - see the comment in app.ts for
// why that matters for CSP.
const HANZI_DATA_CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0';

// Matches a single CJK Unified Ideograph (and common Extension A characters).
// This is a hard allowlist so the endpoint can't be used as an open proxy to
// fetch arbitrary paths from jsdelivr.
const SINGLE_HANZI = /^[\u3400-\u4DBF\u4E00-\u9FFF]$/;

// Simple in-memory cache: stroke data for a given character never changes,
// so once we've fetched it there's no reason to hit the CDN again for the
// life of this process.
//
// Bounded, because "for the life of this process" is weeks on a pilot
// deployment: an unbounded Map would accumulate the stroke data of every
// character any student ever opened and never give the memory back. Each
// entry is tens of kilobytes, so the cap keeps the cache in the low tens of
// megabytes while comfortably covering more characters than any course uses.
// Map iteration order is insertion order, so the first key is always the
// least recently added and evicting it is the intended FIFO behaviour.
const MAX_CACHE_ENTRIES = 2000;
const cache = new Map<string, unknown>();

/**
 * De-duplicates concurrent fetches for the same character.
 *
 * Without this, a class opening the same character at the same moment sends
 * one upstream request per student — a burst of identical fetches for data
 * that is immutable. Requests that arrive while a fetch is in flight await
 * that fetch instead of starting their own.
 */
const inFlight = new Map<string, Promise<unknown>>();

router.get(
  '/:char',
  asyncHandler(async (req: Request, res: Response) => {
    const char = req.params.char;

    if (!char || !SINGLE_HANZI.test(char)) {
      throw new AppError('Invalid character requested.', 400);
    }

    if (cache.has(char)) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.json(cache.get(char));
      return;
    }

    const existing = inFlight.get(char);
    const pending =
      existing ??
      (async () => {
        const upstreamRes = await fetch(`${HANZI_DATA_CDN}/${encodeURIComponent(char)}.json`, {
          // Fail fast if the CDN is slow/unreachable (e.g. campus networks) rather
          // than letting the request — and the client's HanziWriter canvas — hang.
          signal: AbortSignal.timeout(12000),
        });

        if (!upstreamRes.ok) {
          throw new AppError(`No stroke data available for "${char}".`, 404);
        }

        const data = await upstreamRes.json();
        if (cache.size >= MAX_CACHE_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(char, data);
        return data;
      })();

    if (!existing) {
      inFlight.set(char, pending);
      // Clear the in-flight marker however the fetch ends, so a failure is not
      // cached as a permanently pending entry.
      void pending.finally(() => inFlight.delete(char)).catch(() => {});
    }

    const data = await pending;

    // Cache aggressively client-side too - this data is immutable.
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.json(data);
  })
);

export default router;

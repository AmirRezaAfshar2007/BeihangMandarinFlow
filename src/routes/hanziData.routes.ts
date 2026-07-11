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
const cache = new Map<string, unknown>();

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

    const upstreamRes = await fetch(`${HANZI_DATA_CDN}/${encodeURIComponent(char)}.json`);

    if (!upstreamRes.ok) {
      throw new AppError(`No stroke data available for "${char}".`, 404);
    }

    const data = await upstreamRes.json();
    cache.set(char, data);

    // Cache aggressively client-side too - this data is immutable.
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.json(data);
  })
);

export default router;

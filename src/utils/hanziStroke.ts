// Authoritative stroke count for a character, from the HanziWriter stroke
// data package (the same source the frontend uses for stroke animations).
//
// This lives server-side because it is only ever needed by our own backend
// (character injection); the browser variant is fetched through
// /api/hanzi-data/:char instead (see src/lib/hanziDataLoader.ts).
//
// Performance notes:
//  - The CDN can be slow or unreachable from campus/China networks, and the
//    character's stroke data never changes, so results (including failures)
//    are cached in-memory for the life of the process.
//  - A hard timeout keeps a stuck CDN from hanging an "add character" request
//    indefinitely — callers simply fall back to the dictionary's stroke count.
const HANZI_DATA_CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0';

const STROKE_FETCH_TIMEOUT_MS = 3000;

const cache = new Map<string, number | null>();

export async function fetchAuthoritativeStrokeCount(char: string): Promise<number | null> {
  // null is cached too — a character that errored/doesn't exist on the CDN
  // won't be retried on every injection within the same process.
  if (cache.has(char)) {
    return cache.get(char)!;
  }

  try {
    const res = await fetch(`${HANZI_DATA_CDN}/${encodeURIComponent(char)}.json`, {
      signal: AbortSignal.timeout(STROKE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      cache.set(char, null);
      return null;
    }
    const data = (await res.json()) as { strokes?: string[] };
    if (Array.isArray(data.strokes) && data.strokes.length > 0) {
      const count = data.strokes.length;
      cache.set(char, count);
      return count;
    }
    cache.set(char, null);
    return null;
  } catch {
    cache.set(char, null);
    return null;
  }
}

// By default, HanziWriter fetches per-character stroke data directly from
// the jsdelivr CDN in the browser (https://cdn.jsdelivr.net/npm/hanzi-writer-data@...).
// That's a direct third-party network call from the client, which our CSP
// intentionally does not allow (connect-src is locked to 'self'). This
// loader routes the same request through our own backend instead
// (/api/hanzi-data/:char - see src/routes/hanziData.routes.ts), which
// fetches from jsdelivr server-side, where there's no browser CSP to worry
// about, and returns the result same-origin.
//
// Stroke data for a character never changes, so successful responses are
// cached in-memory for the rest of the page session — switching between
// characters (or re-mounting a canvas for the same character) never re-hits
// the network. A hard timeout guarantees a slow/hung backend can never leave
// a HanziWriter canvas stuck on its loading spinner.
const STROKE_DATA_CACHE = new Map<string, unknown>();

const DEFAULT_TIMEOUT_MS = 6000;

export function fetchHanziCharData(char: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const cached = STROKE_DATA_CACHE.get(char);
  if (cached) return Promise.resolve(cached);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(`/api/hanzi-data/${encodeURIComponent(char)}`, { signal: controller.signal })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to load stroke data for "${char}" (${res.status})`);
      }
      return res.json();
    })
    .then((data) => {
      STROKE_DATA_CACHE.set(char, data);
      return data;
    })
    .finally(() => clearTimeout(timer));
}

// Keep the original HanziWriter-compatible loader signature so existing
// call sites (Quiz, StrokeOrderChallenge) keep working unchanged.
export function hanziCharDataLoader(
  char: string,
  onLoad: (data: unknown) => void,
  onError?: (err: unknown) => void
): void {
  fetchHanziCharData(char)
    .then(onLoad)
    .catch((err) => {
      console.error('HanziWriter character data load failed:', err);
      onError?.(err);
    });
}

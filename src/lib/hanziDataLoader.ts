// By default, HanziWriter fetches per-character stroke data directly from
// the jsdelivr CDN in the browser (https://cdn.jsdelivr.net/npm/hanzi-writer-data@...).
// That's a direct third-party network call from the client, which our CSP
// intentionally does not allow (connect-src is locked to 'self'). This
// loader routes the same request through our own backend instead
// (/api/hanzi-data/:char - see src/routes/hanziData.routes.ts), which
// fetches from jsdelivr server-side, where there's no browser CSP to worry
// about, and returns the result same-origin.
export function hanziCharDataLoader(
  char: string,
  onLoad: (data: unknown) => void,
  onError?: (err: unknown) => void
): void {
  fetch(`/api/hanzi-data/${encodeURIComponent(char)}`)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to load stroke data for "${char}" (${res.status})`);
      }
      return res.json();
    })
    .then(onLoad)
    .catch((err) => {
      console.error('HanziWriter character data load failed:', err);
      onError?.(err);
    });
}

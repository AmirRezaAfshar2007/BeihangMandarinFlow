import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Cleanup for the scratch files ffmpeg works on.
 *
 * Audio transcoding writes a temporary input/output pair into the OS temp
 * directory (see speaking.service.ts). The normal path always deletes both in
 * a `finally`, so nothing accumulates while the process stays up. What this
 * covers is the abnormal path: the process being killed (a redeploy, an OOM,
 * Ctrl-C) between writing and deleting, which would otherwise leave orphaned
 * files behind.
 *
 * That matters more than it first looks. On a PaaS the filesystem is
 * ephemeral — a fresh container starts clean — but a long-lived dev machine or
 * a self-hosted server keeps whatever previous runs left, forever, one file
 * per interrupted recording. This sweep runs once at boot and removes only
 * files this app created (strict filename prefix) that are also old enough
 * that no in-flight request could still be using them. It is best-effort: any
 * error is logged and ignored, because failing to clean scratch space must
 * never stop the server from starting.
 */

/** Must match the prefixes used when creating temp audio in speaking.service.ts. */
const OWNED_TEMP_PREFIXES = ['speaking-'];

/** Anything younger than this may belong to a request that is still running. */
const MIN_AGE_MS = 60 * 60 * 1000; // 1 hour

export async function sweepStaleTempAudio(): Promise<number> {
  const dir = os.tmpdir();
  const cutoff = Date.now() - MIN_AGE_MS;
  let removed = 0;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!OWNED_TEMP_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) continue;

      const fullPath = path.join(dir, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.mtimeMs > cutoff) continue;
        await fs.unlink(fullPath);
        removed += 1;
      } catch {
        // Raced with another cleanup, or not removable — either way, move on.
      }
    }
  } catch (err) {
    console.warn('[temp] Could not sweep stale temp files:', err);
    return removed;
  }

  if (removed > 0) {
    console.log(`[temp] Removed ${removed} orphaned audio temp file(s) left by a previous run.`);
  }
  return removed;
}

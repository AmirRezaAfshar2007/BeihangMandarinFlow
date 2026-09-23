import { AppError } from './errors.ts';

/**
 * A tiny counting semaphore used to bound how much heavy work runs at once.
 *
 * Deliberately in-process and dependency-free. The project runs as a single
 * Node process on one small instance, so this is exactly the right amount of
 * machinery: an external queue (Redis, BullMQ, a worker service) would add
 * infrastructure the pilot does not need and does not have. If the app is
 * ever scaled to several instances, each one gets its own pool — a
 * conservative cap per instance, not a global one.
 *
 * Two ways to use it:
 *   - `acquire()`  — waits for a free slot, and gives up with a 503 rather
 *                    than letting an unbounded queue build up.
 *   - `tryAcquire()` — never waits; returns null when saturated. Used for
 *                    optional work (the live caption) that should simply be
 *                    skipped instead of competing with real requests.
 */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<{
    grant: () => void;
    timeout: NodeJS.Timeout;
  }> = [];

  constructor(
    private readonly max: number,
    /** Only used in log/error text, to make overload diagnosable. */
    private readonly label = 'task'
  ) {}

  get inFlight(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiters.length;
  }

  /** Current load, for /api/health and logging. */
  stats(): { label: string; inFlight: number; queued: number; max: number } {
    return { label: this.label, inFlight: this.active, queued: this.waiters.length, max: this.max };
  }

  /** Idempotent: calling the returned release twice cannot free two slots. */
  private makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.active > 0) this.active -= 1;
      const next = this.waiters.shift();
      if (next) {
        clearTimeout(next.timeout);
        this.active += 1;
        next.grant();
      }
    };
  }

  /**
   * Waits up to `timeoutMs` for a slot. Rejects with a 503 AppError if the
   * pool stays saturated — the request then fails fast and cleanly instead of
   * piling up and taking the process down with it.
   */
  async acquire(timeoutMs: number, busyMessage?: string): Promise<() => void> {
    if (this.active < this.max) {
      this.active += 1;
      return this.makeRelease();
    }

    return new Promise<() => void>((resolve, reject) => {
      const waiter = {
        grant: () => resolve(this.makeRelease()),
        timeout: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          console.warn(
            `[concurrency] ${this.label} pool saturated (${this.active}/${this.max}, ${this.waiters.length} queued) — shedding request.`
          );
          reject(
            new AppError(
              busyMessage ??
                'The server is busy handling other requests right now. Please try again in a few seconds.',
              503
            )
          );
        }, timeoutMs),
      };
      // Deliberately NOT unref'd. An unref'd timer does not keep the event loop
      // alive, so if waiting for this pool slot were the only thing left to do
      // the process would exit before the timeout could fire — the caller would
      // never get its 503, and a short-lived process would silently drop the
      // request. The timer is bounded (requestQueueTimeoutMs, 20s by default)
      // and shutdown force-exits after 15s, so keeping the loop alive for it
      // costs nothing.
      this.waiters.push(waiter);
    });
  }

  /** Non-blocking variant: null means "busy, skip this optional work". */
  tryAcquire(): (() => void) | null {
    if (this.active >= this.max) return null;
    this.active += 1;
    return this.makeRelease();
  }

  /**
   * Runs `fn` inside the pool, always releasing the slot — including when
   * `fn` throws. Keeps call sites from leaking slots on the error path, which
   * would silently shrink the pool to zero over time.
   */
  async run<T>(timeoutMs: number, fn: () => Promise<T>, busyMessage?: string): Promise<T> {
    const release = await this.acquire(timeoutMs, busyMessage);
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

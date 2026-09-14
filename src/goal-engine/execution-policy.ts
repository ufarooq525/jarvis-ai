/** Bounded execution policy for Shadow/Live task dispatch (Phase 1 harden). */

export interface ExecutionPolicy {
  /** Per-attempt timeout for adapter propose+start. */
  timeout_ms: number;
  /** Total attempts including the first. */
  max_attempts: number;
  /**
   * Shadow browser research: when false, simulate_only (no network).
   * Defaults off under Vitest; on for the API process so observations can be real.
   */
  browser_fetch: boolean;
  /** Live getRun poll until terminal. Short under Vitest so tests do not hang. */
  live_poll_timeout_ms: number;
  live_poll_interval_ms: number;
}

export const DEFAULT_SHADOW_EXECUTION: ExecutionPolicy = {
  timeout_ms: 8_000,
  max_attempts: 2,
  browser_fetch: !process.env.VITEST,
  live_poll_timeout_ms: process.env.VITEST ? 80 : 15_000,
  live_poll_interval_ms: process.env.VITEST ? 15 : 400,
};

export class TimeoutError extends Error {
  readonly code = "TIMEOUT" as const;
  constructor(label: string, ms: number) {
    super(`Timeout after ${ms}ms: ${label}`);
    this.name = "TimeoutError";
  }
}

export function isRetryableFailure(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return (
      m.includes("timeout") ||
      m.includes("econnrefused") ||
      m.includes("fetch failed") ||
      m.includes("unreachable") ||
      m.includes("temporarily") ||
      m.includes("adapter error")
    );
  }
  return false;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Base idempotency key without :retry:N / :replan:N suffixes. */
export function baseIdempotencyKey(key: string): string {
  return key.replace(/:(?:retry|replan):\d+$/g, "");
}

export function retryIdempotencyKey(base: string, attempt: number): string {
  const root = baseIdempotencyKey(base);
  return attempt <= 1 ? root : `${root}:retry:${attempt}`;
}

export function replanIdempotencyKey(base: string, replanGen: number): string {
  const root = baseIdempotencyKey(base);
  return `${root}:replan:${replanGen}`;
}

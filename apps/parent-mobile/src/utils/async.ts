/**
 * Pure async utilities (Prompt 2 foundation). No React Native import here —
 * deliberately, so this module can be unit-tested under plain Vitest (see
 * src/utils/async.test.ts) without needing a React Native test renderer.
 */

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  /** Total attempts including the first — not additional retries on top of it. */
  maxAttempts: number;
  /** Base delay in ms; doubles each attempt (exponential backoff). */
  baseDelayMs: number;
  /** Upper bound for the computed delay. */
  maxDelayMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 4000,
};

/** Generic retry-with-backoff helper for transient network failures. This is
 * infrastructure only — it has no knowledge of any specific API call, and
 * must never be used to retry a security-sensitive mutation (e.g. a leave
 * decision) automatically; callers decide what is safe to retry. */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY_OPTIONS, ...options };

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await delay(backoff);
    }
  }
  throw lastError;
}

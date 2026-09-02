/**
 * Named, overridable escalation/notification timing configuration — per
 * ADR-017 §2 ("configurable, not hard-coded... not a literal constant in
 * scheduling code") and ADR-018 §3 (retry mechanism resolved, numeric values
 * a separate product decision). Defaults below are the product-supplied
 * values (escalation interval, notification retry policy) — not invented.
 */

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Uniform per-stage escalation timeout — applies to every automated hop,
 * including the first (pending -> father_notified), per ADR-019 §3's
 * canonical diagram. */
export const ESCALATION_STAGE_TIMEOUT_MS = envNumber("ESCALATION_STAGE_TIMEOUT_MS", 90_000);

/** Notification retry policy (ADR-018 §3): 1 initial attempt + up to 3
 * retries, exponential backoff, capped at 120s. Index i is the delay before
 * retry i+1 (i.e. NOTIFICATION_RETRY_DELAYS_MS[0] is the delay before the
 * 1st retry, following the 1st/initial attempt's failure). */
export const NOTIFICATION_RETRY_DELAYS_MS = [
  envNumber("NOTIFICATION_RETRY_DELAY_1_MS", 30_000),
  envNumber("NOTIFICATION_RETRY_DELAY_2_MS", 60_000),
  envNumber("NOTIFICATION_RETRY_DELAY_3_MS", 120_000),
] as const;

export const NOTIFICATION_MAX_RETRIES = NOTIFICATION_RETRY_DELAYS_MS.length;

export const NOTIFICATION_MAX_BACKOFF_MS = envNumber("NOTIFICATION_MAX_BACKOFF_MS", 120_000);

/**
 * Waiting-time computation (Prompt 7A §12 — "Waiting Time" column, §11's
 * "Average Waiting Time" metric candidate). Pure, framework-agnostic
 * function of `createdAt` and `now` — REAL, derived data (§11's
 * REAL/PARTIAL/PLACEHOLDER/FUTURE rule): every leave request's `createdAt`
 * is a genuine database timestamp, and elapsed time is simple arithmetic,
 * never a fabricated number.
 */
export function computeWaitingMinutes(createdAt: string, now: Date): number {
  const created = new Date(createdAt).getTime();
  const elapsedMs = Math.max(0, now.getTime() - created);
  return Math.floor(elapsedMs / 60_000);
}

/** Compact, human-readable duration — "3m", "2h 14m", "1d 4h". Never shows
 * more precision than is operationally useful in a dense queue table. */
export function formatWaitingDuration(minutes: number): string {
  if (minutes < 1) return "<1m";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

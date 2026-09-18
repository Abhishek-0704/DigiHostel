import type { Notification } from "./types";

/**
 * Deterministic ordering (Prompt 6 §25). Newest-first by `createdAt`; for
 * two notifications with an identical timestamp, `id` is the stable
 * secondary tie-breaker (never insertion/arrival order, which a realtime
 * transport does not guarantee matches actual event creation order).
 */
export function compareNotifications(a: Notification, b: Notification): number {
  const byCreatedAt = b.createdAt.localeCompare(a.createdAt);
  if (byCreatedAt !== 0) return byCreatedAt;
  return a.id.localeCompare(b.id);
}

export function sortNotifications(notifications: readonly Notification[]): Notification[] {
  return [...notifications].sort(compareNotifications);
}

/**
 * Realtime merge/deduplication (Prompt 6 §23/§24). Deduplicates strictly by
 * the notification's own stable `id` — never a derived key like
 * `title + timestamp` (§24's explicit rule) — so a redelivered or replayed
 * event updates the existing entry in place instead of creating a visible
 * duplicate, while two genuinely distinct notifications that happen to
 * share a title/timestamp are never incorrectly collapsed into one.
 *
 * No actual realtime event source calls this today (see
 * `notificationService.ts`'s doc comment) — this is the prepared merge
 * boundary a future adapter will call once one exists, exercised here only
 * by unit tests with synthetic events, never a fabricated production event
 * producer (§23's "implement the readiness boundary, not a fake event
 * producer").
 */
export function mergeIncomingNotification(
  existing: readonly Notification[],
  incoming: Notification,
): Notification[] {
  const index = existing.findIndex((n) => n.id === incoming.id);
  const next =
    index === -1 ? [...existing, incoming] : existing.map((n, i) => (i === index ? incoming : n));
  return sortNotifications(next);
}
